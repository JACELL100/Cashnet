"""
Execute Demo Attack with REAL On-Chain Swaps
=============================================
This script:
1. Starts the simulation
2. Executes the 5-phase demo attack
3. Performs REAL on-chain swaps with your Palladium & Badassium tokens
4. Shows Etherscan links for each transaction
"""

import asyncio
import sys
from agents.simulation_runner import simulation_runner
from agents.demo_attack_scenario import run_protocol_stress_test_demo


async def main():
    print("\n" + "="*80)
    print("DEMO ATTACK - REAL ON-CHAIN TRANSACTIONS")
    print("="*80)
    print("Using your deployed tokens:")
    print("  PALLADIUM: 0x983A613d5f224459D2919e0d9E9e77C72E032042")
    print("  BADASSIUM: 0x2960e22Ed3256E2bAfF233F5d03A20f597f14e07")
    print("  Network: Sepolia Testnet")
    print("="*80)
    
    # Step 1: Start simulation (this initializes blockchain integrator)
    print("\n[1/3] Starting simulation...")
    await simulation_runner.start(max_steps=500, tick_delay=0.1)
    await asyncio.sleep(3)  # Let simulation warm up
    
    # Step 2: Check blockchain integrator
    print("[2/3] Checking blockchain integrator...")
    if simulation_runner.blockchain_integrator:
        print(f"  ✅ Blockchain integrator ready")
        print(f"  ✅ Real TXs enabled: {simulation_runner.blockchain_integrator.enable_real_txs}")
        print(f"  ✅ Wallet: {simulation_runner.blockchain_integrator.blockchain.account.address if simulation_runner.blockchain_integrator.blockchain.account else 'N/A'}")
    else:
        print("  ⚠️  Blockchain integrator not available")
        print("  Transactions will be simulated only")
    
    # Step 3: Execute demo attack
    print("\n[3/3] Executing demo attack...")
    print("="*80)
    print("This will execute:")
    print("  - ~7 REAL on-chain swaps (visible on Etherscan)")
    print("  - ~123 simulated transactions (flash loans, liquidations, MEV)")
    print("  - Total: ~130 transactions")
    print("  - Duration: 3-5 minutes (waiting for blockchain confirmations)")
    print("="*80)
    input("\nPress ENTER to start the attack... ")
    
    # Execute attack
    results = await run_protocol_stress_test_demo(
        simulation_runner.pool,
        simulation_runner.lending,
        simulation_runner.blockchain_integrator
    )
    
    # Display results
    print("\n" + "="*80)
    print("DEMO ATTACK COMPLETE!")
    print("="*80)
    print(f"Total Transactions: {results['total_transactions']}")
    print(f"Attack Profit: ${results['total_attack_profit']:,.2f}")
    print(f"Protocol Damage: ${results['total_protocol_damage']:,.2f}")
    
    # Count on-chain transactions
    on_chain_txs = [tx for tx in results.get('transactions', []) if tx.get('on_chain')]
    print(f"\nOn-Chain Transactions: {len(on_chain_txs)}")
    
    if on_chain_txs:
        print("\n🔗 View your on-chain swaps on Etherscan:")
        for i, tx in enumerate(on_chain_txs, 1):
            if tx.get('blockchain_tx'):
                print(f"  {i}. https://sepolia.etherscan.io/tx/{tx['blockchain_tx']}")
    else:
        print("\n⚠️  No on-chain transactions executed")
        print("Check that ENABLE_BLOCKCHAIN_TXS=true in .env.local")
    
    print("\n📊 View all transactions:")
    print(f"  Wallet: https://sepolia.etherscan.io/address/{simulation_runner.blockchain_integrator.blockchain.account.address if simulation_runner.blockchain_integrator and simulation_runner.blockchain_integrator.blockchain.account else 'N/A'}")
    print(f"  PALLADIUM: https://sepolia.etherscan.io/token/0x983A613d5f224459D2919e0d9E9e77C72E032042")
    print(f"  BADASSIUM: https://sepolia.etherscan.io/token/0x2960e22Ed3256E2bAfF233F5d03A20f597f14e07")
    print("="*80)
    
    # Stop simulation
    await simulation_runner.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nAttack cancelled by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
