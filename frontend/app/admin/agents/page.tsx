'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Terminal from '@/components/Terminal';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Agent Configuration State ──────────────────────────────
  const [agentConfigs, setAgentConfigs] = useState([
    { id: 'retail', name: 'Retail Army', type: 'retail_trader', capital: 25000, risk: 'medium', speed: 'normal', active: true, count: 3 },
    { id: 'whale', name: 'MegaWhale', type: 'whale', capital: 500000, risk: 'high', speed: 'normal', active: true, count: 1 },
    { id: 'arb', name: 'ArbBot', type: 'arbitrage_bot', capital: 100000, risk: 'medium', speed: 'fast', spread: 0.3, active: true, count: 1 },
    { id: 'liq', name: 'LiqBot', type: 'liquidator_bot', capital: 200000, risk: 'low', speed: 'fast', active: true, count: 1 },
    { id: 'mev', name: 'SandwichBot', type: 'mev_bot', capital: 150000, risk: 'high', speed: 'fast', active: true, count: 1 },
    { id: 'attacker', name: 'FlashAttacker', type: 'attacker', capital: 50000, risk: 'high', speed: 'fast', active: true, count: 1 },
    { id: 'borrower', name: 'LeverageChad', type: 'borrower', capital: 20000, risk: 'high', speed: 'normal', active: true, count: 3 },
  ]);

  // ── Polling ─────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [statusData, agentData, feedData, alertData] = await Promise.all([
      api<SimStatus>('/api/simulation/status'),
      api<SimAgent[]>('/api/agents'),
      api<FeedEvent[]>('/api/sim/activity-feed?limit=50'),
      api<FraudAlert[]>('/api/threats/alerts'),
    ]);
    if (statusData) setSimStatus(statusData);
    if (Array.isArray(agentData)) setAgents(agentData);
    if (Array.isArray(feedData)) setFeed(feedData);
    if (Array.isArray(alertData)) setAlerts(alertData);
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

    // Build agent payload
    const payloadAgents: any[] = [];
    agentConfigs.filter(c => c.active).forEach(c => {
      for (let i = 0; i < c.count; i++) {
        payloadAgents.push({
          type: c.type,
          name: c.count > 1 ? `${c.name}_${i + 1}` : c.name,
          capital: c.capital,
          risk: c.risk,
          speed: c.speed,
          spread_threshold: c.spread || undefined
        });
      }
    });

    await api('/api/simulation/start', {
      method: 'POST',
      body: JSON.stringify({
        max_steps: 400,
        tick_delay: 0.5,
        agents_config: payloadAgents.length > 0 ? payloadAgents : undefined // fall back to defaults if empty
      })
    });

    await fetchAll();
    setIsLoading(false);
  };

  const triggerStress = async (type: string, magnitude: number) => {
    await api('/api/simulation/stress', {
      method: 'POST',
      body: JSON.stringify({ event_type: type, magnitude })
    });
    await fetchAll();
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

  const totalCapital = agents.reduce((s, a) => s + a.capital, 0);
  const totalValue = agents.reduce((s, a) => s + a.current_value, 0);
  const totalPnl = agents.reduce((s, a) => s + a.pnl, 0);

  const terminalLines = feed.map((e) => ({
    text: `[${e.agent_name || e.agent_id}] ${e.event_type}: ${typeof e.data === 'object'
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
  }));

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
        <div className="card p-4 bg-gradient-to-r from-[rgba(0,212,99,0.08)] to-[rgba(56,189,248,0.08)] border border-[color:var(--color-accent)] rounded-lg">
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
              <div key={symbol} className="bg-[color:var(--color-bg-primary)] rounded p-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-text-primary">{symbol}</span>
                  <span className={`text-[10px] font-mono font-bold ${(price as PriceInfo).change_pct_24h >= 0 ? 'text-success' : 'text-danger'
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
            className={`card p-3 space-y-2 border-l-2 transition-all ${agent.active
                ? 'border-l-[color:var(--color-accent)]'
                : 'border-l-[color:var(--color-text-tertiary)] opacity-60'
              }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{AGENT_ICONS[agent.type] || '🤖'}</span>
              <div className="overflow-hidden">
                <h3 className="font-bold font-mono text-text-primary text-xs truncate">
                  {agent.name}
                </h3>
                <p className="text-[10px] text-text-tertiary font-mono truncate">
                  {(agent.type ?? '').replace(/_/g, ' ')}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Badge variant={AGENT_RISK_BADGE[agent.risk] || 'medium'}>
                {(agent.risk ?? '').toUpperCase()}
              </Badge>
              <span
                className={`text-xs font-mono font-bold ${(agent.pnl ?? 0) >= 0 ? 'text-success' : 'text-danger'
                  }`}
              >
                {(agent.pnl ?? 0) >= 0 ? '+' : ''}
                {(agent.pnl ?? 0).toFixed(0)}
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

      {/* ── Configuration & Control Panel ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Agent Config Builder */}
        <div className="card p-4 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono font-bold text-text-primary uppercase">
              Agent Configuration
            </h3>
            {isRunning && <Badge variant="medium">LOCKED WHILE RUNNING</Badge>}
          </div>

          <div className={`space-y-3 ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}>
            {agentConfigs.map((c, i) => (
              <div key={c.id} className="flex flex-wrap items-center gap-4 p-2 border border-[color:var(--color-border)] rounded bg-[color:var(--color-bg-primary)]">
                <label className="flex items-center gap-2 min-w-[120px]">
                  <input type="checkbox" checked={c.active} onChange={(e) => {
                    const next = [...agentConfigs];
                    next[i].active = e.target.checked;
                    setAgentConfigs(next);
                  }} />
                  <span className="text-xs font-mono font-bold text-text-primary">{c.name}</span>
                </label>

                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-text-tertiary">Count:</span>
                  <input type="number" min="1" max="10" value={c.count} onChange={(e) => {
                    const next = [...agentConfigs];
                    next[i].count = parseInt(e.target.value) || 1;
                    setAgentConfigs(next);
                  }} className="w-12 bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded px-1 text-text-primary" />
                </div>

                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-text-tertiary">Cap $:</span>
                  <input type="number" step="1000" value={c.capital} onChange={(e) => {
                    const next = [...agentConfigs];
                    next[i].capital = parseFloat(e.target.value) || 0;
                    setAgentConfigs(next);
                  }} className="w-20 bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded px-1 text-text-primary" />
                </div>

                <select className="text-xs font-mono bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded p-1 text-text-primary"
                  value={c.risk} onChange={(e) => {
                    const next = [...agentConfigs];
                    next[i].risk = e.target.value;
                    setAgentConfigs(next);
                  }}>
                  <option value="low">Low Risk</option>
                  <option value="medium">Med Risk</option>
                  <option value="high">High Risk</option>
                </select>

                <select className="text-xs font-mono bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded p-1 text-text-primary"
                  value={c.speed} onChange={(e) => {
                    const next = [...agentConfigs];
                    next[i].speed = e.target.value;
                    setAgentConfigs(next);
                  }}>
                  <option value="slow">Slow</option>
                  <option value="normal">Normal</option>
                  <option value="fast">Fast</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Stress Event Injector */}
        <div className="card p-4 space-y-4">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase flex items-center gap-2">
            <span className="text-danger">⚠</span> Stress Injector
          </h3>
          <p className="text-xs font-mono text-text-tertiary">
            Trigger chaotic events into the live simulation to test agent resilience and fraud monitors.
          </p>

          <div className="space-y-3">
            <button
              disabled={!isRunning}
              onClick={() => triggerStress('price_crash', 1.5)}
              className={`w-full py-2 px-3 text-xs font-mono font-bold border rounded transition-colors ${isRunning
                  ? 'border-[color:var(--color-danger)] text-danger bg-[rgba(255,56,96,0.1)] hover:bg-[rgba(255,56,96,0.2)]'
                  : 'border-[color:var(--color-border)] text-text-tertiary opacity-50'
                }`}
            >
              📉 Flash Crash (-15% Price)
            </button>
            <button
              disabled={!isRunning}
              onClick={() => triggerStress('liquidity_drain', 1.0)}
              className={`w-full py-2 px-3 text-xs font-mono font-bold border rounded transition-colors ${isRunning
                  ? 'border-[color:var(--color-warn)] text-[color:var(--color-warn)] bg-[rgba(255,178,56,0.1)] hover:bg-[rgba(255,178,56,0.2)]'
                  : 'border-[color:var(--color-border)] text-text-tertiary opacity-50'
                }`}
            >
              💧 Rug Pull (Drain 20% Liquidity)
            </button>
            <button
              disabled={!isRunning}
              onClick={() => triggerStress('mempool_flood', 2.0)}
              className={`w-full py-2 px-3 text-xs font-mono font-bold border rounded transition-colors ${isRunning
                  ? 'border-accent text-accent bg-[rgba(0,212,255,0.1)] hover:bg-[rgba(0,212,255,0.2)]'
                  : 'border-[color:var(--color-border)] text-text-tertiary opacity-50'
                }`}
            >
              🌊 Flood Mempool (Spam Txs)
            </button>
          </div>
          {!isRunning && <p className="text-[10px] font-mono text-center text-text-tertiary pt-2">Start simulation to enable stress triggers.</p>}
        </div>
      </div>

      {/* ── Playback Controls + Status ────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {!isRunning && !isPaused && (
              <button
                className="btn accent text-xs py-2 px-5"
                onClick={startSim}
                disabled={isLoading}
              >
                {isLoading ? 'STARTING...' : '▶ START'}
              </button>
            )}
            {isRunning && (
              <button className="btn ghost text-xs py-2 px-4" onClick={pauseSim}>
                ⏸ PAUSE
              </button>
            )}
            {isPaused && (
              <button className="btn accent text-xs py-2 px-4" onClick={resumeSim}>
                ▶ RESUME
              </button>
            )}
            {(isRunning || isPaused) && (
              <button className="btn ghost text-xs py-2 px-4" onClick={stopSim}>
                ⏹ STOP
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
            <span className="text-text-secondary">
              Status:{' '}
              <span
                className={`font-bold ${isRunning
                    ? 'text-success'
                    : isPaused
                      ? 'text-[color:var(--color-warn)]'
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
            <span className="text-text-secondary">
              Alerts:{' '}
              <span className="text-[color:var(--color-danger)] font-bold">
                {simStatus?.total_alerts || 0}
              </span>
            </span>
          </div>
        </div>

        {/* Progress bar */}
        {(isRunning || isPaused) && (
          <div className="w-full bg-[color:var(--color-bg-accent)] rounded-full h-2">
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

      {/* ── Pool / Lending Live Stats ─────────────────────────────────── */}
      {simStatus && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatBox label="Reserve A" value={`$${(simStatus.pool.reserve_a / 1000).toFixed(1)}k`} />
          <StatBox label="Reserve B" value={`$${(simStatus.pool.reserve_b / 1000).toFixed(1)}k`} />
          <StatBox label="Price A/B" value={simStatus.pool.price_a_per_b.toFixed(4)} />
          <StatBox label="Pool Volume" value={`$${(simStatus.pool.total_volume / 1000).toFixed(1)}k`} />
          <StatBox label="Total Collateral" value={`$${(simStatus.lending.total_collateral / 1000).toFixed(1)}k`} />
          <StatBox
            label="Liquidatable"
            value={String(simStatus.lending.liquidatable_count)}
            danger={simStatus.lending.liquidatable_count > 0}
          />
        </div>
      )}

      {/* ── Activity Feed + Alerts ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Terminal title="Agent Activity Feed" lines={terminalLines} maxLines={18} />
        </div>

        <div className="card space-y-4 max-h-[420px] overflow-y-auto">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">
            Fraud Alerts ({alerts.length})
          </h3>
          {alerts.length === 0 && (
            <p className="text-xs text-text-tertiary font-mono">No alerts yet</p>
          )}
          {alerts.slice(-15).reverse().map((alert) => (
            <div
              key={alert.id}
              className={`p-2 rounded border-l-2 ${alert.severity === 'CRITICAL'
                  ? 'border-l-[color:var(--color-danger)] bg-[rgba(255,56,96,0.08)]'
                  : alert.severity === 'HIGH'
                    ? 'border-l-[color:var(--color-warn)] bg-[rgba(255,178,56,0.08)]'
                    : 'border-l-[color:var(--color-text-tertiary)] bg-[color:var(--color-bg-accent)]'
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
                  {alert.type.replace('_', ' ')}
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
                    {AGENT_ICONS[row.type] || '🤖'} {row.name}
                  </span>
                ),
                className: 'font-mono text-xs font-bold',
              },
              {
                header: 'Type',
                accessor: (row: SimAgent) => (row.type ?? '').replace(/_/g, ' '),
                className: 'font-mono text-xs capitalize',
              },
              {
                header: 'Capital',
                accessor: (row: SimAgent) => `$${((row.capital ?? 0) / 1000).toFixed(1)}k`,
                className: 'text-xs',
              },
              {
                header: 'Value',
                accessor: (row: SimAgent) => `$${((row.current_value ?? 0) / 1000).toFixed(1)}k`,
                className: 'text-xs',
              },
              {
                header: 'PnL',
                accessor: (row: SimAgent) => (
                  <span className={(row.pnl ?? 0) >= 0 ? 'text-success' : 'text-danger'}>
                    {(row.pnl ?? 0) >= 0 ? '+' : ''}
                    {(row.pnl ?? 0).toFixed(0)}
                  </span>
                ),
                className: 'font-mono text-xs font-bold',
              },
              {
                header: 'Trades',
                accessor: (row: SimAgent) => String(row.stats?.trades_count ?? 0),
                className: 'text-xs',
              },
              {
                header: 'Win %',
                accessor: (row: SimAgent) =>
                  `${((row.win_rate ?? 0) * 100).toFixed(0)}%`,
                className: 'text-xs',
              },
              {
                header: 'Volume',
                accessor: (row: SimAgent) =>
                  `$${((row.stats?.total_volume ?? 0) / 1000).toFixed(1)}k`,
                className: 'text-xs',
              },
              {
                header: 'Status',
                accessor: (row: SimAgent) => (
                  <Badge variant={row.active ? 'success' : 'medium'}>
                    {(row.state ?? '').toUpperCase()}
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
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold font-mono text-xs bg-[color:var(--color-bg-accent)] ${item.color}`}
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
      className={`card p-3 ${danger ? 'border border-[color:var(--color-danger)] bg-[rgba(255,56,96,0.06)]' : ''
        }`}
    >
      <div className="text-[10px] text-text-tertiary font-mono uppercase">{label}</div>
      <div
        className={`text-lg font-bold font-mono ${danger ? 'text-[color:var(--color-danger)]' : 'text-accent'
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
    <div className="p-2 bg-[color:var(--color-bg-accent)] rounded">
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
