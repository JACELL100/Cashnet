'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Terminal from '@/components/Terminal';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://cash-net.onrender.com';

// ── Types ──────────────────────────────────────────────────────────────────
interface SimAgent {
  id: string;
  name: string;
  type: string;
  capital: number;
  current_value: number;
  pnl: number;
  win_rate: number;
  active: boolean;
  state: string;
  risk: string;
  speed: string;
  stats: {
    trades_count: number;
    total_volume: number;
    pnl: number;
    win_rate: number;
    alerts_triggered: number;
  };
}

interface SimStatus {
  status: string;
  current_step: number;
  max_steps: number;
  elapsed_seconds: number;
  agents_count: number;
  active_agents: number;
  total_trades: number;
  total_alerts: number;
  pool: {
    reserve_a: number;
    reserve_b: number;
    price_a_per_b: number;
    total_volume: number;
    swap_count: number;
    reference_price: number;
  };
  lending: {
    total_collateral: number;
    total_debt: number;
    liquidatable_count: number;
    liquidation_count: number;
  };
  market_data?: MarketData | null;
}

interface MarketData {
  prices: Record<string, PriceInfo>;
  condition: MarketCondition;
  last_update: number;
  source: string;
}

interface PriceInfo {
  symbol: string;
  price: number;
  change_24h: number;
  change_pct_24h: number;
  high_24h: number;
  low_24h: number;
  volume_24h: number;
  source: string;
}

interface MarketCondition {
  sentiment: string;
  volatility: string;
  trend: string;
  risk_level: number;
  recommended_exposure: number;
}

interface FeedEvent {
  agent_id: string;
  agent_name: string;
  agent_type: string;
  event_type: string;
  data: Record<string, any>;
  timestamp: number;
}

interface FraudAlert {
  id: string;
  type: string;
  severity: string;
  agent_id: string;
  description: string;
  timestamp: number;
  resolved: boolean;
}

interface LiveTransaction {
  id: string;
  type: string;
  token_in: string;
  token_out: string;
  amount_in: number;
  status: 'pending' | 'confirming' | 'confirmed' | 'failed';
  tx_hash?: string;
  etherscan_url?: string;
  timestamp: number;
}

// ── Agent type visual config ───────────────────────────────────────────────
const AGENT_ICONS: Record<string, string> = {
  retail_trader: '🛒',
  whale: '🐋',
  arbitrage_bot: '⚡',
  liquidator_bot: '🔫',
  mev_bot: '🥪',
  attacker: '💀',
};

const AGENT_RISK_BADGE: Record<string, 'critical' | 'high' | 'medium' | 'success'> = {
  high: 'critical',
  medium: 'high',
  low: 'success',
};

