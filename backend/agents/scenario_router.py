"""
Scenario Engine Router — /api/scenarios/*
Real-world DeFi attack scenario simulation endpoints
"""

from __future__ import annotations

import asyncio
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.scenario_engine import (
    ScenarioEngine,
    ScenarioType,
    ScenarioResult,
    get_scenario_engine,
)
from agents.simulation_runner import simulation_runner


router = APIRouter(prefix="/api/scenarios", tags=["Scenario Simulations"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ScenarioRunRequest(BaseModel):
    scenario_type: str
    intensity: float = 1.0  # 0.1 to 2.0
    tick_delay: float = 0.3


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


@router.post("/run", response_model=ScenarioResultOut)
async def run_scenario(body: ScenarioRunRequest):
    """
    Execute a real-world attack scenario.
    
    Example scenarios:
    - fxtc_collapse: FTX-style exchange collapse with customer fund misappropriation
    - luna_death_spiral: Terra/Luna algorithmic stablecoin death spiral
    - flash_loan_exploit: Euler-style flash loan attack
    - oracle_manipulation: Mango Markets style oracle price manipulation
    - rug_pull: Classic DeFi exit scam
    - cascade_armageddon: 3AC-style multi-protocol cascade failure
    """
    # Validate scenario type
    try:
        scenario_type = ScenarioType(body.scenario_type)
    except ValueError:
        valid_types = [t.value for t in ScenarioType]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scenario type. Valid options: {valid_types}"
        )

    # Validate intensity
    if not 0.1 <= body.intensity <= 2.0:
        raise HTTPException(
            status_code=400,
            detail="Intensity must be between 0.1 and 2.0"
        )

    # Get engine with current simulation state
    engine = get_scenario_engine(
        simulation_runner.pool,
        simulation_runner.lending,
        simulation_runner.mempool,
    )

    # Wire up event callback to simulation feed
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

    # Run the scenario
    result = await engine.run_scenario(
        scenario_type=scenario_type,
        intensity=body.intensity,
        tick_delay=body.tick_delay,
    )

    return ScenarioResultOut(**result.to_dict())


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
            "initial_exchange_balance": 10_000_000_000,  # $10B
            "hidden_debt_ratio": 0.8,  # 80% secretly loaned out
            "bank_run_trigger_threshold": 0.2,  # 20% withdrawal triggers halt
            "cascade_contagion_factor": 1.5,
            "final_recovery_rate": 0.15,  # 15 cents on the dollar
        }
    }
