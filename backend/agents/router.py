"""
Agent & Simulation API Router
===============================
Direct endpoints under /agents-sim/* for the simulation engine.
The api_adapter will also proxy /api/* routes to these.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel

from agents.simulation_runner import simulation_runner
from agents.market_data import market_data_service

router = APIRouter(prefix="/agents-sim", tags=["Agents & Simulation"])


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class StartSimulationRequest(BaseModel):
    max_steps: int = 200
    tick_delay: float = 0.5
    agents_config: Optional[list[dict]] = None


class ToggleAgentRequest(BaseModel):
    active: bool


class UpdateCapitalRequest(BaseModel):
    capital: float

class StressEventRequest(BaseModel):
    event_type: str
    magnitude: float = 1.0


# ---------------------------------------------------------------------------
# Simulation lifecycle
# ---------------------------------------------------------------------------

@router.post("/simulation/start")
async def start_simulation(req: StartSimulationRequest = StartSimulationRequest()):
    """Start the multi-agent simulation."""
    
    custom_agents = None
    if req.agents_config:
        custom_agents = simulation_runner._create_custom_agents(req.agents_config)
        
    result = await simulation_runner.start(
        max_steps=req.max_steps,
        tick_delay=req.tick_delay,
        custom_agents=custom_agents
    )
    return {"success": True, "data": result}


@router.post("/simulation/pause")
async def pause_simulation():
    """Pause a running simulation."""
    result = await simulation_runner.pause()
    return {"success": True, "data": result}


@router.post("/simulation/resume")
async def resume_simulation():
    """Resume a paused simulation."""
    result = await simulation_runner.resume()
    return {"success": True, "data": result}


@router.post("/simulation/stop")
async def stop_simulation():
    """Stop the simulation."""
    result = await simulation_runner.stop()
    return {"success": True, "data": result}


@router.post("/simulation/stress")
async def trigger_stress_event(req: StressEventRequest):
    """Trigger a live stress event in the simulation."""
    if simulation_runner.status != "running":
        raise HTTPException(status_code=400, detail="Simulation must be running to trigger test.")
    
    result = simulation_runner.trigger_stress_event(req.event_type, req.magnitude)
    return {"success": True, "data": result}


@router.get("/simulation/status")
async def get_simulation_status():
    """Get current simulation status, pool state, etc."""
    return {"success": True, "data": simulation_runner.get_status()}


@router.get("/simulation/summary")
async def get_simulation_summary():
    """Get full summary with per-agent stats and fraud data."""
    return {"success": True, "data": simulation_runner.get_summary()}


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------

@router.get("/agents")
async def list_agents():
    """Get all agents and their current state."""
    return {"success": True, "data": simulation_runner.get_agents()}


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    """Get details for a specific agent."""
    agent = simulation_runner.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"success": True, "data": agent}


@router.put("/agents/{agent_id}/toggle")
async def toggle_agent(agent_id: str, req: ToggleAgentRequest):
    """Enable or disable an agent."""
    result = simulation_runner.toggle_agent(agent_id, req.active)
    if not result:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"success": True, "data": result}


@router.put("/agents/{agent_id}/capital")
async def update_agent_capital(agent_id: str, req: UpdateCapitalRequest):
    """Update an agent's capital."""
    result = simulation_runner.update_agent_capital(agent_id, req.capital)
    if not result:
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"success": True, "data": result}


# ---------------------------------------------------------------------------
# Activity & Trade Log
# ---------------------------------------------------------------------------

@router.get("/activity-feed")
async def get_activity_feed(limit: int = Query(50, ge=1, le=200)):
    """Get recent agent activity events."""
    return {"success": True, "data": simulation_runner.get_activity_feed(limit)}


@router.get("/trade-log")
async def get_trade_log(limit: int = Query(100, ge=1, le=500)):
    """Get recent trade actions."""
    return {"success": True, "data": simulation_runner.get_trade_log(limit)}


# ---------------------------------------------------------------------------
# Pool & Lending (live simulation state)
# ---------------------------------------------------------------------------

@router.get("/pool/state")
async def get_pool_state():
    """Get current simulated pool state."""
    return {"success": True, "data": simulation_runner.pool.to_dict()}


@router.get("/lending/state")
async def get_lending_state():
    """Get current simulated lending state."""
    data = simulation_runner.lending.to_dict()
    data["positions"] = [
        p.to_dict() for p in simulation_runner.lending.positions.values()
    ]
    return {"success": True, "data": data}


# ---------------------------------------------------------------------------
# Fraud / Threats
# ---------------------------------------------------------------------------

@router.get("/fraud/alerts")
async def get_fraud_alerts(
    severity: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    """Get fraud alerts from the monitor."""
    return {
        "success": True,
        "data": simulation_runner.fraud_monitor.get_alerts(severity, limit),
    }


@router.get("/fraud/stats")
async def get_fraud_stats():
    """Get aggregate fraud statistics."""
    return {"success": True, "data": simulation_runner.fraud_monitor.get_stats()}


@router.get("/fraud/threat-scores")
async def get_threat_scores():
    """Get threat radar scores."""
    return {"success": True, "data": simulation_runner.fraud_monitor.get_threat_scores()}


@router.post("/fraud/alerts/{alert_id}/resolve")
async def resolve_fraud_alert(alert_id: str):
    """Resolve a fraud alert."""
    resolved = simulation_runner.fraud_monitor.resolve_alert(alert_id)
    if not resolved:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"success": True, "data": {"resolved": True}}


# ---------------------------------------------------------------------------
# Real Market Data (CoinDesk API)
# ---------------------------------------------------------------------------

@router.get("/market/prices")
async def get_market_prices():
    """Get real-time prices from CoinDesk API for all supported assets."""
    try:
        prices = await market_data_service.fetch_all_prices()
        return {
            "success": True,
            "data": {k: v.to_dict() for k, v in prices.items()},
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/market/price/{symbol}")
async def get_price(symbol: str):
    """Get real-time price for a single asset (BTC, ETH, SOL, etc.)."""
    try:
        price = await market_data_service.fetch_price(symbol.upper())
        if price:
            return {"success": True, "data": price.to_dict()}
        raise HTTPException(status_code=404, detail=f"Price not found for {symbol}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/market/condition")
async def get_market_condition():
    """Get current market sentiment, volatility, and trend analysis."""
    condition = market_data_service.get_market_condition()
    return {"success": True, "data": condition.to_dict()}


@router.get("/market/all")
async def get_all_market_data():
    """Get all market data including prices, conditions, and agent modifiers."""
    try:
        # Fetch fresh prices first
        await market_data_service.fetch_all_prices()
        return {"success": True, "data": market_data_service.to_dict()}
    except Exception as e:
        return {"success": False, "error": str(e)}
