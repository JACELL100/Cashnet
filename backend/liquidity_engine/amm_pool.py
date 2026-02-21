"""
AMM Pool — Constant Product Market Maker (x * y = k)
Supports:
  - Add / Remove liquidity (proportional + single-token)
  - Swap with configurable fee
  - Slippage curve generation
  - Liquidity depth chart generation
  - Impermanent loss calculation
  - Stress testing (mass withdrawal, flash swap, sustained drain)
"""
import math
import time
import uuid
from typing import Optional
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class LiquidityPosition:
    owner: str
    lp_tokens: float          # LP tokens held
    entry_price: float        # spot price (token1 per token0) at entry
    token0_amount: float      # token0 contributed at entry
    token1_amount: float      # token1 contributed at entry
    added_at: float = field(default_factory=time.time)


@dataclass
class SwapResult:
    amount_in: float
    amount_out: float
    fee_paid: float
    price_impact: float       # %
    execution_price: float    # effective price
    new_price: float          # spot price after swap
    slippage: float           # %


@dataclass
class StressResult:
    scenario: str
    initial_tvl: float
    final_tvl: float
    tvl_change_pct: float
    initial_price: float
    final_price: float
    price_change_pct: float
    liquidity_removed: float
    slippage_at_peak: float
    time_to_drain_estimate: float   # seconds (conceptual)
    events: list[str]
    risk_score: float               # 0-100


@dataclass
class PoolEvent:
    event_id: str
    event_type: str           # ADD | REMOVE | SWAP | STRESS | CREATE
    description: str
    timestamp: float
    metadata: dict


# ---------------------------------------------------------------------------
# AMMPool
# ---------------------------------------------------------------------------

