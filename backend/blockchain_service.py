"""
Blockchain service - Web3 connection and smart contract interactions
"""
from web3 import Web3
try:
    from web3.middleware import ExtraDataToPOAMiddleware
    geth_poa_middleware = ExtraDataToPOAMiddleware
except ImportError:
    # Fallback for older web3.py versions
    from web3.middleware import geth_poa_middleware
from config import settings
from typing import Dict, Any, Optional
import json
import threading
import time

# Process-wide lock serialising nonce fetch + sign + send for the server wallet.
# Module-level (not per-instance) because several BlockchainService instances exist
# (e.g. agents/blockchain_integrator.py creates its own) but share one wallet.
_TX_LOCK = threading.Lock()
_last_nonce: Dict[str, tuple] = {}  # address -> (nonce, monotonic time sent)


def _next_nonce(w3, address: str) -> int:
    """Next nonce for `address`; must be called with _TX_LOCK held."""
    pending = w3.eth.get_transaction_count(address, "pending")
    last = _last_nonce.get(address)
    # RPC "pending" count can lag right after a send; never reuse a nonce we just used.
    # Only trust our cached value briefly so a dropped tx can't leave a permanent gap.
    if last is not None and pending <= last[0] and time.monotonic() - last[1] < 120:
        return last[0] + 1
    return pending


