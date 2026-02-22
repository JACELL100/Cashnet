"""
SimulationRunner — Orchestrates all agents together
=====================================================
- Creates & manages all agent instances
- Runs the tick loop (async)
- Coordinates shared state (pool, lending, mempool)
- Integrates REAL market data from CoinDesk API
- Feeds events into the FraudMonitor
- Logs everything for the backend & frontend
- Records simulation events on blockchain (when enabled)
"""

import asyncio
import time
import random
from typing import Any, Dict, List, Optional

from agents.base import (
    BaseAgent,
    AgentState,
    AgentType,
    PoolState,
    LendingState,
    Mempool,
    TradeAction,
    PendingTx,
)
from agents.retail_trader import RetailTrader
from agents.whale_agent import WhaleAgent
from agents.arbitrage_bot import ArbitrageBot
from agents.liquidator_bot import LiquidatorBot
from agents.mev_bot import MEVBot
from agents.attacker_agent import AttackerAgent
from agents.borrower_agent import BorrowerAgent
from agents.fraud_monitor import FraudMonitor
from agents.market_data import MarketDataService, market_data_service, PriceData
from agents.blockchain_integrator import get_blockchain_integrator, BlockchainIntegrator
from agents.groq_advisor import get_agent_advice, get_market_narrative, analyze_threat


