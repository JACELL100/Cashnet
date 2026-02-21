"""
Agent ML Intelligence Router — /agents-sim/ml/*
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import asdict
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from agents.ml_model import (
    DotlocalAgentIntelModel,
    AgentFeatures,
    AgentIntelPrediction,
    AGENT_TYPES,
    MODEL_PATH,
    get_model,
)
from agents.simulation_runner import simulation_runner

router = APIRouter(prefix="/agents-sim/ml", tags=["Agent ML Intelligence"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class AgentFeaturesIn(BaseModel):
    agent_type_id:       int   = 0
    capital:             float = 10_000
    current_value:       float = 10_000
    pnl:                 float = 0.0
    trades_count:        float = 0
    total_volume:        float = 0
    win_rate:            float = 0.5
    alerts_triggered:    float = 0
    avg_trade_size:      float = 100
    trade_frequency:     float = 0.5
    avg_slippage:        float = 0.5
    last_profit:         float = 0.0
    pool_reserve_a:      float = 1_000_000
    pool_reserve_b:      float = 1_000_000
    pool_price:          float = 1.0
    pool_volume:         float = 0
    pool_swap_count:     float = 0
    price_deviation_pct: float = 0.0
    lending_health_avg:  float = 2.0
    liquidatable_ratio:  float = 0.0
    total_debt_ratio:    float = 0.5
    market_risk_level:   float = 0.5
    market_volatility_id: int  = 1


class AgentIntelOut(BaseModel):
    predicted_agent_type:    str
    agent_type_confidence:   float
    threat_score:            float
    threat_category:         str
    mev_attack_probability:  float
    flash_loan_probability:  float
    is_mev_pattern:          bool
    is_flash_loan_risk:      bool
    market_sentiment:        str
    sentiment_confidence:    float
    predicted_volatility:    str
    pnl_forecast:            float
    pnl_direction:           str
    wash_trading_score:      float
    is_wash_trading:         bool
    cascade_liquidation_risk: float
    cascade_imminent:        bool
    risk_level:              str
    warnings:                list[str]


class ModelStatus(BaseModel):
    ready:       bool
    version:     str
    pkl_size_kb: float
    n_samples:   int
    path:        str


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _sim_context() -> dict:
    """Build shared simulation context dict for predict_from_dict."""
    pool    = simulation_runner.pool.to_dict()
    lending = simulation_runner.lending.to_dict()
    mkt     = {}
    if simulation_runner._market_prices:
        try:
            mkt = simulation_runner.market_data.to_dict()
        except Exception:
            mkt = {}
    return {"pool": pool, "lending": lending, "market": mkt}


def _pred_to_out(p: AgentIntelPrediction) -> AgentIntelOut:
    return AgentIntelOut(**{k: v for k, v in p.__dict__.items()})


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/predict", response_model=AgentIntelOut)
async def predict_agent(body: AgentFeaturesIn):
    """Full ML prediction from raw feature values."""
    model = await asyncio.get_event_loop().run_in_executor(None, get_model)
    feat  = AgentFeatures(**body.model_dump())
    pred  = await asyncio.get_event_loop().run_in_executor(None, model.predict, feat)
    return _pred_to_out(pred)


@router.post("/predict/from-simulation/{agent_id}", response_model=AgentIntelOut)
async def predict_from_sim(agent_id: str):
    """Extract live agent + simulation features → full ML prediction."""
    agent = simulation_runner.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")

    ctx = _sim_context()
    ctx.update(agent)                  # merge agent fields into context
    model = await asyncio.get_event_loop().run_in_executor(None, get_model)
    pred  = await asyncio.get_event_loop().run_in_executor(
        None, model.predict_from_dict, ctx
    )
    return _pred_to_out(pred)


@router.get("/threat-matrix")
async def threat_matrix():
    """
    Score ALL active agents in the current simulation.
    Returns a ranked threat matrix (highest threat first).
    """
    agents = simulation_runner.get_agents()
    if not agents:
        return {"success": True, "data": [], "message": "No agents in simulation"}

    ctx      = _sim_context()
    enriched = [dict(**a, **ctx) for a in agents]

    model    = await asyncio.get_event_loop().run_in_executor(None, get_model)
    results  = await asyncio.get_event_loop().run_in_executor(
        None, model.predict_batch, enriched
    )

    # Sort by threat_score desc
    results.sort(key=lambda r: r.get("threat_score", 0), reverse=True)
    return {"success": True, "data": results}


@router.get("/market-forecast")
async def market_forecast():
    """
    Market sentiment + volatility forecast based on current simulation state.
    Returns a compact dict (no agent required).
    """
    ctx   = _sim_context()
    dummy = {
        "type": "retail_trader",
        "capital": 10_000,
        "current_value": 10_000,
        "pnl": 0,
        "stats": {},
        "win_rate": 0.5,
        **ctx,
    }
    model  = await asyncio.get_event_loop().run_in_executor(None, get_model)
    pred   = await asyncio.get_event_loop().run_in_executor(
        None, model.predict_from_dict, dummy
    )
    return {
        "success": True,
        "data": {
            "sentiment":          pred.market_sentiment,
            "sentiment_confidence": pred.sentiment_confidence,
            "volatility":         pred.predicted_volatility,
            "cascade_risk":       pred.cascade_liquidation_risk,
            "cascade_imminent":   pred.cascade_imminent,
            "warnings":           pred.warnings,
        },
    }


@router.get("/cascade-risk")
async def cascade_risk():
    """Cascade liquidation risk from current lending + pool state."""
    ctx  = _sim_context()
    dummy = {"type": "retail_trader", "capital": 10_000, "current_value": 10_000,
             "pnl": 0, "stats": {}, "win_rate": 0.5, **ctx}
    model = await asyncio.get_event_loop().run_in_executor(None, get_model)
    pred  = await asyncio.get_event_loop().run_in_executor(
        None, model.predict_from_dict, dummy
    )
    return {
        "success": True,
        "data": {
            "cascade_liquidation_risk": pred.cascade_liquidation_risk,
            "cascade_imminent":         pred.cascade_imminent,
        },
    }


@router.post("/retrain")
async def retrain(
    confirm:   bool = Query(False),
    n_samples: int  = Query(6000, ge=500, le=50_000),
):
    """Force re-train and overwrite .pkl. Pass ?confirm=true to proceed."""
    if not confirm:
        raise HTTPException(status_code=400, detail="Pass ?confirm=true to proceed.")

    import agents.ml_model as ml_mod

    async def _train():
        m = DotlocalAgentIntelModel().fit(n_samples)
        m.save(MODEL_PATH)
        ml_mod.agent_intel_model = m
        return m

    # Simple lock via module attribute
    if getattr(retrain, "_running", False):
        raise HTTPException(status_code=409, detail="Training already in progress.")
    retrain._running = True
    try:
        new_m = await _train()
        return {
            "status":    "success",
            "n_samples": new_m.n_samples,
            "version":   new_m.VERSION,
        }
    finally:
        retrain._running = False


@router.get("/status", response_model=ModelStatus)
async def model_status():
    """Model health + metadata."""
    exists = os.path.exists(MODEL_PATH)
    size   = os.path.getsize(MODEL_PATH) / 1024 if exists else 0.0
    import agents.ml_model as ml_mod
    m = ml_mod.agent_intel_model
    return ModelStatus(
        ready       = (m is not None and m.is_trained),
        version     = (m.VERSION if m else "n/a"),
        pkl_size_kb = round(size, 1),
        n_samples   = (m.n_samples if m else 0),
        path        = MODEL_PATH,
    )
