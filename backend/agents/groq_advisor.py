"""
Groq LLM Agent Advisor
=======================
Uses Groq's OpenAI-compatible chat API (model from GROQ_MODEL) to provide AI-powered
decision making for simulation agents, market narration and threat analysis.

All Groq calls in the backend go through `groq_completion()`, which tries GROQ_API_KEY
first and falls back to GROQ_API_KEY_2 when the first key is rate-limited, out of quota,
revoked, or Groq returns a server error.

Each agent type has a dedicated system prompt that matches its role.
"""

import asyncio
import json
import os
import time
from typing import Any, Dict, Optional
import aiohttp


GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# HTTP statuses meaning "this key can't serve requests right now" -> try the next key
_KEY_FALLBACK_STATUSES = {401, 403, 429, 498}
# Keys that recently hit a rate/quota limit are tried last until this time (monotonic seconds)
_key_cooldown_until: Dict[str, float] = {}
_DEFAULT_KEY_COOLDOWN = 60.0


class GroqError(Exception):
    """Raised when every configured Groq key failed. `status` is the last HTTP status (0 = network/config)."""

    def __init__(self, status: int, detail: str):
        super().__init__(f"Groq API error {status}: {detail}")
        self.status = status
        self.detail = detail


def _get_groq_keys() -> list[str]:
    """Return configured Groq API keys in priority order (primary first), without blanks or duplicates."""
    try:
        from config import settings
        keys = [
            settings.groq_api_key or os.getenv("GROQ_API_KEY", ""),
            settings.groq_api_key_2 or os.getenv("GROQ_API_KEY_2", ""),
        ]
    except Exception:
        keys = [os.getenv("GROQ_API_KEY", ""), os.getenv("GROQ_API_KEY_2", "")]
    seen: list[str] = []
    for k in keys:
        k = (k or "").strip()
        if k and k not in seen:
            seen.append(k)
    return seen


def _get_groq_key() -> str:
    """Return the first available Groq API key (backwards-compat helper)."""
    keys = _get_groq_keys()
    return keys[0] if keys else ""


def _get_groq_model() -> str:
    try:
        from config import settings
        return settings.groq_model or "openai/gpt-oss-120b"
    except Exception:
        return os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")


def _ordered_keys() -> list[str]:
    """Primary key first, unless it is cooling down after a rate/quota limit."""
    now = time.monotonic()
    keys = _get_groq_keys()
    return [k for k in keys if _key_cooldown_until.get(k, 0) <= now] + \
           [k for k in keys if _key_cooldown_until.get(k, 0) > now]


async def groq_completion(payload: Dict[str, Any], timeout: float = 15.0) -> Dict[str, Any]:
    """
    POST a chat completion to Groq and return the response JSON.
    Tries each configured key in turn; raises GroqError if all of them fail.
    """
    keys = _ordered_keys()
    if not keys:
        raise GroqError(0, "Groq API key not configured")

    last = GroqError(0, "no request made")
    for i, key in enumerate(keys):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    GROQ_API_URL,
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=timeout),
                ) as resp:
                    if resp.status == 200:
                        if i > 0:
                            print(f"[Groq] served by fallback key ...{key[-4:]}")
                        return await resp.json()
                    text = (await resp.text())[:500]
                    last = GroqError(resp.status, text)
                    if resp.status in _KEY_FALLBACK_STATUSES or resp.status >= 500:
                        if resp.status in (429, 498):
                            try:
                                wait = float(resp.headers.get("retry-after", _DEFAULT_KEY_COOLDOWN))
                            except ValueError:
                                wait = _DEFAULT_KEY_COOLDOWN
                            _key_cooldown_until[key] = time.monotonic() + max(wait, 5.0)
                        print(f"[Groq] key ...{key[-4:]} returned {resp.status}; trying next key")
                        continue
                    raise last  # request problem (400/413/...): another key won't help
        except GroqError:
            raise
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            last = GroqError(0, f"{type(e).__name__}: {e}")
            continue
    raise last


async def groq_chat_json(payload: Dict[str, Any], timeout: float = 15.0) -> Dict[str, Any]:
    """groq_completion() + parse the assistant message as JSON."""
    data = await groq_completion(payload, timeout)
    return json.loads(data["choices"][0]["message"]["content"])


