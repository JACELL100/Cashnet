"""
Pool management routes for liquidity operations
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from schemas import (
    AddLiquidityRequest,
    SwapRequest,
    PoolStateResponse
)
from blockchain_service import blockchain_service

router = APIRouter(prefix="/pool", tags=["Liquidity Pool"])


def check_system_paused():
    """Check if system is paused and raise exception if it is"""
    try:
        if "AccessControl" in blockchain_service.contracts:
            is_paused = blockchain_service.call_contract_function("AccessControl", "paused")
            if is_paused:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="System is paused. All operations are currently frozen."
                )
    except HTTPException:
        raise
    except Exception as e:
        # If we can't check pause status, allow operation but log warning
        print(f"Warning: Could not check pause status: {e}")


@router.get("/state", response_model=PoolStateResponse)
async def get_pool_state():
    """Get current liquidity pool state"""
    try:
        # Mock data for now - will be replaced with actual blockchain calls
        return {
            "reserve_a": 1000000.0,
            "reserve_b": 2000000.0,
            "price_a_per_b": 2.0,
            "price_b_per_a": 0.5,
            "total_liquidity": 3000000.0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/add-liquidity")
async def add_liquidity(
    request: AddLiquidityRequest,
    db: Session = Depends(get_db)
):
    """Add liquidity to the pool"""
    check_system_paused()
    try:
        # TODO: Implement actual blockchain transaction
        return {
            "status": "success",
            "message": f"Added liquidity: {request.amount_a} TokenA + {request.amount_b} TokenB",
            "wallet": request.wallet
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/remove-liquidity")
async def remove_liquidity(
    wallet: str,
    amount: float,
    db: Session = Depends(get_db)
):
    """Remove liquidity from the pool"""
    check_system_paused()
    try:
        # TODO: Implement actual blockchain transaction
        return {
            "status": "success",
            "message": f"Removed {amount} liquidity",
            "wallet": wallet
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/swap")
async def swap_tokens(
    request: SwapRequest,
    db: Session = Depends(get_db)
):
    """Swap tokens in the pool"""
    check_system_paused()
    try:
        # Mock calculation (x*y=k formula)
        slippage = (request.amount_in / 1000000) * 100  # Simple slippage estimation
        
        return {
            "status": "success",
            "token_in": request.token_in,
            "token_out": request.token_out,
            "amount_in": request.amount_in,
            "amount_out": request.amount_in * 2,  # Mock 1:2 ratio
            "slippage": slippage,
            "wallet": request.wallet
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stress-test")
async def run_stress_test(withdrawal_percentage: float = 50.0):
    """Simulate mass withdrawal stress test"""
    try:
        return {
            "status": "simulation_started",
            "withdrawal_percentage": withdrawal_percentage,
            "estimated_slippage": withdrawal_percentage * 1.5,
            "time_to_drain_minutes": 5
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
