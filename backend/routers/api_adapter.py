"""
API adapter routes to match frontend expectations
Maps frontend API calls to backend endpoints
"""
import asyncio
import time
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from routers import participants, pool, lending, alerts, simulations
from typing import Dict, Any, Optional
from agents.simulation_runner import simulation_runner
from agents.fraud_monitor import FraudMonitor

# Standalone fraud monitor (persists across requests, no simulation loop needed)
_fraud_monitor = FraudMonitor()

router = APIRouter(prefix="/api", tags=["API Adapter"])


# ============================================================================
# SIMULATION API (maps to /simulations)
# ============================================================================

@router.post("/simulation/start")
async def start_simulation(body: Dict[str, Any] = None):
    """Start the real multi-agent simulation with blockchain integration."""
    if body is None:
        body = {}
    result = await simulation_runner.start(
        max_steps=body.get("max_steps", 200),
        tick_delay=body.get("tick_delay", 0.5),
    )
    return {"success": True, "data": result}


@router.get("/simulation/status")
async def get_simulation_status():
    """Get real-time simulation status from the running engine."""
    return {"success": True, "data": simulation_runner.get_status()}


@router.post("/simulation/pause")
async def pause_simulation():
    result = await simulation_runner.pause()
    return {"success": True, "data": result}


@router.post("/simulation/resume")
async def resume_simulation():
    result = await simulation_runner.resume()
    return {"success": True, "data": result}


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
    return {"success": True, "data": simulation_runner.get_summary()}


# ============================================================================
# AGENTS API (maps to /participants)
# ============================================================================

@router.get("/agents")
async def list_agents():
    """Get all live simulation agents with their real-time stats."""
    sim_agents = simulation_runner.get_agents()
    if sim_agents:
        return {"success": True, "data": sim_agents}
    # Fallback to DB participants when simulation is idle
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
async def get_activity_feed(limit: int = 50):
    """Get recent agent activity from live simulation."""
    feed = simulation_runner.get_activity_feed(limit)
    return {"success": True, "data": feed}


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
    """Get threat scores from the live simulation fraud monitor."""
    # Prefer simulation_runner's fraud monitor when running
    if simulation_runner.status == "running":
        scores = simulation_runner.fraud_monitor.get_threat_scores()
    else:
        scores = _fraud_monitor.get_threat_scores()
    return {"success": True, "data": scores or []}


@router.get("/threats/alerts")
async def get_alerts():
    """Get threat alerts from the live simulation fraud monitor."""
    # Prefer simulation_runner's fraud monitor when running
    if simulation_runner.status == "running":
        fraud_alerts = simulation_runner.fraud_monitor.get_alerts(limit=50)
    else:
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
async def simulate_attack(body: Dict[str, Any], db: Session = Depends(get_db)):
    """Run a full attack simulation and return detected alerts + impact."""
    attack_type = body.get("attack_type") or body.get("scenario_type") or body.get("type", "")
    params = body.get("params", {})
    from models import Alert
    from agents.anomaly_simulators import (
        simulate_wash_trading,
        simulate_oracle_manipulation,
        simulate_flash_loan_attack,
        simulate_liquidity_poisoning,
        simulate_pump_dump,
    )

    simulators = {
        "wash_trading": simulate_wash_trading,
        "oracle_manipulation": simulate_oracle_manipulation,
        "flash_loan_exploit": simulate_flash_loan_attack,
        "liquidity_poisoning": simulate_liquidity_poisoning,
        "pump_dump": simulate_pump_dump,
        # Aliases used by the stress test page
        "sandwich_mega": simulate_flash_loan_attack,
        "luna_death_spiral": simulate_oracle_manipulation,
    }

    simulator_fn = simulators.get(attack_type)
    if not simulator_fn:
        return {
            "success": True,
            "data": {
                "attack_type": attack_type,
                "status": "unknown_type",
                "message": f"No simulator for '{attack_type}'. Available: {list(simulators.keys())}",
            }
        }

    result = simulator_fn(_fraud_monitor, params)

    # Persist triggered alerts to DB
    for alert_data in result.get("alerts_triggered", []):
        try:
            db_alert = Alert(
                type=alert_data.get("type", attack_type),
                severity=alert_data.get("severity", "HIGH"),
                wallet=alert_data.get("agent_id", "0xSimulated"),
                description=alert_data.get("description", f"Simulated {attack_type}"),
            )
            db.add(db_alert)
        except Exception:
            pass
    db.commit()

    return {
        "success": True,
        "data": result,
    }