# Minimum seconds between Groq calls per agent (rate-limit control)
_ADVISOR_COOLDOWN = 30.0

# Cache of last advice per agent_id
_advice_cache: Dict[str, Dict[str, Any]] = {}
_last_call_time: Dict[str, float] = {}


# ---------------------------------------------------------------------------
# System prompts per agent type
# ---------------------------------------------------------------------------

SYSTEM_PROMPTS: Dict[str, str] = {
    "retail_trader": (
        "You are a retail DeFi trader AI. You make small, emotion-driven "
        "trades based on market sentiment. When BTC is up you buy aggressively; "
        "when it's falling you panic-sell. Your output MUST be valid JSON with "
        "keys: action (buy/sell/hold), amount_pct (0-20 as % of capital), "
        "token (PALLADIUM/BADASSIUM), reasoning (1 sentence)."
    ),
    "whale": (
        "You are a crypto whale AI. You move large amounts of capital to "
        "influence prices intentionally. You look for low liquidity moments to "
        "dump or pump. Your output MUST be valid JSON with keys: action "
        "(dump/pump/hold), amount_pct (10-60 as % of capital), "
        "token (PALLADIUM/BADASSIUM), reasoning (1 sentence)."
    ),
    "arbitrage_bot": (
        "You are an arbitrage bot AI. You scan price spreads between pools and "
        "execute risk-free profits when spread > 0.3%. Your output MUST be valid "
        "JSON with keys: action (arb/hold), amount_pct (5-30 as % of capital), "
        "token_in (PALLADIUM/BADASSIUM), token_out (PALLADIUM/BADASSIUM), "
        "reasoning (1 sentence)."
    ),
    "liquidator_bot": (
        "You are a liquidator bot AI. You monitor under-collateralized positions "
        "and call liquidate() to claim discounted collateral. Your output MUST be "
        "valid JSON with keys: action (liquidate/wait), target_wallet (address or null), "
        "reasoning (1 sentence)."
    ),
    "mev_bot": (
        "You are an MEV sandwich bot AI. You front-run and back-run detected "
        "pending large trades in the mempool. Your output MUST be valid JSON with "
        "keys: action (sandwich/frontrun/hold), victim_amount (float), "
        "token (PALLADIUM/BADASSIUM), reasoning (1 sentence)."
    ),
    "attacker": (
        "You are a malicious DeFi attacker AI. You simulate flash loan attacks, "
        "oracle manipulation, and price manipulation to drain liquidity pools. "
        "Your output MUST be valid JSON with keys: attack_type "
        "(flash_loan/oracle_manipulation/pump_dump/none), amount (float), "
        "severity (low/medium/high/critical), reasoning (1 sentence)."
    ),
    "borrower": (
        "You are a DeFi borrower AI. You manage collateral positions and try to "
        "maximize capital efficiency without getting liquidated. Your output MUST "
        "be valid JSON with keys: action (borrow/repay/add_collateral/hold), "
        "amount_pct (0-30 as % of capital), reasoning (1 sentence)."
    ),
}


# ---------------------------------------------------------------------------
# Core advisor function
# ---------------------------------------------------------------------------

