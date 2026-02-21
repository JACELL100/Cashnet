"""
ScenarioEngine — Real-World DeFi Attack Scenario Simulator
===========================================================
Simulates famous real-world DeFi attacks and frauds:

  1. FTX/FXTC Collapse (Nov 2022)
     - Customer fund misappropriation
     - Hidden leverage through Alameda
     - Run on exchange / bank run
     
  2. Terra/Luna Collapse (May 2022)
     - Algorithmic stablecoin de-peg
     - Death spiral liquidation cascade
     - $40B market cap evaporated
     
  3. Euler Finance Hack (Mar 2023)
     - Flash loan attack
     - Reentrancy exploit
     - $197M stolen
     
  4. Mango Markets Exploit (Oct 2022)
     - Oracle manipulation
     - Artificial collateral inflation
     - $114M drained
     
  5. Wintermute Hack (Sep 2022)
     - Private key compromise (vanity address)
     - $160M stolen
     
  6. 3AC Collapse (Jun 2022)
     - Over-leveraged positions
     - Contagion effect
     - Multiple counterparty failures

Usage:
    from agents.scenario_engine import ScenarioEngine, ScenarioType
    engine = ScenarioEngine(pool, lending, mempool)
    await engine.run_scenario(ScenarioType.FXTC_COLLAPSE)
"""

from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from agents.base import PoolState, LendingState, Mempool


class ScenarioType(str, Enum):
    FXTC_COLLAPSE = "fxtc_collapse"           # FTX-style exchange collapse
    LUNA_DEATH_SPIRAL = "luna_death_spiral"   # Algorithmic stablecoin death spiral
    FLASH_LOAN_EXPLOIT = "flash_loan_exploit" # Euler-style flash loan attack
    ORACLE_MANIPULATION = "oracle_manipulation"  # Mango-style oracle attack
    RUG_PULL = "rug_pull"                     # Classic rug pull
    BANK_RUN = "bank_run"                     # Mass withdrawal panic
    SANDWICH_MEGA = "sandwich_mega"           # Large-scale MEV extraction
    CASCADE_ARMAGEDDON = "cascade_armageddon" # Multi-protocol cascade failure
    WHALE_PANIC = "whale_panic"               # Whale-induced market panic


@dataclass
class ScenarioPhase:
    """A single phase of a scenario with description and effects."""
    name: str
    description: str
    duration_ticks: int
    effects: Dict[str, Any]
    severity: str = "medium"  # low, medium, high, critical


@dataclass
class ScenarioEvent:
    """An event generated during scenario execution."""
    timestamp: float
    scenario_type: str
    phase_name: str
    event_type: str
    description: str
    data: Dict[str, Any]
    severity: str = "medium"
    blockchain_tx: Optional[str] = None  # If recorded on-chain

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "scenario_type": self.scenario_type,
            "phase_name": self.phase_name,
            "event_type": self.event_type,
            "description": self.description,
            "data": self.data,
            "severity": self.severity,
            "blockchain_tx": self.blockchain_tx,
        }


@dataclass
class ScenarioResult:
    """Final result of a completed scenario."""
    scenario_type: str
    success: bool
    total_damage: float
    liquidations_triggered: int
    price_impact_pct: float
    duration_seconds: float
    events: List[ScenarioEvent]
    lessons_learned: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "scenario_type": self.scenario_type,
            "success": self.success,
            "total_damage": round(self.total_damage, 2),
            "liquidations_triggered": self.liquidations_triggered,
            "price_impact_pct": round(self.price_impact_pct, 2),
            "duration_seconds": round(self.duration_seconds, 2),
            "events": [e.to_dict() for e in self.events],
            "lessons_learned": self.lessons_learned,
        }


