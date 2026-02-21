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
from typing import Dict, Any
import json


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
            
        # Contract instances (will be initialized when ABIs are loaded)
        self.contracts = {}
        
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
        
        # Build transaction
        transaction = function(*args).build_transaction({
            'from': self.account.address,
            'nonce': self.w3.eth.get_transaction_count(self.account.address),
            'gas': 2000000,
            'gasPrice': self.w3.eth.gas_price,
            'value': value
        })
        
        # Sign transaction
        signed_txn = self.w3.eth.account.sign_transaction(
            transaction, 
            private_key=self.account.key
        )
        
        # Send transaction
        tx_hash = self.w3.eth.send_raw_transaction(signed_txn.raw_transaction)
        
        # Wait for receipt
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        
        return receipt['transactionHash'].hex()
    
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


# Global blockchain service instance
blockchain_service = BlockchainService()