async def get_agent_advice(
    agent_id: str,
    agent_type: str,
    market_context: Dict[str, Any],
    pool_state: Dict[str, Any],
    agent_stats: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Ask Groq LLM what the agent should do next given current market state.
    Returns parsed JSON action dict. Falls back to empty dict on any error.
    Respects per-agent cooldown to avoid rate limit errors.
    """
    if not _get_groq_keys():
        return {}

    # Rate-limit per agent
    now = time.time()
    last = _last_call_time.get(agent_id, 0.0)
    if now - last < _ADVISOR_COOLDOWN:
        return _advice_cache.get(agent_id, {})

    system_prompt = SYSTEM_PROMPTS.get(agent_type, SYSTEM_PROMPTS["retail_trader"])

    user_message = (
        f"Current market data (from CoinDesk API):\n"
        f"  BTC price: ${market_context.get('btc_price', 0):,.0f} "
        f"({market_context.get('btc_change_24h', 0):+.2f}% 24h)\n"
        f"  ETH price: ${market_context.get('eth_price', 0):,.0f} "
        f"({market_context.get('eth_change_24h', 0):+.2f}% 24h)\n"
        f"  Market sentiment: {market_context.get('sentiment', 'neutral')}\n"
        f"  Volatility: {market_context.get('volatility', 'medium')}\n"
        f"  Risk level: {market_context.get('risk_level', 0.5):.2f}\n\n"
        f"Simulation pool state (Sepolia deployed LiquidityPool):\n"
        f"  Reserve A (PALLADIUM): {pool_state.get('reserve_a', 0):,.0f}\n"
        f"  Reserve B (BADASSIUM): {pool_state.get('reserve_b', 0):,.0f}\n"
        f"  Current price: {pool_state.get('price_a_per_b', 1):.6f}\n"
        f"  Reference price: {pool_state.get('reference_price', 1):.6f}\n\n"
        f"Your agent stats:\n"
        f"  Capital: ${agent_stats.get('capital', 0):,.2f}\n"
        f"  PnL: ${agent_stats.get('pnl', 0):,.2f}\n"
        f"  Trades: {agent_stats.get('trades_count', 0)}\n\n"
        f"Based on the above, what is your next action? Reply ONLY with valid JSON."
    )

    payload = {
        "model": _get_groq_model(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.7,
        "max_tokens": 200,
        "response_format": {"type": "json_object"},
    }

    try:
        advice = await groq_chat_json(payload, timeout=10)
    except (GroqError, json.JSONDecodeError, KeyError, TypeError) as e:
        print(f"[Groq] agent advice failed: {e}")
        return {}
    _advice_cache[agent_id] = advice
    _last_call_time[agent_id] = now
    return advice


# ---------------------------------------------------------------------------
# Market narrator — Groq produces a live commentary string for the feed
# ---------------------------------------------------------------------------

async def get_market_narrative(market_context: Dict[str, Any]) -> Optional[str]:
    """
    Ask Groq to produce a 1-sentence market narrative for the activity feed.
    Called by simulation_runner once per market data update.
    """
    if not _get_groq_keys():
        return None

    user_msg = (
        f"DeFi market snapshot: BTC ${market_context.get('btc_price', 0):,.0f} "
        f"({market_context.get('btc_change_24h', 0):+.2f}%), "
        f"ETH ${market_context.get('eth_price', 0):,.0f}, "
        f"sentiment={market_context.get('sentiment', 'neutral')}, "
        f"volatility={market_context.get('volatility', 'medium')}. "
        f"Write ONE punchy sentence describing what's happening and what traders should watch."
    )

    payload = {
        "model": _get_groq_model(),
        "messages": [
            {"role": "system", "content": "You are a concise DeFi market analyst."},
            {"role": "user", "content": user_msg},
        ],
        "temperature": 0.8,
        "max_tokens": 80,
    }

    try:
        data = await groq_completion(payload, timeout=8)
        return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"[Groq] market narrative failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Threat analyzer — Groq assesses if a sequence of events is an attack
# ---------------------------------------------------------------------------

async def analyze_threat(events: list, pool_state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ask Groq to assess a suspicious sequence of events and rate threat level.
    Returns dict with: is_attack (bool), threat_type, severity, recommendation.
    """
    if not events or not _get_groq_keys():
        return {}

    events_str = json.dumps(events[-10:], indent=2)  # Last 10 events
    user_msg = (
        f"Analyze these DeFi simulation events for malicious behavior:\n\n"
        f"{events_str}\n\n"
        f"Pool state: reserves_a={pool_state.get('reserve_a', 0):.0f}, "
        f"reserves_b={pool_state.get('reserve_b', 0):.0f}\n\n"
        f"Reply ONLY with valid JSON: "
        f"{{\"is_attack\": bool, \"threat_type\": str, \"severity\": \"low/medium/high/critical\", "
        f"\"recommendation\": str (1 sentence)}}"
    )

    payload = {
        "model": _get_groq_model(),
        "messages": [
            {"role": "system", "content": "You are a DeFi security analyst specializing in on-chain threat detection."},
            {"role": "user", "content": user_msg},
        ],
        "temperature": 0.3,
        "max_tokens": 150,
        "response_format": {"type": "json_object"},
    }

    try:
        return await groq_chat_json(payload, timeout=10)
    except Exception as e:
        print(f"[Groq] threat analysis failed: {e}")
        return {}
