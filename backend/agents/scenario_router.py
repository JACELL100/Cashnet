"""
Scenario Engine Router — /api/scenarios/*
Real-world DeFi attack scenario simulation endpoints
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.scenario_engine import (
    ScenarioEngine,
    ScenarioType,
    ScenarioResult,
    get_scenario_engine,
)
from agents.simulation_runner import simulation_runner
from agents.demo_attack_scenario import run_protocol_stress_test_demo


router = APIRouter(prefix="/api/scenarios", tags=["Scenario Simulations"])

# ─── In-memory job store ──────────────────────────────────────────────────────
# job_id -> {"status": "running"|"done"|"error", "result": dict|None}
_jobs: Dict[str, dict] = {}

# Global attack task tracker
_continuous_attack_task: Optional[asyncio.Task] = None
_attack_running: bool = False


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ScenarioRunRequest(BaseModel):
    scenario_type: str
    intensity: float = 1.0   # 0.1 to 2.0
    tick_delay: float = 0.05  # reduced from 0.3 — faster simulation


class ScenarioInfo(BaseModel):
    type: str
    name: str
    description: str
    severity: str
    estimated_damage: str
    real_world_date: str


class ScenarioStatus(BaseModel):
    active: Optional[str]
    current_phase: int
    events_count: int
    liquidations: int
    elapsed_seconds: float


class ScenarioResultOut(BaseModel):
    scenario_type: str
    success: bool
    total_damage: float
    liquidations_triggered: int
    price_impact_pct: float
    duration_seconds: float
    events: List[dict]
    lessons_learned: List[str]


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/available", response_model=List[ScenarioInfo])
async def get_available_scenarios():
    """Get list of all available real-world scenarios."""
    engine = get_scenario_engine(
        simulation_runner.pool,
        simulation_runner.lending,
        simulation_runner.mempool,
    )
    scenarios = engine.get_available_scenarios()
    return [ScenarioInfo(**s) for s in scenarios]


@router.get("/status", response_model=ScenarioStatus)
async def get_scenario_status():
    """Get current scenario execution status."""
    engine = get_scenario_engine(
        simulation_runner.pool,
        simulation_runner.lending,
        simulation_runner.mempool,
    )
    status = engine.get_scenario_status()
    return ScenarioStatus(**status)


@router.post("/run")
async def run_scenario(body: ScenarioRunRequest):
    """
    Start a real-world attack scenario as a background job.
    Returns immediately with a job_id. Poll /job/{job_id} for result.
    """
    try:
        scenario_type = ScenarioType(body.scenario_type)
    except ValueError:
        valid_types = [t.value for t in ScenarioType]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scenario type. Valid options: {valid_types}"
        )

    if not 0.1 <= body.intensity <= 2.0:
        raise HTTPException(
            status_code=400,
            detail="Intensity must be between 0.1 and 2.0"
        )

    job_id = str(uuid.uuid4())[:8]
    _jobs[job_id] = {"status": "running", "result": None}

    async def _run():
        try:
            engine = get_scenario_engine(
                simulation_runner.pool,
                simulation_runner.lending,
                simulation_runner.mempool,
            )

            def scenario_event_callback(event):
                simulation_runner.activity_feed.append({
                    "agent_id": "scenario_engine",
                    "agent_name": f"🎭 {body.scenario_type.upper()}",
                    "agent_type": "scenario",
                    "event_type": event.event_type,
                    "data": {
                        "description": event.description,
                        "severity": event.severity,
                        **event.data,
                    },
                    "timestamp": event.timestamp,
                })

            engine.event_callback = scenario_event_callback
            result = await engine.run_scenario(
                scenario_type=scenario_type,
                intensity=body.intensity,
                tick_delay=max(body.tick_delay, 0.05),  # clamp minimum to 50ms
            )
            _jobs[job_id] = {"status": "done", "result": result.to_dict()}
        except Exception as e:
            _jobs[job_id] = {"status": "error", "result": {"error": str(e)}}

    asyncio.create_task(_run())
    return {"job_id": job_id, "status": "running"}


@router.get("/job/{job_id}")
async def get_job_result(job_id: str):
    """Poll the result of a running scenario job."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/lessons/{scenario_type}")
