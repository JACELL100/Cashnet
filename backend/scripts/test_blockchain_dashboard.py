"""
Test Script: Demonstrate Blockchain Integration Dashboard
Shows what users will see with simulation-only mode (default)
"""

import requests
import json
import time

API_URL = "http://localhost:8000"

def test_blockchain_dashboard():
    print("=" * 70)
    print("BLOCKCHAIN INTEGRATION DEMO - Simulation-Only Mode")
    print("=" * 70)
    print()
    
    # 1. Start a simulation
    print("1. Starting simulation...")
    response = requests.post(f"{API_URL}/api/simulation/start", json={
        "max_steps": 50,
        "tick_delay": 0.1
    })
    print(f"   Status: {response.json()}")
    print()
    
    # Wait for some transactions
    time.sleep(10)
    
    # 2. Check blockchain stats
    print("2. Fetching blockchain stats...")
    response = requests.get(f"{API_URL}/blockchain/stats")
    stats = response.json()
    print(f"   Connected to Sepolia: {stats.get('connected')}")
    print(f"   Current Block: {stats.get('current_block')}")
    print(f"   Total Transactions: {stats.get('total_txs')}")
    print(f"   On-Chain TXs: {stats.get('on_chain_txs')} (real Sepolia)")
    print(f"   Simulated TXs: {stats.get('simulated_txs')} (in-memory)")
    print(f"   Real TXs Enabled: {stats.get('real_txs_enabled')}")
    print()
    
    # 3. Get token information
    print("3. Token contracts loaded:")
    response = requests.get(f"{API_URL}/blockchain/tokens/info")
    tokens = response.json().get('tokens', {})
    for symbol, info in tokens.items():
        print(f"   {symbol}:")
        print(f"     Address: {info['address']}")
        print(f"     Decimals: {info['decimals']}")
    print()
    
    # 4. Get recent transactions
    print("4. Recent transactions (first 5):")
    response = requests.get(f"{API_URL}/blockchain/transactions?limit=5")
    txs = response.json().get('transactions', [])
    
    for i, tx in enumerate(txs, 1):
        print(f"\n   Transaction #{i}:")
        print(f"     TX Hash: {tx['tx_hash']}")
        print(f"     Contract: {tx['contract']}")
        print(f"     Function: {tx['function']}")
        print(f"     Status: {tx['status']}")
        print(f"     Block: #{tx['block_number']}")
        print(f"     Gas Used: {tx['gas_used']:,}")
        
        # Show swap details if available
        if 'token_in' in tx['args']:
            print(f"     Swap: {tx['args']['amount_in']} {tx['args']['token_in']} → "
                  f"{tx['args']['amount_out']} {tx['args']['token_out']}")
            print(f"     Price Impact: {tx['args']['price_impact_pct']:.2f}%")
            print(f"     On Sepolia: {'✅ YES' if tx['args'].get('on_chain') else '❌ NO (simulated)'}")
    
    print()
    print("=" * 70)
    print("DASHBOARD VIEW: http://localhost:3000/admin/blockchain")
    print("=" * 70)
    print()
    print("What you'll see:")
    print("  ✅ All transactions listed with TX hashes")
    print("  ✅ Transaction details (swap amounts, contracts, gas)")
    print("  ✅ Network status (connected to Sepolia)")
    print("  ✅ Token contract addresses")
    print()
    print("What you WON'T see on Etherscan:")
    print("  ❌ These transactions (they're simulated, not on-chain)")
    print()
    print("Why this is PERFECT for demonstrations:")
    print("  ⚡ Instant execution (100+ TPS)")
    print("  💰 Zero cost (no gas fees)")
    print("  📊 Full transaction history in dashboard")
    print("  🎯 Perfect for attack scenarios with 100s of TXs")
    print()

if __name__ == "__main__":
    try:
        test_blockchain_dashboard()
    except Exception as e:
        print(f"Error: {e}")
        print("\nMake sure:")
        print("  1. Backend is running: python -m uvicorn main:app --reload")
        print("  2. Simulation is started via API or frontend")
