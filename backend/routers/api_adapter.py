"""
API adapter routes to match frontend expectations
Maps frontend API calls to backend endpoints
"""
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from routers import participants, pool, lending, alerts, simulations
from typing import Dict, Any, Optional
# simulation_runner removed for L1-only mode
from agents.fraud_monitor import FraudMonitor

# Standalone fraud monitor (persists across requests, no simulation loop needed)
_fraud_monitor = FraudMonitor()

router = APIRouter(prefix="/api", tags=["API Adapter"])


# ============================================================================
# SIMULATION API (maps to /simulations)
# ============================================================================

@router.post("/simulation/start")
async def start_simulation(db: Session = Depends(get_db)):
    """Mock start to satisfy frontend, we run on L1 now"""
    return {
        "success": True,
        "data": {
            "id": 1,
            "status": "running on L1",
            "message": "Connected to Sepolia"
        }
    }


@router.get("/simulation/status")
async def get_simulation_status():
    return {
        "success": True, 
        "data": {"status": "running", "tick": 0, "agents_count": 0, "transactions": 0, "alerts": 0}
    }


@router.post("/simulation/pause")
async def pause_simulation():
    return {"success": True, "data": {"status": "paused"}}


@router.post("/simulation/resume")
async def resume_simulation():
    return {"success": True, "data": {"status": "running"}}


@router.post("/simulation/stop")
async def stop_simulation(db: Session = Depends(get_db)):
    """Stop the simulation engine"""
    from models import Simulation
    from datetime import datetime
    
    # Stop continuous attack if running
    try:
        from agents.scenario_router import _continuous_attack_task, _attack_running
        import agents.scenario_router as scenario_router
        
        if scenario_router._attack_running:
            print("🛑 Stopping continuous attack...")
            scenario_router._attack_running = False
            
        if scenario_router._continuous_attack_task and not scenario_router._continuous_attack_task.done():
            scenario_router._continuous_attack_task.cancel()
            try:
                await scenario_router._continuous_attack_task
            except asyncio.CancelledError:
                pass
            print("✅ Continuous attack stopped")
    except Exception as e:
        print(f"⚠️  Error stopping attack: {e}")
    
    result = await simulation_runner.stop()
    
    # Also update DB
    sim = db.query(Simulation).filter(
        Simulation.status.in_(["running", "paused"])
    ).first()
    if sim:
        sim.status = "completed"
        sim.end_time = datetime.utcnow()
        sim.agents_count = len(simulation_runner.agents)
        sim.transactions_count = len(simulation_runner.trade_log)
        sim.alerts_count = len(simulation_runner.fraud_monitor.alerts)
        db.commit()
    
    return {"success": True, "data": result}



@router.get("/simulation/summary")
async def get_simulation_summary():
    return {"success": True, "data": {}}


# ============================================================================
# AGENTS API (maps to /participants)
# ============================================================================

@router.get("/agents")
async def list_agents():
    # Fallback to DB participants
    from models import Participant
    from database import SessionLocal
    db = SessionLocal()
    try:
        participants_list = db.query(Participant).all()
        return {
            "success": True,
            "data": [
                {
                    "id": str(p.id),
                    "wallet": p.wallet,
                    "role": p.role,
                    "score": p.score,
                    "status": "active"
                }
                for p in participants_list
            ]
        }
    finally:
        db.close()


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    return {"success": False, "detail": "L1 Mode: Agent tracking disabled"}


@router.put("/agents/{agent_id}")
async def update_agent(agent_id: str, data: Dict[str, Any]):
    return {"success": True, "data": {"message": "Agent update mocked"}}


@router.get("/agents/activity-feed")
async def get_activity_feed():
    """Get recent agent activity"""
    # Fallback to DB transactions
    from models import Transaction
    from database import SessionLocal
    db = SessionLocal()
    try:
        transactions = db.query(Transaction).order_by(
            Transaction.timestamp.desc()
        ).limit(50).all()
        return {
            "success": True,
            "data": [
                {
                    "id": str(tx.id),
                    "wallet": tx.wallet,
                    "type": tx.type,
                    "amount": tx.amount,
                    "timestamp": tx.timestamp.isoformat()
                }
                for tx in transactions
            ]
        }
    finally:
        db.close()


# ============================================================================
# LIQUIDITY API (proxies to liquidity_engine pool_store)
# ============================================================================

