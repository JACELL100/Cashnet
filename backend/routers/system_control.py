"""
System Control Router - Admin functions for pause/unpause and emergency controls
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
import json
from pathlib import Path

from database import get_db
from models import AdminAuditor, AdminAuditorRoleEnum, LogCategoryEnum
from blockchain_service import blockchain_service
from config import settings
from routers.auth import get_current_admin_or_auditor
from logging_utils import log_success, log_error, log_warn, log_info

router = APIRouter(prefix="/system", tags=["system-control"])

# Load AccessControl contract ABI
abi_path = Path(__file__).parent.parent.parent / "contracts" / "abi" / "AccessControl.json"
with open(abi_path) as f:
    ACCESS_CONTROL_ABI = json.load(f)

# Load contract
try:
    blockchain_service.load_contract(
        "AccessControl",
        settings.access_control_address,
        ACCESS_CONTROL_ABI
    )
    print(f"✅ AccessControl contract loaded at {settings.access_control_address}")
except Exception as e:
    print(f"⚠️  Warning: Could not load AccessControl contract: {e}")


class SystemStatusResponse(BaseModel):
    connected: bool
    block_number: int
    paused: bool
    access_control_address: str


class PauseResponse(BaseModel):
    success: bool
    message: str
    tx_hash: str | None = None
    paused: bool


@router.get("/status", response_model=SystemStatusResponse)
async def get_system_status():
    """
    Get current system status including blockchain connection and pause state
    """
    try:
        connected = blockchain_service.is_connected()
        block_number = blockchain_service.get_block_number() if connected else 0
        
        # Check if system is paused
        paused = False
        if connected and "AccessControl" in blockchain_service.contracts:
            paused = blockchain_service.call_contract_function("AccessControl", "paused")
        
        return SystemStatusResponse(
            connected=connected,
            block_number=block_number,
            paused=paused,
            access_control_address=settings.access_control_address
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get system status: {str(e)}"
        )


@router.post("/pause", response_model=PauseResponse)
async def pause_system(
    current_user: AdminAuditor = Depends(get_current_admin_or_auditor),
    db: Session = Depends(get_db)
):
    """
    Pause all contract operations (Admin only)
    
    This emergency function freezes:
    - All lending pool operations
    - All liquidity pool operations  
    - Collateral deposits/withdrawals
    
    Only admins with ADMIN_ROLE on-chain can execute this.
    """
    # Verify user is ADMIN
    if current_user.role != AdminAuditorRoleEnum.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can pause the system"
        )
    
    try:
        # Check if already paused
        is_paused = blockchain_service.call_contract_function("AccessControl", "paused")
        if is_paused:
            log_info(
                LogCategoryEnum.SYSTEM,
                "System Control",
                f"Pause request received but system already paused (admin: {current_user.email})"
            )
            return PauseResponse(
                success=True,
                message="System is already paused",
                paused=True
            )
        
        # Send pause transaction
        log_warn(
            LogCategoryEnum.SYSTEM,
            "System Control",
            f"⏸ EMERGENCY PAUSE initiated by admin: {current_user.email}",
            metadata={"admin_id": current_user.id, "admin_email": current_user.email}
        )
        
        tx_hash = blockchain_service.send_transaction(
            "AccessControl",
            "pauseAll"
        )
        
        log_success(
            LogCategoryEnum.SYSTEM,
            "System Control",
            f"✅ System PAUSED successfully - All blockchain operations frozen",
            metadata={
                "tx_hash": tx_hash,
                "admin_id": current_user.id,
                "admin_email": current_user.email,
                "timestamp": datetime.utcnow().isoformat()
            }
        )
        
        return PauseResponse(
            success=True,
            message="System paused successfully. All blockchain operations are now frozen.",
            tx_hash=tx_hash,
            paused=True
        )
    except Exception as e:
        log_error(
            LogCategoryEnum.SYSTEM,
            "System Control",
            f"❌ Failed to pause system: {str(e)}",
            metadata={"admin_email": current_user.email, "error": str(e)}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "PAUSE_FAILED",
                "message": f"Failed to pause system: {str(e)}",
                "suggestion": "Check blockchain connection and try again."
            }
        )


@router.post("/unpause", response_model=PauseResponse)
async def unpause_system(
    current_user: AdminAuditor = Depends(get_current_admin_or_auditor),
    db: Session = Depends(get_db)
):
    """
    Resume all contract operations (Admin only)
    
    This lifts the emergency pause and allows:
    - Lending pool operations to resume
    - Liquidity pool operations to resume
    - Collateral operations to resume
    
    Only admins with ADMIN_ROLE on-chain can execute this.
    """
    # Verify user is ADMIN
    if current_user.role != AdminAuditorRoleEnum.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can unpause the system"
        )
    
    try:
        # Check if already unpaused
        is_paused = blockchain_service.call_contract_function("AccessControl", "paused")
        if not is_paused:
            log_info(
                LogCategoryEnum.SYSTEM,
                "System Control",
                f"Unpause request received but system already active (admin: {current_user.email})"
            )
            return PauseResponse(
                success=True,
                message="System is already active",
                paused=False
            )
        
        # Send unpause transaction
        log_info(
            LogCategoryEnum.SYSTEM,
            "System Control",
            f"▶ SYSTEM RESUME initiated by admin: {current_user.email}",
            metadata={"admin_id": current_user.id, "admin_email": current_user.email}
        )
        
        tx_hash = blockchain_service.send_transaction(
            "AccessControl",
            "unpauseAll"
        )
        
        log_success(
            LogCategoryEnum.SYSTEM,
            "System Control",
            f"✅ System RESUMED successfully - All blockchain operations restored",
            metadata={
                "tx_hash": tx_hash,
                "admin_id": current_user.id,
                "admin_email": current_user.email,
                "timestamp": datetime.utcnow().isoformat()
            }
        )
        
        return PauseResponse(
            success=True,
            message="System resumed successfully. All blockchain operations are now active.",
            tx_hash=tx_hash,
            paused=False
        )
    except Exception as e:
        log_error(
            LogCategoryEnum.SYSTEM,
            "System Control",
            f"❌ Failed to unpause system: {str(e)}",
            metadata={"admin_email": current_user.email, "error": str(e)}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "UNPAUSE_FAILED",
                "message": f"Failed to unpause system: {str(e)}",
                "suggestion": "Check blockchain connection and try again."
            }
        )