class AMMPool:
    """
    Single constant-product liquidity pool with full simulation capabilities.
    """

    def __init__(
        self,
        pool_id: str,
        token0: str = "USDC",
        token1: str = "ETH",
        reserve0: float = 1_000_000.0,   # token0 units
        reserve1: float = 312.5,          # token1 units  → 1 ETH ≈ $3200
        fee_bps: int = 30,                # 0.30%
        name: Optional[str] = None,
    ):
        self.pool_id = pool_id
        self.token0 = token0
        self.token1 = token1
        self.reserve0 = reserve0
        self.reserve1 = reserve1
        self.fee_bps = fee_bps            # basis points
        self.name = name or f"{token0}/{token1}"

        # Derived constant — recalculated after every operation
        self.k = reserve0 * reserve1

        # Accounting
        self.total_lp_tokens: float = math.sqrt(reserve0 * reserve1)
        self.positions: dict[str, LiquidityPosition] = {}   # address → position
        self.total_fees_token0: float = 0.0
        self.total_fees_token1: float = 0.0
        self.volume_24h: float = 0.0
        self.swap_count: int = 0

        # History
        self.events: list[PoolEvent] = []

        self._log_event("CREATE", f"Pool {self.name} created — k={self.k:.2f}", {})

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def fee(self) -> float:
        return self.fee_bps / 10_000

    @property
    def price(self) -> float:
        """token1 per token0  (e.g. ETH per USDC)"""
        return self.reserve1 / self.reserve0 if self.reserve0 > 0 else 0

    @property
    def price_token1_in_token0(self) -> float:
        """token0 per token1  (e.g. USDC per ETH)"""
        return self.reserve0 / self.reserve1 if self.reserve1 > 0 else 0

    @property
    def tvl(self) -> float:
        """Total value locked — priced in token0 units"""
        return self.reserve0 + self.reserve1 * self.price_token1_in_token0

    # ------------------------------------------------------------------
    # Core AMM math
    # ------------------------------------------------------------------

    def _apply_fee(self, amount_in: float) -> tuple[float, float]:
        """Returns (amount_after_fee, fee_amount)"""
        fee = amount_in * self.fee
        return amount_in - fee, fee

    def _quote_token0_out(self, amount1_in: float) -> float:
        """How much token0 comes out when amount1_in of token1 goes in (before fee deduction)."""
        amount1_in_after_fee = amount1_in * (1 - self.fee)
        # x * y = k  →  new_reserve0 = k / (reserve1 + amount1_in_after_fee)
        new_reserve1 = self.reserve1 + amount1_in_after_fee
        new_reserve0 = self.k / new_reserve1
        return self.reserve0 - new_reserve0

    def _quote_token1_out(self, amount0_in: float) -> float:
        """How much token1 comes out when amount0_in of token0 goes in (before fee deduction)."""
        amount0_in_after_fee = amount0_in * (1 - self.fee)
        new_reserve0 = self.reserve0 + amount0_in_after_fee
        new_reserve1 = self.k / new_reserve0
        return self.reserve1 - new_reserve1

    # ------------------------------------------------------------------
    # Swap
    # ------------------------------------------------------------------

    def swap_token0_for_token1(self, amount0_in: float) -> SwapResult:
        """Sell token0, receive token1."""
        if amount0_in <= 0:
            raise ValueError("amount must be > 0")
        if amount0_in > self.reserve0 * 0.95:
            raise ValueError("Trade too large relative to pool size")

        amount0_after_fee, fee0 = self._apply_fee(amount0_in)
        new_reserve0 = self.reserve0 + amount0_after_fee
        new_reserve1 = self.k / new_reserve0
        amount1_out = self.reserve1 - new_reserve1

        if amount1_out <= 0 or amount1_out >= self.reserve1:
            raise ValueError("Insufficient liquidity for this trade")

        mid_price = self.price_token1_in_token0
        exec_price = amount0_in / amount1_out if amount1_out > 0 else 0
        price_impact = abs(exec_price - mid_price) / mid_price * 100 if mid_price > 0 else 0

        # apply
        self.reserve0 = new_reserve0
        self.reserve1 = new_reserve1
        self.total_fees_token0 += fee0
        self.volume_24h += amount0_in
        self.swap_count += 1

        new_spot = self.price_token1_in_token0
        slippage = abs(new_spot - mid_price) / mid_price * 100 if mid_price > 0 else 0

        result = SwapResult(
            amount_in=amount0_in,
            amount_out=amount1_out,
            fee_paid=fee0,
            price_impact=price_impact,
            execution_price=exec_price,
            new_price=new_spot,
            slippage=slippage,
        )
        self._log_event("SWAP", f"Swap {amount0_in:.2f} {self.token0} → {amount1_out:.6f} {self.token1}", {"result": vars(result)})
        return result

    def swap_token1_for_token0(self, amount1_in: float) -> SwapResult:
        """Sell token1, receive token0."""
        if amount1_in <= 0:
            raise ValueError("amount must be > 0")
        if amount1_in > self.reserve1 * 0.95:
            raise ValueError("Trade too large relative to pool size")

        amount1_after_fee, fee1 = self._apply_fee(amount1_in)
        new_reserve1 = self.reserve1 + amount1_after_fee
        new_reserve0 = self.k / new_reserve1
        amount0_out = self.reserve0 - new_reserve0

        if amount0_out <= 0 or amount0_out >= self.reserve0:
            raise ValueError("Insufficient liquidity for this trade")

        mid_price = self.price
        exec_price = amount1_in / amount0_out if amount0_out > 0 else 0
        price_impact = abs(exec_price - mid_price) / mid_price * 100 if mid_price > 0 else 0

        # apply
        self.reserve0 = new_reserve0
        self.reserve1 = new_reserve1
        self.total_fees_token1 += fee1
        self.volume_24h += amount1_in * self.price_token1_in_token0
        self.swap_count += 1

        new_spot = self.price
        slippage = abs(new_spot - mid_price) / mid_price * 100 if mid_price > 0 else 0

        result = SwapResult(
            amount_in=amount1_in,
            amount_out=amount0_out,
            fee_paid=fee1,
            price_impact=price_impact,
            execution_price=exec_price,
            new_price=new_spot,
            slippage=slippage,
        )
        self._log_event("SWAP", f"Swap {amount1_in:.6f} {self.token1} → {amount0_out:.2f} {self.token0}", {"result": vars(result)})
        return result

    # ------------------------------------------------------------------
    # Add / Remove Liquidity
    # ------------------------------------------------------------------

    def add_liquidity(self, provider: str, amount0: float, max_slippage_pct: float = 1.0) -> dict:
        """
        Add liquidity proportionally.  Caller provides token0; we compute
        the required token1 to maintain the current price ratio.
        Returns LP tokens minted.
        """
        if amount0 <= 0:
            raise ValueError("amount0 must be > 0")

        # required token1 to maintain ratio
        ratio = self.reserve1 / self.reserve0
        amount1 = amount0 * ratio

        # LP tokens minted proportional to token0 share
        lp_minted = (amount0 / self.reserve0) * self.total_lp_tokens

        entry_price = self.price_token1_in_token0

        # apply
        self.reserve0 += amount0
        self.reserve1 += amount1
        self.k = self.reserve0 * self.reserve1
        self.total_lp_tokens += lp_minted

        # update or create position
        if provider in self.positions:
            pos = self.positions[provider]
            pos.lp_tokens += lp_minted
            pos.token0_amount += amount0
            pos.token1_amount += amount1
        else:
            self.positions[provider] = LiquidityPosition(
                owner=provider,
                lp_tokens=lp_minted,
                entry_price=entry_price,
                token0_amount=amount0,
                token1_amount=amount1,
            )

        self._log_event("ADD", f"{provider} added {amount0:.2f} {self.token0} + {amount1:.6f} {self.token1} → {lp_minted:.4f} LP", {})
        return {
            "amount0_deposited": amount0,
            "amount1_deposited": amount1,
            "lp_tokens_minted": lp_minted,
            "total_lp_tokens": self.total_lp_tokens,
            "new_tvl": self.tvl,
        }

    def remove_liquidity(self, provider: str, lp_tokens: float) -> dict:
        """
        Remove liquidity by burning LP tokens.
        Returns amounts of token0 and token1 received.
        """
        pos = self.positions.get(provider)
        if not pos:
            raise ValueError(f"No LP position found for provider '{provider}'. Add liquidity first.")
        if pos.lp_tokens < lp_tokens:
            raise ValueError(f"Insufficient LP tokens: requested {lp_tokens:.4f}, available {pos.lp_tokens:.4f}")

        share = lp_tokens / self.total_lp_tokens
        amount0_out = share * self.reserve0
        amount1_out = share * self.reserve1

        # IL calculation
        il = self._calc_il(pos.entry_price, self.price_token1_in_token0)

        # apply
        self.reserve0 -= amount0_out
        self.reserve1 -= amount1_out
        self.k = self.reserve0 * self.reserve1
        self.total_lp_tokens -= lp_tokens
        pos.lp_tokens -= lp_tokens
        pos.token0_amount -= amount0_out
        pos.token1_amount -= amount1_out

        if pos.lp_tokens <= 0:
            del self.positions[provider]

        self._log_event("REMOVE", f"{provider} removed {lp_tokens:.4f} LP → {amount0_out:.2f} {self.token0} + {amount1_out:.6f} {self.token1}", {})
        return {
            "amount0_received": amount0_out,
            "amount1_received": amount1_out,
            "lp_tokens_burned": lp_tokens,
            "impermanent_loss_pct": il,
            "new_tvl": self.tvl,
        }

    # ------------------------------------------------------------------
    # Impermanent Loss
    # ------------------------------------------------------------------

    @staticmethod
    def _calc_il(price_at_entry: float, price_now: float) -> float:
        """
        IL(%) for a 50/50 constant-product pool.
        IL = 2 * sqrt(r) / (1 + r) - 1   where r = price_now / price_at_entry
        Returns positive % representing the loss vs. hold.
        """
        if price_at_entry <= 0:
            return 0.0
        r = price_now / price_at_entry
        il = 2 * math.sqrt(r) / (1 + r) - 1   # negative value
        return abs(il) * 100

    def get_impermanent_loss(self, entry_price: float) -> dict:
        """
        Get IL data for a hypothetical entry at entry_price vs. multiple future prices.
        Returns a curve: list of {price_ratio, il_pct}.
        """
        current_price = self.price_token1_in_token0
        il_now = self._calc_il(entry_price, current_price)

        # Generate IL curve x-axis: price ratio 0.25 to 4.0
        curve = []
        for ratio_pct in range(25, 401, 5):
            r = ratio_pct / 100
            il = abs(2 * math.sqrt(r) / (1 + r) - 1) * 100
            curve.append({"price_ratio": r, "il_pct": round(il, 4)})

        return {
            "entry_price": entry_price,
            "current_price": current_price,
            "price_ratio": current_price / entry_price if entry_price > 0 else 1,
            "il_pct_now": round(il_now, 4),
            "il_curve": curve,
        }

    # ------------------------------------------------------------------
    # Slippage curve
    # ------------------------------------------------------------------

    def get_slippage_curve(self, direction: str = "token0_to_token1", steps: int = 20) -> list[dict]:
        """
        Compute slippage for different trade sizes without mutating the pool.
        direction: "token0_to_token1" or "token1_to_token0"
        Returns list of {trade_size_usd, trade_size_token, slippage_pct, price_impact_pct, amount_out}.
        """
        results = []
        max_size = self.reserve0 * 0.5 if direction == "token0_to_token1" else self.reserve1 * 0.5

        for i in range(1, steps + 1):
            frac = i / steps
            size = max_size * frac  # token0 (USDC) or token1 (ETH)

            try:
                if direction == "token0_to_token1":
                    amount_after_fee = size * (1 - self.fee)
                    new_r0 = self.reserve0 + amount_after_fee
                    new_r1 = self.k / new_r0
                    out = self.reserve1 - new_r1
                    mid_price = self.price_token1_in_token0
                    exec_price = size / out if out > 0 else 0
                    price_impact = abs(exec_price - mid_price) / mid_price * 100 if mid_price > 0 else 0
                    size_usd = size
                else:
                    amount_after_fee = size * (1 - self.fee)
                    new_r1 = self.reserve1 + amount_after_fee
                    new_r0 = self.k / new_r1
                    out = self.reserve0 - new_r0
                    mid_price = self.price
                    exec_price = size / out if out > 0 else 0
                    price_impact = abs(exec_price - mid_price) / mid_price * 100 if mid_price > 0 else 0
                    size_usd = size * self.price_token1_in_token0

                results.append({
                    "trade_size_usd": round(size_usd, 2),
                    "trade_size_token": round(size, 6),
                    "slippage_pct": round(price_impact, 4),
                    "price_impact_pct": round(price_impact, 4),
                    "amount_out": round(out, 6),
                })
            except Exception:
                break

        return results

    # ------------------------------------------------------------------
    # Depth chart
    # ------------------------------------------------------------------

    def get_depth_chart(self, price_range_pct: float = 10.0, levels: int = 20) -> dict:
        """
        Simulate order book depth around the current spot price.
        For AMMs, "depth" is the liquidity available at each price level.
        Returns bids (below spot) and asks (above spot).
        """
        spot = self.price_token1_in_token0
        step = spot * (price_range_pct / 100) / levels

        bids = []
        asks = []

        # Bids: prices below spot — how much token0 you'd receive selling token1
        for i in range(1, levels + 1):
            p = spot - i * step
            if p <= 0:
                break
            # How much token0 do I get if I push price to p?
            # new_reserve1 = sqrt(k / p),  new_reserve0 = sqrt(k * p)
            new_r0 = math.sqrt(self.k * p)
            new_r1 = math.sqrt(self.k / p)
            token0_available = max(0, new_r0 - self.reserve0)
            bids.append({
                "price": round(p, 4),
                "cumulative_token0": round(token0_available, 2),
                "liquidity_usd": round(token0_available, 2),
            })

        # Asks: prices above spot — how much token1 you'd receive selling token0
        for i in range(1, levels + 1):
            p = spot + i * step
            new_r0 = math.sqrt(self.k * p)
            new_r1 = math.sqrt(self.k / p)
            token1_available = max(0, self.reserve1 - new_r1)
            asks.append({
                "price": round(p, 4),
                "cumulative_token0": round(token1_available * p, 2),
                "liquidity_usd": round(token1_available * p, 2),
            })

        return {
            "spot_price": round(spot, 4),
            "bids": bids,
            "asks": asks,
        }

    # ------------------------------------------------------------------
    # Stress tests
    # ------------------------------------------------------------------

    def stress_test(self, scenario: str, intensity: float = 1.0) -> StressResult:
        """
        Run a stress scenario on a cloned pool (non-destructive).
        intensity: 0.0 – 2.0 multiplier on trade sizes / withdrawal amounts.
        
        Scenarios:
          flash_swap       — one massive single-direction swap
          mass_withdrawal  — 60% of liquidity removed in chunks
          sustained_drain  — 20 sequential sells from the same direction
          price_crash      — external price moves 50% down, arb normalises pool
        """
        import copy
        clone = copy.deepcopy(self)
        events = []
        initial_tvl = clone.tvl
        initial_price = clone.price_token1_in_token0
        peak_slippage = 0.0

        try:
            if scenario == "flash_swap":
                trade = clone.reserve0 * 0.30 * intensity
                r = clone.swap_token0_for_token1(min(trade, clone.reserve0 * 0.94))
                peak_slippage = r.slippage
                events.append(f"Flash swap: {trade:,.0f} {clone.token0} in, {r.amount_out:.4f} {clone.token1} out, slippage={r.slippage:.2f}%")

            elif scenario == "mass_withdrawal":
                total_to_remove = clone.total_lp_tokens * 0.60 * intensity
                chunk = total_to_remove / 5
                # Add a synthetic LP to withdraw from
                clone.add_liquidity("stress_lp", clone.reserve0 * 0.60 * intensity)
                for i in range(5):
                    safe_chunk = min(chunk, clone.positions.get("stress_lp", LiquidityPosition("stress_lp", 0, 0, 0, 0)).lp_tokens * 0.99)
                    if safe_chunk <= 0:
                        break
                    res = clone.remove_liquidity("stress_lp", safe_chunk)
                    events.append(f"Chunk {i+1}: removed {safe_chunk:.2f} LP — TVL now ${clone.tvl:,.0f}")
                peak_slippage = abs((clone.price_token1_in_token0 - initial_price) / initial_price) * 100

            elif scenario == "sustained_drain":
                sell_size = clone.reserve0 * 0.04 * intensity
                for i in range(20):
                    safe = min(sell_size, clone.reserve0 * 0.09)
                    if safe <= 0:
                        break
                    r = clone.swap_token0_for_token1(safe)
                    peak_slippage = max(peak_slippage, r.slippage)
                    if i % 5 == 0:
                        events.append(f"Sell {i+1}: slippage={r.slippage:.2f}%, price={clone.price_token1_in_token0:.4f}")

            elif scenario == "price_crash":
                # Simulate external price crash of 40% → arbitrageurs drain token0 side
                target_price = initial_price * (1 - 0.40 * intensity)
                # Arb buys token1 (pushes reserve1 down, reserve0 up) to restore
                new_r1 = math.sqrt(clone.k / target_price)
                token1_to_buy = max(0, clone.reserve1 - new_r1) * 0.90
                if token1_to_buy > 0:
                    r = clone.swap_token0_for_token1(min(token1_to_buy * clone.price_token1_in_token0 * 1.2, clone.reserve0 * 0.90))
                    peak_slippage = r.slippage
                    events.append(f"Arb normalises after 40% crash — slippage={r.slippage:.2f}%")

            else:
                raise ValueError(f"Unknown scenario: {scenario}")

        except Exception as exc:
            events.append(f"Scenario terminated early: {exc}")

        final_tvl = clone.tvl
        final_price = clone.price_token1_in_token0
        tvl_change = (final_tvl - initial_tvl) / initial_tvl * 100 if initial_tvl > 0 else 0
        price_change = (final_price - initial_price) / initial_price * 100 if initial_price > 0 else 0
        liquidity_removed = initial_tvl - final_tvl

        # Time-to-drain estimate: extrapolate based on TVL change rate
        drain_rate_per_op = abs(tvl_change)
        tde = (100 / drain_rate_per_op) * 10 if drain_rate_per_op > 0 else 9999

        # Risk score
        risk = min(100, abs(tvl_change) * 1.5 + abs(price_change) * 0.5 + peak_slippage * 2)

        return StressResult(
            scenario=scenario,
            initial_tvl=initial_tvl,
            final_tvl=final_tvl,
            tvl_change_pct=round(tvl_change, 2),
            initial_price=initial_price,
            final_price=final_price,
            price_change_pct=round(price_change, 2),
            liquidity_removed=round(liquidity_removed, 2),
            slippage_at_peak=round(peak_slippage, 2),
            time_to_drain_estimate=round(tde, 1),
            events=events,
            risk_score=round(risk, 1),
        )

    # ------------------------------------------------------------------
    # Pool state snapshot
    # ------------------------------------------------------------------

    def get_state(self) -> dict:
        return {
            "pool_id": self.pool_id,
            "name": self.name,
            "token0": self.token0,
            "token1": self.token1,
            "reserve0": round(self.reserve0, 4),
            "reserve1": round(self.reserve1, 6),
            "price_token1_per_token0": round(self.price, 8),
            "price_token0_per_token1": round(self.price_token1_in_token0, 4),
            "k_product": round(self.k, 2),
            "tvl": round(self.tvl, 2),
            "total_lp_tokens": round(self.total_lp_tokens, 6),
            "fee_pct": self.fee * 100,
            "volume_24h": round(self.volume_24h, 2),
            "swap_count": self.swap_count,
            "total_fees_token0": round(self.total_fees_token0, 4),
            "total_fees_token1": round(self.total_fees_token1, 6),
            "provider_count": len(self.positions),
        }

    def get_recent_events(self, limit: int = 20) -> list[dict]:
        return [
            {
                "event_id": e.event_id,
                "event_type": e.event_type,
                "description": e.description,
                "timestamp": e.timestamp,
            }
            for e in self.events[-limit:][::-1]
        ]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _log_event(self, event_type: str, description: str, metadata: dict):
        self.events.append(PoolEvent(
            event_id=str(uuid.uuid4())[:8],
            event_type=event_type,
            description=description,
            timestamp=time.time(),
            metadata=metadata,
        ))
        # Keep last 200 events
        if len(self.events) > 200:
            self.events = self.events[-200:]