class ScenarioEngine:
    """
    Orchestrates real-world DeFi attack scenarios with configurable intensity.
    """

    def __init__(
        self,
        pool: PoolState,
        lending: LendingState,
        mempool: Mempool,
        event_callback: Optional[Callable[[ScenarioEvent], None]] = None,
    ):
        self.pool = pool
        self.lending = lending
        self.mempool = mempool
        self.event_callback = event_callback
        
        self.active_scenario: Optional[ScenarioType] = None
        self.current_phase: int = 0
        self.events: List[ScenarioEvent] = []
        self.start_time: float = 0.0
        
        # Track damage
        self._initial_pool_value: float = 0.0
        self._initial_lending_value: float = 0.0
        self._liquidations: int = 0
        self._price_before: float = 1.0

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario Definitions
    # ─────────────────────────────────────────────────────────────────────────

    def _get_fxtc_collapse_phases(self) -> List[ScenarioPhase]:
        """
        FTX/FXTC Collapse Scenario (Nov 2022)
        Based on: Misappropriation of customer funds, hidden Alameda leverage
        """
        return [
            ScenarioPhase(
                name="Hidden Leverage Build-up",
                description="Exchange secretly loans customer deposits to related trading entity",
                duration_ticks=5,
                effects={
                    "hidden_debt_ratio": 0.4,  # 40% of deposits secretly loaned out
                    "fake_reserve_display": True,
                },
                severity="low",
            ),
            ScenarioPhase(
                name="Whistleblower Leak",
                description="Balance sheet leaked showing $8B hole in customer funds",
                duration_ticks=3,
                effects={
                    "market_confidence_drop": 0.3,
                    "withdrawal_rate_multiplier": 2.5,
                },
                severity="medium",
            ),
            ScenarioPhase(
                name="Bank Run Begins",
                description="Users rush to withdraw, exchange halts withdrawals",
                duration_ticks=8,
                effects={
                    "withdrawal_rate_multiplier": 10.0,
                    "liquidity_drain_pct": 0.6,
                    "halt_withdrawals": True,
                },
                severity="high",
            ),
            ScenarioPhase(
                name="Contagion Spreads",
                description="Related entities liquidated, cascading failures",
                duration_ticks=10,
                effects={
                    "cascade_liquidations": True,
                    "price_crash_pct": -45.0,
                    "lending_health_impact": -0.5,
                },
                severity="critical",
            ),
            ScenarioPhase(
                name="Collapse Complete",
                description="Exchange declares bankruptcy, $8B customer funds lost",
                duration_ticks=2,
                effects={
                    "total_loss_pct": 0.95,
                    "bankruptcy": True,
                },
                severity="critical",
            ),
        ]

    def _get_luna_death_spiral_phases(self) -> List[ScenarioPhase]:
        """
        Terra/Luna Death Spiral (May 2022)
        Based on: UST de-peg causing LUNA hyperinflation
        """
        return [
            ScenarioPhase(
                name="Large Depeg Event",
                description="Algorithmic stablecoin begins losing its peg ($0.99 -> $0.95)",
                duration_ticks=4,
                effects={
                    "stablecoin_depeg_pct": -5.0,
                    "arbitrage_opportunity": True,
                },
                severity="medium",
            ),
            ScenarioPhase(
                name="Anchor Protocol Run",
                description="Users rush to exit 20% 'stable' yield, massive sell pressure",
                duration_ticks=6,
                effects={
                    "withdrawal_rate_multiplier": 8.0,
                    "stablecoin_depeg_pct": -15.0,
                    "backing_token_inflation": 3.0,
                },
                severity="high",
            ),
            ScenarioPhase(
                name="Death Spiral Activated",
                description="Mint/burn mechanism enters hyperinflation loop",
                duration_ticks=10,
                effects={
                    "backing_token_inflation": 100.0,  # LUNA went from 350M to 6.5T supply
                    "stablecoin_depeg_pct": -85.0,
                    "price_crash_pct": -99.0,
                },
                severity="critical",
            ),
            ScenarioPhase(
                name="Total Collapse",
                description="$40B market cap evaporates, chain halted",
                duration_ticks=3,
                effects={
                    "chain_halt": True,
                    "total_loss_pct": 0.999,
                },
                severity="critical",
            ),
        ]

    def _get_flash_loan_exploit_phases(self) -> List[ScenarioPhase]:
        """
        Flash Loan Exploit (Euler-style, Mar 2023)
        Based on: $197M stolen using donation attack + flash loans
        """
        return [
            ScenarioPhase(
                name="Flash Loan Borrowed",
                description="Attacker borrows $30M in flash loan (no collateral)",
                duration_ticks=1,
                effects={
                    "flash_loan_amount": 30_000_000,
                    "attack_type": "donation_attack",
                },
                severity="medium",
            ),
            ScenarioPhase(
                name="Collateral Manipulation",
                description="Donates to protocol contract, inflates own collateral ratio",
                duration_ticks=2,
                effects={
                    "collateral_inflation": 10.0,
                    "borrow_limit_bypass": True,
                },
                severity="high",
            ),
            ScenarioPhase(
                name="Excessive Borrow",
                description="Borrows far beyond actual collateral value",
                duration_ticks=2,
                effects={
                    "stolen_amount": 197_000_000,
                    "protocol_drained": True,
                },
                severity="critical",
            ),
            ScenarioPhase(
                name="Loan Repaid + Profit",
                description="Flash loan repaid, attacker keeps $197M profit",
                duration_ticks=1,
                effects={
                    "flash_loan_repaid": True,
                    "net_profit": 197_000_000,
                },
                severity="critical",
            ),
        ]

    def _get_oracle_manipulation_phases(self) -> List[ScenarioPhase]:
        """
        Oracle Manipulation (Mango Markets style, Oct 2022)
        Based on: $114M drained via oracle price manipulation
        """
        return [
            ScenarioPhase(
                name="Position Establishment",
                description="Attacker opens large long + short positions on illiquid perp",
                duration_ticks=3,
                effects={
                    "position_size": 5_000_000,
                    "market": "illiquid_perp",
                },
                severity="low",
            ),
            ScenarioPhase(
                name="Price Manipulation",
                description="Pumps spot price 10x on low-liquidity pair",
                duration_ticks=4,
                effects={
                    "price_pump_pct": 900.0,
                    "oracle_lag_exploited": True,
                },
                severity="high",
            ),
            ScenarioPhase(
                name="Collateral Inflation",
                description="Unrealized PnL counted as collateral, borrows against it",
                duration_ticks=3,
                effects={
                    "fake_collateral_value": 423_000_000,
                    "borrow_against_fake": True,
                },
                severity="critical",
            ),
            ScenarioPhase(
                name="Treasury Drained",
                description="Borrows all available liquidity from protocol treasury",
                duration_ticks=2,
                effects={
                    "stolen_amount": 114_000_000,
                    "treasury_empty": True,
                },
                severity="critical",
            ),
        ]

    def _get_rug_pull_phases(self) -> List[ScenarioPhase]:
        """Classic DeFi Rug Pull Scenario"""
        return [
            ScenarioPhase(
                name="Hype Build-up",
                description="Project promises 10000% APY, celebrity endorsements",
                duration_ticks=5,
                effects={
                    "tvl_growth_rate": 5.0,
                    "fomo_index": 0.9,
                },
                severity="low",
            ),
            ScenarioPhase(
                name="Peak TVL",
                description="Total Value Locked reaches all-time high",
                duration_ticks=3,
                effects={
                    "tvl_peak": True,
                    "insider_sells_begin": True,
                },
                severity="medium",
            ),
            ScenarioPhase(
                name="Liquidity Removal",
                description="Team removes all liquidity from DEX pools",
                duration_ticks=2,
                effects={
                    "liquidity_removed_pct": 0.95,
                    "price_crash_pct": -99.0,
                },
                severity="critical",
            ),
            ScenarioPhase(
                name="Aftermath",
                description="Token worthless, team vanished, social media deleted",
                duration_ticks=2,
                effects={
                    "token_value": 0.0,
                    "team_disappeared": True,
                },
                severity="critical",
            ),
        ]

    def _get_cascade_armageddon_phases(self) -> List[ScenarioPhase]:
        """Multi-Protocol Cascade Failure (inspired by 3AC collapse)"""
        return [
            ScenarioPhase(
                name="Initial Default",
                description="Major fund fails to meet margin call",
                duration_ticks=3,
                effects={
                    "initial_default_size": 500_000_000,
                    "counterparty_exposure": 0.3,
                },
                severity="high",
            ),
            ScenarioPhase(
                name="Contagion Wave 1",
                description="Direct counterparties begin liquidations",
                duration_ticks=5,
                effects={
                    "cascade_liquidations": True,
                    "price_drop_pct": -25.0,
                    "lenders_affected": 5,
                },
                severity="high",
            ),
            ScenarioPhase(
                name="Contagion Wave 2",
                description="Secondary counterparties fail, credit freeze",
                duration_ticks=6,
                effects={
                    "credit_freeze": True,
                    "price_drop_pct": -40.0,
                    "lenders_affected": 12,
                },
                severity="critical",
            ),
            ScenarioPhase(
                name="Market Capitulation",
                description="Forced selling across all protocols",
                duration_ticks=8,
                effects={
                    "forced_selling_pct": 0.6,
                    "price_drop_pct": -70.0,
                    "insolvencies": 8,
                },
                severity="critical",
            ),
        ]

    # ─────────────────────────────────────────────────────────────────────────
    # Scenario Execution
    # ─────────────────────────────────────────────────────────────────────────

    def get_available_scenarios(self) -> List[Dict[str, Any]]:
        """Get list of available scenarios with descriptions."""
        return [
            {
                "type": ScenarioType.FXTC_COLLAPSE.value,
                "name": "FTX/FXTC Collapse",
                "description": "Customer fund misappropriation leading to exchange collapse",
                "severity": "critical",
                "estimated_damage": "$8B+",
                "real_world_date": "November 2022",
            },
            {
                "type": ScenarioType.LUNA_DEATH_SPIRAL.value,
                "name": "Luna/Terra Death Spiral",
                "description": "Algorithmic stablecoin de-peg causing token hyperinflation",
                "severity": "critical",
                "estimated_damage": "$40B+",
                "real_world_date": "May 2022",
            },
            {
                "type": ScenarioType.FLASH_LOAN_EXPLOIT.value,
                "name": "Flash Loan Exploit",
                "description": "Euler-style donation attack using flash loans",
                "severity": "critical",
                "estimated_damage": "$197M",
                "real_world_date": "March 2023",
            },
            {
                "type": ScenarioType.ORACLE_MANIPULATION.value,
                "name": "Oracle Manipulation",
                "description": "Mango Markets style oracle price manipulation",
                "severity": "critical",
                "estimated_damage": "$114M",
                "real_world_date": "October 2022",
            },
            {
                "type": ScenarioType.RUG_PULL.value,
                "name": "Rug Pull",
                "description": "Classic DeFi exit scam with liquidity removal",
                "severity": "high",
                "estimated_damage": "Variable",
                "real_world_date": "Ongoing",
            },
            {
                "type": ScenarioType.CASCADE_ARMAGEDDON.value,
                "name": "Cascade Armageddon",
                "description": "3AC-style multi-protocol cascade failure",
                "severity": "critical",
                "estimated_damage": "$10B+",
                "real_world_date": "June 2022",
            },
        ]

    async def run_scenario(
        self,
        scenario_type: ScenarioType,
        intensity: float = 1.0,  # 0.1 to 2.0
        tick_delay: float = 0.3,
    ) -> ScenarioResult:
        """
        Execute a real-world attack scenario.
        
        Args:
            scenario_type: Type of scenario to run
            intensity: Multiplier for damage (0.1 = mild, 2.0 = extreme)
            tick_delay: Seconds between simulation ticks
        """
        self.active_scenario = scenario_type
        self.events = []
        self.start_time = time.time()
        self._liquidations = 0
        
        # Record initial state
        self._initial_pool_value = self.pool.reserve_a + self.pool.reserve_b
        self._initial_lending_value = self.lending.total_collateral
        self._price_before = self.pool.price_a_per_b

        # Get phases for this scenario
        phases = self._get_phases_for_scenario(scenario_type)

        # Execute each phase
        for phase_idx, phase in enumerate(phases):
            self.current_phase = phase_idx
            await self._execute_phase(phase, intensity, tick_delay)

        # Calculate final damage
        price_after = self.pool.price_a_per_b
        price_impact = (price_after - self._price_before) / self._price_before * 100
        
        final_pool_value = self.pool.reserve_a + self.pool.reserve_b
        total_damage = self._initial_pool_value - final_pool_value

        # Generate lessons learned
        lessons = self._get_lessons_learned(scenario_type)

        result = ScenarioResult(
            scenario_type=scenario_type.value,
            success=True,
            total_damage=total_damage * intensity,
            liquidations_triggered=self._liquidations,
            price_impact_pct=price_impact * intensity,
            duration_seconds=time.time() - self.start_time,
            events=self.events,
            lessons_learned=lessons,
        )

        self.active_scenario = None
        return result

    def _get_phases_for_scenario(self, scenario_type: ScenarioType) -> List[ScenarioPhase]:
        """Get the phase sequence for a scenario type."""
        phase_map = {
            ScenarioType.FXTC_COLLAPSE: self._get_fxtc_collapse_phases,
            ScenarioType.LUNA_DEATH_SPIRAL: self._get_luna_death_spiral_phases,
            ScenarioType.FLASH_LOAN_EXPLOIT: self._get_flash_loan_exploit_phases,
            ScenarioType.ORACLE_MANIPULATION: self._get_oracle_manipulation_phases,
            ScenarioType.RUG_PULL: self._get_rug_pull_phases,
            ScenarioType.CASCADE_ARMAGEDDON: self._get_cascade_armageddon_phases,
        }
        return phase_map.get(scenario_type, self._get_fxtc_collapse_phases)()

    async def _execute_phase(
        self,
        phase: ScenarioPhase,
        intensity: float,
        tick_delay: float,
    ):
        """Execute a single scenario phase."""
        # Emit phase start event
        self._emit_event(
            event_type="phase_start",
            description=f"Phase '{phase.name}' begins: {phase.description}",
            data={"phase": phase.name, "effects": phase.effects},
            severity=phase.severity,
        )

        # Apply effects over duration
        for tick in range(phase.duration_ticks):
            await asyncio.sleep(tick_delay)
            await self._apply_phase_effects(phase, intensity, tick)

        # Emit phase complete event
        self._emit_event(
            event_type="phase_complete",
            description=f"Phase '{phase.name}' completed",
            data={"phase": phase.name},
            severity="low",
        )

    async def _apply_phase_effects(
        self,
        phase: ScenarioPhase,
        intensity: float,
        tick: int,
    ):
        """Apply the effects of a phase to the simulation state."""
        effects = phase.effects

        # Price crash effect
        if "price_crash_pct" in effects:
            crash_pct = effects["price_crash_pct"] * intensity / phase.duration_ticks
            self._apply_price_impact(crash_pct)
            self._emit_event(
                event_type="price_crash",
                description=f"Price dropped {abs(crash_pct):.1f}%",
                data={"crash_pct": crash_pct, "new_price": self.pool.price_a_per_b},
                severity="high" if abs(crash_pct) > 5 else "medium",
            )

        # Liquidity drain effect
        if "liquidity_drain_pct" in effects:
            drain = effects["liquidity_drain_pct"] * intensity / phase.duration_ticks
            drain_amount = self.pool.reserve_a * drain
            self.pool.reserve_a -= drain_amount
            self.pool.reserve_b -= drain_amount * self.pool.price_a_per_b
            self._emit_event(
                event_type="liquidity_drain",
                description=f"${drain_amount:,.0f} liquidity withdrawn",
                data={"amount": drain_amount},
                severity="high",
            )

        # Cascade liquidations effect
        if "cascade_liquidations" in effects and effects["cascade_liquidations"]:
            await self._trigger_cascade_liquidations(intensity)

        # Lending health impact
        if "lending_health_impact" in effects:
            impact = effects["lending_health_impact"] * intensity / phase.duration_ticks
            self.lending.apply_price_change(impact * 100)
            
        # Flash loan specific effects
        if "flash_loan_amount" in effects:
            amount = effects["flash_loan_amount"] * intensity
            self._emit_event(
                event_type="flash_loan_borrow",
                description=f"Flash loan of ${amount:,.0f} borrowed (no collateral)",
                data={"amount": amount, "collateral": 0},
                severity="high",
            )

        # Stolen amount
        if "stolen_amount" in effects:
            stolen = effects["stolen_amount"] * intensity / phase.duration_ticks
            self._emit_event(
                event_type="funds_stolen",
                description=f"${stolen:,.0f} stolen from protocol",
                data={"stolen": stolen},
                severity="critical",
            )

    def _apply_price_impact(self, crash_pct: float):
        """Apply a price impact to the pool."""
        if crash_pct < 0:
            # Price crash = dump token A
            dump_amount = abs(crash_pct) / 100 * self.pool.reserve_a
            self.pool.execute_swap(dump_amount, "TOKEN_A")
        else:
            # Price pump = dump token B
            pump_amount = crash_pct / 100 * self.pool.reserve_b
            self.pool.execute_swap(pump_amount, "TOKEN_B")

    async def _trigger_cascade_liquidations(self, intensity: float):
        """Trigger cascade liquidations in the lending market."""
        liquidatable = self.lending.get_liquidatable()
        
        num_to_liquidate = min(int(len(liquidatable) * intensity), 10)
        
        for pos in liquidatable[:num_to_liquidate]:
            result = self.lending.liquidate(pos.wallet)
            if result:
                self._liquidations += 1
                self._emit_event(
                    event_type="cascade_liquidation",
                    description=f"Position {pos.wallet[:8]}... liquidated in cascade",
                    data={
                        "wallet": pos.wallet,
                        "debt_covered": result["debt_covered"],
                        "collateral_seized": result["seized_collateral"],
                    },
                    severity="high",
                )

    def _emit_event(
        self,
        event_type: str,
        description: str,
        data: Dict[str, Any],
        severity: str = "medium",
    ):
        """Emit a scenario event."""
        event = ScenarioEvent(
            timestamp=time.time(),
            scenario_type=self.active_scenario.value if self.active_scenario else "unknown",
            phase_name=f"phase_{self.current_phase}",
            event_type=event_type,
            description=description,
            data=data,
            severity=severity,
        )
        self.events.append(event)
        
        if self.event_callback:
            self.event_callback(event)

    def _get_lessons_learned(self, scenario_type: ScenarioType) -> List[str]:
        """Get educational lessons from each scenario."""
        lessons_map = {
            ScenarioType.FXTC_COLLAPSE: [
                "Never trust centralized exchanges with custody of your funds",
                "Proof of Reserves audits can be faked without proper verification",
                "Related-party transactions create hidden systemic risk",
                "Regulatory oversight is crucial for customer protection",
                "Bank runs can happen in weeks, not years",
            ],
            ScenarioType.LUNA_DEATH_SPIRAL: [
                "Algorithmic stablecoins have inherent death spiral risk",
                "Unsustainable yields (like 20% 'stable') are red flags",
                "When backing asset inflates, the system is collapsing",
                "Circular tokenomics amplify downward pressure",
                "Market size doesn't protect against design flaws",
            ],
            ScenarioType.FLASH_LOAN_EXPLOIT: [
                "Flash loans enable atomic exploit sequences",
                "Donation/deposit mechanics can be manipulated",
                "Time delays between state updates create vulnerabilities",
                "Smart contract audits must consider flash loan vectors",
                "Reentrancy guards are essential but not sufficient",
            ],
            ScenarioType.ORACLE_MANIPULATION: [
                "Low-liquidity assets should not be used as collateral",
                "Time-weighted average prices (TWAP) add protection",
                "Collateral caps prevent single-asset concentration",
                "Unrealized PnL should not count as collateral",
                "Multi-oracle designs reduce manipulation risk",
            ],
            ScenarioType.RUG_PULL: [
                "Anonymous teams + high APY = maximum risk",
                "Check if liquidity is locked and for how long",
                "Verify smart contracts are non-upgradeable or timelocked",
                "Celebrity endorsements mean nothing for security",
                "If it seems too good to be true, it is",
            ],
            ScenarioType.CASCADE_ARMAGEDDON: [
                "Interconnected protocols amplify systemic risk",
                "Over-leveraged entities create contagion vectors",
                "Credit risk in DeFi is real and correlated",
                "Diversification within DeFi may not protect you",
                "Market makers can fail too, causing liquidity crises",
            ],
        }
        return lessons_map.get(scenario_type, [])

    def get_scenario_status(self) -> Dict[str, Any]:
        """Get current scenario execution status."""
        return {
            "active": self.active_scenario.value if self.active_scenario else None,
            "current_phase": self.current_phase,
            "events_count": len(self.events),
            "liquidations": self._liquidations,
            "elapsed_seconds": time.time() - self.start_time if self.start_time else 0,
        }


# Global instance for router access
scenario_engine: Optional[ScenarioEngine] = None

def get_scenario_engine(pool: PoolState, lending: LendingState, mempool: Mempool) -> ScenarioEngine:
    """Get or create the scenario engine instance."""
    global scenario_engine
    if scenario_engine is None:
        scenario_engine = ScenarioEngine(pool, lending, mempool)
    else:
        scenario_engine.pool = pool
        scenario_engine.lending = lending
        scenario_engine.mempool = mempool
    return scenario_engine
