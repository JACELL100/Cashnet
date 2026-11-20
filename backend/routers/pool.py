"""
Liquidity Pool routes — all operations hit the deployed LiquidityPool contract on Sepolia.
No simulation, no in-memory state: every read is an on-chain call, every write is a signed tx.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from blockchain_service import blockchain_service
from config import settings
from middleware import check_system_not_paused
from web3 import Web3
import json
import models
from pathlib import Path

router = APIRouter(prefix="/pool", tags=["Liquidity Pool"])

_ABI_DIR = Path(__file__).parent.parent.parent / "contracts" / "abi"

# ── Minimal ERC-20 ABI (PAL / BAD token operations + LP totalSupply/balanceOf) ─
_ERC20_ABI = [
    {
        "inputs": [{"name": "spender", "type": "address"}, {"name": "value", "type": "uint256"}],
        "name": "approve",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}],
        "name": "allowance",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]

# ── Internal helpers ───────────────────────────────────────────────────────────

def _pool_contract():
    """Lazily load the LiquidityPool contract (also IS the LP ERC-20 token via inheritance)."""
    if "LiquidityPool" not in blockchain_service.contracts:
        with open(_ABI_DIR / "LiquidityPool.json") as f:
            abi = json.load(f)
        blockchain_service.load_contract(
            "LiquidityPool",
            settings.liquidity_pool_address,
            abi,
        )
    return blockchain_service.contracts["LiquidityPool"]


def _token_contract(name: str, address: str):
    """Lazily load an ERC-20 token contract (PAL or BAD)."""
    if name not in blockchain_service.contracts:
        blockchain_service.load_contract(name, address, _ERC20_ABI)
    return blockchain_service.contracts[name]


def _resolve_token_address(identifier: str) -> str:
    """Map 'PAL'/'BAD'/<name variants> to checksum address, or pass raw address through."""
    n = identifier.strip().lower()
    if n in ("tokena", "a", "pal", "palladium"):
        return settings.palladium_address
    if n in ("tokenb", "b", "bad", "badassium"):
        return settings.badassium_address
    try:
        return Web3.to_checksum_address(identifier)
    except Exception:
        raise ValueError(f"Cannot resolve token identifier: {identifier!r}")


def _to_wei(amount: float) -> int:
    return int(amount * 10 ** 18)


def _from_wei(amount_wei: int) -> float:
    return amount_wei / 10 ** 18


def _log_tx(
    db: Session,
    tx_type: models.TransactionTypeEnum,
    wallet: str,
    amount: float,
    token: str,
    tx_hash: str,
    extra: dict,
) -> None:
    """Persist a transaction record to the database (best-effort, never raises)."""
    try:
        db.add(models.Transaction(
            hash=tx_hash,
            type=tx_type,
            wallet=wallet,
            amount=amount,
            token=token,
            tx_metadata=json.dumps({"tx_hash": tx_hash, **extra}),
        ))
        db.commit()
    except Exception:
        db.rollback()


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/state")
async def get_pool_state():
    """Full on-chain pool state: reserves, prices, LP supply."""
    try:
        pool = _pool_contract()

        reserve_a_wei = pool.functions.reserveA().call()
        reserve_b_wei = pool.functions.reserveB().call()
        total_lp_wei  = pool.functions.totalSupply().call()

        reserve_a   = _from_wei(reserve_a_wei)
        reserve_b   = _from_wei(reserve_b_wei)
        total_lp    = _from_wei(total_lp_wei)
        total_liq   = reserve_a + reserve_b

        return {
            "reserve_a":        reserve_a,
            "reserve_b":        reserve_b,
            "price_a_per_b":    reserve_a / reserve_b if reserve_b > 0 else 0.0,
            "price_b_per_a":    reserve_b / reserve_a if reserve_a > 0 else 0.0,
            "total_liquidity":  total_liq,
            "total_lp_supply":  total_lp,
            "fee_pct":          0.3,
            "token_a":          "PAL",
            "token_b":          "BAD",
            "token_a_address":  settings.palladium_address,
            "token_b_address":  settings.badassium_address,
            "contract_address": settings.liquidity_pool_address,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/balances/{wallet}")
async def get_balances(wallet: str):
    """PAL balance, BAD balance, and LP token balance for a given wallet."""
    try:
        wallet_cs = Web3.to_checksum_address(wallet)
        pal  = _token_contract("TokenA", settings.palladium_address)
        bad  = _token_contract("TokenB", settings.badassium_address)
        pool = _pool_contract()   # LP token IS the pool contract (inherits ERC20)
        return {
            "wallet":      wallet,
            "pal_balance": _from_wei(pal.functions.balanceOf(wallet_cs).call()),
            "bad_balance": _from_wei(bad.functions.balanceOf(wallet_cs).call()),
            "lp_balance":  _from_wei(pool.functions.balanceOf(wallet_cs).call()),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/slippage-curve")
async def slippage_curve(
    direction: str = Query(default="PAL_to_BAD", description="PAL_to_BAD | BAD_to_PAL"),
    steps: int = Query(default=20, ge=5, le=50),
):
    """Slippage vs. trade-size curve derived from live on-chain reserves (read-only)."""
    try:
        pool = _pool_contract()
        ra = _from_wei(pool.functions.reserveA().call())
        rb = _from_wei(pool.functions.reserveB().call())

        reserve_in  = ra if direction == "PAL_to_BAD" else rb
        reserve_out = rb if direction == "PAL_to_BAD" else ra

        if reserve_in == 0 or reserve_out == 0:
            return {"success": True, "data": []}

        result = []
        for i in range(1, steps + 1):
            pct       = (i / steps) * 20.0          # sweep 0→20 % of pool
            amt_in    = reserve_in * pct / 100
            amt_in_wi = int(amt_in * 1e18)
            ri_wi     = int(reserve_in  * 1e18)
            ro_wi     = int(reserve_out * 1e18)
            fee_in    = amt_in_wi * 997
            out_wi    = (fee_in * ro_wi) // (ri_wi * 1000 + fee_in)
            out       = out_wi / 1e18
            mid       = reserve_out / reserve_in
            expected  = amt_in * mid
            slip      = ((expected - out) / expected * 100) if expected > 0 else 0.0
            result.append({
                "trade_size_pct":   round(pct, 2),
                "trade_size_token": round(amt_in, 4),
                "slippage_pct":     round(slip, 4),
            })
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/depth-chart")
async def depth_chart(
    levels: int = Query(default=20, ge=5, le=50),
    price_range_pct: float = Query(default=10.0, ge=1.0, le=50.0),
):
    """Simulated bid/ask depth chart derived from live on-chain reserves (read-only)."""
    try:
        pool = _pool_contract()
        ra = _from_wei(pool.functions.reserveA().call())
        rb = _from_wei(pool.functions.reserveB().call())

        if ra == 0 or rb == 0:
            return {"success": True, "data": {"spot_price": 0, "bids": [], "asks": []}}

        spot = rb / ra  # BAD per PAL
        step = (price_range_pct / 100) * spot / levels

        bids, asks = [], []
        cumulative = 0.0
        for i in range(1, levels + 1):
            bid_price = max(spot - i * step, 1e-9)
            ask_price = spot + i * step
            liq = (ra * rb) / bid_price
            cumulative += liq / levels
            scaled = round(cumulative / 1e3, 2)
            bids.append({"price": round(bid_price, 6), "cumulative_token0": scaled, "liquidity_usd": scaled})
            asks.append({"price": round(ask_price, 6), "cumulative_token0": scaled, "liquidity_usd": scaled})

        return {"success": True, "data": {"spot_price": spot, "bids": bids, "asks": asks}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/transactions")
async def get_transactions(
    limit: int = Query(default=20, le=100),
    include_lending: bool = Query(default=False, description="Also include indexed LendingPool events"),
    db: Session = Depends(get_db),
):
    """Recent pool transactions: indexed on-chain events (on_chain=true) + legacy DB-logged rows."""
    try:
        txs = (
            db.query(models.Transaction)
            .filter(models.Transaction.type.in_([
                models.TransactionTypeEnum.ADD_LIQUIDITY,
                models.TransactionTypeEnum.REMOVE_LIQUIDITY,
                models.TransactionTypeEnum.SWAP,
            ]))
            .order_by(models.Transaction.timestamp.desc())
            .limit(limit)
            .all()
        )
        data = []
        seen = set()
        # Real events indexed from Sepolia (chain_indexer.py)
        try:
            from chain_indexer import query_events, serialize_event
            contract = None if include_lending else "LiquidityPool"
            for ev in query_events(db, contract=contract, limit=limit):
                e = serialize_event(ev)
                if ev.event == "Swap":
                    token_in = (e["args"].get("tokenIn") or "").lower()
                    token = "PAL" if token_in == (settings.palladium_address or "").lower() else "BAD"
                    amount = e["amounts"].get("amountIn")
                elif ev.event in ("LiquidityAdded", "LiquidityRemoved"):
                    token, amount = "PAL", e["amounts"].get("amountA")
                elif ev.event == "CollateralDeposited":
                    token, amount = "ETH", e["amounts"].get("amount")
                elif ev.event == "Liquidated":
                    token, amount = "PLDM", e["amounts"].get("debtRecovered")
                else:  # Borrowed / Repaid -> LendingPool.borrowToken (PLDM)
                    token, amount = "PLDM", e["amounts"].get("amount")
                seen.add(e["tx_hash"].lower())
                data.append({
                    "hash":      e["tx_hash"],
                    "type":      e["type"],
                    "wallet":    e["wallet"],
                    "amount":    amount,
                    "token":     token,
                    "timestamp": ev.timestamp.timestamp() if ev.timestamp else None,
                    "metadata":  {**e["args"], "event": ev.event, "contract": ev.contract, "block_number": ev.block_number},
                    "on_chain":  True,
                    "simulated": False,
                })
        except Exception as ex:
            print(f"/pool/transactions: indexed events unavailable: {ex}")

        for t in txs:
            if (t.hash or "").lower() in seen:
                continue
            data.append({
                "hash":      t.hash,
                "type":      t.type.value,
                "wallet":    t.wallet,
                "amount":    t.amount,
                "token":     t.token,
                "timestamp": t.timestamp.timestamp() if t.timestamp else None,
                "metadata":  json.loads(t.tx_metadata) if t.tx_metadata else {},
                # liquidity_engine logs simulated rows with "0xsim_" hashes; others were real server-signed txs
                "on_chain":  not (t.hash or "").startswith("0xsim_"),
                "simulated": (t.hash or "").startswith("0xsim_"),
            })
        data.sort(key=lambda d: d["timestamp"] or 0, reverse=True)
        return {
            "success": True,
            "data": data[:limit],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# NOTE: POST /pool/add-liquidity, /pool/remove-liquidity and /pool/swap were removed.
# They signed with the SERVER wallet on behalf of any caller (LP tokens/output went to the server).
# Users sign these directly via MetaMask (frontend/hooks/usePoolActions.ts).


@router.post("/stress-test")
async def run_stress_test(
    withdrawal_percentage: float = Query(default=50.0, ge=1.0, le=100.0),
):
    """
    Read-only hypothetical stress projection from live on-chain reserves.
    No transaction is submitted.
    """
    try:
        pool = _pool_contract()
        ra = _from_wei(pool.functions.reserveA().call())
        rb = _from_wei(pool.functions.reserveB().call())
        total_liq  = ra + rb
        withdrawal = total_liq * (withdrawal_percentage / 100)
        remaining  = total_liq - withdrawal

        return {
            "status":                "projected",
            "withdrawal_percentage": withdrawal_percentage,
            "total_liquidity":       total_liq,
            "withdrawal_amount":     withdrawal,
            "remaining_liquidity":   remaining,
            "estimated_slippage":    round(withdrawal_percentage * 1.5, 2),
            "time_to_drain_minutes": round(withdrawal_percentage / 10, 1),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
