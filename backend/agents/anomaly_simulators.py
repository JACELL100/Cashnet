"""
Anomaly Simulators
==================
Stateless simulator functions for each attack type.
Each function generates synthetic events, feeds them into a FraudMonitor,
and returns a structured result with timeline, alerts, and impact metrics.
"""

import time
import random
import string
from typing import Any, Dict, List
from agents.fraud_monitor import FraudMonitor


def _random_wallet() -> str:
    """Generate a fake 0x wallet address."""
    return "0x" + "".join(random.choices(string.hexdigits[:16], k=40))


def _run_events(monitor: FraudMonitor, events: List[Dict[str, Any]]) -> List[Dict]:
    """Feed events into the monitor and collect triggered alerts."""
    before = len(monitor.alerts)
    for ev in events:
        monitor.process_event(ev)
    new_alerts = monitor.alerts[before:]
    return [a.to_dict() for a in new_alerts]


# =========================================================================
# 1. WASH TRADING SIMULATOR
# =========================================================================
def simulate_wash_trading(monitor: FraudMonitor, params: Dict[str, Any]) -> Dict:
    """
    Simulate circular trades between two wallets to inflate volume.
    Params: rounds (int), amount (float)
    """
    rounds = params.get("rounds", 6)
    amount = params.get("amount", 5000.0)
    wallet_a = params.get("wallet_a", _random_wallet())
    wallet_b = params.get("wallet_b", _random_wallet())

    base_ts = time.time()
    events = []
    timeline = []

    for i in range(rounds):
        ts = base_ts + i * 5  # every 5 seconds
        # A → B
        events.append({
            "event_type": "wash_trade",
            "agent_id": wallet_a,
            "agent_type": "wash_trader",
            "agent_name": f"WashBot-A",
            "timestamp": ts,
            "data": {
                "counterparty": wallet_b,
                "amount": amount + random.uniform(-50, 50),
                "token_in": "PAL",
                "token_out": "BAD",
                "side": "buy",
            },
        })
        timeline.append({"t": round(i * 5, 1), "action": f"#{i+1} A→B buy ${amount:,.0f} PAL"})

        # B → A (return leg)
        events.append({
            "event_type": "wash_trade",
            "agent_id": wallet_b,
            "agent_type": "wash_trader",
            "agent_name": f"WashBot-B",
            "timestamp": ts + 2,
            "data": {
                "counterparty": wallet_a,
                "amount": amount + random.uniform(-50, 50),
                "token_in": "BAD",
                "token_out": "PAL",
                "side": "sell",
            },
        })
        timeline.append({"t": round(i * 5 + 2, 1), "action": f"#{i+1} B→A sell ${amount:,.0f} BAD"})

    alerts = _run_events(monitor, events)

    return {
        "attack_type": "wash_trading",
        "status": "detected" if alerts else "undetected",
        "events_generated": len(events),
        "alerts_triggered": alerts,
        "impact": {
            "inflated_volume": round(amount * rounds * 2, 2),
            "real_volume": 0,
            "rounds": rounds,
            "wallets_involved": [wallet_a, wallet_b],
        },
        "timeline": timeline,
    }


# =========================================================================
# 2. ORACLE MANIPULATION SIMULATOR
# =========================================================================
def simulate_oracle_manipulation(monitor: FraudMonitor, params: Dict[str, Any]) -> Dict:
    """
    Simulate Mango Markets-style oracle price manipulation.
    Params: initial_price (float), spike_pct (float), steps (int)
    """
    initial_price = params.get("initial_price", 1.0)
    spike_pct = params.get("spike_pct", 40.0)
    steps = params.get("steps", 10)
    attacker = params.get("attacker_wallet", _random_wallet())

    base_ts = time.time()
    events = []
    timeline = []
    price = initial_price

    # Normal price updates first
    for i in range(5):
        price *= 1 + random.uniform(-0.01, 0.01)  # ±1% normal drift
        events.append({
            "event_type": "oracle_update",
            "agent_id": "oracle_feed",
            "agent_type": "oracle",
            "timestamp": base_ts + i * 3,
            "data": {"price": round(price, 6), "source": "chainlink_mock"},
        })
        timeline.append({"t": round(i * 3, 1), "action": f"Normal price: ${price:.4f}"})

    # SPIKE — attacker inflates price in one update
    spiked_price = price * (1 + spike_pct / 100)
    events.append({
        "event_type": "oracle_update",
        "agent_id": attacker,
        "agent_type": "attacker",
        "agent_name": "OracleManipulator",
        "timestamp": base_ts + 15,
        "data": {
            "price": round(spiked_price, 6),
            "source": "manipulated_feed",
            "new_price": round(spiked_price, 6),
        },
    })
    timeline.append({"t": 15.0, "action": f"⚠ SPIKE: ${price:.4f} → ${spiked_price:.4f} (+{spike_pct}%)"})

    # Attacker borrows against inflated collateral
    borrow_value = spiked_price * 100000
    events.append({
        "event_type": "oracle_update",
        "agent_id": attacker,
        "agent_type": "attacker",
        "timestamp": base_ts + 18,
        "data": {
            "price": round(spiked_price * 1.02, 6),
            "new_price": round(spiked_price * 1.02, 6),
        },
    })
    timeline.append({"t": 18.0, "action": f"Attacker borrows ${borrow_value:,.0f} against inflated collateral"})

    # Price crashes back
    crashed_price = initial_price * 0.8
    events.append({
        "event_type": "oracle_update",
        "agent_id": "oracle_feed",
        "agent_type": "oracle",
        "timestamp": base_ts + 25,
        "data": {"price": round(crashed_price, 6), "new_price": round(crashed_price, 6)},
    })
    timeline.append({"t": 25.0, "action": f"Price crashes to ${crashed_price:.4f} — protocol left with bad debt"})

    alerts = _run_events(monitor, events)

    return {
        "attack_type": "oracle_manipulation",
        "status": "detected" if alerts else "undetected",
        "events_generated": len(events),
        "alerts_triggered": alerts,
        "impact": {
            "price_before": round(initial_price, 4),
            "price_spiked_to": round(spiked_price, 4),
            "spike_pct": round(spike_pct, 1),
            "estimated_bad_debt": round(borrow_value * 0.6, 2),
            "attacker_wallet": attacker,
        },
        "timeline": timeline,
    }


