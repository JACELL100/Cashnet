"""
Demo Attack Scenario - Protocol Stress Test with Palladium & Badassium
========================================================================
Demonstrates coordinated multi-agent attack generating 100+ transactions:
  1. Flash Loan Exploit (20-30 TXs)
  2. Liquidity Drain Attack (15-20 TXs)
  3. Cascade Liquidations (40-60 TXs)
  4. MEV Sandwich Attacks (15-20 TXs)
  5. Recovery & Arbitrage (10-15 TXs)

Uses your deployed tokens:
  - PALLADIUM: 0x983A613d5f224459D2919e0d9E9e77C72E032042
  - BADASSIUM: 0x2960e22Ed3256E2bAfF233F5d03A20f597f14e07
"""

import asyncio
import random
from typing import Dict, List, Any
from dataclasses import dataclass

from agents.base import PoolState, LendingState, TradeAction


@dataclass
class AttackPhase:
    name: str
    description: str
    transactions_target: int
    severity: str
    completed: bool = False
    tx_count: int = 0


class ProtocolStressTestDemo:
    """
    Orchestrates a sophisticated multi-stage attack for demonstration.
    Generates 100+ transactions using your deployed tokens.
    """
    
    def __init__(self, pool: PoolState, lending: LendingState, blockchain_integrator=None):
        self.pool = pool
        self.lending = lending
        self.blockchain_integrator = blockchain_integrator
        self.phases: List[AttackPhase] = [
            AttackPhase(
                name="Phase 1: Flash Loan Exploit",
                description="Attacker borrows 5M PALLADIUM, dumps to crash price",
                transactions_target=25,
                severity="CRITICAL"
            ),
            AttackPhase(
                name="Phase 2: Liquidity Drain",
                description="Coordinated withdrawal of BADASSIUM liquidity",
                transactions_target=20,
                severity="HIGH"
            ),
            AttackPhase(
                name="Phase 3: Cascade Liquidations",
                description="Underwater positions liquidated en masse",
                transactions_target=50,
                severity="CRITICAL"
            ),
            AttackPhase(
                name="Phase 4: MEV Extraction",
                description="Bots sandwich honest traders during chaos",
                transactions_target=20,
                severity="MEDIUM"
            ),
            AttackPhase(
                name="Phase 5: Recovery Arbitrage",
                description="Market makers restore pool equilibrium",
                transactions_target=15,
                severity="LOW"
            ),
        ]
        
        self.current_phase_idx = 0
        self.total_transactions = 0
        self.attack_profit = 0.0
        self.protocol_damage = 0.0
        
    def get_current_phase(self) -> AttackPhase:
        """Get the currently active attack phase."""
        if self.current_phase_idx < len(self.phases):
            return self.phases[self.current_phase_idx]
        return None
    
    async def execute_phase_1_flash_loan(self) -> List[Dict[str, Any]]:
        """
        PHASE 1: Flash Loan Exploit
        - Borrow 5,000,000 PALLADIUM (flash loan)
        - Swap 2,000,000 PALLADIUM → BADASSIUM (crashes PALLADIUM price)
        - Liquidate 15-20 borrower positions
        - Swap back BADASSIUM → PALLADIUM at discount
        - Repay flash loan + fees
        - Keep profit
        """
        transactions = []
        phase = self.phases[0]
        
        # TX 1: Flash loan borrow
        flash_amount = 5_000_000
        transactions.append({
            "type": "flash_loan_borrow",
            "token": "PALLADIUM",
            "amount": flash_amount,
            "phase": phase.name,
            "description": f"Borrow {flash_amount:,} PALLADIUM via flash loan"
        })
        
        # TX 2-6: Large dumps (split into 5 transactions to avoid single-TX detection)
        dump_size = 2_000_000 / 5
        price_impact_total = 0
        for i in range(5):
            tx_receipt = self.pool.execute_swap(dump_size, "TOKEN_A")
            price_impact_total += abs(tx_receipt.get('price_impact', 0))
            
            tx_obj = {
                "type": "swap",
                "token_in": "PALLADIUM",
                "token_out": "BADASSIUM",
                "amount_in": dump_size,
                "amount_out": tx_receipt.get('amount_out', dump_size * 0.95),
                "price_impact": tx_receipt.get('price_impact', -3.5),
                "phase": phase.name,
                "description": f"Dump {dump_size:,.0f} PALLADIUM → BADASSIUM (part {i+1}/5)"
            }
            
            # Execute on blockchain if enabled
            if self.blockchain_integrator:
                try:
                    bc_tx_hash = await self.blockchain_integrator.execute_real_swap(
                        agent_wallet="attacker",
                        token_in="PALLADIUM",
                        token_out="BADASSIUM",
                        amount_in=dump_size
                    )
                    if bc_tx_hash:
                        tx_obj["blockchain_tx"] = bc_tx_hash
                        tx_obj["on_chain"] = True
                except Exception as e:
                    print(f"⚠️  Blockchain swap skipped: {e}")
                    tx_obj["on_chain"] = False
            
            transactions.append(tx_obj)
        
        # TX 7: Apply price crash to lending protocol
        self.lending.apply_price_change(-price_impact_total * 0.6)
        self.protocol_damage += abs(price_impact_total * 100_000)
        
        # TX 8-22: Liquidate underwater positions (15 liquidations)
        liquidation_count = 15
        for i in range(liquidation_count):
            # Simulate liquidation
            debt_covered = random.uniform(5_000, 15_000)
            collateral_seized = debt_covered * 1.08  # 8% liquidation bonus
            liquidation_profit = collateral_seized - debt_covered
            self.attack_profit += liquidation_profit
            
            transactions.append({
                "type": "liquidate",
                "target": f"Borrower_{i+1}",
                "debt_covered": debt_covered,
                "collateral_seized": collateral_seized,
                "liquidation_bonus": liquidation_profit,
                "phase": phase.name,
                "description": f"Liquidate Borrower_{i+1} (seized {collateral_seized:,.0f} PALLADIUM)"
            })
        
        # TX 23-24: Buy back PALLADIUM at crashed price
        buyback_amount = 2_000_000 / 2
        for i in range(2):
            tx_receipt = self.pool.execute_swap(buyback_amount * 0.95, "TOKEN_B")
            
            tx_obj = {
                "type": "swap",
                "token_in": "BADASSIUM",
                "token_out": "PALLADIUM",
                "amount_in": buyback_amount * 0.95,
                "amount_out": tx_receipt.get('amount_out', buyback_amount),
                "price_impact": tx_receipt.get('price_impact', 2.5),
                "phase": phase.name,
                "description": f"Buy back {buyback_amount:,.0f} PALLADIUM at discount (part {i+1}/2)"
            }
            
            # Execute on blockchain if enabled
            if self.blockchain_integrator:
                try:
                    bc_tx_hash = await self.blockchain_integrator.execute_real_swap(
                        agent_wallet="attacker",
                        token_in="BADASSIUM",
                        token_out="PALLADIUM",
                        amount_in=buyback_amount
                    )
                    if bc_tx_hash:
                        tx_obj["blockchain_tx"] = bc_tx_hash
                        tx_obj["on_chain"] = True
                except Exception as e:
                    print(f"⚠️  Blockchain swap skipped: {e}")
                    tx_obj["on_chain"] = False
            
            transactions.append(tx_obj)
        
        # TX 25: Repay flash loan
        flash_fee = flash_amount * 0.0009  # 0.09% flash loan fee
        flash_profit = 150_000  # Net profit from exploit
        self.attack_profit += flash_profit
        
        transactions.append({
            "type": "flash_loan_repay",
            "token": "PALLADIUM",
            "amount": flash_amount + flash_fee,
            "fee": flash_fee,
            "net_profit": flash_profit,
            "phase": phase.name,
            "description": f"Repay flash loan + {flash_fee:,.0f} fee | Profit: ${flash_profit:,.0f}"
        })
        
        phase.tx_count = len(transactions)
        return transactions
    
    def execute_phase_2_liquidity_drain(self) -> List[Dict[str, Any]]:
        """
        PHASE 2: Coordinated Liquidity Drain
        - Multiple whales remove BADASSIUM liquidity simultaneously
        - Pool slippage increases dramatically
        - Small traders get rekt on swaps
        """
        transactions = []
        phase = self.phases[1]
        
        # TX 1-20: Coordinated liquidity removals
        whale_count = 20
        for i in range(whale_count):
            removal_pct = random.uniform(3, 8)  # Each whale removes 3-8%
            removed = self.pool.remove_liquidity(removal_pct)
            
            transactions.append({
                "type": "remove_liquidity",
                "whale": f"Whale_{i+1}",
                "token_a_removed": removed.get('token_a', 0),
                "token_b_removed": removed.get('token_b', 0),
                "lp_tokens_burned": removal_pct * 1000,
                "phase": phase.name,
                "description": f"Whale_{i+1} withdraws {removal_pct:.1f}% liquidity"
            })
            
            self.protocol_damage += removed.get('token_a', 0) + removed.get('token_b', 0)
        
        phase.tx_count = len(transactions)
        return transactions
    
    def execute_phase_3_cascade_liquidations(self) -> List[Dict[str, Any]]:
        """
        PHASE 3: Cascade Liquidations
        - Price volatility triggers margin calls
        - 50+ positions liquidated in rapid succession
        - Liquidator bots compete for profits
        """
        transactions = []
        phase = self.phases[2]
        
        # TX 1-50: Mass liquidations
        liquidation_count = 50
        for i in range(liquidation_count):
            debt = random.uniform(2_000, 20_000)
            collateral = debt * random.uniform(1.05, 1.15)
            bonus = collateral - debt
            self.attack_profit += bonus
            
            transactions.append({
                "type": "liquidate",
                "liquidator": f"LiqBot_{(i % 3) + 1}",
                "borrower": f"Position_{i+1}",
                "debt_covered": debt,
                "collateral_seized": collateral,
                "liquidation_bonus": bonus,
                "health_factor": random.uniform(0.85, 0.99),
                "phase": phase.name,
                "description": f"Liquidate Position_{i+1} | Bonus: ${bonus:,.0f}"
            })
            
            self.protocol_damage += debt
        
        phase.tx_count = len(transactions)
        return transactions
    
    def execute_phase_4_mev_extraction(self) -> List[Dict[str, Any]]:
        """
        PHASE 4: MEV Sandwich Attacks
        - Bots front-run honest traders during volatility
        - Each sandwich = 3 TXs (front-run, victim, back-run)
        """
        transactions = []
        phase = self.phases[3]
        
        # 6-7 sandwich attacks = ~20 transactions
        sandwich_count = 7
        for i in range(sandwich_count):
            victim_size = random.uniform(5_000, 15_000)
            
            # TX 1: Front-run
            frontrun_size = victim_size * 1.5
            tx1 = self.pool.execute_swap(frontrun_size, "TOKEN_A")
            transactions.append({
                "type": "swap",
                "token_in": "PALLADIUM",
                "token_out": "BADASSIUM",
                "amount_in": frontrun_size,
                "amount_out": tx1.get('amount_out', frontrun_size * 0.98),
                "mev_type": "front_run",
                "sandwich_id": i+1,
                "phase": phase.name,
                "description": f"MEV front-run: {frontrun_size:,.0f} PALLADIUM"
            })
            
            # TX 2: Victim transaction
            tx2 = self.pool.execute_swap(victim_size, "TOKEN_A")
            transactions.append({
                "type": "swap",
                "token_in": "PALLADIUM",
                "token_out": "BADASSIUM",
                "amount_in": victim_size,
                "amount_out": tx2.get('amount_out', victim_size * 0.95),
                "victim": f"Trader_{i+1}",
                "sandwich_id": i+1,
                "phase": phase.name,
                "description": f"Victim TX: Trader_{i+1} gets sandwiched"
            })
            
            # TX 3: Back-run
            backrun_size = tx1.get('amount_out', frontrun_size * 0.98)
            tx3 = self.pool.execute_swap(backrun_size, "TOKEN_B")
            mev_profit = tx3.get('amount_out', backrun_size * 1.02) - frontrun_size
            self.attack_profit += mev_profit
            
            transactions.append({
                "type": "swap",
                "token_in": "BADASSIUM",
                "token_out": "PALLADIUM",
                "amount_in": backrun_size,
                "amount_out": tx3.get('amount_out', backrun_size * 1.02),
                "mev_type": "back_run",
                "mev_profit": mev_profit,
                "sandwich_id": i+1,
                "phase": phase.name,
                "description": f"MEV back-run: Profit ${mev_profit:,.0f}"
            })
        
        phase.tx_count = len(transactions)
        return transactions
    
    def execute_phase_5_recovery(self) -> List[Dict[str, Any]]:
        """
        PHASE 5: Market Recovery
        - Arbitrageurs restore price equilibrium
        - Liquidity providers return
        - Protocol stabilizes
        """
        transactions = []
        phase = self.phases[4]
        
        # TX 1-10: Arbitrage to restore price
        arb_count = 10
        for i in range(arb_count):
            arb_size = random.uniform(10_000, 30_000)
            direction = "TOKEN_A" if random.random() > 0.5 else "TOKEN_B"
            tx_receipt = self.pool.execute_swap(arb_size, direction)
            
            transactions.append({
                "type": "swap",
                "token_in": "PALLADIUM" if direction == "TOKEN_A" else "BADASSIUM",
                "token_out": "BADASSIUM" if direction == "TOKEN_A" else "PALLADIUM",
                "amount_in": arb_size,
                "amount_out": tx_receipt.get('amount_out', arb_size * 0.99),
                "arb_type": "price_stabilization",
                "phase": phase.name,
                "description": f"Arbitrage: Restore price equilibrium (#{i+1})"
            })
        
        # TX 11-15: Liquidity provision
        lp_count = 5
        for i in range(lp_count):
            add_amount = random.uniform(50_000, 150_000)
            transactions.append({
                "type": "add_liquidity",
                "provider": f"LP_Provider_{i+1}",
                "token_a_added": add_amount,
                "token_b_added": add_amount * 0.98,
                "lp_tokens_minted": add_amount * 2,
                "phase": phase.name,
                "description": f"Add ${add_amount:,.0f} liquidity to restore pool"
            })
        
        phase.tx_count = len(transactions)
        return transactions
    
    async def execute_full_attack(self) -> Dict[str, Any]:
        """
        Execute all 5 phases of the protocol stress test.
        Returns comprehensive attack summary with all transactions.
        """
        all_transactions = []
        
        # Execute all phases
        all_transactions.extend(await self.execute_phase_1_flash_loan())
        all_transactions.extend(self.execute_phase_2_liquidity_drain())
        all_transactions.extend(self.execute_phase_3_cascade_liquidations())
        all_transactions.extend(self.execute_phase_4_mev_extraction())
        all_transactions.extend(self.execute_phase_5_recovery())
        
        return {
            "attack_name": "Multi-Stage Protocol Stress Test",
            "tokens_used": {
                "PALLADIUM": "0x983A613d5f224459D2919e0d9E9e77C72E032042",
                "BADASSIUM": "0x2960e22Ed3256E2bAfF233F5d03A20f597f14e07"
            },
            "total_transactions": len(all_transactions),
            "total_attack_profit": round(self.attack_profit, 2),
            "total_protocol_damage": round(self.protocol_damage, 2),
            "phases": [
                {
                    "name": phase.name,
                    "description": phase.description,
                    "severity": phase.severity,
                    "transactions": phase.tx_count
                }
                for phase in self.phases
            ],
            "transactions": all_transactions,
            "final_pool_state": self.pool.to_dict(),
            "final_lending_state": self.lending.to_dict()
        }


# Helper function to run demo
async def run_protocol_stress_test_demo(pool: PoolState, lending: LendingState, blockchain_integrator=None) -> Dict[str, Any]:
    """
    Execute the full protocol stress test demonstration.
    Generates 100+ transactions using Palladium & Badassium tokens.
    """
    demo = ProtocolStressTestDemo(pool, lending, blockchain_integrator)
    results = await demo.execute_full_attack()
    
    print("\n" + "="*80)
    print("PROTOCOL STRESS TEST - DEMONSTRATION COMPLETE")
    print("="*80)
    print(f"Tokens Used: PALLADIUM & BADASSIUM (Sepolia Testnet)")
    print(f"Total Transactions: {results['total_transactions']}")
    print(f"Attack Profit: ${results['total_attack_profit']:,.2f}")
    print(f"Protocol Damage: ${results['total_protocol_damage']:,.2f}")
    
    # Count on-chain transactions
    on_chain_count = sum(1 for tx in results['transactions'] if tx.get('on_chain'))
    print(f"On-Chain Transactions: {on_chain_count}")
    
    print("\nPhase Breakdown:")
    for phase in results['phases']:
        print(f"  {phase['name']}: {phase['transactions']} TXs [{phase['severity']}]")
    print("="*80)
    
    return results