// ── Helper ─────────────────────────────────────────────────────────────────
async function api<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...opts?.headers },
      ...opts,
    });
    const json = await res.json();
    return json?.data ?? json;
  } catch {
    return null;
  }
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const [simStatus, setSimStatus] = useState<SimStatus | null>(null);
  const [agents, setAgents] = useState<SimAgent[]>([]);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [liveTransactions, setLiveTransactions] = useState<LiveTransaction[]>([]);
  const [showTxTracker, setShowTxTracker] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [attackRunning, setAttackRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Polling ─────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [statusData, agentData, feedData, alertData, attackStatusData] = await Promise.all([
      api<SimStatus>('/api/simulation/status'),
      api<SimAgent[]>('/api/agents'),
      api<FeedEvent[]>('/api/sim/activity-feed?limit=50'),
      api<FraudAlert[]>('/api/threats/alerts'),
      api<{attack_running: boolean}>('/api/scenarios/attack-status'),
    ]);
    if (statusData) setSimStatus(statusData);
    if (Array.isArray(agentData)) setAgents(agentData);
    if (Array.isArray(feedData)) setFeed(feedData);
    if (Array.isArray(alertData)) setAlerts(alertData);
    // Only update attack status if we received valid data
    if (attackStatusData && typeof attackStatusData.attack_running === 'boolean') {
      setAttackRunning(attackStatusData.attack_running);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchAll]);

  // ── Controls ─────────────────────────────────────────────────────────────
  const startSim = async () => {
    setIsLoading(true);
    await api('/api/simulation/start', { method: 'POST', body: JSON.stringify({ max_steps: 200, tick_delay: 0.5 }) });
    await fetchAll();
    setIsLoading(false);
  };
  
  const runDemoAttack = async () => {
    setIsLoading(true);
    setShowTxTracker(true);
    setLiveTransactions([]);
    
    try {
      const response = await api('/api/scenarios/demo-attack', { method: 'POST' }) as any;
      if (!response) {
        throw new Error("Invalid response from server");
      }
      
      // Extract wallet address
      if (response.etherscan_wallet) {
        const walletMatch = response.etherscan_wallet.match(/0x[a-fA-F0-9]{40}/);
        if (walletMatch) setWalletAddress(walletMatch[0]);
      }
      
      // Update attack status immediately
      setAttackRunning(true);
      
      // Show success message
      alert(`✅ Continuous Attack Started!\n\n${response.message || 'Attack initiated'}\n\nWatch the Activity Feed below for live blockchain confirmations.\n\n🔗 Etherscan: ${response.etherscan_wallet || 'N/A'}\n\n⚠️ Click STOP ATTACK button to end the attack.`);
      
      await fetchAll();
    } catch (error: any) {
      setLiveTransactions([{
        id: 'error',
        type: 'Failed',
        token_in: 'N/A',
        token_out: 'N/A',
        amount_in: 0,
        status: 'failed',
        timestamp: Date.now()
      }]);
      alert(`❌ Demo attack failed: ${error?.message || 'Unknown error'}\n\nMake sure backend is running.`);
    }
    setIsLoading(false);
  };
  
  const stopAttack = async () => {
    setIsLoading(true);
    try {
      const result = await api('/api/scenarios/stop-attack', { method: 'POST' }) as any;
      
      // Immediately set attack to false
      setAttackRunning(false);
      
      // Wait a moment for backend to fully stop
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Refresh all data
      await fetchAll();
      
      if (result?.success) {
        console.log('✅ Attack stopped:', result.message);
      }
    } catch (error: any) {
      console.error('❌ Failed to stop attack:', error);
      alert(`❌ Failed to stop attack: ${error?.message || 'Unknown error'}`);
      // Still try to update state
      setAttackRunning(false);
      await fetchAll();
    } finally {
      setIsLoading(false);
    }
  };

  const pauseSim = async () => {
    await api('/api/simulation/pause', { method: 'POST' });
    await fetchAll();
  };

  const resumeSim = async () => {
    await api('/api/simulation/resume', { method: 'POST' });
    await fetchAll();
  };

  const stopSim = async () => {
    await api('/api/simulation/stop', { method: 'POST' });
    await fetchAll();
  };

  const toggleAgent = async (agentId: string, active: boolean) => {
    await api(`/api/agents/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify({ active }),
    });
    await fetchAll();
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const isRunning = simStatus?.status === 'running';
  const isPaused = simStatus?.status === 'paused';
  const progress = simStatus
    ? Math.round((simStatus.current_step / simStatus.max_steps) * 100)
    : 0;

  const totalCapital = agents.reduce((s, a) => s + (a.capital || 0), 0);
  const totalValue = agents.reduce((s, a) => s + (a.current_value || 0), 0);
  const totalPnl = agents.reduce((s, a) => s + (a.pnl || 0), 0);

  // Count on-chain transactions from blockchain events in feed
  const onChainTxCount = feed.filter(
    (e) => e.agent_type === 'blockchain_tx' && e.event_type.includes('confirmed')
  ).length;

  const terminalLines = feed.map((e) => {
    // Special formatting for blockchain transactions
    if (e.agent_type === 'blockchain_tx') {
      const data = e.data || {};
      let text = `[🔗 Blockchain] ${e.event_type}: `;
      
      if (e.event_type === 'approval_pending') {
        text += `🔓 Approving ${data.token} (${data.amount})`;
      } else if (e.event_type === 'approval_confirmed') {
        text += `✅ Approved ${data.token} | TX: ${data.tx_hash?.slice(0, 10)}... | ${data.etherscan || ''}`;
      } else if (e.event_type === 'swap_pending') {
        text += `⏳ Swapping ${data.amount} ${data.token_in} → ${data.token_out}`;
      } else if (e.event_type === 'swap_confirmed') {
        text += `✅ Swapped ${data.amount} ${data.token_in} → ${data.token_out} | TX: ${data.tx_hash?.slice(0, 10)}... | ${data.etherscan || ''}`;
      } else {
        text += Object.entries(data)
          .filter(([k]) => k !== 'receipt' && k !== 'etherscan')
          .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
          .join(' | ');
      }
      
      return {
        text,
        type: (e.event_type.includes('confirmed') ? 'success' : 'info') as 'info' | 'success' | 'danger' | 'warn',
        timestamp: e.timestamp * 1000,
      };
    }
    
    // Standard agent event formatting
    return {
      text: `[${e.agent_name || e.agent_id}] ${e.event_type}: ${
        typeof e.data === 'object'
          ? Object.entries(e.data)
              .filter(([k]) => k !== 'receipt')
              .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
              .join(' | ')
          : String(e.data)
      }`,
      type: (e.event_type.includes('attack') || e.event_type.includes('flash')
        ? 'danger'
        : e.event_type.includes('panic') || e.event_type.includes('liquidat')
          ? 'warn'
          : e.event_type.includes('arb')
            ? 'success'
            : 'info') as 'info' | 'success' | 'danger' | 'warn',
      timestamp: e.timestamp * 1000,
    };
  });

  return (
    <div className="space-y-8 animate-fadeUp">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold font-mono text-text-primary mb-2">
          Agent Simulator
        </h1>
        <p className="text-text-secondary text-sm font-mono">
          Multi-agent DeFi simulation — live chaos engine with fraud detection
        </p>
      </div>

      {/* ── Real Market Data Banner ───────────────────────────────────── */}
      {simStatus?.market_data && (
        <div className="card p-4 bg-linear-to-r from-[rgba(0,212,99,0.08)] to-[rgba(56,189,248,0.08)] border border-(--color-accent) rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📡</span>
              <h3 className="font-mono font-bold text-text-primary text-sm">LIVE MARKET DATA</h3>
              <Badge variant={simStatus.market_data.source === 'coindesk' ? 'success' : 'medium'}>
                {simStatus.market_data.source.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <SentimentBadge sentiment={simStatus.market_data.condition.sentiment} />
              <Badge variant={
                simStatus.market_data.condition.volatility === 'extreme' ? 'critical' :
                simStatus.market_data.condition.volatility === 'high' ? 'high' : 'medium'
              }>
                {simStatus.market_data.condition.volatility.toUpperCase()} VOL
              </Badge>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {Object.entries(simStatus.market_data.prices).map(([symbol, price]) => (
              <div key={symbol} className="bg-(--color-bg-primary) rounded p-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-text-primary">{symbol}</span>
                  <span className={`text-[10px] font-mono font-bold ${
                    (price as PriceInfo).change_pct_24h >= 0 ? 'text-success' : 'text-danger'
                  }`}>
                    {(price as PriceInfo).change_pct_24h >= 0 ? '▲' : '▼'}
                    {Math.abs((price as PriceInfo).change_pct_24h).toFixed(1)}%
                  </span>
                </div>
                <div className="text-sm font-mono text-accent font-bold">
                  ${(price as PriceInfo).price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex items-center justify-between mt-3 text-[10px] font-mono text-text-tertiary">
            <span>Trend: <span className="text-accent">{simStatus.market_data.condition.trend.toUpperCase()}</span></span>
            <span>Risk Level: <span className={simStatus.market_data.condition.risk_level > 0.6 ? 'text-danger' : 'text-accent'}>
              {(simStatus.market_data.condition.risk_level * 100).toFixed(0)}%
            </span></span>
            <span>Agents react to real price movements</span>
          </div>
        </div>
      )}

      {/* ── Agent Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`card p-3 space-y-2 border-l-2 transition-all ${
              agent.active
                ? 'border-l-(--color-accent)'
                : 'border-l-(--color-text-tertiary) opacity-60'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{AGENT_ICONS[agent.type] || '🤖'}</span>
              <div className="overflow-hidden">
                <h3 className="font-bold font-mono text-text-primary text-xs truncate">
                  {agent.name}
                </h3>
                <p className="text-[10px] text-text-tertiary font-mono truncate">
                  {agent.type?.replace('_', ' ') || 'Unknown'}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Badge variant={AGENT_RISK_BADGE[agent.risk] || 'medium'}>
                {agent.risk?.toUpperCase() || 'MEDIUM'}
              </Badge>
              <span
                className={`text-xs font-mono font-bold ${
                  agent.pnl >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {agent.pnl >= 0 ? '+' : ''}
                {agent.pnl?.toFixed(0) || 0}
              </span>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={agent.active}
                onChange={() => toggleAgent(agent.id, !agent.active)}
              />
              <span className="font-mono">
                {agent.active ? 'Active' : 'Disabled'}
              </span>
            </label>
          </div>
        ))}
        {agents.length === 0 && (
          <div className="col-span-full text-center text-text-tertiary font-mono py-8 text-sm">
            Press START to spawn agents
          </div>
        )}
      </div>

      {/* ── Playback Controls + Status ──────────────────────────────────*/}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {!isRunning && !isPaused && !attackRunning && (
              <>
                <button
                  className="btn accent text-xs py-2 px-5"
                  onClick={startSim}
                  disabled={isLoading}
                >
                  {isLoading ? 'STARTING...' : '▶ START'}
                </button>
                <button
                  className="btn text-xs py-2 px-5 bg-linear-to-r from-[rgba(220,38,38,0.9)] to-[rgba(239,68,68,0.9)] hover:from-[rgba(220,38,38,1)] hover:to-[rgba(239,68,68,1)] text-white font-bold border-0"
                  onClick={runDemoAttack}
                  disabled={isLoading}
                  title="Execute 100+ transaction attack demo with Palladium & Badassium tokens"
                >
                  {isLoading ? 'ATTACKING...' : '💥 DEMO ATTACK (100+ TXs)'}
                </button>
              </>
            )}
            {attackRunning && (
              <button
                className="btn text-xs py-2 px-5 bg-linear-to-r from-[rgba(220,38,38,0.9)] to-[rgba(239,68,68,0.9)] hover:from-[rgba(220,38,38,1)] hover:to-[rgba(239,68,68,1)] text-white font-bold border-0 animate-pulse"
                onClick={stopAttack}
                disabled={isLoading}
                title="Stop the ongoing attack"
              >
                {isLoading ? 'STOPPING...' : '🛑 STOP ATTACK'}
              </button>
            )}
            {isRunning && !attackRunning && (
              <>
                <button className="btn ghost text-xs py-2 px-4" onClick={pauseSim}>
                  ⏸ PAUSE
                </button>
              </>
            )}
            {isPaused && (
              <button className="btn accent text-xs py-2 px-4" onClick={resumeSim}>
                ▶ RESUME
              </button>
            )}
            {(isRunning || isPaused) && !attackRunning && (
              <button className="btn ghost text-xs py-2 px-4" onClick={stopSim}>
                ⏹ STOP
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
            {attackRunning && (
              <span className="text-text-secondary">
                🔥 Attack:{' '}
                <span className="text-[#ff0033] font-bold animate-pulse">
                  RUNNING
                </span>
              </span>
            )}
            <span className="text-text-secondary">
              Status:{' '}
              <span
                className={`font-bold ${
                  isRunning
                    ? 'text-success'
                    : isPaused
                      ? 'text-(--color-warn)'
                      : 'text-text-tertiary'
                }`}
              >
                {simStatus?.status?.toUpperCase() || 'IDLE'}
              </span>
            </span>
            <span className="text-text-secondary">
              Step:{' '}
              <span className="text-accent font-bold">
                {simStatus?.current_step || 0}/{simStatus?.max_steps || 0}
              </span>
            </span>
            <span className="text-text-secondary">
              Trades:{' '}
              <span className="text-cyan font-bold">{simStatus?.total_trades || 0}</span>
            </span>
            {onChainTxCount > 0 && (
              <span className="text-text-secondary">
                On-Chain:{' '}
                <span className="text-success font-bold animate-pulse">
                  {onChainTxCount}
                </span>
              </span>
            )}
            <span className="text-text-secondary">
              Alerts:{' '}
              <span className="text-(--color-danger) font-bold">
                {simStatus?.total_alerts || 0}
              </span>
            </span>
          </div>
        </div>

        {/* Progress bar */}
        {(isRunning || isPaused) && (
          <div className="w-full bg-(--color-bg-accent) rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                background: 'var(--color-accent)',
              }}
            />
          </div>
        )}
      </div>

      {/* ── Live Transaction Tracker ──────────────────────────────────── */}
      {showTxTracker && walletAddress && (
        <div className="card p-4 space-y-3 border-l-4 border-l-accent">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono font-bold text-text-primary uppercase flex items-center gap-2">
              <span className="animate-pulse">🔴</span> Live On-Chain Attack — Watch Activity Feed Below
            </h3>
            <div className="flex items-center gap-2">
              <a
                href={`https://sepolia.etherscan.io/address/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn accent text-xs py-1 px-3 flex items-center gap-1"
              >
                🔗 View Wallet on Etherscan
              </a>
              <button
                onClick={() => setShowTxTracker(false)}
                className="btn ghost text-xs py-1 px-2"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Transaction Flow Diagram */}
          <div className="bg-(--color-bg-accent) rounded-lg p-4 font-mono text-xs">
            <div className="text-text-secondary mb-2 font-bold">Continuous Attack Strategy:</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-accent">
                <span className="bg-(--color-bg-primary) px-3 py-1.5 rounded font-bold">PALLADIUM</span>
                <span className="text-danger text-lg">→</span>
                <span className="bg-(--color-bg-primary) px-3 py-1.5 rounded font-bold">BADASSIUM</span>
                <span className="text-text-tertiary ml-2">(400K tokens per swap)</span>
              </div>
              <div className="text-text-tertiary text-center">↓ Price Manipulation ↓</div>
              <div className="flex items-center gap-2 text-cyan">
                <span className="bg-(--color-bg-primary) px-3 py-1.5 rounded font-bold">BADASSIUM</span>
                <span className="text-success text-lg">→</span>
                <span className="bg-(--color-bg-primary) px-3 py-1.5 rounded font-bold">PALLADIUM</span>
                <span className="text-text-tertiary ml-2">(400K tokens per swap)</span>
              </div>
              <div className="mt-3 p-2 bg-(--color-bg-primary) rounded text-center">
                <span className="text-success animate-pulse font-bold">🔄 Loops continuously until STOP pressed</span>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-warn/10 border border-warn/30 rounded-lg p-3 text-xs font-mono">
            <div className="font-bold text-warn mb-1">📊 Live Transaction Tracking:</div>
            <ul className="text-text-secondary space-y-1 ml-4">
              <li>• Watch the <span className="text-accent font-bold">Activity Feed</span> terminal below for real-time updates</li>
              <li>• Each swap has 2 TXs: Approval + Swap (both visible on Etherscan)</li>
              <li>• Click <span className="text-accent font-bold">View Wallet on Etherscan</span> to see all transactions</li>
              <li>• Press <span className="text-danger font-bold">STOP</span> button to end the attack</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Pool / Lending Live Stats ─────────────────────────────────── */}
      {simStatus && simStatus.pool && simStatus.lending && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatBox label="Reserve A" value={`$${((simStatus.pool.reserve_a || 0) / 1000).toFixed(1)}k`} />
          <StatBox label="Reserve B" value={`$${((simStatus.pool.reserve_b || 0) / 1000).toFixed(1)}k`} />
          <StatBox label="Price A/B" value={(simStatus.pool.price_a_per_b || 0).toFixed(4)} />
          <StatBox label="Pool Volume" value={`$${((simStatus.pool.total_volume || 0) / 1000).toFixed(1)}k`} />
          <StatBox label="Total Collateral" value={`$${((simStatus.lending.total_collateral || 0) / 1000).toFixed(1)}k`} />
          <StatBox
            label="Liquidatable"
            value={String(simStatus.lending.liquidatable_count || 0)}
            danger={(simStatus.lending.liquidatable_count || 0) > 0}
          />
        </div>
      )}

      {/* ── Activity Feed + Alerts ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Terminal title="Agent Activity Feed" lines={terminalLines} maxLines={18} />
        </div>

        <div className="card space-y-4 max-h-105 overflow-y-auto">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">
            Fraud Alerts ({alerts.length})
          </h3>
          {alerts.length === 0 && (
            <p className="text-xs text-text-tertiary font-mono">No alerts yet</p>
          )}
          {alerts.slice(-15).reverse().map((alert) => (
            <div
              key={alert.id}
              className={`p-2 rounded border-l-2 ${
                alert.severity === 'CRITICAL'
                  ? 'border-l-(--color-danger) bg-[rgba(255,56,96,0.08)]'
                  : alert.severity === 'HIGH'
                    ? 'border-l-(--color-warn) bg-[rgba(255,178,56,0.08)]'
                    : 'border-l-(--color-text-tertiary) bg-(--color-bg-accent)'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <Badge
                  variant={
                    alert.severity === 'CRITICAL'
                      ? 'critical'
                      : alert.severity === 'HIGH'
                        ? 'high'
                        : 'medium'
                  }
                >
                  {alert.severity}
                </Badge>
                <span className="text-[10px] text-text-tertiary font-mono">
                  {alert.type?.replace('_', ' ') || 'Unknown'}
                </span>
              </div>
              <p className="text-xs text-text-secondary font-mono leading-relaxed">
                {alert.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── PnL Summary ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">
            PnL Summary
          </h3>
          <div className="space-y-2">
            <MiniStat label="Total Capital" value={`$${(totalCapital / 1000).toFixed(1)}k`} color="accent" />
            <MiniStat label="Current Value" value={`$${(totalValue / 1000).toFixed(1)}k`} color="cyan" />
            <MiniStat
              label="Total PnL"
              value={`${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(0)}`}
              color={totalPnl >= 0 ? 'success' : 'danger'}
            />
          </div>
        </div>

        {/* ── Performance Table (3 cols) ──────────────────────────────── */}
        <div className="card space-y-4 lg:col-span-3">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">
            Agent Performance
          </h3>
          <DataTable
            columns={[
              {
                header: 'Agent',
                accessor: (row: SimAgent) => (
                  <span>
                    {AGENT_ICONS[row.type] || '🤖'} {row.name || 'Unknown'}
                  </span>
                ),
                className: 'font-mono text-xs font-bold',
              },
              {
                header: 'Type',
                accessor: (row: SimAgent) => row.type?.replace('_', ' ') || 'Unknown',
                className: 'font-mono text-xs capitalize',
              },
              {
                header: 'Capital',
                accessor: (row: SimAgent) => `$${((row.capital || 0) / 1000).toFixed(1)}k`,
                className: 'text-xs',
              },
              {
                header: 'Value',
                accessor: (row: SimAgent) => `$${((row.current_value || 0) / 1000).toFixed(1)}k`,
                className: 'text-xs',
              },
              {
                header: 'PnL',
                accessor: (row: SimAgent) => (
                  <span className={(row.pnl || 0) >= 0 ? 'text-success' : 'text-danger'}>
                    {(row.pnl || 0) >= 0 ? '+' : ''}
                    {(row.pnl || 0).toFixed(0)}
                  </span>
                ),
                className: 'font-mono text-xs font-bold',
              },
              {
                header: 'Trades',
                accessor: (row: SimAgent) => String(row.stats?.trades_count || 0),
                className: 'text-xs',
              },
              {
                header: 'Win %',
                accessor: (row: SimAgent) =>
                  `${((row.win_rate || 0) * 100).toFixed(0)}%`,
                className: 'text-xs',
              },
              {
                header: 'Volume',
                accessor: (row: SimAgent) =>
                  `$${((row.stats?.total_volume || 0) / 1000).toFixed(1)}k`,
                className: 'text-xs',
              },
              {
                header: 'Status',
                accessor: (row: SimAgent) => (
                  <Badge variant={row.active ? 'success' : 'medium'}>
                    {row.state?.toUpperCase() || 'IDLE'}
                  </Badge>
                ),
              },
            ]}
            data={agents}
          />
        </div>
      </div>

      {/* ── MEV Sandwich Visualizer ───────────────────────────────────── */}
      <div className="card space-y-4">
        <h3 className="text-sm font-mono font-bold text-text-primary uppercase">
          MEV Sandwich Attack Flow
        </h3>
        <div className="grid grid-cols-5 gap-2 text-center">
          {[
            { step: 1, label: 'Victim Tx in Mempool', icon: '📤', color: 'text-accent' },
            { step: 2, label: 'MEV Bot Detects', icon: '👁️', color: 'text-[color:var(--color-warn)]' },
            { step: 3, label: 'Front-Run Executed', icon: '⚡', color: 'text-[color:var(--color-danger)]' },
            { step: 4, label: 'Victim Trade @ Worse Price', icon: '😵', color: 'text-[color:var(--color-warn)]' },
            { step: 5, label: 'Back-Run Profit', icon: '💰', color: 'text-[color:var(--color-danger)]' },
          ].map((item) => (
            <div key={item.step} className="flex flex-col items-center gap-1 p-2">
              <span className="text-2xl">{item.icon}</span>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold font-mono text-xs bg-(--color-bg-accent) ${item.color}`}
              >
                {item.step}
              </div>
              <span className="text-[10px] font-mono text-text-secondary leading-tight">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Mini components ─────────────────────────────────────────────────────────
function StatBox({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`card p-3 ${
        danger ? 'border border-(--color-danger) bg-[rgba(255,56,96,0.06)]' : ''
      }`}
    >
      <div className="text-[10px] text-text-tertiary font-mono uppercase">{label}</div>
      <div
        className={`text-lg font-bold font-mono ${
          danger ? 'text-(--color-danger)' : 'text-accent'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="p-2 bg-(--color-bg-accent) rounded">
      <div className="text-[10px] text-text-tertiary font-mono">{label}</div>
      <div className={`text-base font-bold font-mono text-${color}`}>{value}</div>
    </div>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const config: Record<string, { emoji: string; color: string; label: string }> = {
    extreme_fear: { emoji: '😱', color: 'critical', label: 'EXTREME FEAR' },
    bearish: { emoji: '🐻', color: 'high', label: 'BEARISH' },
    neutral: { emoji: '😐', color: 'medium', label: 'NEUTRAL' },
    bullish: { emoji: '🐂', color: 'success', label: 'BULLISH' },
    extreme_greed: { emoji: '🤑', color: 'success', label: 'EXTREME GREED' },
  };
  
  const c = config[sentiment] || config.neutral;
  
  return (
    <Badge variant={c.color as 'critical' | 'high' | 'medium' | 'success'}>
      {c.emoji} {c.label}
    </Badge>
  );
}
