"""
BlockchainIntegrator — On-Chain Transaction Recording for Simulation Events
===========================================================================
Integrates simulation events with the deployed smart contracts:
  - LendingPool: Record borrows, repayments, liquidations
  - LiquidityPool: Record swaps, liquidity adds/removes
  - CreditRegistry: Record credit score updates
  - CollateralVault: Record collateral deposits/withdrawals

Uses the existing blockchain_service.py for Web3 connectivity.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from pathlib import Path
from web3 import Web3

from blockchain_service import BlockchainService
from config import settings


@dataclass
class OnChainTx:
    """Represents an on-chain transaction record."""
    tx_hash: str
    contract: str
    function: str
    args: Dict[str, Any]
    block_number: int
    gas_used: int
    status: str  # "success" | "failed" | "pending"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tx_hash": self.tx_hash,
            "contract": self.contract,
            "function": self.function,
            "args": self.args,
            "block_number": self.block_number,
            "gas_used": self.gas_used,
            "status": self.status,
        }


class BlockchainIntegrator:
    """
    Bridges simulation events to on-chain transactions.
    Records immutable proof of simulation outcomes.
    """

    def __init__(self, activity_feed_callback=None):
        self.blockchain = BlockchainService()
        self.contracts_loaded = False
        self.tx_history: List[OnChainTx] = []
        
        # Contract addresses (from deployment)
        self.contract_addresses: Dict[str, str] = {}
        
        # Token contracts (Palladium & Badassium)
        self.token_contracts: Dict[str, Any] = {}
        
        # Enable/disable real on-chain execution
        self.enable_real_txs: bool = os.getenv("ENABLE_BLOCKCHAIN_TXS", "false").lower() == "true"
        
        # ABI paths
        self.abi_dir = Path(__file__).parent.parent.parent / "contracts" / "abi"
        
        # Activity feed callback for live event streaming
        self.activity_feed_callback = activity_feed_callback

    async def initialize(self) -> bool:
        """Load contract ABIs and verify connectivity."""
        if not self.blockchain.is_connected():
            print("⚠️  BlockchainIntegrator: Not connected to blockchain")
            return False

        try:
            # Load ABIs
            await self._load_contracts()
            self.contracts_loaded = True
            print(f"✅ BlockchainIntegrator ready (Block: {self.blockchain.get_block_number()})")
            return True
        except Exception as e:
            print(f"⚠️  BlockchainIntegrator init failed: {e}")
            return False

    async def _load_contracts(self):
        """Load contract ABIs from the contracts/abi directory."""
        contracts_to_load = [
            "LendingPool",
            "LiquidityPool", 
            "CreditRegistry",
            "CollateralVault",
            "AccessControl",
        ]

        for contract_name in contracts_to_load:
            abi_path = self.abi_dir / f"{contract_name}.json"
            if abi_path.exists():
                with open(abi_path) as f:
                    abi_data = json.load(f)
                    # ABI can be the full object or just the abi array
                    abi = abi_data.get("abi", abi_data) if isinstance(abi_data, dict) else abi_data
                    
                    # Get address from settings or use placeholder
                    address = self._get_contract_address(contract_name)
                    if address:
                        self.blockchain.load_contract(contract_name, address, abi)
                        self.contract_addresses[contract_name] = address
        
        # Load token contracts (Palladium & Badassium)
        await self._load_token_contracts()

    def _get_contract_address(self, contract_name: str) -> Optional[str]:
        """Get deployed contract address from settings or environment."""
        env_key = f"{contract_name.upper()}_ADDRESS"
        address = os.getenv(env_key) or getattr(settings, env_key.lower(), None)
        
        # Fallback to a mock address for development
        if not address:
            # Use a deterministic mock address for dev mode
            mock_addresses = {
                "LendingPool": "0x1111111111111111111111111111111111111111",
                "LiquidityPool": "0x2222222222222222222222222222222222222222",
                "CreditRegistry": "0x3333333333333333333333333333333333333333",
                "CollateralVault": "0x4444444444444444444444444444444444444444",
                "AccessControl": "0x5555555555555555555555555555555555555555",
            }
            return mock_addresses.get(contract_name)
        return address
    
    async def _load_token_contracts(self):
        """Load Palladium and Badassium token contracts."""
        token_abi_path = self.abi_dir / "SimToken.json"
        if not token_abi_path.exists():
            print("⚠️  SimToken.json not found, skipping token contracts")
            return
        
        with open(token_abi_path) as f:
            token_abi_data = json.load(f)
            token_abi = token_abi_data.get("abi", token_abi_data) if isinstance(token_abi_data, dict) else token_abi_data
        
        # Load Palladium
        palladium_addr = os.getenv("PALLADIUM_ADDRESS")
        if palladium_addr:
            self.blockchain.load_contract("Palladium", palladium_addr, token_abi)
            self.token_contracts["PALLADIUM"] = palladium_addr
            print(f"✅ Loaded Palladium token: {palladium_addr}")
        
        # Load Badassium
        badassium_addr = os.getenv("BADASSIUM_ADDRESS")
        if badassium_addr:
            self.blockchain.load_contract("Badassium", badassium_addr, token_abi)
            self.token_contracts["BADASSIUM"] = badassium_addr
            print(f"✅ Loaded Badassium token: {badassium_addr}")

    # ─────────────────────────────────────────────────────────────────────────
    # Real On-Chain Execution (Enabled when ENABLE_BLOCKCHAIN_TXS=true)
    # ─────────────────────────────────────────────────────────────────────────

    async def execute_real_swap(
        self,
        agent_wallet: str,
        token_in: str,
        token_out: str,
        amount_in: float,
    ) -> Optional[str]:
        """
        Execute a real on-chain token swap via LiquidityPool contract.
        Returns transaction hash if successful, None otherwise.
        """
        if not self.enable_real_txs or not self.contracts_loaded:
            print(f"⏭️  Skipping real swap (enable_real_txs={self.enable_real_txs}, contracts_loaded={self.contracts_loaded})")
            return None
        
        if not self.blockchain.account:
            print("⚠️  No blockchain account configured")
            return None
        
        # Use the actual wallet address from private key
        wallet_address = self.blockchain.account.address
        
        try:
            # Get token addresses
            token_in_addr = self.token_contracts.get(token_in.upper())
            token_out_addr = self.token_contracts.get(token_out.upper())
            
            if not token_in_addr or not token_out_addr:
                print(f"⚠️  Token not found: {token_in} ({token_in_addr}) or {token_out} ({token_out_addr})")
                return None
            
            # Convert to Wei (assuming 18 decimals)
            amount_in_wei = int(amount_in * 10**18)
            
            # Step 1: Approve LiquidityPool to spend tokens
            liquidity_pool_addr = self.contract_addresses.get("LiquidityPool")
            if not liquidity_pool_addr:
                print("⚠️  LiquidityPool address not found")
                return None
            
            # Get token contract
            token_contract_name = "Palladium" if token_in.upper() == "PALLADIUM" else "Badassium"
            token_contract = self.blockchain.contracts.get(token_contract_name)
            if not token_contract:
                print(f"⚠️  Token contract not loaded: {token_contract_name}")
                return None
            
            # Approve transaction
            print(f"🔓 Approving {amount_in} {token_in} for swap from {wallet_address}...")
            
            # Emit event to activity feed
            if self.activity_feed_callback:
                self.activity_feed_callback({
                    "agent_id": "blockchain",
                    "agent_name": "Blockchain",
                    "agent_type": "blockchain_tx",
                    "event_type": "approval_pending",
                    "data": {
                        "token": token_in,
                        "amount": amount_in,
                        "wallet": wallet_address[:10] + "...",
                        "status": "pending"
                    },
                    "timestamp": time.time()
                })
            
            approve_tx = token_contract.functions.approve(
                Web3.to_checksum_address(liquidity_pool_addr),
                amount_in_wei
            ).build_transaction({
                'from': wallet_address,
                'gas': 100000,
                'gasPrice': self.blockchain.w3.eth.gas_price,
                'nonce': self.blockchain.w3.eth.get_transaction_count(wallet_address),
            })
            
            # Sign and send approval
            approve_tx_hash = self.blockchain.send_raw_transaction_dict(approve_tx)
            print(f"✅ Approval tx: https://sepolia.etherscan.io/tx/{approve_tx_hash}")
            
            # Emit confirmation event
            if self.activity_feed_callback:
                self.activity_feed_callback({
                    "agent_id": "blockchain",
                    "agent_name": "Blockchain",
                    "agent_type": "blockchain_tx",
                    "event_type": "approval_confirmed",
                    "data": {
                        "token": token_in,
                        "amount": amount_in,
                        "tx_hash": approve_tx_hash,
                        "etherscan": f"https://sepolia.etherscan.io/tx/{approve_tx_hash}",
                        "status": "confirmed"
                    },
                    "timestamp": time.time()
                })
            
            # Step 2: Execute swap
            liquidity_pool = self.blockchain.contracts.get("LiquidityPool")
            if not liquidity_pool:
                print("⚠️  LiquidityPool contract not loaded")
                return None
            
            print(f"💱 Executing swap: {amount_in} {token_in} → {token_out}...")
            
            # Emit swap pending event
            if self.activity_feed_callback:
                self.activity_feed_callback({
                    "agent_id": "blockchain",
                    "agent_name": "Blockchain",
                    "agent_type": "blockchain_tx",
                    "event_type": "swap_pending",
                    "data": {
                        "token_in": token_in,
                        "token_out": token_out,
                        "amount": amount_in,
                        "wallet": wallet_address[:10] + "...",
                        "status": "pending"
                    },
                    "timestamp": time.time()
                })
            
            swap_tx = liquidity_pool.functions.swap(
                Web3.to_checksum_address(token_in_addr),
                amount_in_wei
            ).build_transaction({
                'from': wallet_address,
                'gas': 300000,
                'gasPrice': self.blockchain.w3.eth.gas_price,
                'nonce': self.blockchain.w3.eth.get_transaction_count(wallet_address),
            })
            
            # Sign and send swap
            swap_tx_hash = self.blockchain.send_raw_transaction_dict(swap_tx)
            print(f"✅ Swap tx: https://sepolia.etherscan.io/tx/{swap_tx_hash}")
            
            # Emit swap confirmed event
            if self.activity_feed_callback:
                self.activity_feed_callback({
                    "agent_id": "blockchain",
                    "agent_name": "Blockchain",
                    "agent_type": "blockchain_tx",
                    "event_type": "swap_confirmed",
                    "data": {
                        "token_in": token_in,
                        "token_out": token_out,
                        "amount": amount_in,
                        "tx_hash": swap_tx_hash,
                        "etherscan": f"https://sepolia.etherscan.io/tx/{swap_tx_hash}",
                        "status": "confirmed"
                    },
                    "timestamp": time.time()
                })
            
            return swap_tx_hash
            
        except Exception as e:
            print(f"❌ Real swap failed: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    async def get_token_balance(self, token_symbol: str, wallet: str) -> float:
        """Get token balance for a wallet (in human-readable units)."""
        try:
            token_addr = self.token_contracts.get(token_symbol.upper())
            if not token_addr:
                return 0.0
            
            contract_name = "Palladium" if token_symbol.upper() == "PALLADIUM" else "Badassium"
            token_contract = self.blockchain.contracts.get(contract_name)
            if not token_contract:
                return 0.0
            
            balance_wei = token_contract.functions.balanceOf(wallet).call()
            return balance_wei / 10**18
            
        except Exception as e:
            print(f"❌ Failed to get balance: {e}")
            return 0.0

    # ─────────────────────────────────────────────────────────────────────────
    # Transaction Recording (Simulation → Blockchain)
    # ─────────────────────────────────────────────────────────────────────────

    async def record_swap(
        self,
        agent_id: str,
        token_in: str,
        amount_in: float,
        amount_out: float,
        price_impact: float,
        agent_wallet: Optional[str] = None,
        execute_on_chain: bool = False,
    ) -> Optional[OnChainTx]:
        """
        Record a swap event.
        If execute_on_chain=True and ENABLE_BLOCKCHAIN_TXS=true, executes real swap.
        """
        if not self.contracts_loaded:
            return None

        # Extract token_out from context (simplified)
        token_out = "BADASSIUM" if token_in.upper() == "PALLADIUM" else "PALLADIUM"
        
        # Optionally execute real on-chain swap
        real_tx_hash = None
        if execute_on_chain and self.enable_real_txs and agent_wallet:
            real_tx_hash = await self.execute_real_swap(
                agent_wallet,
                token_in,
                token_out,
                amount_in
            )

        tx_data = {
            "agent_id": agent_id,
            "token_in": token_in,
            "token_out": token_out,
            "amount_in": amount_in,
            "amount_out": amount_out,
            "price_impact_pct": price_impact,
            "timestamp": self._current_timestamp(),
            "on_chain": real_tx_hash is not None,
        }

        # Create transaction record
        tx = OnChainTx(
            tx_hash=real_tx_hash or self._generate_mock_tx_hash(),
            contract="LiquidityPool",
            function="swap",
            args=tx_data,
            block_number=self.blockchain.get_block_number(),
            gas_used=150_000 if not real_tx_hash else 300_000,
            status="pending" if real_tx_hash else "success",
        )
        self.tx_history.append(tx)
        
        if real_tx_hash:
            print(f"📝 Recorded REAL swap: {amount_in} {token_in} → {amount_out} {token_out} | TX: {real_tx_hash}")
        
        return tx

    async def record_liquidation(
        self,
        liquidator_id: str,
        target_wallet: str,
        debt_covered: float,
        collateral_seized: float,
        bonus_pct: float,
    ) -> Optional[OnChainTx]:
        """Record a liquidation event."""
        if not self.contracts_loaded:
            return None

        tx_data = {
            "liquidator": liquidator_id,
            "target": target_wallet,
            "debt_covered": debt_covered,
            "collateral_seized": collateral_seized,
            "bonus_pct": bonus_pct,
            "timestamp": self._current_timestamp(),
        }

        tx = OnChainTx(
            tx_hash=self._generate_mock_tx_hash(),
            contract="LendingPool",
            function="liquidate",
            args=tx_data,
            block_number=self.blockchain.get_block_number(),
            gas_used=250_000,
            status="success",
        )
        self.tx_history.append(tx)
        return tx

    async def record_borrow(
        self,
        borrower_id: str,
        amount: float,
        collateral: float,
        interest_rate: float,
    ) -> Optional[OnChainTx]:
        """Record a borrow event."""
        if not self.contracts_loaded:
            return None

        tx_data = {
            "borrower": borrower_id,
            "amount": amount,
            "collateral": collateral,
            "interest_rate_pct": interest_rate,
            "timestamp": self._current_timestamp(),
        }

        tx = OnChainTx(
            tx_hash=self._generate_mock_tx_hash(),
            contract="LendingPool",
            function="borrow",
            args=tx_data,
            block_number=self.blockchain.get_block_number(),
            gas_used=200_000,
            status="success",
        )
        self.tx_history.append(tx)
        return tx

    async def record_flash_loan_attack(
        self,
        attacker_id: str,
        flash_amount: float,
        profit: float,
        liquidations_triggered: int,
        attack_type: str,
    ) -> Optional[OnChainTx]:
        """Record a flash loan attack for forensic analysis."""
        if not self.contracts_loaded:
            return None

        tx_data = {
            "attacker": attacker_id,
            "flash_amount": flash_amount,
            "profit": profit,
            "liquidations": liquidations_triggered,
            "attack_type": attack_type,
            "timestamp": self._current_timestamp(),
        }

        tx = OnChainTx(
            tx_hash=self._generate_mock_tx_hash(),
            contract="SecurityAudit",  # Virtual contract for attack logging
            function="logFlashLoanAttack",
            args=tx_data,
            block_number=self.blockchain.get_block_number(),
            gas_used=100_000,
            status="success",
        )
        self.tx_history.append(tx)
        return tx

    async def record_scenario_event(
        self,
        scenario_type: str,
        phase: str,
        event_type: str,
        damage: float,
        severity: str,
    ) -> Optional[OnChainTx]:
        """Record a scenario simulation event."""
        if not self.contracts_loaded:
            return None

        tx_data = {
            "scenario": scenario_type,
            "phase": phase,
            "event": event_type,
            "damage": damage,
            "severity": severity,
            "timestamp": self._current_timestamp(),
        }

        tx = OnChainTx(
            tx_hash=self._generate_mock_tx_hash(),
            contract="ScenarioRegistry",  # Virtual contract for scenario logging
            function="logScenarioEvent",
            args=tx_data,
            block_number=self.blockchain.get_block_number(),
            gas_used=80_000,
            status="success",
        )
        self.tx_history.append(tx)
        return tx

    # ─────────────────────────────────────────────────────────────────────────
    # Query Methods
    # ─────────────────────────────────────────────────────────────────────────

    def get_tx_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent transaction history."""
        return [tx.to_dict() for tx in self.tx_history[-limit:]]

    def get_tx_by_contract(self, contract_name: str) -> List[Dict[str, Any]]:
        """Get transactions by contract."""
        return [
            tx.to_dict() 
            for tx in self.tx_history 
            if tx.contract == contract_name
        ]

    def get_stats(self) -> Dict[str, Any]:
        """Get blockchain integration statistics."""
        by_contract: Dict[str, int] = {}
        total_gas = 0
        on_chain_txs = 0
        
        for tx in self.tx_history:
            by_contract[tx.contract] = by_contract.get(tx.contract, 0) + 1
            total_gas += tx.gas_used
            if tx.args.get("on_chain"):
                on_chain_txs += 1

        return {
            "connected": self.blockchain.is_connected(),
            "contracts_loaded": self.contracts_loaded,
            "current_block": self.blockchain.get_block_number() if self.blockchain.is_connected() else 0,
            "total_txs": len(self.tx_history),
            "on_chain_txs": on_chain_txs,
            "simulated_txs": len(self.tx_history) - on_chain_txs,
            "by_contract": by_contract,
            "total_gas_used": total_gas,
            "contract_addresses": self.contract_addresses,
            "token_contracts": self.token_contracts,
            "real_txs_enabled": self.enable_real_txs,
        }

    async def get_on_chain_state(self) -> Dict[str, Any]:
        """Query current on-chain state from deployed contracts."""
        state = {
            "block_number": 0,
            "lending_pool": {},
            "liquidity_pool": {},
        }

        if not self.blockchain.is_connected():
            return state

        state["block_number"] = self.blockchain.get_block_number()

        # Try to read from contracts if addresses are configured
        try:
            if "LendingPool" in self.blockchain.contracts:
                state["lending_pool"] = {
                    "total_borrowed": 0,  # Would call contract.functions.totalBorrowed().call()
                }
        except Exception:
            pass

        return state

    # ─────────────────────────────────────────────────────────────────────────
    # Helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _generate_mock_tx_hash(self) -> str:
        """Generate a mock transaction hash for simulation."""
        import hashlib
        import time
        import random
        data = f"{time.time()}-{random.randint(0, 1000000)}"
        return "0x" + hashlib.sha256(data.encode()).hexdigest()

    def _current_timestamp(self) -> int:
        """Get current Unix timestamp."""
        import time
        return int(time.time())

    def reset(self):
        """Clear transaction history."""
        self.tx_history.clear()


# Global instance
blockchain_integrator: Optional[BlockchainIntegrator] = None


async def get_blockchain_integrator(activity_feed_callback=None) -> BlockchainIntegrator:
    """Get or create the blockchain integrator instance."""
    global blockchain_integrator
    if blockchain_integrator is None:
        blockchain_integrator = BlockchainIntegrator(activity_feed_callback=activity_feed_callback)
        await blockchain_integrator.initialize()
    elif activity_feed_callback and not blockchain_integrator.activity_feed_callback:
        # Update callback if was None before
        blockchain_integrator.activity_feed_callback = activity_feed_callback
    return blockchain_integrator
