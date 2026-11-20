"""
Real-time Market Data Service
=============================
Fetches live crypto prices from CoinDesk API and other sources.
Provides real market conditions for the simulation agents to react to.
"""

import asyncio
import aiohttp
import time
import random
from typing import Any, Dict, List, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import os


@dataclass
class PriceData:
    """Single price data point."""
    symbol: str
    price: float
    change_24h: float
    change_pct_24h: float
    high_24h: float
    low_24h: float
    volume_24h: float
    timestamp: float
    source: str = "coindesk"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "symbol": self.symbol,
            "price": round(self.price, 2),
            "change_24h": round(self.change_24h, 2),
            "change_pct_24h": round(self.change_pct_24h, 4),
            "high_24h": round(self.high_24h, 2),
            "low_24h": round(self.low_24h, 2),
            "volume_24h": round(self.volume_24h, 2),
            "timestamp": self.timestamp,
            "source": self.source,
        }


@dataclass
class MarketCondition:
    """Overall market sentiment derived from price data."""
    sentiment: str  # "bullish", "bearish", "neutral", "extreme_fear", "extreme_greed"
    volatility: str  # "low", "medium", "high", "extreme"
    trend: str  # "uptrend", "downtrend", "sideways"
    btc_dominance_trend: str  # "rising", "falling", "stable"
    risk_level: float  # 0.0 - 1.0
    recommended_exposure: float  # 0.0 - 1.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sentiment": self.sentiment,
            "volatility": self.volatility,
            "trend": self.trend,
            "btc_dominance_trend": self.btc_dominance_trend,
            "risk_level": round(self.risk_level, 2),
            "recommended_exposure": round(self.recommended_exposure, 2),
        }


# ---------------------------------------------------------------------------
# Shared live price fetch
# ---------------------------------------------------------------------------
# One batched upstream request serves every caller (simulation, /api/sim/market,
# market-intel page) per TTL window. The old code made one CoinDesk call per
# symbol on every request, which exhausted the CoinDesk free-tier quota.

LIVE_SYMBOLS = ["BTC", "ETH", "SOL", "AVAX", "MATIC", "LINK", "UNI", "AAVE"]
COINGECKO_IDS = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana", "AVAX": "avalanche-2",
    "MATIC": "matic-network", "LINK": "chainlink", "UNI": "uniswap", "AAVE": "aave",
}
COINDESK_TICK_URL = "https://data-api.coindesk.com/index/cc/v1/latest/tick"

_LIVE_TTL = 180.0            # seconds between upstream fetches (~14k calls/month)
_COINDESK_BACKOFF = 3600.0   # skip CoinDesk for 1h after a rate-limit / error
_live_cache: Dict[str, Dict[str, Any]] = {}
_live_ts: float = 0.0
_coindesk_blocked_until: float = 0.0
_live_lock: Optional[asyncio.Lock] = None


def _first(d: Dict[str, Any], *keys: str, default: float = 0.0) -> float:
    for k in keys:
        v = d.get(k)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    return default


async def _coindesk_batch(session: aiohttp.ClientSession, api_key: str) -> Dict[str, Dict[str, Any]]:
    params = {"market": "cadli", "instruments": ",".join(f"{s}-USD" for s in LIVE_SYMBOLS)}
    headers = {"Authorization": f"Bearer {api_key}"}
    async with session.get(COINDESK_TICK_URL, params=params, headers=headers,
                           timeout=aiohttp.ClientTimeout(total=10)) as resp:
        data = await resp.json(content_type=None)
    err = data.get("Err") or {}
    if err.get("message"):
        raise RuntimeError(err["message"][:160])

    # CoinDesk returns Data as {"BTC-USD": {...}, ...}
    ticks = data.get("Data") or {}
    if isinstance(ticks, dict):
        ticks = list(ticks.values())

    out: Dict[str, Dict[str, Any]] = {}
    for t in ticks:
        sym = str(t.get("INSTRUMENT", "")).replace("-USD", "")
        price = _first(t, "VALUE")
        if sym not in LIVE_SYMBOLS or price <= 0:
            continue
        out[sym] = {
            "price": price,
            "change_24h": _first(t, "MOVING_24_HOUR_CHANGE", "CURRENT_DAY_CHANGE", "CHANGE_24H"),
            "change_pct": _first(t, "MOVING_24_HOUR_CHANGE_PERCENTAGE", "CURRENT_DAY_CHANGE_PERCENTAGE", "CHANGE_PCT_24H"),
            "high_24h": _first(t, "MOVING_24_HOUR_HIGH", "CURRENT_DAY_HIGH", "HIGH_24H", default=price * 1.02),
            "low_24h": _first(t, "MOVING_24_HOUR_LOW", "CURRENT_DAY_LOW", "LOW_24H", default=price * 0.98),
            "volume": _first(t, "MOVING_24_HOUR_QUOTE_VOLUME", "CURRENT_DAY_QUOTE_VOLUME", "VOLUME_24H"),
            "source": "coindesk",
        }
    return out