class BlockchainService:
    """Service for interacting with Ethereum blockchain and smart contracts"""
    
    def __init__(self):
        """Initialize Web3 connection"""
        self.w3 = Web3(Web3.HTTPProvider(settings.sepolia_rpc_url))
        # Add PoA middleware for Sepolia testnet
        self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
        
        # Load account from private key
        if settings.private_key:
            self.account = self.w3.eth.account.from_key(settings.private_key)
        else:
            self.account = None
            
        # Contract instances
        self.contracts = {}
        
        # Initialize core protocol contracts
        self._init_contracts()
        
    def _init_contracts(self):
        """Load ABIs and register core contracts from config"""
        from pathlib import Path
        
        abi_dir = Path(__file__).parent.parent / "contracts" / "abi"
        
        def _load_abi(filename: str):
            filepath = abi_dir / filename
            if filepath.exists():
                with open(filepath, "r") as f:
                    return json.load(f)
            return []
            
        if settings.lending_pool_address:
            self.load_contract("LendingPool", settings.lending_pool_address, _load_abi("LendingPool.json"))
            
        if settings.credit_registry_address:
            self.load_contract("CreditRegistry", settings.credit_registry_address, _load_abi("CreditRegistry.json"))
            
        if settings.collateral_vault_address:
            self.load_contract("CollateralVault", settings.collateral_vault_address, _load_abi("CollateralVault.json"))
            
        if settings.palladium_address:
            self.load_contract("TokenA", settings.palladium_address, _load_abi("SimToken.json"))
            
        if settings.badassium_address:
            self.load_contract("TokenB", settings.badassium_address, _load_abi("SimToken.json"))
        
    def is_connected(self) -> bool:
        """Check if connected to blockchain"""
        return self.w3.is_connected()
    
    def get_block_number(self) -> int:
        """Get current block number"""
        return self.w3.eth.block_number
    
    def get_balance(self, address: str) -> float:
        """Get ETH balance of address in ETH"""
        balance_wei = self.w3.eth.get_balance(address)
        return self.w3.from_wei(balance_wei, 'ether')
    
    def load_contract(self, contract_name: str, address: str, abi: list):
        """Load a smart contract"""
        self.contracts[contract_name] = self.w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=abi
        )
        return self.contracts[contract_name]
    
    def call_contract_function(
        self, 
        contract_name: str, 
        function_name: str, 
        *args
    ) -> Any:
        """Call a read-only contract function"""
        if contract_name not in self.contracts:
            raise ValueError(f"Contract {contract_name} not loaded")
        
        contract = self.contracts[contract_name]
        function = getattr(contract.functions, function_name)
        return function(*args).call()
    
    def send_transaction(
        self,
        contract_name: str,
        function_name: str,
        *args,
        value: int = 0
    ) -> str:
        """Send a transaction to a contract function"""
        if not self.account:
            raise ValueError("No account configured")
        
        if contract_name not in self.contracts:
            raise ValueError(f"Contract {contract_name} not loaded")
        
        contract = self.contracts[contract_name]
        function = getattr(contract.functions, function_name)
        
        with _TX_LOCK:
            nonce = _next_nonce(self.w3, self.account.address)
            # Build transaction
            transaction = function(*args).build_transaction({
                'from': self.account.address,
                'nonce': nonce,
                'gas': 2000000,
                'gasPrice': self.w3.eth.gas_price,
                'value': value
            })

            # Sign transaction
            signed_txn = self.w3.eth.account.sign_transaction(
                transaction,
                private_key=self.account.key
            )

            # Send transaction (handle both old and new web3.py versions)
            raw_tx = getattr(signed_txn, 'rawTransaction', None) or getattr(signed_txn, 'raw_transaction', None)
            if raw_tx is None:
                raise ValueError("Could not extract raw transaction from signed transaction")
            tx_hash = self.w3.eth.send_raw_transaction(raw_tx)
            _last_nonce[self.account.address] = (nonce, time.monotonic())

        # Wait for receipt (outside the lock so other txs aren't blocked)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        
        return Web3.to_hex(receipt['transactionHash'])  # always 0x-prefixed
    
    def send_raw_transaction_dict(self, transaction_dict: Dict) -> str:
        """
        Sign and send a pre-built transaction dictionary.
        Returns transaction hash.
        """
        if not self.account:
            raise ValueError("No account configured")
        
        with _TX_LOCK:
            # Re-assign the nonce under the lock (caller-supplied nonce may be stale)
            nonce = _next_nonce(self.w3, self.account.address)
            transaction_dict = {**transaction_dict, 'nonce': nonce}

            # Sign the transaction
            signed_txn = self.w3.eth.account.sign_transaction(
                transaction_dict,
                private_key=self.account.key
            )

            # Send the raw transaction (handle both old and new web3.py versions)
            raw_tx = getattr(signed_txn, 'rawTransaction', None) or getattr(signed_txn, 'raw_transaction', None)
            if raw_tx is None:
                raise ValueError("Could not extract raw transaction from signed transaction")
            tx_hash = self.w3.eth.send_raw_transaction(raw_tx)
            _last_nonce[self.account.address] = (nonce, time.monotonic())

        # Wait for receipt (outside the lock)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        
        return Web3.to_hex(receipt['transactionHash'])  # always 0x-prefixed
    
    def get_transaction_receipt(self, tx_hash: str) -> Dict:
        """Get transaction receipt"""
        return self.w3.eth.get_transaction_receipt(tx_hash)
    
    def listen_for_events(
        self,
        contract_name: str,
        event_name: str,
        from_block: int = 'latest'
    ):
        """Listen for contract events"""
        if contract_name not in self.contracts:
            raise ValueError(f"Contract {contract_name} not loaded")
        
        contract = self.contracts[contract_name]
        event = getattr(contract.events, event_name)
        
        return event.create_filter(fromBlock=from_block)


    def sync_credit_score_onchain(self, wallet: str, score) -> Optional[str]:
        """
        Push a borrower's DB credit score to CreditRegistry.updateScore (server wallet has ORACLE_ROLE).
        Skips invalid wallets and unchanged scores. Never raises; returns tx hash or None.
        """
        try:
            if not wallet or score is None or not Web3.is_address(wallet):
                return None
            if "CreditRegistry" not in self.contracts or not self.account:
                return None
            wallet_cs = Web3.to_checksum_address(wallet)
            score = int(score)
            if score < 0:
                return None
            current = int(self.call_contract_function("CreditRegistry", "creditScores", wallet_cs))
            if current == score:
                return None
            tx_hash = self.send_transaction("CreditRegistry", "updateScore", wallet_cs, score)
            print(f"[credit-sync] {wallet_cs}: {current} -> {score} tx={tx_hash}")
            return tx_hash
        except Exception as e:
            print(f"[credit-sync] failed for {wallet}: {e}")
            return None


# Global blockchain service instance
blockchain_service = BlockchainService()


def schedule_credit_score_sync(wallet: str, score) -> None:
    """Fire-and-forget on-chain credit score sync (runs in a daemon thread, never blocks the request)."""
    try:
        threading.Thread(
            target=blockchain_service.sync_credit_score_onchain,
            args=(wallet, score),
            daemon=True,
        ).start()
    except Exception as e:
        print(f"[credit-sync] could not schedule sync for {wallet}: {e}")