# =========================================================================
# 3. FLASH LOAN ATTACK SIMULATOR
# =========================================================================
def simulate_flash_loan_attack(monitor: FraudMonitor, params: Dict[str, Any]) -> Dict:
    """
    Simulate Euler Finance-style flash loan attack.
    Params: flash_amount (float), liquidation_count (int)
    """
    flash_amount = params.get("flash_amount", 1_000_000.0)
    liq_count = params.get("liquidation_count", 4)
    attacker = params.get("attacker_wallet", _random_wallet())

    base_ts = time.time()
    events = []
    timeline = []

    # Step 1: Borrow massive amount
    events.append({
        "event_type": "flash_loan_attack",
        "agent_id": attacker,
        "agent_type": "attacker",
        "agent_name": "FlashLoanBot",
        "timestamp": base_ts,
        "data": {
            "flash_amount": flash_amount,
            "liquidations": liq_count,
            "net_profit": round(flash_amount * 0.035, 2),
            "price_crash_pct": -28.5,
        },
    })
    timeline.append({"t": 0, "action": f"Flash borrow ${flash_amount:,.0f}"})

    # Step 2: Dump to crash price
    dump_amount = flash_amount * 0.5
    events.append({
        "event_type": "whale_swap",
        "agent_id": attacker,
        "agent_type": "attacker",
        "timestamp": base_ts + 0.1,
        "data": {
            "pool_impact_pct": 18.5,
            "slippage_pct": 12.3,
            "amount": dump_amount,
        },
    })
    timeline.append({"t": 0.1, "action": f"Dump ${dump_amount:,.0f} — 18.5% pool impact"})

    # Step 3: Cascade liquidations
    for i in range(liq_count):
        victim = _random_wallet()
        seized = random.uniform(10000, 50000)
        events.append({
            "event_type": "liquidation_executed",
            "agent_id": attacker,
            "agent_type": "attacker",
            "timestamp": base_ts + 0.2 + i * 0.05,
            "data": {
                "target": victim[:10] + "…",
                "seized_collateral": seized,
                "debt_covered": seized * 0.85,
            },
        })
        timeline.append({"t": round(0.2 + i * 0.05, 2), "action": f"Liquidate {victim[:10]}… (${seized:,.0f})"})

    # Step 4: Buyback + repay
    net_profit = flash_amount * 0.035
    events.append({
        "event_type": "trade",
        "agent_id": attacker,
        "agent_type": "attacker",
        "timestamp": base_ts + 0.5,
        "data": {"amount": dump_amount * 0.9, "side": "buy"},
    })
    timeline.append({"t": 0.5, "action": f"Buyback at low price, repay flash loan"})
    timeline.append({"t": 0.6, "action": f"Net profit: ${net_profit:,.0f}"})

    alerts = _run_events(monitor, events)

    return {
        "attack_type": "flash_loan_exploit",
        "status": "detected" if alerts else "undetected",
        "events_generated": len(events),
        "alerts_triggered": alerts,
        "impact": {
            "flash_loan_amount": flash_amount,
            "liquidations_triggered": liq_count,
            "price_crash_pct": -28.5,
            "net_profit": round(net_profit, 2),
            "attacker_wallet": attacker,
        },
        "timeline": timeline,
    }


