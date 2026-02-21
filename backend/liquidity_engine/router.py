"""
Liquidity Engine Router — FastAPI endpoints for the AMM simulation engine.
All routes are prefixed with /liquidity-engine
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

from .pool_store import pool_store
from .amm_pool import AMMPool

router = APIRouter(prefix="/liquidity-engine", tags=["Liquidity Engine"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class CreatePoolRequest(BaseModel):
    token0: str = "USDC"
    token1: str = "ETH"
    reserve0: float = Field(default=100_000.0, gt=0)
    reserve1: float = Field(default=31.25, gt=0)
    fee_bps: int = Field(default=30, ge=1, le=1000)   # 1 bp – 10%
    name: Optional[str] = None


class AddLiquidityRequest(BaseModel):
    provider: str = "default_user"
    amount0: float = Field(..., gt=0, description="Amount of token0 to deposit")
    max_slippage_pct: float = Field(default=1.0, ge=0)


class RemoveLiquidityRequest(BaseModel):
    provider: str = "default_user"
    lp_tokens: float = Field(..., gt=0)


class SwapRequest(BaseModel):
    direction: str = Field(
        default="token0_to_token1",
        pattern="^(token0_to_token1|token1_to_token0)$",
    )
    amount_in: float = Field(..., gt=0)


class StressTestRequest(BaseModel):
    scenario: str = Field(
        default="flash_swap",
        pattern="^(flash_swap|mass_withdrawal|sustained_drain|price_crash)$",
    )
    intensity: float = Field(default=1.0, ge=0.1, le=2.0)


class ILRequest(BaseModel):
    entry_price: float = Field(..., gt=0, description="token0 per token1 at LPs entry")


# ---------------------------------------------------------------------------
# Pool management
# ---------------------------------------------------------------------------

@router.get("/pools")
async def list_pools():
    """List all registered pools."""
    return {"success": True, "data": pool_store.list_pools()}


@router.post("/pools")
async def create_pool(req: CreatePoolRequest):
    """Create a new simulated AMM pool."""
    pool = pool_store.create_pool(
        token0=req.token0,
        token1=req.token1,
        reserve0=req.reserve0,
        reserve1=req.reserve1,
        fee_bps=req.fee_bps,
        name=req.name,
    )
    return {"success": True, "data": pool.get_state()}


@router.delete("/pools/{pool_id}")
async def delete_pool(pool_id: str):
    """Delete a pool (cannot delete 'default')."""
    try:
        pool_store.delete_pool(pool_id)
        return {"success": True, "data": {"deleted": pool_id}}
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/pools/reset-default")
async def reset_default_pool():
    """Reset the default pool to its initial state."""
    pool_store.reset_default()
    pool = pool_store.get_or_raise("default")
    return {"success": True, "data": pool.get_state()}


# ---------------------------------------------------------------------------
# Pool state
# ---------------------------------------------------------------------------

@router.get("/pools/{pool_id}/state")
async def get_pool_state(pool_id: str = "default"):
    """Get current pool state snapshot."""
    try:
        pool = pool_store.get_or_raise(pool_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"success": True, "data": pool.get_state()}


@router.get("/pools/{pool_id}/events")
async def get_pool_events(pool_id: str = "default", limit: int = Query(default=20, le=100)):
    """Get recent pool events."""
    try:
        pool = pool_store.get_or_raise(pool_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"success": True, "data": pool.get_recent_events(limit=limit)}


# ---------------------------------------------------------------------------
# Liquidity operations
# ---------------------------------------------------------------------------

@router.post("/pools/{pool_id}/add-liquidity")
async def add_liquidity(pool_id: str, req: AddLiquidityRequest):
    """Add liquidity to pool."""
    try:
        pool = pool_store.get_or_raise(pool_id)
        result = pool.add_liquidity(req.provider, req.amount0, req.max_slippage_pct)
        return {"success": True, "data": result, "pool_state": pool.get_state()}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (ValueError, ArithmeticError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/pools/{pool_id}/remove-liquidity")
async def remove_liquidity(pool_id: str, req: RemoveLiquidityRequest):
    """Remove liquidity from pool by burning LP tokens."""
    try:
        pool = pool_store.get_or_raise(pool_id)
        result = pool.remove_liquidity(req.provider, req.lp_tokens)
        return {"success": True, "data": result, "pool_state": pool.get_state()}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (ValueError, ArithmeticError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Swap
# ---------------------------------------------------------------------------

@router.post("/pools/{pool_id}/swap")
async def swap(pool_id: str, req: SwapRequest):
    """Execute a swap on the pool."""
    try:
        pool = pool_store.get_or_raise(pool_id)
        if req.direction == "token0_to_token1":
            result = pool.swap_token0_for_token1(req.amount_in)
        else:
            result = pool.swap_token1_for_token0(req.amount_in)
        return {
            "success": True,
            "data": {
                "amount_in": result.amount_in,
                "amount_out": result.amount_out,
                "fee_paid": result.fee_paid,
                "price_impact": result.price_impact,
                "execution_price": result.execution_price,
                "new_price": result.new_price,
                "slippage": result.slippage,
            },
            "pool_state": pool.get_state(),
        }
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (ValueError, ArithmeticError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

@router.get("/pools/{pool_id}/slippage-curve")
async def slippage_curve(
    pool_id: str,
    direction: str = Query(default="token0_to_token1", pattern="^(token0_to_token1|token1_to_token0)$"),
    steps: int = Query(default=20, ge=5, le=50),
):
    """Compute slippage vs. trade size curve."""
    try:
        pool = pool_store.get_or_raise(pool_id)
        curve = pool.get_slippage_curve(direction=direction, steps=steps)
        return {"success": True, "data": curve}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/pools/{pool_id}/depth-chart")
async def depth_chart(
    pool_id: str,
    price_range_pct: float = Query(default=10.0, ge=1.0, le=50.0),
    levels: int = Query(default=20, ge=5, le=50),
):
    """Get simulated liquidity depth chart."""
    try:
        pool = pool_store.get_or_raise(pool_id)
        data = pool.get_depth_chart(price_range_pct=price_range_pct, levels=levels)
        return {"success": True, "data": data}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/pools/{pool_id}/impermanent-loss")
async def impermanent_loss(pool_id: str, req: ILRequest):
    """Calculate impermanent loss given an entry price."""
    try:
        pool = pool_store.get_or_raise(pool_id)
        data = pool.get_impermanent_loss(req.entry_price)
        return {"success": True, "data": data}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
# Stress testing
# ---------------------------------------------------------------------------

@router.post("/pools/{pool_id}/stress-test")
async def stress_test(pool_id: str, req: StressTestRequest):
    """
    Run a stress scenario on a clone of the pool (non-destructive).
    Scenarios: flash_swap | mass_withdrawal | sustained_drain | price_crash
    """
    try:
        pool = pool_store.get_or_raise(pool_id)
        result = pool.stress_test(scenario=req.scenario, intensity=req.intensity)
        return {
            "success": True,
            "data": {
                "scenario": result.scenario,
                "initial_tvl": result.initial_tvl,
                "final_tvl": result.final_tvl,
                "tvl_change_pct": result.tvl_change_pct,
                "initial_price": result.initial_price,
                "final_price": result.final_price,
                "price_change_pct": result.price_change_pct,
                "liquidity_removed": result.liquidity_removed,
                "slippage_at_peak": result.slippage_at_peak,
                "time_to_drain_estimate": result.time_to_drain_estimate,
                "events": result.events,
                "risk_score": result.risk_score,
            },
        }
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (ValueError, ArithmeticError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