# Kraken public ticker: keyless, one batched call, not blocked from cloud IPs
# (CoinGecko rate-limits Render's shared egress IPs with HTTP 429).
KRAKEN_PAIRS = {
    "BTC": ("XBTUSD", "XXBTZUSD"), "ETH": ("ETHUSD", "XETHZUSD"), "SOL": ("SOLUSD",),
    "AVAX": ("AVAXUSD",), "LINK": ("LINKUSD",), "UNI": ("UNIUSD",), "AAVE": ("AAVEUSD",),
    "MATIC": ("POLUSD",),  # Polygon rebranded MATIC -> POL
}


async def _kraken_batch(session: aiohttp.ClientSession, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
    wanted = [s for s in symbols if s in KRAKEN_PAIRS]
    if not wanted:
        return {}
    params = {"pair": ",".join(KRAKEN_PAIRS[s][0] for s in wanted)}
    async with session.get("https://api.kraken.com/0/public/Ticker", params=params,
                           timeout=aiohttp.ClientTimeout(total=10)) as resp:
        data = await resp.json(content_type=None)
    if data.get("error"):
        raise RuntimeError(f"Kraken: {data['error']}")

    result = data.get("result") or {}
    out: Dict[str, Dict[str, Any]] = {}
    for sym in wanted:
        t = next((result[k] for k in KRAKEN_PAIRS[sym] if k in result), None)
        if not t:
            continue
        price = float(t["c"][0])
        open_ = float(t["o"]) or price  # today's open (00:00 UTC)
        if price <= 0:
            continue
        out[sym] = {
            "price": price,
            "change_24h": price - open_,
            "change_pct": (price - open_) / open_ * 100,
            "high_24h": float(t["h"][1]),
            "low_24h": float(t["l"][1]),
            "volume": float(t["v"][1]) * float(t["p"][1]),  # base volume * VWAP = USD volume
            "source": "kraken",
        }
    return out


async def _coingecko_batch(session: aiohttp.ClientSession, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
    ids = {COINGECKO_IDS[s]: s for s in symbols if s in COINGECKO_IDS}
    if not ids:
        return {}
    params = {"ids": ",".join(ids), "vs_currencies": "usd",
              "include_24hr_change": "true", "include_24hr_vol": "true"}
    async with session.get("https://api.coingecko.com/api/v3/simple/price", params=params,
                           timeout=aiohttp.ClientTimeout(total=10)) as resp:
        if resp.status != 200:
            raise RuntimeError(f"CoinGecko HTTP {resp.status}")
        data = await resp.json(content_type=None)

    out: Dict[str, Dict[str, Any]] = {}
    for cid, vals in data.items():
        sym = ids.get(cid)
        price = _first(vals, "usd")
        if not sym or price <= 0:
            continue
        pct = _first(vals, "usd_24h_change")
        out[sym] = {
            "price": price,
            "change_24h": price * pct / 100,
            "change_pct": pct,
            "high_24h": price * 1.02,
            "low_24h": price * 0.98,
            "volume": _first(vals, "usd_24h_vol"),
            "source": "coingecko",
        }
    return out


async def fetch_live_crypto_prices(api_key: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    """
    Live prices for LIVE_SYMBOLS, cached for _LIVE_TTL seconds and shared by all callers.
    CoinDesk first (one batched call), then Kraken, then CoinGecko for anything missing.
    Returns the last good data (possibly stale) or {} if nothing has ever succeeded.
    """
    global _live_cache, _live_ts, _coindesk_blocked_until, _live_lock
    if _live_lock is None:
        _live_lock = asyncio.Lock()

    async with _live_lock:
        now = time.time()
        if now - _live_ts < _LIVE_TTL:
            return dict(_live_cache)

        api_key = api_key or os.getenv("COINDESK_API_KEY", "")
        prices: Dict[str, Dict[str, Any]] = {}
        async with aiohttp.ClientSession() as session:
            if api_key and now >= _coindesk_blocked_until:
                try:
                    prices = await _coindesk_batch(session, api_key)
                except Exception as e:
                    _coindesk_blocked_until = now + _COINDESK_BACKOFF
                    print(f"[MarketData] CoinDesk unavailable, backing off 1h: {e}")

            for name, fetch in (("Kraken", _kraken_batch), ("CoinGecko", _coingecko_batch)):
                missing = [s for s in LIVE_SYMBOLS if s not in prices]
                if not missing:
                    break
                try:
                    prices.update(await fetch(session, missing))
                except Exception as e:
                    print(f"[MarketData] {name} fallback failed: {e}")

        if prices:
            _live_cache = prices
            _live_ts = now
        else:
            # Nothing worked: keep stale data, retry in 30s instead of a full TTL
            _live_ts = now - _LIVE_TTL + 30
        return dict(_live_cache)


class MarketDataService:
    """
    Fetches and caches real-time market data from CoinDesk API.
    Provides market conditions for AI agents to react to.
    """

    COINDESK_BASE_URL = "https://data-api.coindesk.com/index/cc/v1"
    
    # Supported assets
    SUPPORTED_ASSETS = ["BTC", "ETH", "SOL", "AVAX", "MATIC", "LINK", "UNI", "AAVE"]

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("COINDESK_API_KEY", "")
        self._cache: Dict[str, PriceData] = {}
        self._cache_ttl: float = 10.0  # seconds
        self._last_fetch: float = 0.0
        self._price_history: Dict[str, List[float]] = {asset: [] for asset in self.SUPPORTED_ASSETS}
        self._max_history: int = 100
        self._session: Optional[aiohttp.ClientSession] = None
        self._callbacks: List[Callable[[Dict[str, PriceData]], None]] = []
        self._running: bool = False
        self._task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------
    # HTTP Session Management
    # ------------------------------------------------------------------

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                }
            )
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    # ------------------------------------------------------------------
    # Price Fetching
    # ------------------------------------------------------------------

    async def fetch_price(self, symbol: str = "BTC") -> Optional[PriceData]:
        """Current price for one asset, served from the shared batched cache."""
        prices = await self.fetch_all_prices()
        return prices.get(symbol)

    def _apply_live(self, live: Dict[str, Dict[str, Any]]) -> None:
        """Copy shared live prices into this service's cache and price history."""
        for sym, p in live.items():
            prev = self._cache.get(sym)
            self._cache[sym] = PriceData(
                symbol=sym,
                price=p["price"],
                change_24h=p["change_24h"],
                change_pct_24h=p["change_pct"],
                high_24h=p["high_24h"],
                low_24h=p["low_24h"],
                volume_24h=p["volume"],
                timestamp=time.time(),
                source=p["source"],
            )
            if prev is None or prev.price != p["price"]:
                self._update_history(sym, p["price"])

    def _get_cached_or_mock(self, symbol: str) -> PriceData:
        """Return cached data or generate realistic mock if unavailable."""
        if symbol in self._cache:
            cached = self._cache[symbol]
            # Add small random drift to cached price
            drift = random.uniform(-0.5, 0.5)
            cached.price *= (1 + drift / 100)
            cached.timestamp = time.time()
            return cached
            
        # Generate realistic mock prices
        base_prices = {
            "BTC": 67500,
            "ETH": 3450,
            "SOL": 145,
            "AVAX": 38,
            "MATIC": 0.85,
            "LINK": 14.5,
            "UNI": 7.8,
            "AAVE": 92,
        }
        
        base = base_prices.get(symbol, 100)
        # Add some variance
        price = base * random.uniform(0.95, 1.05)
        change_pct = random.uniform(-5, 5)
        
        return PriceData(
            symbol=symbol,
            price=price,
            change_24h=price * change_pct / 100,
            change_pct_24h=change_pct,
            high_24h=price * 1.03,
            low_24h=price * 0.97,
            volume_24h=random.uniform(1e8, 1e10),
            timestamp=time.time(),
            source="mock",
        )

    async def fetch_all_prices(self) -> Dict[str, PriceData]:
        """Prices for all supported assets: shared live data, cached/mock values fill gaps."""
        live = await fetch_live_crypto_prices(self.api_key)
        if live:
            self._apply_live(live)

        prices: Dict[str, PriceData] = {}
        for symbol in self.SUPPORTED_ASSETS:
            if symbol in live:
                prices[symbol] = self._cache[symbol]
            else:
                prices[symbol] = self._get_cached_or_mock(symbol)

        self._last_fetch = time.time()
        return prices


    def _update_history(self, symbol: str, price: float):
        """Track price history for volatility calculations."""
        if symbol not in self._price_history:
            self._price_history[symbol] = []
        self._price_history[symbol].append(price)
        if len(self._price_history[symbol]) > self._max_history:
            self._price_history[symbol] = self._price_history[symbol][-self._max_history:]

    # ------------------------------------------------------------------
    # Market Analysis
    # ------------------------------------------------------------------

    def calculate_volatility(self, symbol: str) -> float:
        """Calculate recent price volatility (standard deviation as % of mean)."""
        history = self._price_history.get(symbol, [])
        if len(history) < 5:
            return 0.02  # Default 2% volatility
            
        import statistics
        mean = statistics.mean(history)
        if mean == 0:
            return 0.02
        stdev = statistics.stdev(history)
        return stdev / mean

    def get_market_condition(self) -> MarketCondition:
        """Analyze current market conditions across all cached assets."""
        if not self._cache:
            return MarketCondition(
                sentiment="neutral",
                volatility="medium",
                trend="sideways",
                btc_dominance_trend="stable",
                risk_level=0.5,
                recommended_exposure=0.5,
            )

        # Aggregate metrics
        total_change = 0
        count = 0
        avg_volatility = 0
        
        for symbol, data in self._cache.items():
            total_change += data.change_pct_24h
            count += 1
            avg_volatility += self.calculate_volatility(symbol)
            
        if count > 0:
            avg_change = total_change / count
            avg_volatility = avg_volatility / count
        else:
            avg_change = 0
            avg_volatility = 0.02
            
        # Determine sentiment
        if avg_change > 5:
            sentiment = "extreme_greed"
        elif avg_change > 2:
            sentiment = "bullish"
        elif avg_change < -5:
            sentiment = "extreme_fear"
        elif avg_change < -2:
            sentiment = "bearish"
        else:
            sentiment = "neutral"
            
        # Determine volatility level
        if avg_volatility > 0.05:
            volatility = "extreme"
        elif avg_volatility > 0.03:
            volatility = "high"
        elif avg_volatility > 0.015:
            volatility = "medium"
        else:
            volatility = "low"
            
        # Determine trend
        btc_history = self._price_history.get("BTC", [])
        if len(btc_history) >= 10:
            recent = btc_history[-5:]
            older = btc_history[-10:-5]
            recent_avg = sum(recent) / len(recent)
            older_avg = sum(older) / len(older)
            if recent_avg > older_avg * 1.01:
                trend = "uptrend"
            elif recent_avg < older_avg * 0.99:
                trend = "downtrend"
            else:
                trend = "sideways"
        else:
            trend = "sideways"
            
        # Calculate risk level
        risk_level = min(1.0, max(0.0, 
            0.5 + (avg_volatility * 5) + (abs(avg_change) / 20)
        ))
        
        # Recommended exposure (inverse of risk for conservative approach)
        recommended_exposure = 1.0 - (risk_level * 0.7)
        
        return MarketCondition(
            sentiment=sentiment,
            volatility=volatility,
            trend=trend,
            btc_dominance_trend="stable",  # Simplified
            risk_level=risk_level,
            recommended_exposure=recommended_exposure,
        )

    # ------------------------------------------------------------------
    # Continuous Streaming
    # ------------------------------------------------------------------

    def subscribe(self, callback: Callable[[Dict[str, PriceData]], None]):
        """Subscribe to price updates."""
        self._callbacks.append(callback)

    def unsubscribe(self, callback: Callable[[Dict[str, PriceData]], None]):
        """Unsubscribe from price updates."""
        if callback in self._callbacks:
            self._callbacks.remove(callback)

    async def start_streaming(self, interval: float = 15.0):
        """Start continuous price streaming."""
        self._running = True
        while self._running:
            try:
                prices = await self.fetch_all_prices()
                for callback in self._callbacks:
                    try:
                        callback(prices)
                    except Exception as e:
                        print(f"[MarketData] Callback error: {e}")
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[MarketData] Streaming error: {e}")
                await asyncio.sleep(5)

    def stop_streaming(self):
        """Stop price streaming."""
        self._running = False
        if self._task:
            self._task.cancel()

    # ------------------------------------------------------------------
    # Simulation Integration
    # ------------------------------------------------------------------

    def get_price_shock_factor(self) -> float:
        """
        Returns a multiplier for simulation price shocks based on real market conditions.
        High volatility = larger shocks, Bear market = downward bias.
        """
        condition = self.get_market_condition()
        
        base_factor = 1.0
        
        # Volatility modifier
        vol_mod = {
            "low": 0.5,
            "medium": 1.0,
            "high": 1.5,
            "extreme": 2.5,
        }.get(condition.volatility, 1.0)
        
        # Sentiment modifier (bias direction)
        sent_mod = {
            "extreme_fear": -1.5,
            "bearish": -0.8,
            "neutral": 0,
            "bullish": 0.8,
            "extreme_greed": 1.5,
        }.get(condition.sentiment, 0)
        
        # Add randomness
        noise = random.uniform(-0.3, 0.3)
        
        return base_factor * vol_mod + sent_mod + noise

    def get_agent_aggression_modifier(self, agent_type: str) -> float:
        """
        Returns a modifier for agent aggression based on market conditions.
        Whales more active in high volatility, Retail more cautious in fear.
        """
        condition = self.get_market_condition()
        
        modifiers = {
            "retail_trader": {
                "extreme_fear": 0.3,
                "bearish": 0.6,
                "neutral": 1.0,
                "bullish": 1.3,
                "extreme_greed": 1.5,
            },
            "whale": {
                "extreme_fear": 1.5,  # Whales buy fear
                "bearish": 1.2,
                "neutral": 1.0,
                "bullish": 0.9,
                "extreme_greed": 1.8,  # Or dump on retail
            },
            "arbitrage_bot": {
                "extreme_fear": 1.4,  # More arb opportunities
                "bearish": 1.2,
                "neutral": 1.0,
                "bullish": 1.1,
                "extreme_greed": 1.3,
            },
            "liquidator_bot": {
                "extreme_fear": 2.0,  # Lots of liquidations
                "bearish": 1.5,
                "neutral": 1.0,
                "bullish": 0.8,
                "extreme_greed": 0.7,
            },
            "mev_bot": {
                "extreme_fear": 1.1,
                "bearish": 1.0,
                "neutral": 1.0,
                "bullish": 1.2,
                "extreme_greed": 1.5,  # More txs to sandwich
            },
            "attacker": {
                "extreme_fear": 1.8,  # Chaos = opportunities
                "bearish": 1.3,
                "neutral": 1.0,
                "bullish": 0.9,
                "extreme_greed": 1.4,
            },
        }
        
        agent_mods = modifiers.get(agent_type, {})
        return agent_mods.get(condition.sentiment, 1.0)

    def to_dict(self) -> Dict[str, Any]:
        """Export current state for API."""
        return {
            "prices": {k: v.to_dict() for k, v in self._cache.items()},
            "condition": self.get_market_condition().to_dict(),
            "last_update": self._last_fetch,
            # Report where BTC actually came from (coindesk / coingecko / mock)
            "source": self._cache["BTC"].source if "BTC" in self._cache else "mock",
        }


# ---------------------------------------------------------------------------
# Global instance — explicitly wired to config settings
# ---------------------------------------------------------------------------

def _create_market_data_service() -> "MarketDataService":
    try:
        from config import settings
        api_key = settings.coindesk_api_key or os.getenv("COINDESK_API_KEY", "")
    except Exception:
        api_key = os.getenv("COINDESK_API_KEY", "")
    return MarketDataService(api_key=api_key)


market_data_service = _create_market_data_service()
