# Blockchain Integration Guide 🔗

## Overview

The Rust-eze Simulation Lab now supports **real on-chain blockchain transactions** using your custom deployed **Palladium** and **Badassium** ERC20 tokens on Sepolia testnet!

### Features

✅ **Hybrid Architecture**: Simulation runs in-memory for speed (100+ trades/sec), optionally records to blockchain  
✅ **Custom Token Support**: Uses your Palladium & Badassium tokens for real swaps  
✅ **Transaction Recording**: Logs swaps, liquidations, borrows, and scenario events on-chain  
✅ **Real-time Monitoring**: Frontend dashboard shows live blockchain activity  
✅ **Etherscan Integration**: Direct links to view transactions on Sepolia Etherscan  

---

## Architecture

### Current Implementation (Default: OFF)

**Mode**: Simulation-only (Fast & Free)
- Agents execute 100+ trades per second in-memory
- Blockchain is used only for critical controls (pause/unpause)
- Transaction records are stored in-memory for API access
- **Cost**: $0 (no gas fees)

### Optional Mode (Enable with Environment Variable)

**Mode**: Hybrid Blockchain Recording
- High-value trades (>1000 tokens) recorded on Sepolia testnet
- Uses Palladium & Badassium ERC20 tokens
- Real on-chain swaps via LiquidityPool contract
- Transaction hashes visible in frontend
- **Cost**: ~$0.50-$2 per simulation (testnet ETH)

---

## Configuration

### 1. Enable Blockchain Transactions

Add to your `.env.local`:

```bash
# Enable real on-chain transaction execution
ENABLE_BLOCKCHAIN_TXS=true

# Token contract addresses (already configured)
PALLADIUM_ADDRESS=0x983A613d5f224459D2919e0d9E9e77C72E032042
BADASSIUM_ADDRESS=0x2960e22Ed3256E2bAfF233F5d03A20f597f14e07
```

### 2. Ensure You Have Testnet ETH

Your deployer wallet needs Sepolia ETH for gas fees:
- Get free Sepolia ETH: https://sepoliafaucet.com/
- Expected cost: ~300,000 gas per swap = ~0.003 ETH per transaction

### 3. Restart Backend

```bash
cd backend
python -m uvicorn main:app --reload
```

Look for this log message:
```
✅ Blockchain integration ready (Real TXs: True)
```

---

## API Endpoints

### Get Blockchain Stats

```bash
GET /blockchain/stats
```

Returns:
```json
{
  "success": true,
  "connected": true,
  "current_block": 12345678,
  "total_txs": 150,
  "on_chain_txs": 12,
  "simulated_txs": 138,
  "real_txs_enabled": true,
  "token_contracts": {
    "PALLADIUM": "0x983A613d5f224459D2919e0d9E9e77C72E032042",
    "BADASSIUM": "0x2960e22Ed3256E2bAfF233F5d03A20f597f14e07"
  }
}
```

### Get Transaction History

```bash
GET /blockchain/transactions?limit=50
```

Returns recent blockchain transactions including:
- Token swaps (Palladium ↔ Badassium)
- Liquidations
- Borrowing events
- Scenario events

### Get Token Balance

```bash
GET /blockchain/tokens/balance/0xYourAddress?token=PALLADIUM
```

### Get Network Info

```bash
GET /blockchain/network
```

Returns contract addresses and Sepolia network status.

---

## Frontend Dashboard

Navigate to: **`/admin/blockchain`**

Features:
- 📊 Network status (connected, current block)
- 💰 Total transactions (on-chain vs simulated)
- ⛽ Gas usage statistics
- 🪙 Token contract information
- 📜 Real-time transaction feed
- 🔗 Direct Etherscan links for on-chain TXs

### Auto-Refresh

Dashboard auto-refreshes every 5 seconds when enabled (toggle button in header).

---

## How It Works

### 1. Simulation Start

When simulation starts:
```python
blockchain_integrator = await get_blockchain_integrator()
# Loads Palladium & Badassium token contracts
# Connects to Sepolia via Alchemy RPC
```

### 2. Agent Executes Trade

Agent calls:
```python
action = TradeAction(
    agent_id="Retail_1",
    action_type="swap",
    metadata={
        "token_in": "PALLADIUM",
        "amount_in": 5000,
        "amount_out": 4950,
        "price_impact": 0.8
    }
)
```

### 3. Blockchain Recording (If Enabled)

For high-value trades (>1000 tokens):
```python
if blockchain_integrator and amount > 1000:
    await blockchain_integrator.record_swap(
        agent_id="Retail_1",
        token_in="PALLADIUM",
        amount_in=5000,
        amount_out=4950,
        price_impact=0.8,
        execute_on_chain=True  # ← Triggers real Sepolia swap!
    )
```

