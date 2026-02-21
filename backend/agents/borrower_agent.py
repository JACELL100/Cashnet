"""
BorrowerAgent
==============
- Simulates retail and institutional borrowers in the lending market
- Monitors health factor on every tick
- Tries to defensively add collateral or repay partial debt when HF gets dangerously low
- Can borrow more if HF is very healthy
"""

import random
from typing import List

from agents.base import (
    BaseAgent,
    AgentType,
    TradeAction,
)


class BorrowerAgent(BaseAgent):
    """
    Actively manages a loan position.
    Defends against liquidations by depositing collateral or repaying debt.
    """

    def __init__(
        self,
        name: str,
        wallet: str,
        capital: float = 100_000.0,
    ):
        # We classify them under Retail Trader for the overall simulation type
        super().__init__(
            agent_type=AgentType.RETAIL_TRADER,
            name=name,
            capital=capital,
            risk="medium",
            speed="normal",
        )
        self.wallet = wallet
        self.target_hf = 1.3  # Wants to keep HF around 1.3
        self.panic_hf = 1.05  # Panics and repays quickly if HF drops here

    async def tick(self, step: int) -> List[TradeAction]:
        if not self.lending or not self.active:
            return []

        actions: List[TradeAction] = []
        pos = self.lending.positions.get(self.wallet)
        
        # If no position, or fully paid off, maybe start a new one
        if not pos or pos.debt <= 0:
            # 5% chance to open a new loan if they have capital
            if random.random() < 0.05 and self.capital > 10000:
                borrow_amount = self.capital * 0.5  # Borrow 50% of capital
                if self.lending.can_borrow(borrow_amount, self.wallet):
                    # They deposit capital as collateral, and borrow
                    self.capital -= borrow_amount * 1.5 # The collateral
                    
                    if pos:
                        pos.collateral += borrow_amount * 1.5
                        pos.debt += borrow_amount
                    
                    self.lending._recompute()
                    
                    actions.append(TradeAction(
                        agent_id=self.id,
                        agent_type=self.agent_type.value,
                        action="borrow",
                        token_in="COLLATERAL",
                        token_out="DEBT",
                        amount=borrow_amount,
                        metadata={
                            "wallet": self.wallet,
                            "new_hf": pos.health_factor if pos else 0
                        }
                    ))
            return actions

        hf = pos.health_factor
        
        # 1. Panic Defense (HF very close to liquidation threshold)
        if hf < self.panic_hf and hf >= 1.0:
            # Needs to repay debt to save position
            # Calculate how much to repay to get back to target_hf
            # target_hf = (collateral / thresh) / (debt - repay)
            # (debt - repay) * target_hf = (collateral / thresh)
            # debt - repay = (collateral / thresh) / target_hf
            # repay = debt - ((collateral / thresh) / target_hf)
            
            desired_repay = pos.debt - ((pos.collateral / pos.liquidation_threshold) / self.target_hf)
            
            if desired_repay > 0:
                # Actual repay is limited by their liquid capital outside the protocol
                actual_repay = min(desired_repay, self.capital)
                
                if actual_repay > 0:
                    self.capital -= actual_repay
                    pos.debt -= actual_repay
                    
                    # Boost credit score for defensive behavior
                    pos.credit_profile.interaction_quality_score += 5
                    pos.credit_profile.successful_repay_volume += actual_repay
                    
                    self.lending._recompute()
                    
                    actions.append(TradeAction(
                        agent_id=self.id,
                        agent_type=self.agent_type.value,
                        action="repay_defensive",
                        token_in="DEBT",
                        token_out="COLLATERAL",
                        amount=actual_repay,
                        metadata={
                            "wallet": self.wallet,
                            "old_hf": round(hf, 4),
                            "new_hf": round(pos.health_factor, 4)
                        }
                    ))
                    
                    self.emit_event("borrower_defense", {
                        "wallet": self.wallet,
                        "action": "repay",
                        "amount": round(actual_repay, 2),
                        "hf_recovered_to": round(pos.health_factor, 4)
                    })

        # 2. Greed (HF very high, might borrow more)
        elif hf > 2.0 and random.random() < 0.1:
            # Borrow more up to target HF
            # target_hf = (collateral / thresh) / (debt + borrow)
            # debt + borrow = (collateral / thresh) / target_hf
            # borrow = ((collateral / thresh) / target_hf) - debt
            
            desired_borrow = ((pos.collateral / pos.liquidation_threshold) / self.target_hf) - pos.debt
            
            if desired_borrow > 0 and self.lending.can_borrow(desired_borrow, self.wallet):
                pos.debt += desired_borrow
                self.capital += desired_borrow
                self.lending._recompute()
                
                actions.append(TradeAction(
                    agent_id=self.id,
                    agent_type=self.agent_type.value,
                    action="borrow_more",
                    token_in="COLLATERAL",
                    token_out="DEBT",
                    amount=desired_borrow,
                    metadata={
                        "wallet": self.wallet,
                        "old_hf": round(hf, 4),
                        "new_hf": round(pos.health_factor, 4)
                    }
                ))

        return actions
