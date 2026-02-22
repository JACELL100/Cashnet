# CashNet — DeFi Risk & Liquidity Simulation Platform

A full-stack DeFi simulation platform featuring AI-powered agents, on-chain smart contracts, real-time fraud detection, and multi-role dashboards for lending, liquidity, and market intelligence.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), Recharts, Three.js, Zustand, React Flow |
| **Backend** | FastAPI, SQLAlchemy, PostgreSQL, Web3.py, scikit-learn, Groq LLM (Llama 3.3 70B) |
| **Blockchain** | Solidity (OpenZeppelin), Sepolia Testnet, Wagmi, Viem, RainbowKit |
| **Auth** | Firebase Admin SDK, Google SSO, MetaMask (EIP-191 signature verification), JWT |
| **Mobile** | Flutter |

---

## Smart Contracts

| Contract | Purpose |
|---|---|
| **AccessControl** | RBAC (Admin, Lender, Borrower, Auditor, Oracle) + system-wide pause/unpause |
| **ERC20Token** | Mintable tokens — Palladium (PAL) & Badassium (BAD) |
| **IdentityRegistry** | On-chain user registration & admin-verified KYC |
| **CreditRegistry** | Oracle-updatable credit scores with tiered max LTV computation |
| **CollateralVault** | Holds ETH collateral; only LendingPool can lock/release |
| **LendingPool** | Deposit collateral → borrow tokens → repay → liquidate under-collateralized loans |
| **LiquidityPool** | Constant-product AMM (x·y=k) with LP tokens, add/remove liquidity, and swaps |

---

## AI/ML Simulation Agents

| Agent | Behavior |
|---|---|
| **RetailTrader** | Randomized small trades with emotional panic-sell logic |
| **WhaleAgent** | Massive trades (1–10% of reserves) causing slippage; rug-pull patterns |
| **ArbitrageBot** | Exploits price discrepancies between AMM and external oracle prices |
| **LiquidatorBot** | Monitors health factors and liquidates under-collateralized positions |
| **MEVBot** | Sandwich attacks — front-run + back-run victim swaps via simulated mempool |
| **AttackerAgent** | Flash-loan exploit simulation: borrow → crash price → cascade liquidations → profit |
| **FraudMonitor** | Real-time detection of 9+ threat types (sandwich, flash-loan, wash trading, pump-dump, etc.) |
| **MarketPredictor** | ML price prediction, regime detection, volatility forecast, portfolio optimization (scikit-learn) |
| **ThreatPredictor** | ML threat classification with time-window risk forecasts (1h/6h/24h) |
| **GroqAdvisor** | LLM-powered trade decisions & risk assessments via Groq API (Llama 3.3 70B) |

Agents react to **live market data** (BTC/ETH/SOL) from CoinDesk API.

---

## Key Features

### Liquidity Engine (In-Memory AMM)
- Constant-product market maker with configurable fees
- Slippage curves, liquidity depth charts, impermanent loss calculation
- Stress testing: mass withdrawal, flash swap, sustained drain scenarios

### Lending Protocol
- Credit-score-gated borrowing with on-chain LTV tiers
- ETH collateral deposits, token borrowing, repayment, and liquidation
- All operations execute as real Sepolia transactions

### AI-Powered Tools
- **Contract Analyzer** — Upload Solidity code → get vulnerability score, attack vectors, and improved code (Groq LLM)
- **Market Intelligence** — Live crypto/stock data, candlestick charts, AI investment recommendations
- **Threat Prediction** — ML-based future threat probability and severity forecasting

### Attack Scenarios & Simulation
- Multi-agent orchestrated simulation (all agent types running concurrently)
- Pre-built attack scenarios (flash-loan exploits, sandwich attacks, cascade liquidations)
- Real-time fraud monitoring with severity-leveled alerts and email notifications

### System Controls
- Admin emergency pause/unpause (on-chain via AccessControl)
- Structured system logging (levels, categories, sources)
- SMTP-based threat alert emails to admins (rate-limited)

---

## Dashboards

| Portal | Highlights |
|---|---|
| **Borrower** | Credit score, identity/KYC, market intelligence, contract analyzer, profile |
| **Admin** | Agent control, simulation management, threat monitoring, blockchain explorer, liquidity pools, stress testing, system pause |
| **Auditor** | Event log viewer, contract analyzer |
| **Lender** | Lending operations, pool management, yield tracking, borrower/loan management, credit assessment |

---

## Auth Flows

- **Admin / Auditor** — Google SSO → Firebase ID token → JWT
- **Borrower / Wallet User** — MetaMask signature (EIP-191 nonce challenge-response) → JWT

---

## Getting Started

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
pnpm install
pnpm dev
```

Configure `.env` with PostgreSQL, Sepolia RPC, Firebase credentials, and Groq API key.