@router.get("/liquidity/pool")
async def get_pool_data():
    """Get current pool data from the AMM liquidity engine (default pool)."""
    from liquidity_engine.pool_store import pool_store
    pool = pool_store.get_or_raise("default")
    state = pool.get_state()
    return {
        "success": True,
        "data": {
            "reserve0": state["reserve0"],
            "reserve1": state["reserve1"],
            "token0": state["token0"],
            "token1": state["token1"],
            "price_token0_per_token1": state["price_token0_per_token1"],
            "price_token1_per_token0": state["price_token1_per_token0"],
            "total_liquidity": state["tvl"],
            "tvl": state["tvl"],
            "volume_24h": state["volume_24h"],
            "swap_count": state["swap_count"],
            "fee_pct": state["fee_pct"],
            "k_product": state["k_product"],
            "total_lp_tokens": state["total_lp_tokens"],
            "provider_count": state["provider_count"],
        },
    }


@router.get("/liquidity/depth-chart")
async def get_depth_chart():
    """Get real AMM liquidity depth chart data."""
    from liquidity_engine.pool_store import pool_store
    pool = pool_store.get_or_raise("default")
    data = pool.get_depth_chart(price_range_pct=10.0, levels=15)
    return {"success": True, "data": data}


@router.get("/liquidity/slippage-curve")
async def get_slippage_curve():
    """Get real AMM slippage curve data."""
    from liquidity_engine.pool_store import pool_store
    pool = pool_store.get_or_raise("default")
    curve = pool.get_slippage_curve(direction="token0_to_token1", steps=20)
    return {"success": True, "data": curve}


@router.get("/liquidity/events")
async def get_liquidity_events(db: Session = Depends(get_db)):
    """Get recent pool events from the AMM engine."""
    from liquidity_engine.pool_store import pool_store
    pool = pool_store.get_or_raise("default")
    engine_events = pool.get_recent_events(limit=20)
    return {"success": True, "data": engine_events}


# ============================================================================
# LENDING API
# ============================================================================

@router.get("/lending/borrowers")
async def get_borrowers(db: Session = Depends(get_db)):
    """Get all borrowers with health factors from live simulation."""
    positions = simulation_runner.lending.positions
    if positions:
        return {
            "success": True,
            "data": [
                {
                    "id": wallet,
                    "wallet": wallet,
                    "collateral_value": round(pos.collateral, 2),
                    "debt_value": round(pos.debt, 2),
                    "health_factor": round(pos.health_factor, 4),
                    "at_risk": pos.is_liquidatable,
                    "credit_score": pos.credit_profile.current_score,
                }
                for wallet, pos in positions.items()
            ],
        }

    return {
        "success": True,
        "data": []
    }


@router.get("/lending/metrics")
async def get_lending_metrics():
    """Get overall lending metrics directly from Sepolia Smart Contracts."""
    from blockchain_service import blockchain_service
    from config import settings
    
    try:
        # Get from contracts
        total_borrowed_wei = blockchain_service.call_contract_function("LendingPool", "totalBorrowed")
        borrow_apr = blockchain_service.call_contract_function("LendingPool", "getCurrentInterestRate")
        
        # Get collateral in pool (Token A balance)
        pool_collateral_wei = blockchain_service.call_contract_function("TokenA", "balanceOf", settings.lending_pool_address)
        
        total_borrowed = total_borrowed_wei / 1e18
        pool_collateral = pool_collateral_wei / 1e18
        
        utilization = (total_borrowed / (total_borrowed + pool_collateral)) * 100 if (total_borrowed + pool_collateral) > 0 else 0
        
        return {
            "success": True,
            "data": {
                "total_collateral": pool_collateral,
                "total_debt": total_borrowed,
                "total_supplied": pool_collateral + total_borrowed,
                "utilization_rate": utilization,
                "utilization_ratio": utilization / 100,
                "borrow_apr": borrow_apr / 100,
                "avg_health_factor": 0,
                "at_risk_count": 0,
                "liquidation_count": 0
            }
        }
    except Exception as e:
        print(f"Error fetching metrics from blockchain: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/lending/cascade-events")
async def get_cascade_events(db: Session = Depends(get_db)):
    """Get cascade liquidation events"""
    from models import Transaction
    
    liquidations = db.query(Transaction).filter(
        Transaction.type == "LIQUIDATE"
    ).order_by(Transaction.timestamp.desc()).limit(10).all()
    
    return {
        "success": True,
        "data": [
            {
                "id": str(liq.id),
                "wallet": liq.wallet,
                "amount": liq.amount,
                "timestamp": liq.timestamp.isoformat()
            }
            for liq in liquidations
        ]
    }