# ============================================================================
# GROQ-ENHANCED THREAT ANALYSIS ENDPOINTS
# ============================================================================

@router.post("/threats/groq-analyze")
async def groq_analyze_threats():
    """
    Run Groq LLM analysis on the current threat landscape.
    Analyzes recent alerts + events and returns AI risk assessment.
    """
    try:
        from agents.groq_advisor import analyze_threat

        # Get active fraud monitor
        monitor = simulation_runner.fraud_monitor if simulation_runner.status == "running" else _fraud_monitor
        recent_events = monitor.events[-20:] if monitor.events else []
        recent_alerts = [a.to_dict() for a in monitor.alerts[-10:]] if monitor.alerts else []

        pool_state = simulation_runner.pool.to_dict() if simulation_runner.pool else {}

        # Combine alerts and events for Groq
        combined = recent_alerts + recent_events
        analysis = await analyze_threat(combined, pool_state)

        return {"success": True, "data": analysis}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/threats/groq-deep-analysis")
async def groq_deep_analysis():
    """
    Comprehensive Groq AI threat assessment — produces a detailed
    threat report with risk breakdown, attack vector assessment, and
    actionable recommendations for each active threat category.
    """
    try:
        from agents.groq_advisor import _get_groq_key, _get_groq_model, GROQ_API_URL
        import aiohttp
        import json

        groq_key = _get_groq_key()
        if not groq_key:
            return {"success": False, "error": "Groq API key not configured"}

        monitor = simulation_runner.fraud_monitor if simulation_runner.status == "running" else _fraud_monitor
        stats = monitor.get_stats()
        scores = monitor.get_threat_scores()
        recent_alerts = [a.to_dict() for a in monitor.alerts[-15:]]

        user_msg = (
            f"Analyze this DeFi security dashboard state and provide a comprehensive threat report.\n\n"
            f"Alert Statistics:\n{json.dumps(stats, indent=2)}\n\n"
            f"Threat Scores:\n{json.dumps(scores, indent=2)}\n\n"
            f"Recent Alerts (last 15):\n{json.dumps(recent_alerts, indent=2)}\n\n"
            f"Reply with valid JSON containing:\n"
            f'{{"overall_risk": "low/medium/high/critical",\n'
            f'"risk_score": 0-100,\n'
            f'"executive_summary": "2-3 sentence overview",\n'
            f'"active_threats": [{{"category": str, "risk": str, "description": str, "recommendation": str}}],\n'
            f'"attack_vectors": ["list of potential attack vectors based on current pattern"],\n'
            f'"recommended_actions": ["prioritized list of actions"]}}'
        )

        async with aiohttp.ClientSession() as session:
            async with session.post(
                GROQ_API_URL,
                headers={
                    "Authorization": f"Bearer {groq_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": _get_groq_model(),
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a senior DeFi security analyst specialized in on-chain threat detection, "
                                "MEV analysis, and smart contract vulnerability assessment. Provide thorough, "
                                "actionable security reports in JSON format."
                            ),
                        },
                        {"role": "user", "content": user_msg},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 800,
                    "response_format": {"type": "json_object"},
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    return {"success": False, "error": f"Groq API returned {resp.status}"}
                data = await resp.json()
                content = data["choices"][0]["message"]["content"]
                report = json.loads(content)
                return {"success": True, "data": report}

    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/threats/notifications")
