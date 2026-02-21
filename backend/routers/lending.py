"""
Lending and borrowing routes
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from schemas import (
    DepositCollateralRequest,
    BorrowRequest,
    RepayRequest,
    HealthFactorResponse
)
from agents.simulation_runner import simulation_runner

router = APIRouter(prefix="/lending", tags=["Lending & Borrowing"])


@router.post("/deposit-collateral")
async def deposit_collateral(
    request: DepositCollateralRequest,
    db: Session = Depends(get_db)
):
    """Deposit collateral to enable borrowing"""
    try:
        
        pos = simulation_runner.lending.positions.get(request.wallet)
        if pos:
            pos.collateral += request.amount
            simulation_runner.lending._recompute()
        
        return {
            "status": "success",
            "wallet": request.wallet,
            "collateral_deposited": request.amount,
            "message": f"Deposited {request.amount} collateral",
            "new_total_collateral": pos.collateral if pos else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/borrow")
async def borrow_tokens(
    request: BorrowRequest,
    db: Session = Depends(get_db)
):
    """Borrow tokens against collateral"""
    try:
        pos = simulation_runner.lending.positions.get(request.wallet)
        if not pos:
            raise HTTPException(status_code=404, detail="Borrower position not found in simulation.")
        
        # Check if the borrow would push them over their max LTV
        if not simulation_runner.lending.can_borrow(request.amount, request.wallet):
            raise HTTPException(status_code=400, detail="Borrow cap exceeded or credit limit reached.")
            
        pos.debt += request.amount
        simulation_runner.lending._recompute()
        health_factor = pos.health_factor
        
        if health_factor < 1.0:
            # Revert
            pos.debt -= request.amount
            simulation_runner.lending._recompute()
            raise HTTPException(
                status_code=400,
                detail="Insufficient collateral. Health factor would drop too low."
            )
        
        return {
            "status": "success",
            "wallet": request.wallet,
            "borrowed_amount": request.amount,
            "health_factor": round(health_factor, 4),
            "message": f"Borrowed {request.amount} tokens"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/repay")
async def repay_loan(
    request: RepayRequest,
    db: Session = Depends(get_db)
):
    """Repay borrowed tokens"""
    try:
        pos = simulation_runner.lending.positions.get(request.wallet)
        if pos:
            repay_amount = min(request.amount, pos.debt)
            pos.debt -= repay_amount
            pos.credit_profile.successful_repay_volume += repay_amount
            simulation_runner.lending._recompute()
        
        return {
            "status": "success",
            "wallet": request.wallet,
            "repaid_amount": request.amount,
            "message": f"Repaid {request.amount} tokens"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health-factor/{wallet}", response_model=HealthFactorResponse)
async def get_health_factor(wallet: str):
    """Get dynamic health factor for a borrower from the simulation engine"""
    try:
        pos = simulation_runner.lending.positions.get(wallet)
        if not pos:
            # Return sensible defaults for wallets not actively tracked in sim
            return {
                "wallet": wallet,
                "collateral_value": 0.0,
                "debt_value": 0.0,
                "health_factor": 999.0,
                "liquidation_threshold": 1.05,
                "at_risk": False
            }
        
        return {
            "wallet": wallet,
            "collateral_value": round(pos.collateral, 2),
            "debt_value": round(pos.debt, 2),
            "health_factor": round(pos.health_factor, 4),
            "liquidation_threshold": round(pos.liquidation_threshold, 4),
            "at_risk": pos.is_liquidatable
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/liquidate/{wallet}")
async def liquidate_position(wallet: str, db: Session = Depends(get_db)):
    """Liquidate an undercollateralized position via the simulation engine"""
    try:
        receipt = simulation_runner.lending.liquidate(wallet)
        if not receipt:
            return {
                "status": "failed",
                "wallet": wallet,
                "message": "Position not liquidatable or does not exist."
            }
            
        return {
            "status": "liquidated",
            "wallet": wallet,
            "collateral_seized": receipt["seized_collateral"],
            "debt_covered": receipt["debt_covered"],
            "message": "Position liquidated successfully in simulation",
            "remaining_hf": receipt["remaining_hf"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cascade-simulation")
async def simulate_cascade(price_drop_percentage: float = 30.0):
    """Simulate price crash and cascade liquidations via the stress engine"""
    try:
        magnitude = price_drop_percentage / 10.0
        result = simulation_runner.trigger_stress_event("price_crash", magnitude)
        
        # Count at-risk positions
        at_risk = len(simulation_runner.lending.get_liquidatable())
        
        return {
            "status": "simulation_started",
            "price_drop": price_drop_percentage,
            "positions_at_risk": at_risk,
            "estimated_liquidations": at_risk, # In the sim, liquidators will hop on this next tick
            "total_debt_at_risk": sum(p.debt for p in simulation_runner.lending.get_liquidatable())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
