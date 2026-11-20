"""
Chain indexer - polls Sepolia logs for LendingPool / LiquidityPool events and stores them in `chain_events`.

- Runs as a background asyncio task started from main.py (startup).
- Every POLL_INTERVAL seconds: fetch logs from (last processed block + 1) up to (latest - CONFIRMATIONS)
  in chunks of <= CHUNK_SIZE blocks (Alchemy free-tier eth_getLogs range limit).
- Cursor is persisted in kv_state[CURSOR_KEY] so restarts resume.
  First run starts at env CHAIN_INDEX_START_BLOCK, else (latest - DEFAULT_LOOKBACK).
- All web3 / DB work is blocking and runs via asyncio.to_thread. Errors are logged, never raised.
"""
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from web3 import Web3

from blockchain_service import blockchain_service
from config import settings
from database import SessionLocal
from models import ChainEvent, KeyValueState

POLL_INTERVAL = int(os.getenv("CHAIN_INDEX_POLL_SECONDS", "30"))
# Optional separate RPC for eth_getLogs. Alchemy FREE tier only allows a 10-block getLogs range;
# e.g. https://ethereum-sepolia-rpc.publicnode.com accepts large ranges.
LOGS_RPC_URL = os.getenv("CHAIN_INDEX_RPC_URL", "").strip()
_default_chunk = "10" if (not LOGS_RPC_URL and "alchemy" in (settings.sepolia_rpc_url or "")) else "500"
CHUNK_SIZE = int(os.getenv("CHAIN_INDEX_CHUNK_SIZE", _default_chunk))
MIN_CHUNK_SIZE = 10
MAX_CHUNKS_PER_CYCLE = int(os.getenv("CHAIN_INDEX_MAX_CHUNKS_PER_CYCLE", "40"))
DEFAULT_LOOKBACK = 50_000
CONFIRMATIONS = 2
CURSOR_KEY = "chain_indexer:last_block"
ADDRESSES_KEY = "chain_indexer:addresses"
# When the tracked contract addresses change (e.g. Phase 2 redeploy), rewind the cursor to this
# block so the new contracts' events since deployment are picked up. Duplicates are skipped by
# (tx_hash, log_index), and events already indexed for the old addresses stay in chain_events.
# Default = block before the LendingPool/LiquidityPool v2 deployment (12175813).
REWIND_ON_ADDRESS_CHANGE = int(os.getenv("CHAIN_INDEX_REWIND_BLOCK", "12175812"))

_ABI_DIR = Path(__file__).parent.parent / "contracts" / "abi"

EVENTS = {
    # LendingPool v2. Liquidated is now (user, liquidator, repaid, collateralSeized); rows indexed
    # from the v1 pool keep their old `debtRecovered` arg.
    "LendingPool": [
        "CollateralDeposited", "CollateralWithdrawn", "Borrowed", "Repaid", "Liquidated",
        "Supplied", "Withdrawn",
    ],
    "LiquidityPool": ["Swap", "LiquidityAdded", "LiquidityRemoved"],
}

# Map on-chain events to the TransactionTypeEnum-style labels the UI already understands
EVENT_TX_TYPE = {
    "CollateralDeposited": "DEPOSIT_COLLATERAL",
    "CollateralWithdrawn": "WITHDRAW_COLLATERAL",
    "Supplied": "SUPPLY",
    "Withdrawn": "WITHDRAW",
    "Borrowed": "BORROW",
    "Repaid": "REPAY",
    "Liquidated": "LIQUIDATE",
    "Swap": "SWAP",
    "LiquidityAdded": "ADD_LIQUIDITY",
    "LiquidityRemoved": "REMOVE_LIQUIDITY",
}

_task: Optional[asyncio.Task] = None
_chunk_size = CHUNK_SIZE
_logs_w3: Optional[Web3] = None
_contracts: Dict[str, Any] = {}
_topic_map: Dict[str, tuple] = {}  # topic0 hex (lowercase, 0x) -> (contract_name, event_name)


def _load_abi(name: str) -> list:
    with open(_ABI_DIR / f"{name}.json") as f:
        data = json.load(f)
    return data.get("abi", data) if isinstance(data, dict) else data


def _init_contracts() -> bool:
    """Build contract objects + topic0 lookup. Returns False if addresses are missing."""
    if _topic_map:
        return True
    w3 = blockchain_service.w3
    addrs = {
        "LendingPool": settings.lending_pool_address,
        "LiquidityPool": settings.liquidity_pool_address,
    }
    for name, addr in addrs.items():
        if not addr:
            continue
        contract = w3.eth.contract(address=Web3.to_checksum_address(addr), abi=_load_abi(name))
        _contracts[name] = contract
        for ev_name in EVENTS[name]:
            ev_abi = next(e for e in contract.abi if e.get("type") == "event" and e.get("name") == ev_name)
            sig = f"{ev_name}({','.join(i['type'] for i in ev_abi['inputs'])})"
            topic0 = "0x" + Web3.keccak(text=sig).hex().removeprefix("0x")
            _topic_map[topic0.lower()] = (name, ev_name)
    return bool(_topic_map)