async def get_threat_notifications():
    """Get log of sent email notifications for threat alerts."""
    try:
        from email_service import get_sent_notifications
        return {"success": True, "data": get_sent_notifications(50)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/threats/email-config")
async def get_email_config():
    """Get email notification configuration status."""
    try:
        from email_service import get_email_config_status
        return {"success": True, "data": get_email_config_status()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/threats/test-email")
async def test_email_alert():
    """Send a test threat alert email to all admins."""
    try:
        from email_service import send_threat_alert_email
        test_alert = {
            "type": "test_alert",
            "severity": "HIGH",
            "agent_id": "system_test",
            "agent_type": "system",
            "description": "This is a test alert from CashNet Threat Monitor. If you received this email, threat alert notifications are working correctly.",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        }
        import time
        success = await send_threat_alert_email(test_alert, None, force=True)
        if success:
            return {"success": True, "data": {"message": "Test email sent to all admins"}}
        else:
            return {"success": False, "error": "Email not sent. Check SMTP configuration in .env.local (SMTP_USER, SMTP_PASSWORD)"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/threats/unread-count")
async def get_unread_threat_count():
    """Get count of unresolved HIGH/CRITICAL alerts for notification badge."""
    monitor = simulation_runner.fraud_monitor if simulation_runner.status == "running" else _fraud_monitor
    unresolved_severe = [
        a for a in monitor.alerts
        if not a.resolved and a.severity in ("HIGH", "CRITICAL")
    ]
    return {
        "success": True,
        "data": {
            "count": len(unresolved_severe),
            "critical": sum(1 for a in unresolved_severe if a.severity == "CRITICAL"),
            "high": sum(1 for a in unresolved_severe if a.severity == "HIGH"),
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
    return {"success": True, "data": simulation_runner.get_trade_log(limit)}


@router.get("/sim/activity-feed")
async def get_sim_activity_feed(limit: int = 50):
    return {"success": True, "data": simulation_runner.get_activity_feed(limit)}


@router.get("/sim/fraud/stats")
async def get_sim_fraud_stats():
    return {"success": True, "data": simulation_runner.fraud_monitor.get_stats()}


@router.get("/sim/pool")
async def get_sim_pool():
    return {"success": True, "data": simulation_runner.pool.to_dict()}


@router.get("/sim/lending")
async def get_sim_lending():
    data = simulation_runner.lending.to_dict()
    data["positions"] = [p.to_dict() for p in simulation_runner.lending.positions.values()]
    return {"success": True, "data": data}


@router.get("/sim/market")
async def get_sim_market():
    """Get current real market data used by agents (CoinDesk)."""
    try:
        await simulation_runner.market_data.fetch_all_prices()
        return {"success": True, "data": simulation_runner.market_data.to_dict()}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================================================
# GROQ AI ENDPOINTS
# ============================================================================

@router.get("/ai/market-narrative")
async def get_ai_market_narrative():
    """Get a Groq LLM market narrative based on live CoinDesk data."""
    try:
        prices = await simulation_runner.market_data.fetch_all_prices()
        btc = prices.get("BTC")
        eth = prices.get("ETH")
        mc = simulation_runner.market_data.get_market_condition()

        from agents.groq_advisor import get_market_narrative
        narrative = await get_market_narrative({
            "btc_price": btc.price if btc else 0,
            "eth_price": eth.price if eth else 0,
            "btc_change_24h": btc.change_pct_24h if btc else 0,
            "eth_change_24h": eth.change_pct_24h if eth else 0,
            "sentiment": mc.sentiment,
            "volatility": mc.volatility,
            "risk_level": mc.risk_level,
        })
        return {"success": True, "data": {"narrative": narrative, "model": "llama-3.3-70b-versatile"}}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/ai/analyze-threat")
async def ai_analyze_threat():
    """Use Groq to analyze recent simulation events for attacks."""
    try:
        recent_events = simulation_runner.get_activity_feed(20)
        from agents.groq_advisor import analyze_threat
        analysis = await analyze_threat(recent_events, simulation_runner.pool.to_dict())
        return {"success": True, "data": analysis}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/ai/status")
async def get_ai_status():
    """Get Groq LLM and CoinDesk API connectivity status."""
    from agents.groq_advisor import _get_groq_key, _get_groq_model
    groq_key = _get_groq_key()
    coindesk_key = simulation_runner.market_data.api_key
    return {
        "success": True,
        "data": {
            "groq": {
                "configured": bool(groq_key),
                "model": _get_groq_model(),
                "key_suffix": f"...{groq_key[-8:]}" if groq_key else None,
            },
            "coindesk": {
                "configured": bool(coindesk_key),
                "key_suffix": f"...{coindesk_key[-8:]}" if coindesk_key else None,
            },
            "blockchain_txs_enabled": simulation_runner.blockchain_integrator.enable_real_txs
                if simulation_runner.blockchain_integrator else False,
        }
    }


# ============================================================================
# BLOCKCHAIN INTEGRATION ENDPOINTS
# ============================================================================

@router.get("/blockchain/stats")
async def get_blockchain_stats():
    """Get blockchain integration statistics (tx counts, gas used, etc.)."""
    from agents.blockchain_integrator import get_blockchain_integrator
    try:
        integrator = await get_blockchain_integrator()
        return {"success": True, "data": integrator.get_stats()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/blockchain/tx-history")
async def get_blockchain_tx_history(limit: int = 50):
    """Get agent transaction history (both simulated and on-chain)."""
    from agents.blockchain_integrator import get_blockchain_integrator
    try:
        integrator = await get_blockchain_integrator()
        return {"success": True, "data": integrator.get_tx_history(limit)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/blockchain/tx-by-contract/{contract_name}")
async def get_txs_by_contract(contract_name: str):
    """Get transactions filtered by contract (LiquidityPool, LendingPool, etc.)."""
    from agents.blockchain_integrator import get_blockchain_integrator
    try:
        integrator = await get_blockchain_integrator()
        return {"success": True, "data": integrator.get_tx_by_contract(contract_name)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/blockchain/on-chain-state")
async def get_on_chain_state():
    """Query current on-chain state from deployed Sepolia contracts."""
    from agents.blockchain_integrator import get_blockchain_integrator
    try:
        integrator = await get_blockchain_integrator()
        state = await integrator.get_on_chain_state()
        return {"success": True, "data": state}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/blockchain/token-balance/{token}/{wallet}")
async def get_token_balance(token: str, wallet: str):
    """Get token balance (PALLADIUM or BADASSIUM) for a wallet address."""
    from agents.blockchain_integrator import get_blockchain_integrator
    try:
        integrator = await get_blockchain_integrator()
        balance = await integrator.get_token_balance(token, wallet)
        return {
            "success": True,
            "data": {
                "token": token.upper(),
                "wallet": wallet,
                "balance": balance,
                "formatted": f"{balance:,.4f}",
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/blockchain/execute-swap")
async def execute_blockchain_swap(body: Dict[str, Any]):
    """
    Execute a REAL on-chain swap via LiquidityPool contract.
    Requires ENABLE_BLOCKCHAIN_TXS=true in .env.local.
    Body: { token_in, token_out, amount }
    """
    from agents.blockchain_integrator import get_blockchain_integrator
    try:
        integrator = await get_blockchain_integrator()
        
        if not integrator.enable_real_txs:
            return {
                "success": False,
                "error": "On-chain transactions disabled. Set ENABLE_BLOCKCHAIN_TXS=true in .env.local"
            }
        
        token_in = body.get("token_in", "PALLADIUM")
        token_out = body.get("token_out", "BADASSIUM")
        amount = float(body.get("amount", 0))
        
        if amount <= 0:
            return {"success": False, "error": "Amount must be greater than 0"}
        
        # Use the configured wallet from PRIVATE_KEY
        tx_hash = await integrator.execute_real_swap(
            agent_wallet=None,  # Will use default from PRIVATE_KEY
            token_in=token_in,
            token_out=token_out,
            amount_in=amount,
        )
        
        if tx_hash:
            return {
                "success": True,
                "data": {
                    "tx_hash": tx_hash,
                    "etherscan": f"https://sepolia.etherscan.io/tx/{tx_hash}",
                    "token_in": token_in,
                    "token_out": token_out,
                    "amount": amount,
                }
            }
        else:
            return {"success": False, "error": "Swap transaction failed"}
            
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/blockchain/record-agent-action")
async def record_agent_action_on_chain(body: Dict[str, Any]):
    """
    Manually record an agent action on blockchain.
    Body: { action_type, agent_id, data }
    action_type: swap | liquidate | borrow | flash_loan_attack | scenario_event
    """
    from agents.blockchain_integrator import get_blockchain_integrator
    try:
        integrator = await get_blockchain_integrator()
        action_type = body.get("action_type", "swap")
        agent_id = body.get("agent_id", "manual")
        data = body.get("data", {})
        
        tx = None
        if action_type == "swap":
            tx = await integrator.record_swap(
                agent_id=agent_id,
                token_in=data.get("token_in", "PALLADIUM"),
                amount_in=data.get("amount_in", 0),
                amount_out=data.get("amount_out", 0),
                price_impact=data.get("price_impact", 0),
                execute_on_chain=data.get("execute_on_chain", False),
            )
        elif action_type == "liquidate":
            tx = await integrator.record_liquidation(
                liquidator_id=agent_id,
                target_wallet=data.get("target_wallet", "0x0"),
                debt_covered=data.get("debt_covered", 0),
                collateral_seized=data.get("collateral_seized", 0),
                bonus_pct=data.get("bonus_pct", 0),
            )
        elif action_type == "borrow":
            tx = await integrator.record_borrow(
                borrower_id=agent_id,
                amount=data.get("amount", 0),
                collateral=data.get("collateral", 0),
                interest_rate=data.get("interest_rate", 0),
            )
        elif action_type == "flash_loan_attack":
            tx = await integrator.record_flash_loan_attack(
                attacker_id=agent_id,
                flash_amount=data.get("flash_amount", 0),
                profit=data.get("profit", 0),
                liquidations_triggered=data.get("liquidations_triggered", 0),
                attack_type=data.get("attack_type", "unknown"),
            )
        elif action_type == "scenario_event":
            tx = await integrator.record_scenario_event(
                scenario_type=data.get("scenario_type", "unknown"),
                phase=data.get("phase", "unknown"),
                event_type=data.get("event_type", "unknown"),
                damage=data.get("damage", 0),
                severity=data.get("severity", "low"),
            )
        
        if tx:
            return {"success": True, "data": tx.to_dict()}
        else:
            return {"success": False, "error": "Failed to record action"}
            
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/blockchain/contract-addresses")
async def get_contract_addresses():
    """Get all deployed contract addresses on Sepolia."""
    from config import settings
    return {
        "success": True,
        "data": {
            "network": "Sepolia",
            "rpc_url": settings.sepolia_rpc_url[:40] + "..." if settings.sepolia_rpc_url else None,
            "contracts": {
                "AccessControl": settings.access_control_address,
                "IdentityRegistry": settings.identity_registry_address,
                "CreditRegistry": settings.credit_registry_address,
                "CollateralVault": settings.collateral_vault_address,
                "LendingPool": settings.lending_pool_address,
                "LiquidityPool": settings.liquidity_pool_address,
                "Palladium": settings.palladium_address,
                "Badassium": settings.badassium_address,
            },
            "real_txs_enabled": settings.enable_blockchain_txs,
        }
    }


@router.post("/blockchain/toggle-real-txs")
async def toggle_real_blockchain_txs(body: Dict[str, Any]):
    """
    Toggle real on-chain transaction execution at runtime.
    Body: { enabled: bool }
    """
    from agents.blockchain_integrator import get_blockchain_integrator
    try:
        integrator = await get_blockchain_integrator()
        enabled = body.get("enabled", False)
        integrator.enable_real_txs = enabled
        return {
            "success": True,
            "data": {
                "real_txs_enabled": integrator.enable_real_txs,
                "message": f"Real blockchain transactions {'enabled' if enabled else 'disabled'}"
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================================================
# THREAT PREDICTION API (ML + Groq enhanced)
# ============================================================================

@router.get("/threats/predictions")
async def get_threat_predictions():
    """
    ML-powered future threat predictions based on current alert state.
    Returns per-threat-type probabilities, severity forecasts, and mitigation suggestions.
    """
    try:
        from agents.threat_predictor import get_threat_predictor

        predictor = get_threat_predictor()

        # Get current alerts from the active fraud monitor
        monitor = simulation_runner.fraud_monitor if simulation_runner.status == "running" else _fraud_monitor
        current_alerts = [a.to_dict() for a in monitor.alerts[-50:]] if monitor.alerts else []
        threat_scores = monitor.get_threat_scores()

        # ML prediction
        forecast = predictor.predict_threats(current_alerts, threat_scores)

        # Get mitigation suggestions for existing threats
        existing_mitigations = predictor.get_mitigation_for_existing(current_alerts)

        return {
            "success": True,
            "data": {
                "forecast": forecast.to_dict(),
                "existing_mitigations": existing_mitigations,
            },
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


@router.post("/threats/predict-enhanced")
async def get_enhanced_predictions():
    """
    Groq-enhanced threat prediction — combines ML predictions with LLM analysis
    for richer narratives, attack chain analysis, and priority action roadmap.
    """
    try:
        from agents.threat_predictor import get_threat_predictor, groq_threat_predictions

        predictor = get_threat_predictor()

        monitor = simulation_runner.fraud_monitor if simulation_runner.status == "running" else _fraud_monitor
        current_alerts = [a.to_dict() for a in monitor.alerts[-50:]] if monitor.alerts else []
        threat_scores = monitor.get_threat_scores()

        # ML prediction
        forecast = predictor.predict_threats(current_alerts, threat_scores)
        ml_data = forecast.to_dict()

        # Get mitigation suggestions
        existing_mitigations = predictor.get_mitigation_for_existing(current_alerts)

        # Groq enhancement
        groq_enhanced = await groq_threat_predictions(
            ml_data, current_alerts, existing_mitigations
        )

        return {
            "success": True,
            "data": {
                "forecast": ml_data,
                "existing_mitigations": existing_mitigations,
                "groq_analysis": groq_enhanced,
            },
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}