@router.post("/lending/liquidate")
async def trigger_liquidation(user_wallet: str):
    """Trigger liquidation for a borrower on-chain"""
    from blockchain_service import blockchain_service
    
    try:
        tx_hash = blockchain_service.send_transaction("LendingPool", "liquidate", user_wallet)
        
        return {
            "success": True,
            "data": {
                "message": "Liquidation transaction submitted to Sepolia",
                "target_wallet": user_wallet,
                "tx_hash": tx_hash
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


# ============================================================================
# THREATS/ALERTS API
# ============================================================================

@router.get("/threats/scores")
async def get_threat_scores():
    """Get threat scores from Python fraud monitor"""
    scores = _fraud_monitor.get_threat_scores()
    if scores:
        return {"success": True, "data": scores}
    
    return {
        "success": True,
        "data": []
    }


@router.get("/threats/alerts")
async def get_alerts():
    """Get threat alerts from fraud monitor + DB"""
    fraud_alerts = _fraud_monitor.get_alerts(limit=50)
    if fraud_alerts:
        return {"success": True, "data": fraud_alerts}
    
    # Fallback to DB
    from models import Alert
    from database import SessionLocal
    db = SessionLocal()
    try:
        alerts_list = db.query(Alert).order_by(Alert.timestamp.desc()).all()
        return {
            "success": True,
            "data": [
                {
                    "id": str(alert.id),
                    "type": alert.type,
                    "severity": alert.severity,
                    "wallet": alert.wallet,
                    "description": alert.description,
                    "timestamp": alert.timestamp.isoformat(),
                    "resolved": alert.resolved == 1
                }
                for alert in alerts_list
            ]
        }
    finally:
        db.close()


@router.post("/threats/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, db: Session = Depends(get_db)):
    """Resolve a threat alert"""
    from models import Alert
    
    alert = db.query(Alert).filter(Alert.id == int(alert_id)).first()
    
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    alert.resolved = 1
    db.commit()
    
    return {"success": True, "data": {"message": "Alert resolved"}}


@router.post("/threats/simulate")
async def simulate_attack(attack_type: str, params: Dict[str, Any], db: Session = Depends(get_db)):
    """Simulate an attack"""
    from models import Alert
    
    # Create a simulated alert
    alert = Alert(
        type=attack_type,
        severity="HIGH",
        wallet=params.get("target_wallet", "0xSimulated"),
        description=f"Simulated {attack_type} attack"
    )
    db.add(alert)
    db.commit()
    
    return {
        "success": True,
        "data": {
            "message": f"Simulated {attack_type} attack",
            "alert_id": str(alert.id)
        }
    }


# ============================================================================
# CREDIT API
# ============================================================================

@router.get("/credit/leaderboard")
async def get_credit_leaderboard(db: Session = Depends(get_db)):
    """Get credit score leaderboard"""
    from models import Participant
    
    participants = db.query(Participant).order_by(
        Participant.score.desc()
    ).limit(10).all()
    
    return {
        "success": True,
        "data": [
            {
                "rank": idx + 1,
                "wallet": p.wallet,
                "score": p.score,
                "role": p.role
            }
            for idx, p in enumerate(participants)
        ]
    }


@router.get("/credit/scores/{wallet}")
async def get_score_details(wallet: str, db: Session = Depends(get_db)):
    """Get detailed credit score for a wallet directly from CreditRegistry contract"""
    from blockchain_service import blockchain_service
    
    try:
        score = blockchain_service.call_contract_function("CreditRegistry", "creditScores", wallet)
        
        return {
            "success": True,
            "data": {
                "wallet": wallet,
                "score": score,
                "factors": {}
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/credit/scores/{wallet}/history")
async def get_score_history(wallet: str):
    """Get credit score history"""
    return {
        "success": True,
        "data": []
    }


@router.get("/credit/dynamic-rates")
async def get_dynamic_rates():
    """Get dynamic interest rates based on credit scores"""
    return {
        "success": True,
        "data": [
            {"score_range": "800-850", "rate": 3.5},
            {"score_range": "700-799", "rate": 5.0},
            {"score_range": "600-699", "rate": 7.5},
            {"score_range": "500-599", "rate": 10.0},
            {"score_range": "300-499", "rate": 15.0}
        ]
    }


# ============================================================================
# AUDIT API
# ============================================================================

@router.post("/audit/log")
async def get_audit_log(filters: Dict[str, Any] = None, db: Session = Depends(get_db)):
    """Get audit log with filters"""
    from models import Transaction
    
    query = db.query(Transaction)
    
    # Apply filters if provided
    if filters:
        if filters.get("wallet"):
            query = query.filter(Transaction.wallet == filters["wallet"])
        if filters.get("type"):
            query = query.filter(Transaction.type == filters["type"])
    
    transactions = query.order_by(Transaction.timestamp.desc()).limit(100).all()
    
    return {
        "success": True,
        "data": [
            {
                "id": str(tx.id),
                "hash": tx.hash,
                "type": tx.type,
                "wallet": tx.wallet,
                "amount": tx.amount,
                "timestamp": tx.timestamp.isoformat()
            }
            for tx in transactions
        ]
    }


@router.post("/audit/verify/{event_id}")
async def verify_event(event_id: str, db: Session = Depends(get_db)):
    """Verify an event"""
    from models import Transaction
    
    event = db.query(Transaction).filter(Transaction.id == int(event_id)).first()
    
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    return {
        "success": True,
        "data": {
            "verified": True,
            "event_id": event_id,
            "hash": event.hash
        }
    }


@router.get("/audit/export")
async def export_report(format: str = "json"):
    """Export a full audit report as inline JSON."""
    from datetime import datetime

    report = {
        "generated_at": datetime.utcnow().isoformat(),
        "format": format,
        "message": "L1 integration active. Exporter disabled."
    }

    if format == "json":
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content=report,
            headers={"Content-Disposition": "attachment; filename=audit_report.json"},
        )

    # Fallback: return data envelope
    return {"success": True, "data": report}


@router.post("/audit/compare")
async def compare_simulations(sim1_id: str, sim2_id: str, db: Session = Depends(get_db)):
    """Compare two simulations"""
    from models import Simulation
    
    sim1 = db.query(Simulation).filter(Simulation.id == int(sim1_id)).first()
    sim2 = db.query(Simulation).filter(Simulation.id == int(sim2_id)).first()
    
    if not sim1 or not sim2:
        raise HTTPException(status_code=404, detail="Simulation not found")
    
    return {
        "success": True,
        "data": {
            "simulation1": {
                "id": sim1_id,
                "transactions": sim1.transactions_count,
                "alerts": sim1.alerts_count
            },
            "simulation2": {
                "id": sim2_id,
                "transactions": sim2.transactions_count,
                "alerts": sim2.alerts_count
            },
            "differences": {
                "transactions": abs(sim1.transactions_count - sim2.transactions_count),
                "alerts": abs(sim1.alerts_count - sim2.alerts_count)
            }
        }
    }


# ============================================================================
# WALLET API
# ============================================================================

@router.post("/wallet/connect")
async def connect_wallet():
    """Connect wallet (placeholder)"""
    return {
        "success": True,
        "data": {"message": "Wallet connection initiated"}
    }


@router.post("/wallet/disconnect")
async def disconnect_wallet():
    """Disconnect wallet (placeholder)"""
    return {
        "success": True,
        "data": {"message": "Wallet disconnected"}
    }


@router.get("/wallet/balance/{address}")
async def get_wallet_balance(address: str):
    """Get wallet balance"""
    from blockchain_service import blockchain_service
    
    try:
        balance = blockchain_service.get_balance(address)
        return {
            "success": True,
            "data": {
                "address": address,
                "balance": balance,
                "currency": "ETH"
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


# ============================================================================
# SIMULATION ENGINE API (live agent simulation)
# ============================================================================

@router.get("/sim/trade-log")
async def get_trade_log(limit: int = 100):
    return {"success": True, "data": []}


@router.get("/sim/activity-feed")
async def get_sim_activity_feed(limit: int = 50):
    return {"success": True, "data": []}


@router.get("/sim/fraud/stats")
async def get_sim_fraud_stats():
    return {"success": True, "data": {}}


@router.get("/sim/pool")
async def get_sim_pool():
    return {"success": True, "data": {}}


@router.get("/sim/lending")
async def get_sim_lending():
    return {"success": True, "data": {}}