async def get_scenario_lessons(scenario_type: str):
    """Get educational lessons learned from a specific scenario."""
    try:
        st = ScenarioType(scenario_type)
    except ValueError:
        raise HTTPException(status_code=404, detail="Scenario not found")

    engine = get_scenario_engine(
        simulation_runner.pool,
        simulation_runner.lending,
        simulation_runner.mempool,
    )

    lessons = engine._get_lessons_learned(st)

    return {
        "scenario_type": scenario_type,
        "lessons": lessons,
    }


@router.get("/fxtc-case-study")
async def get_fxtc_case_study():
    """
    Detailed case study of the FXTC (FTX) collapse.
    Educational resource for understanding exchange risk.
    """
    return {
        "title": "FTX Exchange Collapse - November 2022",
        "summary": "The largest cryptocurrency exchange collapse in history, resulting in $8B+ in customer fund losses",

        "timeline": [
            {
                "date": "November 2, 2022",
                "event": "CoinDesk publishes leaked Alameda Research balance sheet",
                "impact": "Reveals $5.8B in illiquid FTT tokens as collateral"
            },
            {
                "date": "November 6, 2022",
                "event": "Binance announces FTT token dump",
                "impact": "FTT price drops 10%, triggering bank run"
            },
            {
                "date": "November 8, 2022",
                "event": "FTX halts customer withdrawals",
                "impact": "Users unable to access $6B+ in funds"
            },
            {
                "date": "November 9, 2022",
                "event": "Binance backs out of acquisition deal",
                "impact": "Hope of rescue evaporates"
            },
            {
                "date": "November 11, 2022",
                "event": "FTX files Chapter 11 bankruptcy",
                "impact": "$32B valuation goes to zero"
            },
        ],

        "key_fraud_mechanisms": [
            {
                "mechanism": "Customer Fund Misappropriation",
                "description": "FTX secretly transferred customer deposits to Alameda Research for trading",
                "amount": "$8 billion+"
            },
            {
                "mechanism": "Hidden Leverage",
                "description": "Alameda borrowed customer funds with no collateral requirements",
                "amount": "Unlimited"
            },
            {
                "mechanism": "Fake Reserve Proof",
                "description": "Published audit showing assets, but liabilities hidden",
                "amount": "$8B hole"
            },
            {
                "mechanism": "Circular Token Collateral",
                "description": "FTT token printed by FTX used as collateral at FTX",
                "amount": "$5.8B in FTT"
            },
        ],

        "red_flags_missed": [
            "No independent board oversight",
            "Related-party transactions with Alameda",
            "Single founder controlled all entities",
            "Bahamas incorporation avoided US regulation",
            "Accounting firm was tiny unknown firm",
            "Celebrity endorsements instead of audits",
        ],

        "lessons_for_defi": [
            "Proof of Reserves must include liabilities",
            "Multi-sig custody prevents unilateral transfers",
            "On-chain transparency eliminates hidden leverage",
            "Atomic swaps eliminate counterparty risk",
            "Self-custody is the only true security",
        ],

        "simulation_parameters": {
            "initial_exchange_balance": 10_000_000_000,
            "hidden_debt_ratio": 0.8,
            "bank_run_trigger_threshold": 0.2,
            "cascade_contagion_factor": 1.5,
            "final_recovery_rate": 0.15,
        }
    }