def _jsonable(v: Any) -> Any:
    if isinstance(v, bool):
        return v
    if isinstance(v, int):
        return str(v)  # uint256 -> decimal string (no precision loss)
    if isinstance(v, (bytes, bytearray)):
        return "0x" + bytes(v).hex()
    return v


def _get_cursor(db) -> Optional[int]:
    row = db.query(KeyValueState).filter(KeyValueState.key == CURSOR_KEY).first()
    try:
        cursor = int(row.value) if row and row.value is not None else None
    except ValueError:
        cursor = None
    # Detect a change of tracked contract addresses and rewind so new contracts are backfilled
    current = ",".join(sorted(c.address.lower() for c in _contracts.values()))
    addr_row = db.query(KeyValueState).filter(KeyValueState.key == ADDRESSES_KEY).first()
    if addr_row is None or addr_row.value != current:
        if cursor is not None and cursor > REWIND_ON_ADDRESS_CHANGE:
            print(f"[chain-indexer] contract addresses changed; rewinding cursor {cursor} -> {REWIND_ON_ADDRESS_CHANGE}")
            cursor = REWIND_ON_ADDRESS_CHANGE
        if addr_row is None:
            db.add(KeyValueState(key=ADDRESSES_KEY, value=current))
        else:
            addr_row.value = current
        # persisted together with the first chunk's cursor commit
    return cursor


def _set_cursor(db, block: int) -> None:
    row = db.query(KeyValueState).filter(KeyValueState.key == CURSOR_KEY).first()
    if row:
        row.value = str(block)
    else:
        db.add(KeyValueState(key=CURSOR_KEY, value=str(block)))


def _get_logs_w3() -> Web3:
    global _logs_w3
    if _logs_w3 is None:
        _logs_w3 = Web3(Web3.HTTPProvider(LOGS_RPC_URL, request_kwargs={"timeout": 30})) if LOGS_RPC_URL else blockchain_service.w3
    return _logs_w3


def fetch_events(from_block: int, to_block: int) -> List[Dict[str, Any]]:
    """Fetch + decode tracked events in [from_block, to_block]. Pure RPC, no DB."""
    w3 = blockchain_service.w3
    logs = _get_logs_w3().eth.get_logs({
        "fromBlock": from_block,
        "toBlock": to_block,
        "address": [c.address for c in _contracts.values()],
        "topics": [list(_topic_map.keys())],
    })
    out: List[Dict[str, Any]] = []
    block_ts: Dict[int, datetime] = {}
    for log in logs:
        topic0 = log["topics"][0]
        topic0 = ("0x" + bytes(topic0).hex().removeprefix("0x")).lower() if not isinstance(topic0, str) else topic0.lower()
        match = _topic_map.get(topic0)
        if not match:
            continue
        contract_name, ev_name = match
        contract = _contracts[contract_name]
        if Web3.to_checksum_address(log["address"]) != contract.address:
            continue
        decoded = getattr(contract.events, ev_name)().process_log(log)
        args = {k: _jsonable(v) for k, v in dict(decoded["args"]).items()}
        wallet = args.get("user") or args.get("provider") or args.get("lender")
        bn = int(log["blockNumber"])
        if bn not in block_ts:
            block_ts[bn] = datetime.fromtimestamp(int(w3.eth.get_block(bn)["timestamp"]), tz=timezone.utc)
        tx_hash = log["transactionHash"]
        tx_hash = tx_hash if isinstance(tx_hash, str) else "0x" + bytes(tx_hash).hex().removeprefix("0x")
        out.append({
            "tx_hash": tx_hash.lower(),
            "log_index": int(log["logIndex"]),
            "block_number": bn,
            "contract": contract_name,
            "event": ev_name,
            "wallet": Web3.to_checksum_address(wallet) if wallet else None,
            "args": args,
            "timestamp": block_ts[bn],
        })
    return out


