"""
ML Risk Router — endpoints under /liquidity-engine/ml
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict
from functools import partial
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .ml_model import DotlocalRiskModel, PoolFeatures, RiskPrediction, get_model, MODEL_PATH
from .pool_store import pool_store

import os

router = APIRouter(prefix="/liquidity-engine/ml", tags=["ML Risk Engine"])


# ─── Request / Response schemas ───────────────────────────────────────────────

class PoolFeaturesIn(BaseModel):
    reserve0:       float
    reserve1:       float
    price:          float
    tvl:            float
    volume_24h:     float
    swap_count:     float
    provider_count: float
    fee_pct:        float
    trade_size:     float = 0.0
    price_ratio:    float = 1.0


class RiskPredictionOut(BaseModel):
    slippage_pct:       float
    drain_risk_score:   float
    drain_risk_label:   str
    il_forecast_1h:     float
    il_forecast_24h:    float
    anomaly_score:      float
    is_anomaly:         bool
    confidence:         float
    warnings:           list[str]


class SlippagePoint(BaseModel):
    trade_size:     float
    slippage_pct:   float


class ModelStatus(BaseModel):
    ready:      bool
    version:    str
    pkl_size_kb: float
    n_samples:  int
    path:       str


# ─── Helper ──────────────────────────────────────────────────────────────────

def _pred_to_out(pred: RiskPrediction) -> RiskPredictionOut:
    return RiskPredictionOut(**asdict(pred))


def _run_in_executor(fn, *args):
    loop = asyncio.get_event_loop()
    return loop.run_in_executor(None, partial(fn, *args))


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/predict", response_model=RiskPredictionOut)
async def predict_risk(body: PoolFeaturesIn):
    """Run full risk prediction from raw feature values."""
    model = await asyncio.get_event_loop().run_in_executor(None, get_model)
    features = PoolFeatures(**body.model_dump())
    pred = await asyncio.get_event_loop().run_in_executor(None, model.predict, features)
    return _pred_to_out(pred)


@router.post("/predict/from-pool/{pool_id}", response_model=RiskPredictionOut)
async def predict_risk_from_pool(
    pool_id: str,
    trade_size: float = Query(0.0, ge=0, description="Hypothetical trade size in token0 units"),
    price_ratio: float = Query(1.0, description="current_price / entry_price"),
):
    """Extract features from a live pool and run risk prediction."""
    pool = pool_store.get_pool(pool_id)
    if pool is None:
        raise HTTPException(status_code=404, detail=f"Pool '{pool_id}' not found")

    state = pool.state()
    tvl = (state["reserve0"] + state["reserve1"] * state["price"]) / 2
    features = PoolFeatures(
        reserve0       = state["reserve0"],
        reserve1       = state["reserve1"],
        price          = state["price"],
        tvl            = tvl,
        volume_24h     = state.get("volume_24h", tvl * 0.05),
        swap_count     = state.get("swap_count", 0.0),
        provider_count = max(state.get("lp_count", 1.0), 1.0),
        fee_pct        = state.get("fee", 0.003) * 100,
        trade_size     = trade_size,
        price_ratio    = price_ratio,
    )
    model = await asyncio.get_event_loop().run_in_executor(None, get_model)
    pred  = await asyncio.get_event_loop().run_in_executor(None, model.predict, features)
    return _pred_to_out(pred)


@router.get("/slippage-curve", response_model=list[SlippagePoint])
async def ml_slippage_curve(
    pool_id: str = Query("default", description="Pool ID"),
    steps:   int = Query(20, ge=5, le=100, description="Number of points on the curve"),
):
    """Return an ML-predicted slippage curve for increasing trade sizes."""
    pool = pool_store.get_pool(pool_id)
    if pool is None:
        raise HTTPException(status_code=404, detail=f"Pool '{pool_id}' not found")

    state = pool.state()
    tvl   = (state["reserve0"] + state["reserve1"] * state["price"]) / 2
    model = await asyncio.get_event_loop().run_in_executor(None, get_model)

    base = PoolFeatures(
        reserve0       = state["reserve0"],
        reserve1       = state["reserve1"],
        price          = state["price"],
        tvl            = tvl,
        volume_24h     = state.get("volume_24h", tvl * 0.05),
        swap_count     = state.get("swap_count", 0.0),
        provider_count = max(state.get("lp_count", 1.0), 1.0),
        fee_pct        = state.get("fee", 0.003) * 100,
        trade_size     = 0.0,
        price_ratio    = 1.0,
    )

    import numpy as np
    max_trade = state["reserve0"] * 0.40
    curve: list[SlippagePoint] = []

    for t in np.linspace(max_trade / steps, max_trade, steps):
        base.trade_size = float(t)
        pred = await asyncio.get_event_loop().run_in_executor(None, model.predict, base)
        curve.append(SlippagePoint(trade_size=float(t), slippage_pct=pred.slippage_pct))

    return curve


@router.post("/retrain", response_model=dict)
async def retrain_model(
    confirm:   bool = Query(False),
    n_samples: int  = Query(5000, ge=500, le=30000),
):
    """Force re-train the model and overwrite the .pkl file."""
    if not confirm:
        raise HTTPException(status_code=400, detail="Pass ?confirm=true to proceed.")
    global _training_lock
    import threading
    if not hasattr(retrain_model, "_lock"):
        retrain_model._lock = threading.Lock()
    if not retrain_model._lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Training already in progress.")

    try:
        from .ml_model import risk_model as _rm
        import liquidity_engine.ml_model as ml_mod

        def _train():
            m = DotlocalRiskModel().fit(n_samples)
            m.save(MODEL_PATH)
            ml_mod.risk_model = m
            return m

        new_model = await asyncio.get_event_loop().run_in_executor(None, _train)
        return {
            "status":    "success",
            "n_samples": new_model.n_samples,
            "version":   new_model.VERSION,
            "message":   "Model retrained and saved.",
        }
    finally:
        retrain_model._lock.release()


@router.get("/status", response_model=ModelStatus)
async def model_status():
    """Return model health and metadata."""
    exists = os.path.exists(MODEL_PATH)
    size   = os.path.getsize(MODEL_PATH) / 1024 if exists else 0.0

    import liquidity_engine.ml_model as ml_mod
    m = ml_mod.risk_model
    return ModelStatus(
        ready       = (m is not None and m.is_trained),
        version     = (m.VERSION if m else "n/a"),
        pkl_size_kb = round(size, 1),
        n_samples   = (m.n_samples if m else 0),
        path        = MODEL_PATH,
    )
