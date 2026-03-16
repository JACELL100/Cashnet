import { Agent, ActivityFeedItem } from '@/store/agentStore';
import { BorrowerPosition } from '@/store/lendingStore';
import { CreditScore, ScoreFactor } from '@/store/creditStore';
import { ThreatScore, ThreatAlert } from '@/store/threatStore';

/* === AGENTS === */
export const generateAgents = (): Agent[] => [
  {
    id: 'agent-1',
    name: 'ArbiBot',
    type: 'arbitrage_bot',
    capital: 100000,
    current_value: 102500,
    pnl: 2500,
    win_rate: 0.73,
    active: true,
    risk: 'medium',
    speed: 'fast',
    state: 'idle',
    stats: { trades_count: 50, total_volume: 1000000, pnl: 2500, win_rate: 0.73, alerts_triggered: 5 },
  },
  {
    id: 'agent-2',
    name: 'LiquidatorX',
    type: 'liquidator_bot',
    capital: 250000,
    current_value: 248750,
    pnl: -1250,
    win_rate: 0.68,
    active: true,
    risk: 'high',
    speed: 'normal',
    state: 'idle',
    stats: { trades_count: 50, total_volume: 1000000, pnl: -1250, win_rate: 0.68, alerts_triggered: 5 },
  },
  {
    id: 'agent-3',
    name: 'MakerBot',
    type: 'retail_trader',
    capital: 500000,
    current_value: 515000,
    pnl: 15000,
    win_rate: 0.81,
    active: true,
    risk: 'low',
    speed: 'slow',
    state: 'idle',
    stats: { trades_count: 50, total_volume: 1000000, pnl: 15000, win_rate: 0.81, alerts_triggered: 5 },
  },
  {
    id: 'agent-4',
    name: 'TraderAlpha',
    type: 'retail_trader',
    capital: 300000,
    current_value: 285750,
    pnl: -14250,
    win_rate: 0.52,
    active: false,
    risk: 'high',
    speed: 'fast',
    state: 'idle',
    stats: { trades_count: 50, total_volume: 1000000, pnl: -14250, win_rate: 0.52, alerts_triggered: 5 },
  },
  {
    id: 'agent-5',
    name: 'OracleBot',
    type: 'whale',
    capital: 150000,
    current_value: 151500,
    pnl: 1500,
    win_rate: 0.95,
    active: true,
    risk: 'low',
    speed: 'normal',
    state: 'idle',
    stats: { trades_count: 50, total_volume: 1000000, pnl: 1500, win_rate: 0.95, alerts_triggered: 5 },
  },
  {
    id: 'agent-6',
    name: 'GovBot',
    type: 'mev_bot',
    capital: 75000,
    current_value: 76200,
    pnl: 1200,
    win_rate: 0.88,
    active: true,
    risk: 'low',
    speed: 'slow',
    state: 'idle',
    stats: { trades_count: 50, total_volume: 1000000, pnl: 1200, win_rate: 0.88, alerts_triggered: 5 },
  },
];

export const generateActivityFeed = (): ActivityFeedItem[] => [
  {
    timestamp: Date.now() - 5000,
    agent_id: 'agent-1',
    agent_name: 'ArbiBot',
    agent_type: 'arbitrage_bot',
    event_type: 'Arbitrage Executed',
    data: {
      status: 'success',
      details: 'USDC/ETH spread 0.3% > 0.2% | +$500 captured',
    }
  },
  {
    timestamp: Date.now() - 12000,
    agent_id: 'agent-3',
    agent_name: 'MakerBot',
    agent_type: 'retail_trader',
    event_type: 'Bid/Ask Posted',
    data: {
      status: 'success',
      details: 'USDC pair | Spread 2bps | Book depth +$200k',
    }
  },
  {
    timestamp: Date.now() - 25000,
    agent_id: 'agent-2',
    agent_name: 'LiquidatorX',
    agent_type: 'liquidator_bot',
    event_type: 'Liquidation Bid',
    data: {
      status: 'pending',
      details: 'Monitoring wallet 0x3A... | HF 1.02 | Ready to liquidate',
    }
  },
  {
    timestamp: Date.now() - 40000,
    agent_id: 'agent-5',
    agent_name: 'OracleBot',
    agent_type: 'whale',
    event_type: 'Price Update',
    data: {
      status: 'success',
      details: 'ETH/USD: $3,245.67 | Oracle confidence 99.8%',
    }
  },
  {
    timestamp: Date.now() - 60000,
    agent_id: 'agent-4',
    agent_name: 'TraderAlpha',
    agent_type: 'retail_trader',
    event_type: 'Trade Exit',
    data: {
      status: 'error',
      details: 'Slippage exceeded threshold | Order not placed',
    }
  },
];

