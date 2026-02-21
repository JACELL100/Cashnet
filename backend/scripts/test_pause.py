"""
Test script to check if the system is paused and optionally pause/unpause it
"""
import sys
import os
from pathlib import Path

# Add parent directory to path so we can import from backend
sys.path.insert(0, str(Path(__file__).parent.parent))

from web3 import Web3
try:
    from web3.middleware import ExtraDataToPOAMiddleware
    geth_poa_middleware = ExtraDataToPOAMiddleware
except ImportError:
    from web3.middleware import geth_poa_middleware
import json
from dotenv import load_dotenv

# Load environment variables - try both .env.local and .env
env_local = Path(__file__).parent.parent.parent / '.env.local'
env_file = Path(__file__).parent.parent.parent / '.env'

if env_local.exists():
    load_dotenv(env_local)
    print(f"📄 Loaded {env_local}")
elif env_file.exists():
    load_dotenv(env_file)
    print(f"📄 Loaded {env_file}")

def main():
    print("🔍 Testing System Pause Status\n")
    print("=" * 60)
    
    # Connect to blockchain - check both variable names
    rpc_url = os.getenv('NEXT_PUBLIC_SEPOLIA_RPC_URL') or os.getenv('SEPOLIA_RPC_URL')
    if not rpc_url:
        print("❌ Error: SEPOLIA_RPC_URL not found in environment")
        print("   Looking for: SEPOLIA_RPC_URL or NEXT_PUBLIC_SEPOLIA_RPC_URL")
        sys.exit(1)
    
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    
    # Check connection
    if not w3.is_connected():
        print("❌ Error: Cannot connect to blockchain")
        sys.exit(1)
    
    print(f"✅ Connected to blockchain")
    print(f"   Block number: {w3.eth.block_number}")
    
    # Load AccessControl contract
    access_control_address = os.getenv('ACCESS_CONTROL_ADDRESS')
    if not access_control_address:
        print("❌ Error: ACCESS_CONTROL_ADDRESS not found in environment")
        sys.exit(1)
    
    abi_path = Path(__file__).parent.parent.parent / "contracts" / "abi" / "AccessControl.json"
    with open(abi_path) as f:
        abi = json.load(f)
    
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(access_control_address),
        abi=abi
    )
    
    print(f"✅ AccessControl contract loaded")
    print(f"   Address: {access_control_address}\n")
    
    # Check pause status
    try:
        is_paused = contract.functions.paused().call()
        print("=" * 60)
        print(f"📊 CURRENT STATUS:")
        print("=" * 60)
        if is_paused:
            print("🔴 System is PAUSED")
            print("   All contract operations are frozen")
        else:
            print("🟢 System is ACTIVE")
            print("   All contract operations are running normally")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ Error checking pause status: {e}")
        sys.exit(1)
    
    # Show pause/unpause instructions
    print("\n📝 To pause/unpause the system:")
    print("   1. Make sure backend server is running (uvicorn)")
    print("   2. Login as admin to get JWT token")
    print("   3. Use these endpoints:")
    print("      POST http://localhost:8000/system/pause")
    print("      POST http://localhost:8000/system/unpause")
    print("\n   Or use the Admin UI at http://localhost:3000/admin")

if __name__ == "__main__":
    main()