class SimulationRunner:
    """
    Central orchestrator that:
      1. Spawns all agent types
      2. Shares PoolState, LendingState, Mempool across agents
      3. Integrates REAL market data from CoinDesk API
      4. Runs a step-based event loop
      5. Pipes every event through FraudMonitor
      6. Exposes state for the API layer
    """

    def __init__(self):
        # Shared world state
        self.pool = PoolState(reserve_a=1_000_000, reserve_b=1_000_000)
        self.lending = LendingState()
        self.mempool = Mempool()
        self.fraud_monitor = FraudMonitor()
        
        # Blockchain integrator (for on-chain recording)
        self.blockchain_integrator: Optional[BlockchainIntegrator] = None
        
        # Real market data service
        self.market_data = market_data_service
        self._market_prices: Dict[str, PriceData] = {}
        self._last_market_fetch: float = 0.0
        self._market_fetch_interval: float = 15.0  # Fetch every 15 seconds

        # Agents
        self.agents: List[BaseAgent] = []

        # Simulation metadata
        self.status: str = "idle"        # idle | running | paused | completed
        self.current_step: int = 0
        self.max_steps: int = 200
        self.tick_delay: float = 0.5     # seconds between ticks
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None

        # Event log (recent N for the API)
        self.activity_feed: List[Dict[str, Any]] = []
        self._max_feed: int = 200

        # All trade actions log
        self.trade_log: List[Dict[str, Any]] = []

        # Background task handle
        self._task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------
    # Agent creation
    # ------------------------------------------------------------------

    def _create_default_agents(self) -> List[BaseAgent]:
        """Spawn the default set of agents."""
        agents: List[BaseAgent] = []

        # 3 retail traders
        for i in range(1, 4):
            agents.append(RetailTrader(
                name=f"Retail_{i}",
                capital=random.uniform(5_000, 25_000),
            ))

        # 1 whale
        agents.append(WhaleAgent(
            name="MegaWhale",
            capital=500_000,
        ))

        # 1 arbitrage bot
        agents.append(ArbitrageBot(
            name="ArbBot",
            capital=100_000,
            spread_threshold_pct=0.3,
        ))

        # 1 liquidator
        agents.append(LiquidatorBot(
            name="LiqBot",
            capital=200_000,
        ))

        # 1 MEV bot
        agents.append(MEVBot(
            name="SandwichBot",
            capital=150_000,
            min_victim_size=3_000,
        ))

        # 1 attacker
        agents.append(AttackerAgent(
            name="FlashAttacker",
            capital=50_000,
            attack_cooldown_ticks=20,
        ))
        
        # 3 Actively Managed Borrower Positions
        agents.append(BorrowerAgent(name="Borrower_A1", wallet="0xBorrower_A1", capital=10_000))
        agents.append(BorrowerAgent(name="Borrower_B2", wallet="0xBorrower_B2", capital=5_000))
        agents.append(BorrowerAgent(name="Borrower_C3", wallet="0xBorrower_C3", capital=20_000))

        return agents

    def _create_custom_agents(self, config: List[Dict[str, Any]]) -> List[BaseAgent]:
        """Spawn agents based on a custom frontend configuration."""
        agents: List[BaseAgent] = []
        for a_conf in config:
            a_type = a_conf.get("type")
            name = a_conf.get("name", "Agent")
            capital = a_conf.get("capital", 50000.0)
            risk = a_conf.get("risk", "medium")
            speed = a_conf.get("speed", "normal")
            
            agent = None
            if a_type == AgentType.RETAIL_TRADER.value:
                agent = RetailTrader(name=name, capital=capital)
            elif a_type == AgentType.WHALE.value:
                agent = WhaleAgent(name=name, capital=capital)
            elif a_type == AgentType.ARBITRAGE_BOT.value:
                agent = ArbitrageBot(name=name, capital=capital, spread_threshold_pct=a_conf.get("spread_threshold", 0.3))
            elif a_type == AgentType.LIQUIDATOR_BOT.value:
                agent = LiquidatorBot(name=name, capital=capital)
            elif a_type == AgentType.MEV_BOT.value:
                agent = MEVBot(name=name, capital=capital)
            elif a_type == AgentType.ATTACKER.value:
                agent = AttackerAgent(name=name, capital=capital)
            elif a_type == "borrower":
                agent = BorrowerAgent(name=name, wallet=f"0x{name}", capital=capital)
                
            if agent:
                agent.risk = risk
                agent.speed = speed
                agents.append(agent)
                
        return agents

    def _inject_shared_state(self):
        """Give every agent references to shared simulation state."""
        for agent in self.agents:
            agent.pool = self.pool
            agent.lending = self.lending
            agent.mempool = self.mempool
            agent.market_data = self.market_data  # Inject market data service
            agent._event_callback = self._on_agent_event

    # ------------------------------------------------------------------
    # Event handling
    # ------------------------------------------------------------------

    def _on_agent_event(self, event: Dict[str, Any]):
        """Callback wired into every agent. Routes events to FraudMonitor + log."""
        self.activity_feed.append(event)
        if len(self.activity_feed) > self._max_feed:
            self.activity_feed = self.activity_feed[-self._max_feed:]

        # Feed into fraud monitor
        self.fraud_monitor.process_event(event)

    # ------------------------------------------------------------------
    # Simulation lifecycle
    # ------------------------------------------------------------------

    async def start(
        self,
        max_steps: int = 200,
        tick_delay: float = 0.5,
        custom_agents: Optional[List[BaseAgent]] = None,
    ):
        """Start the simulation. Runs in the background."""
        if self.status == "running":
            return {"error": "Simulation already running"}

        # Reset
        self.pool = PoolState(reserve_a=1_000_000, reserve_b=1_000_000)
        self.lending = LendingState()
        self.mempool = Mempool()
        self.fraud_monitor.reset()
        self.activity_feed.clear()
        self.trade_log.clear()
        self.current_step = 0
        self.max_steps = max_steps
        self.tick_delay = tick_delay
        self.start_time = time.time()
        self.end_time = None
        
        # Initialize blockchain integrator
        try:
            # Pass activity_feed.append as callback for live event streaming
            self.blockchain_integrator = await get_blockchain_integrator(
                activity_feed_callback=self.activity_feed.append
            )
            print(f"✅ Blockchain integration ready (Real TXs: {self.blockchain_integrator.enable_real_txs})")
        except Exception as e:
            print(f"⚠️  Blockchain integrator failed to initialize: {e}")
            self.blockchain_integrator = None

        # Create agents
        if custom_agents is not None:
            self.agents = custom_agents
        else:
            self.agents = self._create_default_agents()
            
        self._inject_shared_state()

        for agent in self.agents:
            agent.start()

        self.status = "running"

        # Launch background loop
        self._task = asyncio.create_task(self._run_loop())

        return {
            "status": "running",
            "agents": len(self.agents),
            "max_steps": self.max_steps,
            "blockchain_enabled": self.blockchain_integrator is not None,
        }

    async def _run_loop(self):
        """Main simulation loop."""
        try:
            while self.current_step < self.max_steps and self.status == "running":
                await self._tick()
                self.current_step += 1
                await asyncio.sleep(self.tick_delay)

            if self.status == "running":
                self.status = "completed"
            self.end_time = time.time()

        except asyncio.CancelledError:
            self.status = "stopped"
            self.end_time = time.time()
        except Exception as e:
            self.status = "error"
            self.end_time = time.time()
            self._on_agent_event({
                "agent_id": "system",
                "agent_type": "system",
                "agent_name": "SimulationRunner",
                "event_type": "error",
                "data": {"error": str(e)},
                "timestamp": time.time(),
            })

    async def _tick(self):
        """Execute one simulation step: fetch market data, all agents act, then world updates."""

        # 0. Core world state updates (interest rate accrual)
        self.lending.accrue_interest(self.tick_delay)
        
        # 1. Fetch real market data periodically
        now = time.time()
        if now - self._last_market_fetch >= self._market_fetch_interval:
            try:
                self._market_prices = await self.market_data.fetch_all_prices()
                self._last_market_fetch = now
                
                # Log market update event
                market_condition = self.market_data.get_market_condition()
                btc_price = self._market_prices.get("BTC")
                eth_price = self._market_prices.get("ETH")
                
                market_ctx = {
                    "btc_price": btc_price.price if btc_price else 0,
                    "eth_price": eth_price.price if eth_price else 0,
                    "btc_change_24h": btc_price.change_pct_24h if btc_price else 0,
                    "eth_change_24h": eth_price.change_pct_24h if eth_price else 0,
                    "sentiment": market_condition.sentiment,
                    "volatility": market_condition.volatility,
                    "risk_level": market_condition.risk_level,
                    "source": btc_price.source if btc_price else "coindesk",
                }
                self._on_agent_event({
                    "agent_id": "market_oracle",
                    "agent_type": "system",
                    "agent_name": "Market Oracle",
                    "event_type": "market_update",
                    "data": market_ctx,
                    "timestamp": time.time(),
                })

                # Groq market narrative (non-blocking fire-and-forget)
                async def _emit_narrative(ctx: dict):
                    narrative = await get_market_narrative(ctx)
                    if narrative:
                        self._on_agent_event({
                            "agent_id": "groq_analyst",
                            "agent_type": "ai",
                            "agent_name": "Groq Market Analyst",
                            "event_type": "ai_narrative",
                            "data": {"narrative": narrative, "model": "llama-3.3-70b-versatile"},
                            "timestamp": time.time(),
                        })
                asyncio.create_task(_emit_narrative(market_ctx))

            except Exception as e:
                print(f"[SimulationRunner] Market data fetch error: {e}")

        # 1. Apply real market conditions to pool reference price
        if self._market_prices:
            # Use ETH price changes to drive pool price drift
            eth_data = self._market_prices.get("ETH")
            if eth_data:
                # Scale 24h change to per-tick change (assume ~200 ticks per sim)
                per_tick_drift = eth_data.change_pct_24h / 200
                self.pool.drift_reference_price(per_tick_drift * 0.5)  # Dampened
        else:
            # Fallback: random drift
            self.pool.drift_reference_price(0.3)

        # 2. Apply market conditions to lending price shocks
        market_condition = self.market_data.get_market_condition()
        shock_factor = self.market_data.get_price_shock_factor()
        
        if random.random() < 0.15:
            # Use real volatility to determine shock magnitude
            base_shock = random.uniform(-3, 1)
            real_shock = base_shock * abs(shock_factor) * 0.3
            self.lending.apply_price_change(real_shock)
            
            if abs(real_shock) > 2:
                self._on_agent_event({
                    "agent_id": "market_oracle",
                    "agent_type": "system",
                    "agent_name": "Market Oracle",
                    "event_type": "price_shock",
                    "data": {
                        "shock_pct": round(real_shock, 2),
                        "market_sentiment": market_condition.sentiment,
                        "volatility": market_condition.volatility,
                    },
                    "timestamp": time.time(),
                })

        # 3. Each agent ticks with market-aware aggression
        all_actions: List[TradeAction] = []
        for agent in self.agents:
            if agent.state != AgentState.RUNNING or not agent.active:
                continue
            try:
                # Apply market-driven aggression modifier
                agent._market_aggression = self.market_data.get_agent_aggression_modifier(
                    agent.agent_type.value
                )

                # Groq AI advice — inject into agent every ~30 steps
                if self.current_step % 30 == 0 and self._market_prices:
                    btc = self._market_prices.get("BTC")
                    eth = self._market_prices.get("ETH")
                    mc = self.market_data.get_market_condition()
                    advice = await get_agent_advice(
                        agent_id=agent.id,
                        agent_type=agent.agent_type.value,
                        market_context={
                            "btc_price": btc.price if btc else 0,
                            "eth_price": eth.price if eth else 0,
                            "btc_change_24h": btc.change_pct_24h if btc else 0,
                            "eth_change_24h": eth.change_pct_24h if eth else 0,
                            "sentiment": mc.sentiment,
                            "volatility": mc.volatility,
                            "risk_level": mc.risk_level,
                        },
                        pool_state=self.pool.to_dict(),
                        agent_stats={
                            "capital": agent.capital,
                            "pnl": agent.stats.pnl,
                            "trades_count": agent.stats.trades_count,
                        },
                    )
                    if advice:
                        agent._groq_advice = advice
                        self._on_agent_event({
                            "agent_id": agent.id,
                            "agent_type": agent.agent_type.value,
                            "agent_name": agent.name,
                            "event_type": "ai_decision",
                            "data": {"groq_advice": advice, "model": "llama-3.3-70b-versatile"},
                            "timestamp": time.time(),
                        })

                actions = await agent.tick(self.current_step)
                all_actions.extend(actions)
            except Exception as e:
                agent.state = AgentState.ERROR
                self._on_agent_event({
                    "agent_id": agent.id,
                    "agent_type": agent.agent_type.value,
                    "agent_name": agent.name,
                    "event_type": "agent_error",
                    "data": {"error": str(e)},
                    "timestamp": time.time(),
                })

        # 4. Log actions
        for action in all_actions:
            self.trade_log.append(action.to_dict())
        
        # 5. Record high-value swaps to blockchain (if enabled)
        if self.blockchain_integrator:
            for action in all_actions:
                if action.action == "swap" and action.metadata.get("amount_in", 0) > 1000:
                    # Record significant swaps (>1000 tokens) to blockchain
                    try:
                        await self.blockchain_integrator.record_swap(
                            agent_id=action.agent_id,
                            token_in=action.metadata.get("token_in", "PALLADIUM"),
                            amount_in=action.metadata.get("amount_in", 0),
                            amount_out=action.metadata.get("amount_out", 0),
                            price_impact=action.metadata.get("price_impact", 0),
                            execute_on_chain=False,  # Set to True to execute real swaps
                        )
                    except Exception as e:
                        print(f"⚠️  Failed to record swap on blockchain: {e}")
                
                elif action.action == "liquidate":
                    # Record liquidations to blockchain
                    try:
                        await self.blockchain_integrator.record_liquidation(
                            liquidator_id=action.agent_id,
                            target_wallet=action.metadata.get("target", "unknown"),
                            debt_covered=action.metadata.get("debt_covered", 0),
                            collateral_seized=action.metadata.get("collateral_seized", 0),
                            bonus_pct=action.metadata.get("bonus_pct", 0),
                        )
                    except Exception as e:
                        print(f"⚠️  Failed to record liquidation on blockchain: {e}")

        # 6. Clear processed mempool transactions periodically
        if self.current_step % 5 == 0:
            self.mempool.pop_all()

    async def pause(self):
        if self.status == "running":
            self.status = "paused"
            for agent in self.agents:
                if agent.state == AgentState.RUNNING:
                    agent.pause()
        return {"status": self.status}

    async def resume(self):
        if self.status == "paused":
            self.status = "running"
            for agent in self.agents:
                if agent.state == AgentState.PAUSED:
                    agent.resume()
            # Re-launch loop
            self._task = asyncio.create_task(self._run_loop())
        return {"status": self.status}

    async def stop(self):
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self.status = "completed"
        self.end_time = time.time()
        for agent in self.agents:
            agent.stop()
        return {"status": "completed"}

    # ------------------------------------------------------------------
    # Agent management
    # ------------------------------------------------------------------

    def toggle_agent(self, agent_id: str, active: bool) -> Optional[Dict]:
        for agent in self.agents:
            if agent.id == agent_id:
                agent.active = active
                if active:
                    agent.start()
                else:
                    agent.stop()
                return agent.to_dict()
        return None

    def update_agent_capital(self, agent_id: str, capital: float) -> Optional[Dict]:
        for agent in self.agents:
            if agent.id == agent_id:
                agent.capital = capital
                return agent.to_dict()
        return None

    def trigger_stress_event(self, event_type: str, magnitude: float = 1.0) -> Dict[str, Any]:
        """Trigger an immediate stress event impacting pool or lending protocol."""
        result = {}
        if event_type == "price_crash":
            # Simulate a 10-50% price crash of collateral
            crash_pct = 10 * magnitude
            self.lending.apply_price_change(-crash_pct)
            
            # Crash the pool price as well
            if self.pool.reserve_a > 100:
                self.pool.execute_swap(self.pool.reserve_a * (crash_pct / 100), "TOKEN_A")
                
            self._on_agent_event({
                "agent_id": "system_stress",
                "agent_type": "system",
                "agent_name": "God Mode",
                "event_type": "stress_event",
                "data": {
                    "type": "price_crash",
                    "magnitude": magnitude,
                    "impact_pct": -crash_pct,
                },
                "timestamp": time.time(),
            })
            result = {"type": "price_crash", "impact_pct": -crash_pct}

        elif event_type == "liquidity_drain":
            # Yank liquidity from the pool
            remove_pct = 20 * magnitude
            removed = self.pool.remove_liquidity(remove_pct)
            self._on_agent_event({
                "agent_id": "system_stress",
                "agent_type": "system",
                "agent_name": "God Mode",
                "event_type": "stress_event",
                "data": {
                    "type": "liquidity_drain",
                    "magnitude": magnitude,
                    "removed_pct": remove_pct,
                },
                "timestamp": time.time(),
            })
            result = {"type": "liquidity_drain", "removed_pct": remove_pct}
            
        elif event_type == "mempool_flood":
            # Flood the mempool with fake high gas transactions
            for i in range(int(50 * magnitude)):
                self.mempool.submit(PendingTx(
                    tx_id=f"flood_{time.time()}_{i}",
                    agent_id="system_stress",
                    action="spam_tx",
                    token_in="TOKEN_A",
                    token_out="TOKEN_B",
                    amount=random.uniform(500, 2000),
                    gas_price=random.uniform(100, 300) * magnitude
                ))
            self._on_agent_event({
                "agent_id": "system_stress",
                "agent_type": "system",
                "agent_name": "God Mode",
                "event_type": "stress_event",
                "data": {
                    "type": "mempool_flood",
                    "magnitude": magnitude,
                    "tx_count": int(50 * magnitude),
                },
                "timestamp": time.time(),
            })
            result = {"type": "mempool_flood", "tx_count": int(50 * magnitude)}
            
        return result

    # ------------------------------------------------------------------
    # State queries (for API)
    # ------------------------------------------------------------------

    def get_status(self) -> Dict[str, Any]:
        elapsed = 0
        if self.start_time:
            end = self.end_time or time.time()
            elapsed = round(end - self.start_time, 1)

        # Get real market data
        market_info = self.market_data.to_dict() if self._market_prices else None
        
        # Get blockchain stats
        blockchain_stats = None
        if self.blockchain_integrator:
            blockchain_stats = self.blockchain_integrator.get_stats()

        return {
            "status": self.status,
            "current_step": self.current_step,
            "max_steps": self.max_steps,
            "elapsed_seconds": elapsed,
            "agents_count": len(self.agents),
            "active_agents": sum(1 for a in self.agents if a.active),
            "total_trades": len(self.trade_log),
            "total_alerts": len(self.fraud_monitor.alerts),
            "pool": self.pool.to_dict(),
            "lending": self.lending.to_dict(),
            "market_data": market_info,
            "blockchain": blockchain_stats,
        }

    def get_agents(self) -> List[Dict[str, Any]]:
        return [a.to_dict() for a in self.agents]

    def get_agent(self, agent_id: str) -> Optional[Dict[str, Any]]:
        for a in self.agents:
            if a.id == agent_id:
                return a.to_dict()
        return None

    def get_activity_feed(self, limit: int = 50) -> List[Dict[str, Any]]:
        return self.activity_feed[-limit:]

    def get_trade_log(self, limit: int = 100) -> List[Dict[str, Any]]:
        return self.trade_log[-limit:]

    def get_summary(self) -> Dict[str, Any]:
        total_pnl = sum(a.stats.pnl for a in self.agents)
        total_volume = sum(a.stats.total_volume for a in self.agents)
        return {
            "simulation": self.get_status(),
            "agents_summary": [
                {
                    "id": a.id,
                    "name": a.name,
                    "type": a.agent_type.value,
                    "pnl": round(a.stats.pnl, 2),
                    "trades": a.stats.trades_count,
                    "volume": round(a.stats.total_volume, 2),
                    "win_rate": round(a.stats.win_rate, 4),
                }
                for a in self.agents
            ],
            "totals": {
                "pnl": round(total_pnl, 2),
                "volume": round(total_volume, 2),
                "trades": len(self.trade_log),
            },
            "fraud_stats": self.fraud_monitor.get_stats(),
            "threat_scores": self.fraud_monitor.get_threat_scores(),
        }


# ---------------------------------------------------------------------------
# Singleton instance shared by the API layer
# ---------------------------------------------------------------------------
simulation_runner = SimulationRunner()