/* === BORROWERS === */
export const generateBorrowers = (): BorrowerPosition[] => [
  {
    id: 'borrower-1',
    wallet: '0x1A2B3C4D5E6F7G8H9I0J1K2L',
    collateral: 500000,
    borrowed: 250000,
    healthFactor: 2.1,
    liquidationPrice: 1800,
    status: 'healthy',
  },
  {
    id: 'borrower-2',
    wallet: '0x2B3C4D5E6F7G8H9I0J1K2L3M',
    collateral: 300000,
    borrowed: 220000,
    healthFactor: 1.35,
    liquidationPrice: 2100,
    status: 'warning',
  },
  {
    id: 'borrower-3',
    wallet: '0x3C4D5E6F7G8H9I0J1K2L3M4N',
    collateral: 100000,
    borrowed: 85000,
    healthFactor: 1.15,
    liquidationPrice: 2300,
    status: 'danger',
  },
  {
    id: 'borrower-4',
    wallet: '0x4D5E6F7G8H9I0J1K2L3M4N5O',
    collateral: 750000,
    borrowed: 400000,
    healthFactor: 1.92,
    liquidationPrice: 1650,
    status: 'healthy',
  },
  {
    id: 'borrower-5',
    wallet: '0x5E6F7G8H9I0J1K2L3M4N5O6P',
    collateral: 200000,
    borrowed: 180000,
    healthFactor: 1.08,
    liquidationPrice: 2450,
    status: 'danger',
  },
];

/* === CREDIT SCORES === */
export const generateCreditScores = (): CreditScore[] => [
  {
    wallet: '0x1A2B3C4D5E6F7G8H9I0J1K2L',
    score: 892,
    tier: 'platinum',
    type: 'borrower',
    delta: 12,
    lastUpdated: Date.now() - 3600000,
  },
  {
    wallet: '0x2B3C4D5E6F7G8H9I0J1K2L3M',
    score: 756,
    tier: 'gold',
    type: 'trader',
    delta: 5,
    lastUpdated: Date.now() - 1800000,
  },
  {
    wallet: '0x3C4D5E6F7G8H9I0J1K2L3M4N',
    score: 634,
    tier: 'silver',
    type: 'borrower',
    delta: -8,
    lastUpdated: Date.now() - 7200000,
  },
  {
    wallet: '0x4D5E6F7G8H9I0J1K2L3M4N5O',
    score: 542,
    tier: 'bronze',
    type: 'lender',
    delta: 2,
    lastUpdated: Date.now() - 10800000,
  },
  {
    wallet: '0x5E6F7G8H9I0J1K2L3M4N5O6P',
    score: 825,
    tier: 'platinum',
    type: 'trader',
    delta: -3,
    lastUpdated: Date.now() - 5400000,
  },
];

export const generateScoreFactors = (): ScoreFactor[] => [
  { name: 'Payment History', weight: 0.35, contribution: 312, impact: 35 },
  { name: 'Borrow Activity', weight: 0.25, contribution: 223, impact: 25 },
  { name: 'Collateral Stability', weight: 0.2, contribution: 178, impact: 20 },
  { name: 'Platform Engagement', weight: 0.15, contribution: 134, impact: 15 },
  { name: 'Risk Profile', weight: 0.05, contribution: 45, impact: 5 },
];