# =========================================================================
# 4. LIQUIDITY POISONING SIMULATOR
# =========================================================================
def simulate_liquidity_poisoning(monitor: FraudMonitor, params: Dict[str, Any]) -> Dict:
    """
    Simulate rapid add/remove liquidity at skewed ratios.
    Params: amount (float), remove_pct (float)
    """
    amount = params.get("amount", 50000.0)
    remove_pct = params.get("remove_pct", 95.0)
    attacker = params.get("attacker_wallet", _random_wallet())

    base_ts = time.time()
    events = []
    timeline = []

    # Add large liquidity
    events.append({
        "event_type": "add_liquidity",
        "agent_id": attacker,
        "agent_type": "attacker",
        "agent_name": "LiquidityPoisoner",
        "timestamp": base_ts,
        "data": {
            "amount": amount,
            "amount_a": amount * 0.7,  # skewed ratio
            "amount_b": amount * 0.3,
        },
    })
    timeline.append({"t": 0, "action": f"Add ${amount:,.0f} liquidity (70/30 skewed ratio)"})

    # Wait a beat, then remove almost all of it
    remove_amount = amount * (remove_pct / 100)
    events.append({
        "event_type": "remove_liquidity",
        "agent_id": attacker,
        "agent_type": "attacker",
        "agent_name": "LiquidityPoisoner",
        "timestamp": base_ts + 8,
        "data": {
            "amount": remove_amount,
            "shares": remove_amount,
        },
    })
    timeline.append({"t": 8, "action": f"Remove ${remove_amount:,.0f} ({remove_pct}%) — pool ratio distorted"})

    # Profit from skewed price
    profit = amount * 0.02
    timeline.append({"t": 10, "action": f"Profit from price distortion: ~${profit:,.0f}"})

    alerts = _run_events(monitor, events)

    return {
        "attack_type": "liquidity_poisoning",
        "status": "detected" if alerts else "undetected",
        "events_generated": len(events),
        "alerts_triggered": alerts,
        "impact": {
            "liquidity_added": amount,
            "liquidity_removed": round(remove_amount, 2),
            "remove_pct": remove_pct,
            "skew_ratio": "70/30",
            "estimated_profit": round(profit, 2),
            "attacker_wallet": attacker,
        },
        "timeline": timeline,
    }


# =========================================================================
# 5. COORDINATED PUMP & DUMP SIMULATOR
# =========================================================================
def simulate_pump_dump(monitor: FraudMonitor, params: Dict[str, Any]) -> Dict:
    """
    Simulate coordinated multi-wallet pump followed by single-wallet dump.
    Params: pump_wallets (int), buy_amount (float), dump_multiplier (float)
    """
    num_pumpers = params.get("pump_wallets", 5)
    buy_amount = params.get("buy_amount", 10000.0)
    dump_mult = params.get("dump_multiplier", 3.0)
    dumper = params.get("dumper_wallet", _random_wallet())

    base_ts = time.time()
    events = []
    timeline = []
    pumper_wallets = [_random_wallet() for _ in range(num_pumpers)]

    # Phase 1: Coordinated buying
    for i, w in enumerate(pumper_wallets):
        amt = buy_amount + random.uniform(-500, 500)
        events.append({
            "event_type": "pump_buy",
            "agent_id": w,
            "agent_type": "pump_group",
            "agent_name": f"Pumper-{i+1}",
            "timestamp": base_ts + i * 1.5,
            "data": {
                "amount": amt,
                "side": "buy",
                "token": "PAL",
            },
        })
        timeline.append({"t": round(i * 1.5, 1), "action": f"Pumper-{i+1} buys ${amt:,.0f} PAL"})

    # Phase 2: Price is pumped, dumper sells
    dump_amount = buy_amount * dump_mult
    events.append({
        "event_type": "pump_sell",
        "agent_id": dumper,
        "agent_type": "dumper",
        "agent_name": "Dumper",
        "timestamp": base_ts + num_pumpers * 1.5 + 5,
        "data": {
            "amount": dump_amount,
            "side": "sell",
            "token": "PAL",
        },
    })
    timeline.append({
        "t": round(num_pumpers * 1.5 + 5, 1),
        "action": f"💥 DUMP: ${dump_amount:,.0f} PAL sold by {dumper[:10]}…",
    })

    # Phase 3: Retail holders lose
    price_drop = num_pumpers * 5
    timeline.append({
        "t": round(num_pumpers * 1.5 + 8, 1),
        "action": f"Price crashes ~{price_drop}% — retail holders lose",
    })

    alerts = _run_events(monitor, events)

    return {
        "attack_type": "pump_dump",
        "status": "detected" if alerts else "undetected",
        "events_generated": len(events),
        "alerts_triggered": alerts,
        "impact": {
            "pump_wallets": num_pumpers,
            "total_pump_volume": round(buy_amount * num_pumpers, 2),
            "dump_amount": round(dump_amount, 2),
            "dumper_wallet": dumper,
            "estimated_price_drop_pct": price_drop,
            "pump_wallet_addresses": [w[:12] + "…" for w in pumper_wallets],
        },
        "timeline": timeline,
    }