async def _continuous_swap_attack():
    """Background task that continuously executes swaps until stopped."""
    global _attack_running
    
    swap_count = 0
    direction = "PALLADIUM_TO_BADASSIUM"  # Start direction
    
    print("\n🔥 Starting continuous swap attack...")
    print("   Strategy: Alternate PALLADIUM ⇄ BADASSIUM swaps")
    print("   Each cycle = 2 on-chain transactions")
    print("   Will run until STOP button pressed or simulation stopped\n")
    
    try:
        while _attack_running and simulation_runner.status == "running":
            try:
                # Check if blockchain integrator is still available
                if not simulation_runner.blockchain_integrator:
                    print("⚠️  Blockchain integrator not available, waiting...")
                    await asyncio.sleep(5)
                    continue
                
                # Alternate swap direction
                if direction == "PALLADIUM_TO_BADASSIUM":
                    # Swap PALLADIUM → BADASSIUM
                    tx_hash = await simulation_runner.blockchain_integrator.execute_real_swap(
                        agent_wallet="attacker",
                        token_in="PALLADIUM",
                        token_out="BADASSIUM",
                        amount_in=400_000  # 400K tokens per swap
                    )
                    if tx_hash:
                        swap_count += 1
                        print(f"   ✅ Swap #{swap_count}: PALLADIUM → BADASSIUM | TX: {tx_hash[:16]}...")
                    
                    # Also execute in pool simulation
                    try:
                        simulation_runner.pool.execute_swap(400_000, "TOKEN_A")
                    except Exception as pool_err:
                        print(f"   ⚠️  Pool simulation error (non-critical): {pool_err}")
                    
                    direction = "BADASSIUM_TO_PALLADIUM"
                    
                else:
                    # Swap BADASSIUM → PALLADIUM
                    tx_hash = await simulation_runner.blockchain_integrator.execute_real_swap(
                        agent_wallet="attacker",
                        token_in="BADASSIUM",
                        token_out="PALLADIUM",
                        amount_in=400_000  # 400K tokens per swap
                    )
                    if tx_hash:
                        swap_count += 1
                        print(f"   ✅ Swap #{swap_count}: BADASSIUM → PALLADIUM | TX: {tx_hash[:16]}...")
                    
                    # Also execute in pool simulation
                    try:
                        simulation_runner.pool.execute_swap(400_000, "TOKEN_B")
                    except Exception as pool_err:
                        print(f"   ⚠️  Pool simulation error (non-critical): {pool_err}")
                    
                    direction = "PALLADIUM_TO_BADASSIUM"
                
                # Small delay between swaps to avoid network congestion
                await asyncio.sleep(3)
                
            except asyncio.CancelledError:
                print("\n🛑 Attack cancelled by user")
                raise
            except Exception as e:
                print(f"⚠️  Swap error (will retry): {e}")
                import traceback
                traceback.print_exc()
                await asyncio.sleep(5)  # Longer delay on error, then continue
                
    except asyncio.CancelledError:
        print("\n🛑 Continuous attack task cancelled")
    finally:
        _attack_running = False
        print(f"\n🛑 Continuous attack stopped. Total swaps executed: {swap_count}")


@router.post("/demo-attack")
async def run_demo_attack():
    """
    Execute Continuous Protocol Stress Test with Palladium & Badassium tokens.
    Performs continuous on-chain swaps until STOP is pressed.
    
    Strategy:
      - PALLADIUM → BADASSIUM (price manipulation)
      - BADASSIUM → PALLADIUM (profit taking)
      - Loops continuously until simulation stopped
    
    Perfect for demonstrating live blockchain transactions to judges!
    """
    global _continuous_attack_task, _attack_running
    
    # Start simulation with high step count for continuous execution
    if simulation_runner.status != "running":
        print("🚀 Starting continuous attack simulation...")
        await simulation_runner.start(max_steps=10000, tick_delay=0.1)  # Very high max_steps
        await asyncio.sleep(2)  # Let blockchain integrator initialize
    
    if not simulation_runner.pool or not simulation_runner.lending:
        raise HTTPException(
            status_code=500,
            detail="Simulation pool/lending not initialized"
        )
    
    # Verify blockchain integrator is ready
    wallet = "N/A"
    if simulation_runner.blockchain_integrator:
        print(f"✅ Blockchain integrator ready for continuous attack")
        print(f"   Real TXs enabled: {simulation_runner.blockchain_integrator.enable_real_txs}")
        if simulation_runner.blockchain_integrator.blockchain.account:
            wallet = simulation_runner.blockchain_integrator.blockchain.account.address
            print(f"   Wallet: {wallet}")
            print(f"   Etherscan: https://sepolia.etherscan.io/address/{wallet}")
    else:
        print("⚠️  Blockchain integrator not available - transactions will be simulated only")
    
    # Cancel any existing attack task
    if _continuous_attack_task and not _continuous_attack_task.done():
        print("⚠️  Cancelling existing attack task...")
        _continuous_attack_task.cancel()
        try:
            await _continuous_attack_task
        except asyncio.CancelledError:
            pass
    
    # Launch continuous swap attack
    _attack_running = True
    _continuous_attack_task = asyncio.create_task(_continuous_swap_attack())
    
    return {
        "success": True,
        "message": "Continuous attack started! Swaps will execute until you press STOP.",
        "data": {
            "attack_name": "Continuous On-Chain Swap Attack",
            "tokens": {
                "PALLADIUM": "0x983A613d5f224459D2919e0d9E9e77C72E032042",
                "BADASSIUM": "0x2960e22Ed3256E2bAfF233F5d03A20f597f14e07"
            },
            "status": "running",
            "max_steps": 10000,
            "wallet": wallet,
            "etherscan": f"https://sepolia.etherscan.io/address/{wallet}"
        }
    }

