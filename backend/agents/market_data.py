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
        """Fetch current price for a single asset from CoinDesk."""
        try:
            session = await self._get_session()
            
            # CoinDesk Index API endpoint
            url = f"{self.COINDESK_BASE_URL}/latest/tick"
            params = {
                "market": "cadli",
                "instruments": f"{symbol}-USD",
            }
            
            async with session.get(url, params=params, timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Parse CoinDesk response
                    if "Data" in data and len(data["Data"]) > 0:
                        tick = data["Data"][0]
                        price = tick.get("VALUE", 0)
                        
                        # Get 24h data from a separate call or estimate
                        change_24h = tick.get("CHANGE_24H", 0)
                        change_pct = tick.get("CHANGE_PCT_24H", 0)
                        high_24h = tick.get("HIGH_24H", price * 1.02)
                        low_24h = tick.get("LOW_24H", price * 0.98)
                        volume_24h = tick.get("VOLUME_24H", 0)
                        
                        price_data = PriceData(
                            symbol=symbol,
                            price=price,
                            change_24h=change_24h,
                            change_pct_24h=change_pct,
                            high_24h=high_24h,
                            low_24h=low_24h,
                            volume_24h=volume_24h,
                            timestamp=time.time(),
                            source="coindesk",
                        )
                        
                        self._cache[symbol] = price_data
                        self._update_history(symbol, price)
                        return price_data
                        
                # Fallback to alternative endpoint
                return await self._fetch_price_fallback(symbol)
                
        except Exception as e:
            print(f"[MarketData] Error fetching {symbol}: {e}")
            return await self._fetch_price_fallback(symbol)

    async def _fetch_price_fallback(self, symbol: str) -> Optional[PriceData]:
        """Fallback price fetcher using CoinGecko free API."""
        try:
            session = await self._get_session()
            
            # Map symbol to CoinGecko ID
            symbol_map = {
                "BTC": "bitcoin",
                "ETH": "ethereum",
                "SOL": "solana",
                "AVAX": "avalanche-2",
                "MATIC": "matic-network",
                "LINK": "chainlink",
                "UNI": "uniswap",
                "AAVE": "aave",
            }
            
            coin_id = symbol_map.get(symbol, symbol.lower())
            url = f"https://api.coingecko.com/api/v3/simple/price"
            params = {
                "ids": coin_id,
                "vs_currencies": "usd",
                "include_24hr_change": "true",
                "include_24hr_vol": "true",
            }
            
            async with session.get(url, params=params, timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    if coin_id in data:
                        coin_data = data[coin_id]
                        price = coin_data.get("usd", 0)
                        change_pct = coin_data.get("usd_24h_change", 0)
                        volume = coin_data.get("usd_24h_vol", 0)
                        
                        price_data = PriceData(
                            symbol=symbol,
                            price=price,
                            change_24h=price * change_pct / 100,
                            change_pct_24h=change_pct,
                            high_24h=price * 1.02,
                            low_24h=price * 0.98,
                            volume_24h=volume,
                            timestamp=time.time(),
                            source="coingecko",
                        )
                        
                        self._cache[symbol] = price_data
                        self._update_history(symbol, price)
                        return price_data
                        
        except Exception as e:
            print(f"[MarketData] Fallback error for {symbol}: {e}")
            
        # Return cached or generate mock
        return self._get_cached_or_mock(symbol)

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
        """Fetch prices for all supported assets."""
        tasks = [self.fetch_price(symbol) for symbol in self.SUPPORTED_ASSETS]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        prices = {}
        for symbol, result in zip(self.SUPPORTED_ASSETS, results):
            if isinstance(result, PriceData):
                prices[symbol] = result
            elif symbol in self._cache:
                prices[symbol] = self._cache[symbol]
                
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
            "source": "coindesk" if self.api_key else "mock",
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
