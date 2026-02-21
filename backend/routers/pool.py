"""
Liquidity Pool routes — all operations hit the deployed LiquidityPool contract on Sepolia.
No simulation, no in-memory state: every read is an on-chain call, every write is a signed tx.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from blockchain_service import blockchain_service
from config import settings
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

# ── Request bodies ─────────────────────────────────────────────────────────────

class AddLiquidityRequest(BaseModel):
    wallet: str
    amount_a: float  # PAL
    amount_b: float  # BAD


class RemoveLiquidityRequest(BaseModel):
    wallet: str
    amount: float    # LP shares (18-decimal human units)


class SwapRequest(BaseModel):
    wallet: str
    token_in: str    # 'PAL' | 'BAD' | raw address
    token_out: str   # 'PAL' | 'BAD' | raw address
    amount_in: float


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


def _ensure_approval(token_name: str, token_address: str, spender: str, amount_wei: int):
    """Send approve tx only if current allowance is insufficient."""
    token = _token_contract(token_name, token_address)
    owner = blockchain_service.account.address
    spender_cs = Web3.to_checksum_address(spender)
    if token.functions.allowance(owner, spender_cs).call() < amount_wei:
        blockchain_service.send_transaction(token_name, "approve", spender_cs, amount_wei)


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
    db: Session = Depends(get_db),
):
    """Recent pool transactions logged to the DB from on-chain operations."""
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
        return {
            "success": True,
            "data": [
                {
                    "hash":      t.hash,
                    "type":      t.type.value,
                    "wallet":    t.wallet,
                    "amount":    t.amount,
                    "token":     t.token,
                    "timestamp": t.timestamp.timestamp() if t.timestamp else None,
                    "metadata":  json.loads(t.tx_metadata) if t.tx_metadata else {},
                }
                for t in txs
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/add-liquidity")
async def add_liquidity(
    request: AddLiquidityRequest,
    db: Session = Depends(get_db),
):
    """
    Add liquidity to the on-chain LiquidityPool.
    Flow: approve PAL → approve BAD → addLiquidity(amountA, amountB)
    LP tokens are minted to the operator account by the contract.
    """
    try:
        pool_address = settings.liquidity_pool_address
        amount_a_wei = _to_wei(request.amount_a)
        amount_b_wei = _to_wei(request.amount_b)

        _ensure_approval("TokenA", settings.palladium_address,  pool_address, amount_a_wei)
        _ensure_approval("TokenB", settings.badassium_address, pool_address, amount_b_wei)

        tx_hash = blockchain_service.send_transaction(
            "LiquidityPool", "addLiquidity", amount_a_wei, amount_b_wei
        )
        _log_tx(db, models.TransactionTypeEnum.ADD_LIQUIDITY,
                request.wallet, request.amount_a, "PAL", tx_hash,
                {"amount_a": request.amount_a, "amount_b": request.amount_b})

        pool = _pool_contract()
        return {
            "status":      "success",
            "tx_hash":     tx_hash,
            "sepolia_url": f"https://sepolia.etherscan.io/tx/{tx_hash}",
            "message":     f"Added {request.amount_a} PAL + {request.amount_b} BAD on-chain",
            "wallet":      request.wallet,
            "reserve_a":   _from_wei(pool.functions.reserveA().call()),
            "reserve_b":   _from_wei(pool.functions.reserveB().call()),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/remove-liquidity")
async def remove_liquidity(
    request: RemoveLiquidityRequest,
    db: Session = Depends(get_db),
):
    """
    Remove liquidity from the on-chain pool by burning LP shares.
    The contract burns shares from msg.sender and returns PAL + BAD proportionally.
    """
    try:
        shares_wei = _to_wei(request.amount)

        tx_hash = blockchain_service.send_transaction(
            "LiquidityPool", "removeLiquidity", shares_wei
        )
        _log_tx(db, models.TransactionTypeEnum.REMOVE_LIQUIDITY,
                request.wallet, request.amount, "LP", tx_hash,
                {"lp_shares": request.amount})

        pool = _pool_contract()
        return {
            "status":      "success",
            "tx_hash":     tx_hash,
            "sepolia_url": f"https://sepolia.etherscan.io/tx/{tx_hash}",
            "message":     f"Burned {request.amount} LP shares, received PAL + BAD",
            "wallet":      request.wallet,
            "reserve_a":   _from_wei(pool.functions.reserveA().call()),
            "reserve_b":   _from_wei(pool.functions.reserveB().call()),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/swap")
async def swap_tokens(
    request: SwapRequest,
    db: Session = Depends(get_db),
):
    """
    Swap PAL ↔ BAD via the on-chain constant-product AMM (0.3 % fee).
    Flow: approve token_in → swap(tokenIn, amountIn)
    """
    try:
        pool         = _pool_contract()
        pool_address = settings.liquidity_pool_address

        token_in_addr  = _resolve_token_address(request.token_in)
        token_out_addr = _resolve_token_address(request.token_out)

        pal_addr  = Web3.to_checksum_address(settings.palladium_address)
        is_pal_in = Web3.to_checksum_address(token_in_addr) == pal_addr

        amount_in_wei = _to_wei(request.amount_in)

        # Pre-calculate expected output (mirrors Solidity math)
        ra_wei = pool.functions.reserveA().call()
        rb_wei = pool.functions.reserveB().call()
        ri = ra_wei if is_pal_in else rb_wei
        ro = rb_wei if is_pal_in else ra_wei

        fee_in       = amount_in_wei * 997
        amount_out_wei = (fee_in * ro) // (ri * 1000 + fee_in)

        mid          = ro / ri if ri > 0 else 0
        expected_out = amount_in_wei * mid
        impact_pct   = ((expected_out - amount_out_wei) / expected_out * 100) if expected_out > 0 else 0.0

        token_in_name = "TokenA" if is_pal_in else "TokenB"
        _ensure_approval(token_in_name, token_in_addr, pool_address, amount_in_wei)

        tx_hash = blockchain_service.send_transaction(
            "LiquidityPool", "swap",
            Web3.to_checksum_address(token_in_addr),
            amount_in_wei,
        )

        token_in_sym  = "PAL" if is_pal_in else "BAD"
        token_out_sym = "BAD" if is_pal_in else "PAL"

        _log_tx(db, models.TransactionTypeEnum.SWAP,
                request.wallet, request.amount_in, token_in_sym, tx_hash,
                {
                    "token_in":     token_in_addr,
                    "token_out":    token_out_addr,
                    "amount_in":    request.amount_in,
                    "amount_out":   _from_wei(amount_out_wei),
                    "price_impact": round(impact_pct, 4),
                })

        return {
            "status":       "success",
            "tx_hash":      tx_hash,
            "sepolia_url":  f"https://sepolia.etherscan.io/tx/{tx_hash}",
            "token_in":     token_in_sym,
            "token_out":    token_out_sym,
            "amount_in":    request.amount_in,
            "amount_out":   _from_wei(amount_out_wei),
            "price_impact": round(impact_pct, 4),
            "wallet":       request.wallet,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
