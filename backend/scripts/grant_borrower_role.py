"""
Script to grant BORROWER_ROLE to a wallet address via AccessControl contract
Usage: python grant_borrower_role.py <wallet_address>
"""
import sys
import os
from pathlib import Path
from web3 import Web3
from dotenv import load_dotenv

# Load environment
env_path = Path(__file__).parent.parent.parent / ".env.local"
load_dotenv(env_path)

RPC_URL = os.getenv("SEPOLIA_RPC_URL")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
ACCESS_CONTROL_ADDRESS = os.getenv("ACCESS_CONTROL_ADDRESS")

# AccessControl ABI (minimal - just what we need)
ACCESS_CONTROL_ABI = [
    {"inputs":[],"name":"BORROWER_ROLE","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"bytes32","name":"role","type":"bytes32"},{"internalType":"address","name":"account","type":"address"}],"name":"grantRole","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"bytes32","name":"role","type":"bytes32"},{"internalType":"address","name":"account","type":"address"}],"name":"hasRole","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"}
]

def grant_borrower_role(wallet_address: str):
    """Grant BORROWER_ROLE to a wallet address"""
    try:
        # Connect to Sepolia
        w3 = Web3(Web3.HTTPProvider(RPC_URL))
        
        if not w3.is_connected():
            print("❌ Failed to connect to Sepolia")
            return False
        
        print(f"✅ Connected to Sepolia (Chain ID: {w3.eth.chain_id})")
        
        # Setup account
        account = w3.eth.account.from_key(PRIVATE_KEY)
        print(f"📝 Admin account: {account.address}")
        
        # Load contract
        access_control = w3.eth.contract(
            address=Web3.to_checksum_address(ACCESS_CONTROL_ADDRESS),
            abi=ACCESS_CONTROL_ABI
        )
        
        # Get BORROWER_ROLE hash
        borrower_role = access_control.functions.BORROWER_ROLE().call()
        print(f"\n🔑 BORROWER_ROLE: {borrower_role.hex()}")
        
        # Normalize wallet address
        wallet_address = Web3.to_checksum_address(wallet_address)
        print(f"👤 Target wallet: {wallet_address}")
        
        # Check if already has role
        has_role = access_control.functions.hasRole(borrower_role, wallet_address).call()
        
        if has_role:
            print(f"\n✅ {wallet_address} already has BORROWER_ROLE!")
            return True
        
        print(f"\n🔄 Granting BORROWER_ROLE to {wallet_address}...")
        
        # Build transaction
        nonce = w3.eth.get_transaction_count(account.address, "pending")
        
        gas_price = w3.eth.gas_price
        max_priority_fee = w3.to_wei(1, "gwei")
        max_fee = max(gas_price * 2, max_priority_fee + w3.to_wei(1, "gwei"))
        
        tx = access_control.functions.grantRole(borrower_role, wallet_address).build_transaction({
            "from": account.address,
            "nonce": nonce,
            "gas": 100_000,
            "maxFeePerGas": max_fee,
            "maxPriorityFeePerGas": max_priority_fee,
            "chainId": w3.eth.chain_id
        })
        
        # Sign and send
        signed_tx = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        print(f"📤 Transaction sent: {tx_hash.hex()}")
        print(f"🔗 Etherscan: https://sepolia.etherscan.io/tx/{tx_hash.hex()}")
        
        # Wait for receipt
        print("⏳ Waiting for confirmation...")
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        
        if receipt.status == 1:
            print(f"\n✅ SUCCESS! BORROWER_ROLE granted to {wallet_address}")
            print(f"   Gas used: {receipt.gasUsed:,}")
            print(f"   Block: {receipt.blockNumber}")
            return True
        else:
            print(f"\n❌ Transaction failed!")
            print(f"   Receipt: {receipt}")
            return False
            
    except Exception as e:
        print(f"❌ Error granting BORROWER_ROLE: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python grant_borrower_role.py <wallet_address>")
        print("Example: python grant_borrower_role.py 0xceB0045BFD429eC942aDEc9e84B1F0f2c52C29AD")
        sys.exit(1)
    
    wallet_address = sys.argv[1]
    success = grant_borrower_role(wallet_address)
    sys.exit(0 if success else 1)
