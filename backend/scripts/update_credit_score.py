"""
Update credit score in CreditRegistry contract on Sepolia
Usage: python update_credit_score.py <wallet_address> <score>
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
CREDIT_REGISTRY_ADDRESS = os.getenv("CREDIT_REGISTRY_ADDRESS")
ACCESS_CONTROL_ADDRESS = os.getenv("ACCESS_CONTROL_ADDRESS")

# CreditRegistry ABI
CREDIT_REGISTRY_ABI = [
    {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"creditScores","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"uint256","name":"score","type":"uint256"}],"name":"updateScore","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"getMaxLTV","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
]

# AccessControl ABI
ACCESS_CONTROL_ABI = [
    {"inputs":[],"name":"ORACLE_ROLE","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"bytes32","name":"role","type":"bytes32"},{"internalType":"address","name":"account","type":"address"}],"name":"grantRole","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"bytes32","name":"role","type":"bytes32"},{"internalType":"address","name":"account","type":"address"}],"name":"hasRole","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"}
]

def update_credit_score(wallet_address: str, score: int):
    """Update credit score in CreditRegistry contract"""
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
        
        # Load contracts
        access_control = w3.eth.contract(
            address=Web3.to_checksum_address(ACCESS_CONTROL_ADDRESS),
            abi=ACCESS_CONTROL_ABI
        )
        
        credit_registry = w3.eth.contract(
            address=Web3.to_checksum_address(CREDIT_REGISTRY_ADDRESS),
            abi=CREDIT_REGISTRY_ABI
        )
        
        # Get ORACLE_ROLE hash
        oracle_role = access_control.functions.ORACLE_ROLE().call()
        print(f"\n🔑 ORACLE_ROLE: {oracle_role.hex()}")
        
        # Check if admin has ORACLE_ROLE
        has_oracle_role = access_control.functions.hasRole(oracle_role, account.address).call()
        
        if not has_oracle_role:
            print(f"⚠️  Admin doesn't have ORACLE_ROLE. Granting it...")
            nonce = w3.eth.get_transaction_count(account.address, "pending")
            
            gas_price = w3.eth.gas_price
            max_priority_fee = w3.to_wei(1, "gwei")
            max_fee = max(gas_price * 2, max_priority_fee + w3.to_wei(1, "gwei"))
            
            tx = access_control.functions.grantRole(oracle_role, account.address).build_transaction({
                "from": account.address,
                "nonce": nonce,
                "gas": 100_000,
                "maxFeePerGas": max_fee,
                "maxPriorityFeePerGas": max_priority_fee,
                "chainId": w3.eth.chain_id
            })
            
            signed_tx = account.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            print(f"📤 Granting ORACLE_ROLE: {tx_hash.hex()}")
            w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            print(f"✅ ORACLE_ROLE granted")
        else:
            print(f"✅ Admin already has ORACLE_ROLE")
        
        # Normalize wallet address
        wallet_address = Web3.to_checksum_address(wallet_address)
        print(f"\n👤 Target wallet: {wallet_address}")
        print(f"📊 New credit score: {score}")
        
        # Check current score
        current_score = credit_registry.functions.creditScores(wallet_address).call()
        current_ltv = credit_registry.functions.getMaxLTV(wallet_address).call()
        print(f"\n📈 Current on-chain score: {current_score}")
        print(f"   Current max LTV: {current_ltv}%")
        
        if current_score == score:
            print(f"\n✅ Credit score already set to {score}")
            return True
        
        print(f"\n🔄 Updating credit score to {score}...")
        
        # Build transaction
        nonce = w3.eth.get_transaction_count(account.address, "pending")
        
        gas_price = w3.eth.gas_price
        max_priority_fee = w3.to_wei(1, "gwei")
        max_fee = max(gas_price * 2, max_priority_fee + w3.to_wei(1, "gwei"))
        
        tx = credit_registry.functions.updateScore(wallet_address, score).build_transaction({
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
            # Verify updated score
            new_score = credit_registry.functions.creditScores(wallet_address).call()
            new_ltv = credit_registry.functions.getMaxLTV(wallet_address).call()
            
            print(f"\n✅ SUCCESS! Credit score updated to {new_score}")
            print(f"   New max LTV: {new_ltv}%")
            print(f"   Gas used: {receipt.gasUsed:,}")
            print(f"   Block: {receipt.blockNumber}")
            
            # Show borrowing capacity
            if new_ltv > 0:
                print(f"\n💰 You can now borrow up to {new_ltv}% of your collateral value!")
            else:
                print(f"\n⚠️  Score too low to borrow. Minimum 400 required.")
            
            return True
        else:
            print(f"\n❌ Transaction failed!")
            print(f"   Receipt: {receipt}")
            return False
            
    except Exception as e:
        print(f"❌ Error updating credit score: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python update_credit_score.py <wallet_address> <score>")
        print("Example: python update_credit_score.py 0xceB0045BFD429eC942aDEc9e84B1F0f2c52C29AD 800")
        print("\nCredit Score → Max LTV:")
        print("  800+ → 80% (Excellent)")
        print("  600-799 → 60% (Good)")
        print("  400-599 → 40% (Fair)")
        print("  <400 → 0% (Cannot borrow)")
        sys.exit(1)
    
    wallet = sys.argv[1]
    score = int(sys.argv[2])
    
    if score < 300 or score > 850:
        print("❌ Credit score must be between 300 and 850")
        sys.exit(1)
    
    success = update_credit_score(wallet, score)
    sys.exit(0 if success else 1)