export const generateDynamicRates = () => [
  { tier: 'Platinum', ltv: 0.8, borrowRate: 3.5, liquidationBuffer: 1.2 },
  { tier: 'Gold', ltv: 0.7, borrowRate: 4.2, liquidationBuffer: 1.4 },
  { tier: 'Silver', ltv: 0.6, borrowRate: 5.5, liquidationBuffer: 1.6 },
  { tier: 'Bronze', ltv: 0.5, borrowRate: 7.2, liquidationBuffer: 1.8 },
  { tier: 'Unrated', ltv: 0.4, borrowRate: 10.0, liquidationBuffer: 2.0 },
];

/* === THREATS === */
export const generateThreatScores = (): ThreatScore[] => [
  { axis: 'MEV', score: 45, status: 'safe' },
  { axis: 'Oracle', score: 30, status: 'safe' },
  { axis: 'Liquidity', score: 65, status: 'warning' },
  { axis: 'Governance', score: 25, status: 'safe' },
  { axis: 'Flash', score: 50, status: 'safe' },
  { axis: 'Systemic', score: 40, status: 'safe' },
];

export const generateThreatAlerts = (): ThreatAlert[] => [
  {
    id: 'alert-1',
    type: 'MEV Attack Detected',
    severity: 'high',
    description: 'Front-running sandwich attack on USDC/ETH pair detected',
    timestamp: Date.now() - 120000,
    resolved: false,
  },
  {
    id: 'alert-2',
    type: 'Oracle Manipulation',
    severity: 'medium',
    description: 'Price feed deviation >2% from CEX prices',
    timestamp: Date.now() - 300000,
    resolved: false,
  },
  {
    id: 'alert-3',
    type: 'Liquidity Crisis',
    severity: 'high',
    description: 'Pool liquidity below safe threshold',
    timestamp: Date.now() - 600000,
    resolved: true,
  },
];

/* === AUDIT LOG === */
export const generateAuditLog = () => [
  {
    step: 1,
    timestamp: '2024-01-15T10:30:45Z',
    eventType: 'simulation_start',
    actor: 'admin-0x1A',
    target: 'simulation-session-001',
    description: 'Simulation started with 6 active agents',
    txHash: '0xabc123...def456',
    verified: true,
  },
  {
    step: 2,
    timestamp: '2024-01-15T10:31:02Z',
    eventType: 'agent_action',
    actor: 'agent-1',
    target: 'pool-usdc-eth',
    description: 'Arbitrage executed: USDC/ETH spread captured',
    txHash: '0xdef789...ghi012',
    verified: true,
  },
  {
    step: 3,
    timestamp: '2024-01-15T10:32:15Z',
    eventType: 'liquidation_event',
    actor: 'agent-2',
    target: 'borrower-0x3C',
    description: 'Liquidation executed on underwater position',
    txHash: '0xghi345...jkl678',
    verified: true,
  },
  {
    step: 4,
    timestamp: '2024-01-15T10:35:30Z',
    eventType: 'price_update',
    actor: 'oracle-network',
    target: 'eth-usd-feed',
    description: 'Price update: ETH/USD = $3,245.67',
    txHash: '0xjkl901...mno234',
    verified: true,
  },
  {
    step: 5,
    timestamp: '2024-01-15T10:40:00Z',
    eventType: 'cascade_trigger',
    actor: 'system',
    target: 'lending-market',
    description: 'Cascade event triggered: 5 liquidations in sequence',
    txHash: '0xmno567...pqr890',
    verified: true,
  },
];

/* === UTILITY FUNCTIONS === */
export const generateRandomDelta = (baseValue: number, variance: number = 0.02) => {
  const change = (Math.random() - 0.5) * 2 * variance * baseValue;
  return baseValue + change;
};

export const generateRandomId = () => Math.random().toString(36).substr(2, 9);

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};
