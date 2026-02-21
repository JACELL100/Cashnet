"""
Blockchain Router — On-Chain Transaction Monitoring & Token Management
=======================================================================
Provides endpoints for:
  - Getting blockchain transaction history
  - Viewing token balances (Palladium & Badassium)
  - Getting blockchain integration stats
  - Viewing contract addresses and network info
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict, List, Any, Optional
from agents.blockchain_integrator import get_blockchain_integrator

router = APIRouter(prefix="/blockchain", tags=["blockchain"])


@router.get("/transactions")
async def get_blockchain_transactions(
    limit: int = Query(50, ge=1, le=200, description="Number of recent transactions"),
    contract: Optional[str] = Query(None, description="Filter by contract name"),
) -> Dict[str, Any]:
    """
    Get blockchain transaction history from simulation.
    
    Returns both real on-chain transactions and simulated transaction records.
    """
    try:
        integrator = await get_blockchain_integrator()
        
        if contract:
            transactions = integrator.get_tx_by_contract(contract)
        else:
            transactions = integrator.get_tx_history(limit)
        
        return {
            "success": True,
            "transaction_count": len(transactions),
            "transactions": transactions,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch transactions: {str(e)}")


@router.get("/stats")
async def get_blockchain_stats() -> Dict[str, Any]:
    """
    Get blockchain integration statistics.
    
    Includes:
    - Connection status
    - Total transaction counts
    - Gas usage
    - Contract addresses
    - Token contracts (Palladium & Badassium)
    """
    try:
        integrator = await get_blockchain_integrator()
        stats = integrator.get_stats()
        
        return {
            "success": True,
            **stats,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch blockchain stats: {str(e)}")


@router.get("/tokens/balance/{address}")
async def get_token_balance(
    address: str,
    token: str = Query("PALLADIUM", description="Token symbol (PALLADIUM or BADASSIUM)"),
) -> Dict[str, Any]:
    """
    Get token balance for a wallet address.
    """
    try:
        integrator = await get_blockchain_integrator()
        
        if token.upper() not in ["PALLADIUM", "BADASSIUM"]:
            raise HTTPException(status_code=400, detail="Invalid token. Must be PALLADIUM or BADASSIUM")
        
        balance = await integrator.get_token_balance(token, address)
        
        return {
            "success": True,
            "token": token.upper(),
            "address": address,
            "balance": balance,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch token balance: {str(e)}")


@router.get("/tokens/info")
async def get_token_info() -> Dict[str, Any]:
    """
    Get information about deployed token contracts.
    """
    try:
        integrator = await get_blockchain_integrator()
        
        return {
            "success": True,
            "tokens": {
                "PALLADIUM": {
                    "symbol": "PALLADIUM",
                    "address": integrator.token_contracts.get("PALLADIUM", "Not deployed"),
                    "decimals": 18,
                },
                "BADASSIUM": {
                    "symbol": "BADASSIUM",
                    "address": integrator.token_contracts.get("BADASSIUM", "Not deployed"),
                    "decimals": 18,
                },
            },
            "network": "Sepolia Testnet",
            "explorer": "https://sepolia.etherscan.io",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch token info: {str(e)}")


@router.get("/network")
async def get_network_info() -> Dict[str, Any]:
    """
    Get blockchain network information.
    """
    try:
        integrator = await get_blockchain_integrator()
        
        return {
            "success": True,
            "connected": integrator.blockchain.is_connected(),
            "network": "Sepolia Testnet",
            "current_block": integrator.blockchain.get_block_number() if integrator.blockchain.is_connected() else 0,
            "contracts": integrator.contract_addresses,
            "explorer_base_url": "https://sepolia.etherscan.io",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch network info: {str(e)}")


@router.get("/transactions/{tx_hash}")
async def get_transaction_details(tx_hash: str) -> Dict[str, Any]:
    """
    Get details of a specific transaction by hash.
    """
    try:
        integrator = await get_blockchain_integrator()
        
        # Search for transaction in history
        tx = None
        for transaction in integrator.tx_history:
            if transaction.tx_hash == tx_hash:
                tx = transaction.to_dict()
                break
        
        if not tx:
            raise HTTPException(status_code=404, detail="Transaction not found")
        
        return {
            "success": True,
            "transaction": tx,
            "explorer_url": f"https://sepolia.etherscan.io/tx/{tx_hash}",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch transaction: {str(e)}")