### 4. On-Chain Execution

Steps:
1. **Approve**: Token contract approves LiquidityPool
2. **Swap**: LiquidityPool.swap(PALLADIUM, BADASSIUM, 5000, minOut)
3. **Wait**: Transaction mined on Sepolia (~12 seconds)
4. **Record**: TX hash stored and displayed in frontend

### 5. Frontend Display

Transaction appears in dashboard:
```
🟢 LiquidityPool · swap · success · ON-CHAIN
Block #12345678 | 300k gas
0x1234...5678 [Etherscan →]
Swap: 5000 PALLADIUM → 4950 BADASSIUM (0.8% impact)
```

---

## Code Structure

### Backend

- **`backend/agents/blockchain_integrator.py`**: Core integration logic
  - `execute_real_swap()`: On-chain swap execution
  - `record_swap()`: Transaction recording
  - `get_token_balance()`: Token balance queries

- **`backend/agents/simulation_runner.py`**: Integration point
  - Initializes blockchain_integrator on start
  - Records high-value swaps and liquidations

- **`backend/routers/blockchain.py`**: API endpoints
  - GET /blockchain/stats
  - GET /blockchain/transactions
  - GET /blockchain/tokens/info

### Frontend

- **`frontend/app/admin/blockchain/page.tsx`**: Dashboard
  - Real-time transaction feed
  - Token information cards
  - Network status monitoring

---

## Performance Comparison

| Mode | Trades/Second | Cost per Simulation | Use Case |
|------|---------------|---------------------|----------|
| **Simulation-Only** (Default) | 100+ | $0 | Development, rapid testing |
| **Hybrid Recording** | 100+ (recording async) | $0.50-$2 | Demo, hackathon judges |
| **Full On-Chain** (Future) | 0.08 (12s/tx) | $50-$100 | Production audit trail |

---

## Cost Estimation

### Testnet (Sepolia)

With `ENABLE_BLOCKCHAIN_TXS=true`:
- Approval: ~50,000 gas = 0.0005 ETH
- Swap: ~300,000 gas = 0.003 ETH
- Total per swap: ~0.0035 ETH ($0.05 at $15/ETH)

200-step simulation with 20 on-chain swaps:
- Total: 20 × 0.0035 = 0.07 ETH ($1.05)

### Mainnet (Future)

Never use mainnet for simulations! Estimates:
- Same gas amounts but 50x higher gas price
- One swap: ~$2.50
- 200-step simulation: ~$50

---

## Troubleshooting

### "Blockchain integration ready (Real TXs: False)"

✅ **Expected behavior** - Blockchain recording is OFF by default.

To enable: Add `ENABLE_BLOCKCHAIN_TXS=true` to `.env.local`

### "Failed to record swap on blockchain"

Possible causes:
1. Insufficient Sepolia ETH for gas fees
2. Token approval expired
3. LiquidityPool contract not deployed
4. RPC connection timeout

Check logs for detailed error message.

### "Transaction not appearing on Etherscan"

- Wait 15-30 seconds for block confirmation
- Verify TX hash starts with `0x` and is 66 characters
- Check Sepolia network: https://sepolia.etherscan.io/

### No transactions showing in dashboard

1. Start a simulation: `/admin/agents` → Create Simulation
2. Wait for high-value trades (>1000 tokens)
3. Check `/blockchain/stats` for `on_chain_txs` count

---

## Future Enhancements

🚀 **Planned Features**:
- [ ] Batch transaction submission (reduce gas costs)
- [ ] Flash loan exploit recording on-chain
- [ ] Scenario outcome NFT minting
- [ ] Liquidity pool state snapshots
- [ ] Time-locked transaction execution
- [ ] Multi-sig admin controls

---

## Security Considerations

⚠️ **Important**:
- Never commit private keys to Git
- Use environment variables for sensitive data
- Testnet ETH has no real value but protect your keys
- Set reasonable gas limits to prevent drain attacks

---

## Demo Tips for Judges

1. **Start with simulation-only** (fast iterations)
2. **Enable blockchain recording** for final demo
3. **Show Etherscan link** to prove on-chain execution
4. **Highlight hybrid architecture** (speed + transparency)
5. **Explain cost optimization** (selective recording)

Blockchain integration demonstrates:
✅ Real Web3 integration (not just mockups)  
✅ Production-ready architecture  
✅ Cost-conscious design  
✅ Transparency & auditability  

---

## Support

Questions? Check:
- Backend logs: Look for `✅ Blockchain integration ready`
- Frontend console: Check for API errors
- Etherscan: Verify transaction status
- Docs: `/backend/scripts/README.md`

Happy building! 🚀
