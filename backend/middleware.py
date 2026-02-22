"""
Middleware and dependency functions for FastAPI endpoints
"""
from fastapi import HTTPException, status
from blockchain_service import blockchain_service


async def check_system_not_paused():
    """
    Dependency to check if system is paused before allowing blockchain transactions.
    Raises HTTPException if system is paused.
    
    Usage:
        @router.post("/swap", dependencies=[Depends(check_system_not_paused)])
        async def swap_tokens(...):
            ...
    """
    try:
        if "AccessControl" in blockchain_service.contracts:
            is_paused = blockchain_service.call_contract_function("AccessControl", "paused")
            if is_paused:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={
                        "error": "SYSTEM_PAUSED",
                        "message": "System is currently paused. All blockchain transactions are frozen.",
                        "suggestion": "Please wait for the system to be resumed or contact an administrator."
                    }
                )
    except HTTPException:
        raise
    except Exception as e:
        # If we can't check pause status, log warning and allow operation
        print(f"⚠️  Warning: Could not verify pause status: {e}")


def check_system_paused_sync():
    """
    Synchronous version of check_system_not_paused for use in non-async functions.
    Returns True if paused, False otherwise.
    """
    try:
        if "AccessControl" in blockchain_service.contracts:
            return blockchain_service.call_contract_function("AccessControl", "paused")
        return False
    except Exception as e:
        print(f"⚠️  Warning: Could not check pause status: {e}")
        return False
