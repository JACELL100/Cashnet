"""
Lending and borrowing routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from blockchain_service import blockchain_service
from schemas import (
    DepositCollateralRequest,
    BorrowRequest,
    RepayRequest,
    HealthFactorResponse
)
from agents.simulation_runner import simulation_runner

router = APIRouter(prefix="/lending", tags=["Lending & Borrowing"])


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


@router.post("/deposit-collateral")
async def deposit_collateral(request: DepositCollateralRequest):
    """Deposit collateral (Disabled on backend)"""
    return {
        "status": "error",
        "wallet": request.wallet,
        "message": "L1 Integration Active: You must execute 'depositCollateral()' directly via Web3 in the frontend using MetaMask."
    }


@router.post("/borrow")
async def borrow_tokens(request: BorrowRequest):
    """Borrow tokens (Disabled on backend)"""
    return {
        "status": "error",
        "wallet": request.wallet,
        "message": "L1 Integration Active: You must execute 'borrow()' directly via Web3 in the frontend using MetaMask."
    }


@router.post("/repay")
async def repay_loan(request: RepayRequest):
    """Repay borrowed tokens (Disabled on backend)"""
    return {
        "status": "error",
        "wallet": request.wallet,
        "message": "L1 Integration Active: You must execute 'repay()' directly via Web3 in the frontend using MetaMask."
    }


@router.get("/health-factor/{wallet}", response_model=HealthFactorResponse)
async def get_health_factor(wallet: str):
    """Get dynamic health factor for a borrower from the Sepolia contracts"""
    try:
        if "LendingPool" not in blockchain_service.contracts:
            raise Exception("Contracts not loaded")
        
        # LendingPool v2 getAccountData (Chainlink-priced; HF < 1 => liquidatable)
        pos = blockchain_service.get_account_position(wallet)
        return {
            "wallet": pos["wallet"],
            "collateral_value": round(pos["collateral_eth"], 6),  # ETH (frontend shows it with fmtETH)
            "collateral_usd": round(pos["collateral_usd"], 2),
            "debt_value": round(pos["debt"], 6),  # PLDM (~USD)
            "health_factor": round(pos["health_factor"], 4),
            "liquidation_threshold": round((pos["max_ltv"] + 5) / 100.0, 4) if pos["max_ltv"] else 0.0,
            "at_risk": pos["at_risk"]
        }
    except Exception as e:
        print(f"Error fetching health factor from chain: {e}")
        return {
            "wallet": wallet,
            "collateral_value": 0.0,
            "debt_value": 0.0,
            "health_factor": 999.0,
            "liquidation_threshold": 0.0,
            "at_risk": False
        }


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