def _store_events(db, events: List[Dict[str, Any]]) -> int:
    if not events:
        return 0
    hashes = list({e["tx_hash"] for e in events})
    existing = {
        (h, li) for h, li in db.query(ChainEvent.tx_hash, ChainEvent.log_index)
        .filter(ChainEvent.tx_hash.in_(hashes)).all()
    }
    added = 0
    for e in events:
        if (e["tx_hash"], e["log_index"]) in existing:
            continue
        db.add(ChainEvent(
            tx_hash=e["tx_hash"],
            log_index=e["log_index"],
            block_number=e["block_number"],
            contract=e["contract"],
            event=e["event"],
            wallet=e["wallet"],
            args=json.dumps(e["args"]),
            timestamp=e["timestamp"],
        ))
        added += 1
    return added


def index_once() -> Dict[str, Any]:
    """One indexing cycle (blocking). Processes up to MAX_CHUNKS_PER_CYCLE chunks."""
    if not _init_contracts():
        return {"skipped": "contract addresses not configured"}
    global _chunk_size
    latest = blockchain_service.w3.eth.block_number - CONFIRMATIONS
    db = SessionLocal()
    try:
        cursor = _get_cursor(db)
        if cursor is None:
            start_env = os.getenv("CHAIN_INDEX_START_BLOCK")
            cursor = (int(start_env) - 1) if start_env else max(0, latest - DEFAULT_LOOKBACK) - 1
        total = 0
        chunks = 0
        while cursor < latest and chunks < MAX_CHUNKS_PER_CYCLE:
            frm = cursor + 1
            to = min(frm + _chunk_size - 1, latest)
            try:
                events = fetch_events(frm, to)
            except Exception as e:
                msg = str(e).lower()
                if _chunk_size > MIN_CHUNK_SIZE and ("400" in msg or "range" in msg or "limit" in msg):
                    # Most likely a provider block-range limit -> shrink and retry next loop
                    print(f"[chain-indexer] getLogs failed for {_chunk_size}-block range ({e}); using {MIN_CHUNK_SIZE}")
                    _chunk_size = MIN_CHUNK_SIZE
                    continue
                raise
            total += _store_events(db, events)
            _set_cursor(db, to)
            db.commit()  # events + cursor commit together
            cursor = to
            chunks += 1
        return {"indexed": total, "cursor": cursor, "latest": latest, "chunks": chunks}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def _run_forever():
    while True:
        try:
            result = await asyncio.to_thread(index_once)
            if result.get("indexed") or result.get("skipped"):
                print(f"[chain-indexer] {result}")
            # Still catching up on backfill -> loop again quickly
            if result.get("cursor") is not None and result["cursor"] < result.get("latest", 0):
                await asyncio.sleep(1)
                continue
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"[chain-indexer] error: {e}")
        await asyncio.sleep(POLL_INTERVAL)


def start_indexer() -> None:
    """Start the background indexer task (idempotent). Disable with CHAIN_INDEXER_ENABLED=false."""
    global _task
    if os.getenv("CHAIN_INDEXER_ENABLED", "true").lower() != "true":
        print("[chain-indexer] disabled via CHAIN_INDEXER_ENABLED")
        return
    if _task is None or _task.done():
        _task = asyncio.create_task(_run_forever())
        print("[chain-indexer] started")


# ---------------------------------------------------------------------------
# Query helpers (used by API routes)
# ---------------------------------------------------------------------------

def serialize_event(ev: ChainEvent) -> Dict[str, Any]:
    try:
        args = json.loads(ev.args) if ev.args else {}
    except ValueError:
        args = {}
    # Human-readable token/ETH amounts (all tracked uint256 values are 18-decimals)
    amounts = {}
    for k, v in args.items():
        if isinstance(v, str) and v.isdigit():
            amounts[k] = int(v) / 1e18
    return {
        "id": ev.id,
        "tx_hash": ev.tx_hash,
        "log_index": ev.log_index,
        "block_number": ev.block_number,
        "contract": ev.contract,
        "event": ev.event,
        "type": EVENT_TX_TYPE.get(ev.event, ev.event.upper()),
        "wallet": ev.wallet,
        "args": args,
        "amounts": amounts,
        "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
        "on_chain": True,
        "simulated": False,
        "explorer_url": f"https://sepolia.etherscan.io/tx/{ev.tx_hash}",
    }


def query_events(
    db,
    contract: Optional[str] = None,
    events: Optional[List[str]] = None,
    wallet: Optional[str] = None,
    limit: int = 50,
) -> List[ChainEvent]:
    q = db.query(ChainEvent)
    if contract:
        q = q.filter(ChainEvent.contract == contract)
    if events:
        q = q.filter(ChainEvent.event.in_(events))
    if wallet:
        try:
            wallet = Web3.to_checksum_address(wallet)
        except Exception:
            pass
        q = q.filter(ChainEvent.wallet == wallet)
    return q.order_by(ChainEvent.block_number.desc(), ChainEvent.log_index.desc()).limit(limit).all()
