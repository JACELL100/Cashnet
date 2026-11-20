"""
Indexed on-chain events (populated by chain_indexer.py) -> /api/chain/*
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from chain_indexer import query_events, serialize_event, CURSOR_KEY
from database import get_db
from models import KeyValueState

router = APIRouter(prefix="/api/chain", tags=["Chain Events"])


@router.get("/events")
async def get_chain_events(
    contract: Optional[str] = Query(None, description="LendingPool | LiquidityPool"),
    event: Optional[str] = Query(None, description="Event name, comma-separated allowed (e.g. Borrowed,Repaid)"),
    wallet: Optional[str] = Query(None, description="Filter by actor wallet (user/provider)"),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Real on-chain events indexed from Sepolia, newest first."""
    events = [e.strip() for e in event.split(",") if e.strip()] if event else None
    rows = query_events(db, contract=contract, events=events, wallet=wallet, limit=limit)
    cursor = db.query(KeyValueState).filter(KeyValueState.key == CURSOR_KEY).first()
    return {
        "success": True,
        "indexed_through_block": int(cursor.value) if cursor and cursor.value else None,
        "count": len(rows),
        "data": [serialize_event(r) for r in rows],
    }
