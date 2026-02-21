"""
Pool Store — in-memory registry of AMMPool instances.
Supports multiple pools identified by pool_id.
One default pool is seeded at startup.
"""
import uuid
from typing import Optional
from .amm_pool import AMMPool


class PoolStore:
    """Registry of simulatable AMM pools."""

    def __init__(self):
        self._pools: dict[str, AMMPool] = {}
        # Seed a default PAL/BAD pool (Palladium / Badassium simulation tokens)
        self._seed_default()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def _seed_default(self):
        default_id = "default"
        self._pools[default_id] = AMMPool(
            pool_id=default_id,
            token0="PAL",            # Palladium — 0x983A613d5f224459D2919e0d9E9e77C72E032042
            token1="BAD",            # Badassium — 0x2960e22Ed3256E2bAfF233F5d03A20f597f14e07
            reserve0=1_000_000.0,    # 1,000,000 PAL
            reserve1=500_000.0,      # 500,000 BAD  → 1 BAD = 2 PAL
            fee_bps=30,
            name="PAL/BAD",
        )
        # Add an initial LP position for the "protocol" (shows up in provider_count)
        self._pools[default_id].add_liquidity("protocol_treasury", 100_000.0)
        # Seed a "lender_user" position so the pool page can remove liquidity out of the box
        self._pools[default_id].add_liquidity("lender_user", 50_000.0)

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def create_pool(
        self,
        token0: str = "PAL",
        token1: str = "BAD",
        reserve0: float = 100_000.0,
        reserve1: float = 50_000.0,
        fee_bps: int = 30,
        name: Optional[str] = None,
    ) -> AMMPool:
        pool_id = str(uuid.uuid4())[:8]
        pool = AMMPool(
            pool_id=pool_id,
            token0=token0,
            token1=token1,
            reserve0=reserve0,
            reserve1=reserve1,
            fee_bps=fee_bps,
            name=name,
        )
        self._pools[pool_id] = pool
        return pool

    def get_pool(self, pool_id: str) -> Optional[AMMPool]:
        return self._pools.get(pool_id)

    def get_or_raise(self, pool_id: str) -> AMMPool:
        pool = self._pools.get(pool_id)
        if pool is None:
            raise KeyError(f"Pool '{pool_id}' not found")
        return pool

    def list_pools(self) -> list[dict]:
        return [p.get_state() for p in self._pools.values()]

    def delete_pool(self, pool_id: str) -> bool:
        if pool_id == "default":
            raise ValueError("Cannot delete the default pool")
        return bool(self._pools.pop(pool_id, None))

    def reset_default(self):
        """Reset the default pool to its initial state."""
        if "default" in self._pools:
            del self._pools["default"]
        self._seed_default()


# Singleton
pool_store = PoolStore()
