"""
Test Real On-Chain Token Swap with Palladium & Badassium
=========================================================
Verifies that we can execute real transactions using deployed tokens.
"""

import asyncio
import os
import sys
from dotenv import load_dotenv

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from blockchain_service import BlockchainService
from agents.blockchain_integrator import BlockchainIntegrator


async def main():
    print("\n" + "="*80)
    print("TESTING REAL BLOCKCHAIN SWAPS")
    print("="*80)
    
    # Load environment
    load_dotenv("../.env.local")
    
    # Initialize blockchain
    integrator = BlockchainIntegrator()
    success = await integrator.initialize()
    
    if not success:
        print("❌ Failed to initialize blockchain integrator")
        return
    
    # Check connection
    blockchain = integrator.blockchain
    if not blockchain.is_connected():
        print("❌ Not connected to blockchain")
        return
    
    print(f"✅ Connected to Sepolia (Block: {blockchain.get_block_number()})")
    
    if not blockchain.account:
        print("❌ No account loaded from private key")
        return
    
    wallet = blockchain.account.address
    print(f"✅ Wallet: {wallet}")
    
    # Check ETH balance
    eth_balance = blockchain.get_balance(wallet)
    print(f"💰 ETH Balance: {eth_balance:.4f} ETH")
    
    if eth_balance < 0.01:
        print("⚠️  Warning: Low ETH balance for gas fees")
    
    # Check token balances
    print("\n📊 Token Balances:")
    palladium_balance = await integrator.get_token_balance("PALLADIUM", wallet)
    badassium_balance = await integrator.get_token_balance("BADASSIUM", wallet)
    
    print(f"   PALLADIUM: {palladium_balance:,.2f}")
    print(f"   BADASSIUM: {badassium_balance:,.2f}")
    
    # Check if blockchain TXs are enabled
    print(f"\n🔧 Blockchain TXs Enabled: {integrator.enable_real_txs}")
    
    if not integrator.enable_real_txs:
        print("⚠️  Set ENABLE_BLOCKCHAIN_TXS=true in .env.local to enable real swaps")
        return
    
    if palladium_balance < 10:
        print("⚠️  Insufficient PALLADIUM tokens for swap test")
        print("     Please ensure your wallet has PALLADIUM tokens at:")
        print(f"     {integrator.token_contracts.get('PALLADIUM')}")
        return
    
    # Test a small swap
    print("\n" + "="*80)
    print("EXECUTING TEST SWAP: 10 PALLADIUM → BADASSIUM")
    print("="*80)
    
    tx_hash = await integrator.execute_real_swap(
        agent_wallet=wallet,
        token_in="PALLADIUM",
        token_out="BADASSIUM",
        amount_in=10.0
    )
    
    if tx_hash:
        print(f"\n✅ SWAP SUCCESSFUL!")
        print(f"   Transaction: https://sepolia.etherscan.io/tx/{tx_hash}")
        print("\n   Check the transaction on Etherscan to verify it executed correctly.")
    else:
        print("\n❌ SWAP FAILED - Check error messages above")
    
    print("\n" + "="*80)


if __name__ == "__main__":
    asyncio.run(main())
