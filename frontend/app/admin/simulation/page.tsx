'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  type: string;
  active: boolean;
  capital: number;
  pnl: number;
  trades_count: number;
  risk: string;
  speed: string;
  state: string;
  stats?: {
    pnl: number;
    trades_count: number;
    win_rate?: number;
    max_drawdown?: number;
  };
  groq_advice?: Record<string, any>;
  market_aggression?: number;
}

interface SimStatus {
  status: string; // idle | running | paused | completed
  current_step: number;
  max_steps: number;
  tick_delay: number;
  elapsed_seconds: number;
  agents_count: number;
  blockchain_enabled: boolean;
  market_data?: {
    prices?: Record<string, { price: number; change_pct_24h: number; source: string }>;
    condition?: { sentiment: string; volatility: string; risk_level: number };
  };
  blockchain_stats?: {
    total_txs: number;
    on_chain_txs: number;
    current_block: number;
    real_txs_enabled: boolean;
  };
}

interface ActivityEvent {
  agent_id: string;
  agent_name: string;
  agent_type: string;
  event_type: string;
  data: Record<string, any>;
  timestamp: number;
}

interface PoolState {
  reserve_a: number;
  reserve_b: number;
  price_a_per_b: number;
  reference_price: number;
  total_swaps: number;
  total_volume: number;
}

interface LendingState {
  total_borrowed: number;
  total_collateral: number;
  utilization_rate: number;
  interest_rate: number;
  positions: any[];
}

interface Scenario {
  type: string;
  name: string;
  description: string;
  severity: string;
  estimated_damage: string;
  real_world_date: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const AGENT_CONFIG: Record<string, {
  icon: string; color: string; label: string;
  risk: string; speed: string; strategy: string; capital_model: string;
}> = {
  retail_trader:  { icon: '◈', color: '#b367ff', label: 'Retail Trader',    risk: 'Low',    speed: 'Slow',   strategy: 'Emotion-driven, panic sells', capital_model: '$5K–$30K, 1–5% per trade' },
  whale:          { icon: '🐋', color: '#22c55e', label: 'Whale',            risk: 'High',   speed: 'Medium', strategy: 'Price manipulation, pump/dump', capital_model: '$500K+, 10–60% positions' },
  arbitrage_bot:  { icon: '⇄',  color: '#00d4ff', label: 'Arbitrage Bot',   risk: 'Low',    speed: 'Fast',   strategy: 'Spread exploitation, risk-free', capital_model: '$100K, 5–30% per arb' },
  liquidator_bot: { icon: '⚡', color: '#ff3860', label: 'Liquidator Bot',   risk: 'Medium', speed: 'Fast',   strategy: 'Under-collateral hunting',       capital_model: '$200K, targets bad debt' },
  mev_bot:        { icon: '▲',  color: '#f0a500', label: 'MEV Bot',          risk: 'Medium', speed: 'Instant',strategy: 'Sandwich, frontrun, backrun',     capital_model: '$150K, gas war bidding' },
  attacker:       { icon: '☠',  color: '#ff0033', label: 'Attacker',         risk: 'Critical',speed: 'Fast',  strategy: 'Flash loan, oracle manipulation', capital_model: '$50K × 20x flash loan' },
  borrower:       { icon: '⊕',  color: '#64748b', label: 'Borrower',         risk: 'Medium', speed: 'Slow',   strategy: 'Capital efficiency, avoid liq.',  capital_model: '$5K–$20K, 30% borrow limit' },
};

const SCENARIO_META: Record<string, { icon: string; color: string; realEvent: string }> = {
  fxtc_collapse:        { icon: '🏦', color: '#ff3860', realEvent: 'FTX Collapse — Nov 2022' },
  luna_death_spiral:    { icon: '🌀', color: '#b367ff', realEvent: 'Terra/Luna — May 2022' },
  flash_loan_exploit:   { icon: '🎯', color: '#ff0033', realEvent: 'Euler Finance — Mar 2023' },
  oracle_manipulation:  { icon: '🔮', color: '#f0a500', realEvent: 'Mango Markets — Oct 2022' },
  rug_pull:             { icon: '🪤', color: '#ff3860', realEvent: 'Classic Rug Pull' },
  bank_run:             { icon: '🏃', color: '#00d4ff', realEvent: '3AC / Bank Run — Jun 2022' },
  sandwich_mega:        { icon: '🥪', color: '#f0a500', realEvent: 'Wintermute MEV — Sep 2022' },
  cascade_armageddon:   { icon: '💥', color: '#ff0033', realEvent: 'Multi-Protocol Cascade' },
  whale_panic:          { icon: '🐋', color: '#22c55e', realEvent: 'Whale-Induced Panic' },
};

const SEVERITY_COLOR: Record<string, string> = {
  low: '#22c55e', medium: '#f0a500', high: '#ff3860', critical: '#ff0033',
};

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

function fmtPct(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function elapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s}s`;
}

function timeAgo(ts: number) {
  const diff = (Date.now() / 1000) - ts;
  if (diff < 5) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

function severityBadge(sev: string) {
  const c = SEVERITY_COLOR[sev?.toLowerCase()] ?? '#64748b';
  return (
    <span className="text-xs font-mono uppercase px-1.5 py-0.5 rounded"
      style={{ color: c, border: `1px solid ${c}`, background: `${c}1a` }}>
      {sev}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SimulationPage() {
  const [simStatus, setSimStatus] = useState<SimStatus | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pool, setPool] = useState<PoolState | null>(null);
  const [lending, setLending] = useState<LendingState | null>(null);
  const [feed, setFeed] = useState<ActivityEvent[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [blockchainStats, setBlockchainStats] = useState<any>(null);
  const [aiNarrative, setAiNarrative] = useState<string>('');
  const [txHistory, setTxHistory] = useState<any[]>([]);

  // Controls
  const [maxSteps, setMaxSteps] = useState(500);
  const [tickDelay, setTickDelay] = useState(0.4);
  const [loading, setLoading] = useState<string | null>(null);
  const [activeScenarioJob, setActiveScenarioJob] = useState<string | null>(null);
  const [scenarioResult, setScenarioResult] = useState<any | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string>('fxtc_collapse');
  const [scenarioIntensity, setScenarioIntensity] = useState(1.0);
  const [activeTab, setActiveTab] = useState<'agents' | 'feed' | 'pool' | 'blockchain' | 'ai'>('agents');
  const feedRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const jobPollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Fetchers ────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const [statusRes, agentsRes, feedRes, poolRes, lendingRes, blockchainRes, txRes] =
      await Promise.allSettled([
        fetch(`${API_URL}/api/simulation/status`),
        fetch(`${API_URL}/api/agents`),
        fetch(`${API_URL}/api/sim/activity-feed?limit=80`),
        fetch(`${API_URL}/api/sim/pool`),
        fetch(`${API_URL}/api/sim/lending`),
        fetch(`${API_URL}/api/blockchain/stats`),
        fetch(`${API_URL}/api/blockchain/tx-history?limit=20`),
      ]);

    if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
      const j = await statusRes.value.json();
      setSimStatus(j.data ?? j);
    }
    if (agentsRes.status === 'fulfilled' && agentsRes.value.ok) {
      const j = await agentsRes.value.json();
      setAgents(j.data ?? j ?? []);
    }
    if (feedRes.status === 'fulfilled' && feedRes.value.ok) {
      const j = await feedRes.value.json();
      setFeed((j.data ?? j ?? []).reverse());
    }
    if (poolRes.status === 'fulfilled' && poolRes.value.ok) {
      const j = await poolRes.value.json();
      setPool(j.data ?? null);
    }
    if (lendingRes.status === 'fulfilled' && lendingRes.value.ok) {
      const j = await lendingRes.value.json();
      setLending(j.data ?? null);
    }
    if (blockchainRes.status === 'fulfilled' && blockchainRes.value.ok) {
      const j = await blockchainRes.value.json();
      setBlockchainStats(j.data ?? null);
    }
    if (txRes.status === 'fulfilled' && txRes.value.ok) {
      const j = await txRes.value.json();
      setTxHistory(j.data ?? []);
    }
  }, []);

  const fetchScenarios = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/scenarios/available`);
      if (res.ok) {
        const data = await res.json();
        setScenarios(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchNarrative = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/ai/market-narrative`);
      if (res.ok) {
        const j = await res.json();
        if (j.data?.narrative) setAiNarrative(j.data.narrative);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchScenarios();
    fetchNarrative();
    const interval = setInterval(() => {
      fetchAll();
      if (simStatus?.status === 'running') fetchNarrative();
    }, 2500);
    return () => clearInterval(interval);
  }, [fetchAll, fetchScenarios, fetchNarrative, simStatus?.status]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current && activeTab === 'feed') {
      feedRef.current.scrollTop = 0;
    }
  }, [feed, activeTab]);

  // Scenario job polling
  const pollJob = useCallback((jobId: string) => {
    jobPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/scenarios/job/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'done') {
            setScenarioResult(data.result);
            setActiveScenarioJob(null);
            clearInterval(jobPollRef.current!);
          } else if (data.status === 'error') {
            setActiveScenarioJob(null);
            clearInterval(jobPollRef.current!);
          }
        }
      } catch { /* ignore */ }
    }, 1000);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────

  async function startSimulation() {
    setLoading('start');
    setScenarioResult(null);
    try {
      const res = await fetch(`${API_URL}/api/simulation/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_steps: maxSteps, tick_delay: tickDelay }),
      });
      const j = await res.json();
      if (j.success) await fetchAll();
    } finally { setLoading(null); }
  }

  async function stopSimulation() {
    setLoading('stop');
    try {
      await fetch(`${API_URL}/api/simulation/stop`, { method: 'POST' });
      setActiveScenarioJob(null);
      clearInterval(jobPollRef.current!);
      await fetchAll();
    } finally { setLoading(null); }
  }

  async function pauseResume() {
    const isPaused = simStatus?.status === 'paused';
    setLoading('pause');
    try {
      await fetch(`${API_URL}/api/simulation/${isPaused ? 'resume' : 'pause'}`, { method: 'POST' });
      await fetchAll();
    } finally { setLoading(null); }
  }

  async function runScenario() {
    setLoading('scenario');
    setScenarioResult(null);
    try {
      // Auto-start simulation if not running
      if (simStatus?.status !== 'running') {
        await fetch(`${API_URL}/api/simulation/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ max_steps: maxSteps, tick_delay: tickDelay }),
        });
        await new Promise(r => setTimeout(r, 800));
      }
      const res = await fetch(`${API_URL}/api/scenarios/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_type: selectedScenario, intensity: scenarioIntensity, tick_delay: 0.05 }),
      });
      const j = await res.json();
      if (j.job_id) {
        setActiveScenarioJob(j.job_id);
        pollJob(j.job_id);
      }
    } finally { setLoading(null); }
  }

  async function injectStresEvent(eventType: string) {
    setLoading(eventType);
    try {
      await fetch(`${API_URL}/api/sim/stress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: eventType, magnitude: 1.5 }),
      });
      await fetchAll();
    } finally { setLoading(null); }
  }

  // ── Derived values ───────────────────────────────────────────────────────

  const isRunning = simStatus?.status === 'running';
  const isPaused = simStatus?.status === 'paused';
  const isIdle = !simStatus || simStatus.status === 'idle' || simStatus.status === 'completed';
  const progress = simStatus ? (simStatus.current_step / (simStatus.max_steps || 1)) * 100 : 0;

  const eventTypeColor: Record<string, string> = {
    panic_sell: '#ff3860', swap: '#00d4ff', arb_trade: '#00d4ff',
    attack: '#ff0033', flash_loan_attack: '#ff0033', liquidation: '#ff3860',
    borrow: '#b367ff', repay: '#22c55e', sandwich: '#f0a500',
    market_update: '#64748b', ai_narrative: '#b367ff', ai_decision: '#00d4ff',
    scenario: '#f0a500', price_crash: '#ff0033', liquidity_drain: '#ff3860',
    blockchain_tx: '#22c55e', 
    approval_confirmed: '#22c55e', 
    swap_confirmed: '#22c55e',
    approval_pending: '#f0a500',
    swap_pending: '#f0a500',
  };

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-text-primary">≈ Simulation Engine</h1>
          <p className="text-sm text-text-tertiary font-mono mt-1">
            AI-driven multi-agent DeFi simulation with real-world scenarios
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Status pill */}
          <span className={`text-xs font-mono px-3 py-1.5 rounded-full border font-bold ${
            isRunning ? 'border-[#22c55e] text-[#22c55e] bg-[#22c55e1a]' :
            isPaused  ? 'border-[#f0a500] text-[#f0a500] bg-[#f0a5001a]' :
                        'border-[#64748b] text-[#64748b] bg-[#64748b1a]'
          }`}>
            {isRunning ? '● RUNNING' : isPaused ? '⏸ PAUSED' : '○ IDLE'}
          </span>
          {isRunning && (
            <span className="text-xs font-mono text-text-tertiary">
              Step {simStatus?.current_step}/{simStatus?.max_steps} · {elapsed(simStatus?.elapsed_seconds ?? 0)}
            </span>
          )}
        </div>
      </div>

      {/* ── Progress Bar ────────────────────────────────────────────────── */}
      {!isIdle && (
        <div className="h-1.5 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: isRunning ? '#22c55e' : '#f0a500',
            }}
          />
        </div>
      )}

      {/* ── Control Panel ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Simulation Controls */}
        <div className="lg:col-span-2 rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-5">
          <h2 className="text-sm font-mono font-bold text-text-primary mb-4">⚙ Simulation Controls</h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-mono text-text-tertiary block mb-1">Max Steps</label>
              <input
                type="number" value={maxSteps} onChange={e => setMaxSteps(Number(e.target.value))}
                min={50} max={2000} step={50} disabled={isRunning || isPaused}
                className="w-full bg-(--color-bg-primary) border border-(--color-border) rounded px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-[#00d4ff] disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-text-tertiary block mb-1">Tick Delay (s)</label>
              <input
                type="number" value={tickDelay} onChange={e => setTickDelay(Number(e.target.value))}
                min={0.1} max={2.0} step={0.1} disabled={isRunning || isPaused}
                className="w-full bg-(--color-bg-primary) border border-(--color-border) rounded px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-[#00d4ff] disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {isIdle ? (
              <button
                onClick={startSimulation} disabled={loading === 'start'}
                className="flex-1 py-2.5 font-mono text-sm font-bold rounded border border-[#22c55e] text-[#22c55e] bg-[#22c55e1a] hover:bg-[#22c55e30] transition-colors disabled:opacity-50"
              >
                {loading === 'start' ? '▶ Starting...' : '▶ Start Simulation'}
              </button>
            ) : (
              <>
                <button
                  onClick={pauseResume} disabled={loading === 'pause'}
                  className={`flex-1 py-2.5 font-mono text-sm font-bold rounded border transition-colors disabled:opacity-50 ${
                    isPaused
                      ? 'border-[#22c55e] text-[#22c55e] bg-[#22c55e1a] hover:bg-[#22c55e30]'
                      : 'border-[#f0a500] text-[#f0a500] bg-[#f0a5001a] hover:bg-[#f0a50030]'
                  }`}
                >
                  {isPaused ? '▶ Resume' : '⏸ Pause'}
                </button>
                <button
                  onClick={stopSimulation} disabled={loading === 'stop'}
                  className="flex-1 py-2.5 font-mono text-sm font-bold rounded border border-[#ff3860] text-[#ff3860] bg-[#ff38601a] hover:bg-[#ff386030] transition-colors disabled:opacity-50"
                >
                  {loading === 'stop' ? '⏹ Stopping...' : '⏹ Stop'}
                </button>
              </>
            )}
          </div>

          {/* Stress event injectors */}
          {(isRunning || isPaused) && (
            <div className="mt-4 pt-4 border-t border-(--color-border)">
              <p className="text-xs font-mono text-text-tertiary mb-2">⚡ Inject Stress Event</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'price_crash', label: '📉 Price Crash', color: '#ff0033' },
                  { id: 'liquidity_drain', label: '💧 Drain Liquidity', color: '#f0a500' },
                  { id: 'mempool_flood', label: '🌊 MEV Flood', color: '#00d4ff' },
                ].map(ev => (
                  <button
                    key={ev.id}
                    onClick={() => injectStresEvent(ev.id)}
                    disabled={!!loading}
                    className="text-xs font-mono py-1.5 px-3 rounded border transition-colors disabled:opacity-50"
                    style={{ borderColor: ev.color, color: ev.color, background: `${ev.color}1a` }}
                  >
                    {loading === ev.id ? '...' : ev.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live Market Snapshot */}
        <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-5">
          <h2 className="text-sm font-mono font-bold text-text-primary mb-4">🌐 Live Market</h2>
          <div className="space-y-3">
            {simStatus?.market_data?.prices
              ? Object.entries(simStatus.market_data.prices).slice(0, 5).map(([sym, d]) => (
                <div key={sym} className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-text-primary">{sym}</span>
                  <div className="text-right">
                    <div className="text-xs font-mono text-text-primary">${d.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div className={`text-xs font-mono ${d.change_pct_24h >= 0 ? 'text-[#22c55e]' : 'text-[#ff3860]'}`}>
                      {fmtPct(d.change_pct_24h)} · {d.source}
                    </div>
                  </div>
                </div>
              ))
              : (
                <div className="space-y-2">
                  {['BTC', 'ETH', 'SOL', 'AAVE', 'UNI'].map(s => (
                    <div key={s} className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-text-tertiary">{s}</span>
                      <span className="text-xs font-mono text-text-tertiary">— CoinDesk</span>
                    </div>
                  ))}
                  <p className="text-xs font-mono text-text-tertiary text-center pt-2">Start simulation to stream live prices</p>
                </div>
              )
            }
          </div>
          {simStatus?.market_data?.condition && (
            <div className="mt-3 pt-3 border-t border-(--color-border)">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-text-tertiary">Sentiment</span>
                <span className="font-bold" style={{ color: simStatus.market_data.condition.sentiment.includes('fear') || simStatus.market_data.condition.sentiment === 'bearish' ? '#ff3860' : '#22c55e' }}>
                  {simStatus.market_data.condition.sentiment}
                </span>
              </div>
              <div className="flex justify-between text-xs font-mono mt-1">
                <span className="text-text-tertiary">Volatility</span>
                <span className="text-text-primary">{simStatus.market_data.condition.volatility}</span>
              </div>
              <div className="flex justify-between text-xs font-mono mt-1">
                <span className="text-text-tertiary">Risk Level</span>
                <span className="text-[#f0a500]">{((simStatus.market_data.condition.risk_level ?? 0) * 100).toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Scenario Library ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-mono font-bold text-text-primary">🎭 Real-World Scenario Library</h2>
            <p className="text-xs font-mono text-text-tertiary mt-0.5">
              Based on actual DeFi exploits. AI agents react to each phase as it unfolds.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs font-mono text-text-tertiary mr-2">Intensity</label>
              <input
                type="number" value={scenarioIntensity}
                onChange={e => setScenarioIntensity(Math.max(0.1, Math.min(2.0, Number(e.target.value))))}
                min={0.1} max={2.0} step={0.1}
                className="w-16 bg-(--color-bg-primary) border border-(--color-border) rounded px-2 py-1 text-sm font-mono text-text-primary focus:outline-none focus:border-[#f0a500]"
              />
              <span className="text-xs font-mono text-text-tertiary ml-1">×</span>
            </div>
            <button
              onClick={runScenario}
              disabled={!!loading || !!activeScenarioJob}
              className="py-2 px-4 font-mono text-sm font-bold rounded border border-[#f0a500] text-[#f0a500] bg-[#f0a5001a] hover:bg-[#f0a50030] transition-colors disabled:opacity-50"
            >
              {activeScenarioJob ? '⏳ Running...' : loading === 'scenario' ? '⏳ Launching...' : '⚔ Run Scenario'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          {scenarios.length > 0
            ? scenarios.map((sc) => {
              const meta = SCENARIO_META[sc.type] ?? { icon: '⚡', color: '#64748b', realEvent: sc.real_world_date };
              const isSelected = selectedScenario === sc.type;
              const sevColor = SEVERITY_COLOR[sc.severity?.toLowerCase()] ?? '#64748b';
              return (
                <div
                  key={sc.type}
                  onClick={() => setSelectedScenario(sc.type)}
                  className={`rounded-lg border cursor-pointer p-3 transition-all ${
                    isSelected ? 'opacity-100' : 'opacity-70 hover:opacity-90'
                  }`}
                  style={{
                    borderColor: isSelected ? meta.color : 'var(--color-border)',
                    background: isSelected ? `${meta.color}0d` : 'var(--color-bg-primary)',
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-lg">{meta.icon}</span>
                    {severityBadge(sc.severity)}
                  </div>
                  <div className="text-sm font-mono font-bold text-text-primary mb-0.5">{sc.name}</div>
                  <div className="text-xs font-mono text-text-tertiary mb-2">{sc.description}</div>
                  <div className="text-xs font-mono text-text-tertiary border-t border-(--color-border) pt-1.5 mt-1.5">
                    <span style={{ color: meta.color }}>📅 {meta.realEvent}</span>
                    <br /><span className="text-[#ff3860]">Est. damage: {sc.estimated_damage}</span>
                  </div>
                </div>
              );
            })
            : // Skeleton scenarios when API hasn't loaded
            Object.entries(SCENARIO_META).map(([type, meta]) => {
              const isSelected = selectedScenario === type;
              return (
                <div
                  key={type}
                  onClick={() => setSelectedScenario(type)}
                  className={`rounded-lg border cursor-pointer p-3 transition-all ${isSelected ? 'opacity-100' : 'opacity-70 hover:opacity-90'}`}
                  style={{
                    borderColor: isSelected ? meta.color : 'var(--color-border)',
                    background: isSelected ? `${meta.color}0d` : 'var(--color-bg-primary)',
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-lg">{meta.icon}</span>
                    <span className="text-xs font-mono text-text-tertiary">{type}</span>
                  </div>
                  <div className="text-xs font-mono text-text-tertiary">{meta.realEvent}</div>
                </div>
              );
            })
          }
        </div>

        {/* Scenario result */}
        {scenarioResult && (
          <div className="mt-3 pt-3 border-t border-(--color-border) bg-[#ff00330d] rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-mono font-bold text-[#ff3860]">📊 Scenario Complete</h3>
              <button onClick={() => setScenarioResult(null)} className="text-xs font-mono text-text-tertiary hover:text-text-primary">✕</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {[
                { l: 'Total Damage', v: fmt(scenarioResult.total_damage), c: '#ff3860' },
                { l: 'Liquidations', v: String(scenarioResult.liquidations_triggered), c: '#f0a500' },
                { l: 'Price Impact', v: fmtPct(scenarioResult.price_impact_pct), c: '#ff0033' },
                { l: 'Duration', v: `${scenarioResult.duration_seconds?.toFixed(1)}s`, c: '#00d4ff' },
              ].map(s => (
                <div key={s.l} className="text-center">
                  <div className="text-xs font-mono text-text-tertiary">{s.l}</div>
                  <div className="text-lg font-bold font-mono" style={{ color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
            {scenarioResult.lessons_learned?.length > 0 && (
              <div>
                <p className="text-xs font-mono text-text-tertiary mb-1.5">📘 Lessons Learned</p>
                <ul className="space-y-1">
                  {scenarioResult.lessons_learned.map((l: string, i: number) => (
                    <li key={i} className="text-xs font-mono text-text-secondary flex items-start gap-1.5">
                      <span style={{ color: '#22c55e' }}>{'›'}</span>{l}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Active scenario indicator */}
        {activeScenarioJob && (
          <div className="flex items-center gap-2 mt-3 text-xs font-mono text-[#f0a500]">
            <span className="animate-pulse">⏳</span>
            Scenario running (job: {activeScenarioJob}) — watch the feed for live events…
          </div>
        )}
      </div>

      {/* ── Main Content Tabs ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary)">
        {/* Tab bar */}
        <div className="flex border-b border-(--color-border)">
          {[
            { id: 'agents', label: `◈ Agents (${agents.length})` },
            { id: 'feed', label: `📋 Live Feed (${feed.length})` },
            { id: 'pool', label: '🏊 Pool State' },
            { id: 'blockchain', label: `⛓ Blockchain (${blockchainStats?.total_txs ?? 0} txs)` },
            { id: 'ai', label: '🤖 AI Console' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-xs font-mono font-bold transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-[#00d4ff] text-[#00d4ff]'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── AGENTS TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'agents' && (
          <div className="p-5">
            {agents.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">◈</div>
                <p className="text-sm font-mono text-text-tertiary">No agents active.</p>
                <p className="text-xs font-mono text-text-tertiary mt-1">Start the simulation to spawn agents.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {agents.map(agent => {
                  const cfg = AGENT_CONFIG[agent.type] ?? AGENT_CONFIG['retail_trader'];
                  const pnl = agent.pnl ?? agent.stats?.pnl ?? 0;
                  const trades = agent.trades_count ?? agent.stats?.trades_count ?? 0;
                  const stateColor = agent.state === 'running' ? '#22c55e' : agent.state === 'error' ? '#ff0033' : '#64748b';

                  return (
                    <div
                      key={agent.id}
                      className="rounded-lg border p-4 transition-all"
                      style={{ borderColor: agent.active ? cfg.color : 'var(--color-border)', background: agent.active ? `${cfg.color}08` : 'var(--color-bg-primary)' }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl" style={{ color: cfg.color }}>{cfg.icon}</span>
                          <div>
                            <div className="text-sm font-mono font-bold text-text-primary">{agent.name}</div>
                            <div className="text-xs font-mono" style={{ color: cfg.color }}>{cfg.label}</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: stateColor, border: `1px solid ${stateColor}`, background: `${stateColor}1a` }}>
                            {agent.state?.toUpperCase() ?? 'IDLE'}
                          </span>
                          {agent.active && <span className="text-xs font-mono text-[#22c55e]">● LIVE</span>}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-(--color-bg-secondary) rounded p-2">
                          <div className="text-xs font-mono text-text-tertiary">PnL</div>
                          <div className="text-sm font-bold font-mono" style={{ color: pnl >= 0 ? '#22c55e' : '#ff3860' }}>
                            {pnl >= 0 ? '+' : ''}{fmt(pnl)}
                          </div>
                        </div>
                        <div className="bg-(--color-bg-secondary) rounded p-2">
                          <div className="text-xs font-mono text-text-tertiary">Capital</div>
                          <div className="text-sm font-bold font-mono text-text-primary">{fmt(agent.capital)}</div>
                        </div>
                        <div className="bg-(--color-bg-secondary) rounded p-2">
                          <div className="text-xs font-mono text-text-tertiary">Trades</div>
                          <div className="text-sm font-bold font-mono text-text-primary">{trades}</div>
                        </div>
                        <div className="bg-(--color-bg-secondary) rounded p-2">
                          <div className="text-xs font-mono text-text-tertiary">Aggression</div>
                          <div className="text-sm font-bold font-mono text-[#f0a500]">{((agent.market_aggression ?? 1) * 100).toFixed(0)}%</div>
                        </div>
                      </div>

                      {/* Behavior Model */}
                      <div className="space-y-1 text-xs font-mono border-t border-(--color-border) pt-2">
                        <div className="flex justify-between">
                          <span className="text-text-tertiary">Risk Appetite</span>
                          <span style={{ color: cfg.color }}>{cfg.risk}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-tertiary">Reaction Speed</span>
                          <span className="text-text-primary">{cfg.speed}</span>
                        </div>
                        <div className="text-text-tertiary mt-1">{cfg.strategy}</div>
                        <div className="text-text-tertiary opacity-70 text-[10px]">{cfg.capital_model}</div>
                      </div>

                      {/* Groq AI advice badge */}
                      {agent.groq_advice && Object.keys(agent.groq_advice).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-(--color-border)">
                          <div className="text-xs font-mono text-[#b367ff] mb-1">🤖 Groq Advice</div>
                          <div className="text-[11px] font-mono text-text-tertiary bg-[#b367ff0d] rounded p-1.5">
                            {agent.groq_advice.action && <span className="text-[#b367ff] font-bold">{agent.groq_advice.action?.toUpperCase()} </span>}
                            {agent.groq_advice.reasoning ?? JSON.stringify(agent.groq_advice).slice(0, 80) + '…'}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── FEED TAB ─────────────────────────────────────────────────────── */}
        {activeTab === 'feed' && (
          <div className="p-5">
            <div ref={feedRef} className="space-y-1.5 max-h-[500px] overflow-y-auto">
              {feed.length === 0 ? (
                <p className="text-xs font-mono text-text-tertiary text-center py-8">Start simulation to see live events…</p>
              ) : (
                feed.map((ev, i) => {
                  const evColor = eventTypeColor[ev.event_type] ?? '#64748b';
                  const cfg = AGENT_CONFIG[ev.agent_type];
                  const icon = cfg?.icon ?? (ev.agent_type === 'ai' ? '🤖' : ev.agent_type === 'scenario' ? '🎭' : ev.agent_type === 'blockchain_tx' ? '⛓' : '●');
                  
                  // Check if this is a blockchain event
                  const isBlockchainEvent = ev.event_type === 'blockchain_tx' || 
                    ev.event_type === 'approval_confirmed' || 
                    ev.event_type === 'swap_confirmed' ||
                    ev.event_type === 'approval_pending' ||
                    ev.event_type === 'swap_pending' ||
                    ev.data?.tx_hash;
                  
                  return (
                    <div key={i} className={`flex items-start gap-2 py-2 px-3 rounded border border-(--color-border) last:border-0 ${
                      isBlockchainEvent ? 'bg-[#22c55e0a] border-[#22c55e33]' : 'border-(--color-border)'
                    }`}>
                      <span className="text-sm flex-shrink-0" style={{ color: cfg?.color ?? evColor }}>
                        {isBlockchainEvent ? '⛓' : icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-bold text-text-primary">{ev.agent_name}</span>
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                            style={{ color: evColor, border: `1px solid ${evColor}22`, background: `${evColor}11` }}>
                            {isBlockchainEvent && '⚡ '}{ev.event_type}
                          </span>
                          {ev.data?.severity && severityBadge(ev.data.severity)}
                        </div>
                        {ev.data?.description && (
                          <p className="text-xs font-mono text-text-secondary mt-0.5">{ev.data.description}</p>
                        )}
                        {ev.data?.narrative && (
                          <p className="text-xs font-mono text-[#b367ff] mt-0.5 italic">"{ev.data.narrative}"</p>
                        )}
                        {ev.data?.amount && (
                          <span className="text-xs font-mono text-text-tertiary">{fmt(ev.data.amount)}</span>
                        )}
                        {ev.data?.tx_hash && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            <a href={`https://sepolia.etherscan.io/tx/${ev.data.tx_hash}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs font-mono text-[#22c55e] hover:text-[#16a34a] hover:underline inline-flex items-center gap-1 px-2 py-1 rounded bg-[#22c55e11] border border-[#22c55e33]">
                              <span className="font-bold">TX:</span> {ev.data.tx_hash.slice(0, 10)}...{ev.data.tx_hash.slice(-8)} ↗
                            </a>
                            {ev.data?.pool_contract && (
                              <a href={`https://sepolia.etherscan.io/address/${ev.data.pool_contract}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-mono text-[#00d4ff] hover:text-[#00b8e6] hover:underline inline-flex items-center gap-1 px-2 py-1 rounded bg-[#00d4ff11] border border-[#00d4ff33]">
                                <span className="font-bold">Pool:</span> {ev.data.pool_contract.slice(0, 6)}...{ev.data.pool_contract.slice(-4)} ↗
                              </a>
                            )}
                            {ev.data?.token_contract && (
                              <a href={`https://sepolia.etherscan.io/address/${ev.data.token_contract}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-mono text-[#b367ff] hover:text-[#9d4edd] hover:underline inline-flex items-center gap-1 px-2 py-1 rounded bg-[#b367ff11] border border-[#b367ff33]">
                                <span className="font-bold">Token:</span> {ev.data.token_contract.slice(0, 6)}...{ev.data.token_contract.slice(-4)} ↗
                              </a>
                            )}
                            {ev.data?.token_in_contract && (
                              <a href={`https://sepolia.etherscan.io/address/${ev.data.token_in_contract}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-mono text-[#b367ff] hover:text-[#9d4edd] hover:underline inline-flex items-center gap-1 px-2 py-1 rounded bg-[#b367ff11] border border-[#b367ff33]">
                                <span className="font-bold">Token In:</span> {ev.data.token_in_contract.slice(0, 6)}...{ev.data.token_in_contract.slice(-4)} ↗
                              </a>
                            )}
                            {ev.data?.token_out_contract && (
                              <a href={`https://sepolia.etherscan.io/address/${ev.data.token_out_contract}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-mono text-[#f0a500] hover:text-[#d99500] hover:underline inline-flex items-center gap-1 px-2 py-1 rounded bg-[#f0a50011] border border-[#f0a50033]">
                                <span className="font-bold">Token Out:</span> {ev.data.token_out_contract.slice(0, 6)}...{ev.data.token_out_contract.slice(-4)} ↗
                              </a>
                            )}
                          </div>
                        )}
                        {isBlockchainEvent && !ev.data?.tx_hash && ev.event_type.includes('pending') && (
                          <div className="mt-1">
                            <span className="text-xs font-mono text-[#f0a500] inline-flex items-center gap-1 px-2 py-1 rounded bg-[#f0a50011] border border-[#f0a50033]">
                              ⏳ Waiting for blockchain confirmation...
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-text-tertiary flex-shrink-0">{timeAgo(ev.timestamp)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── POOL TAB ────────────────────────────────────────────────────── */}
        {activeTab === 'pool' && (
          <div className="p-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* AMM Pool State */}
              <div>
                <h3 className="text-sm font-mono font-bold text-text-primary mb-3">🏊 AMM Pool (PALLADIUM / BADASSIUM)</h3>
                {pool ? (
                  <div className="space-y-3">
                    {[
                      { label: 'Reserve A (PALLADIUM)', value: pool.reserve_a?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', color: '#b367ff' },
                      { label: 'Reserve B (BADASSIUM)', value: pool.reserve_b?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', color: '#00d4ff' },
                      { label: 'Current Price (A/B)', value: (pool.price_a_per_b ?? 0).toFixed(6), color: '#f0a500' },
                      { label: 'Reference Price', value: (pool.reference_price ?? 0).toFixed(6), color: '#64748b' },
                      { label: 'Total Swaps', value: String(pool.total_swaps ?? 0), color: '#22c55e' },
                      { label: 'Total Volume', value: fmt(pool.total_volume ?? 0), color: '#22c55e' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-2 border-b border-(--color-border) last:border-0">
                        <span className="text-xs font-mono text-text-tertiary">{row.label}</span>
                        <span className="text-sm font-mono font-bold" style={{ color: row.color }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-mono text-text-tertiary">Start simulation to view pool state.</p>
                )}
              </div>

              {/* Lending State */}
              <div>
                <h3 className="text-sm font-mono font-bold text-text-primary mb-3">🏦 Lending Protocol</h3>
                {lending ? (
                  <div className="space-y-3">
                    {[
                      { label: 'Total Borrowed', value: fmt(lending.total_borrowed ?? 0), color: '#ff3860' },
                      { label: 'Total Collateral', value: fmt(lending.total_collateral ?? 0), color: '#22c55e' },
                      { label: 'Utilization Rate', value: `${((lending.utilization_rate ?? 0) * 100).toFixed(1)}%`, color: '#f0a500' },
                      { label: 'Interest Rate', value: `${((lending.interest_rate ?? 0) * 100).toFixed(2)}% APR`, color: '#00d4ff' },
                      { label: 'Active Positions', value: String(lending.positions?.length ?? 0), color: '#b367ff' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-2 border-b border-(--color-border) last:border-0">
                        <span className="text-xs font-mono text-text-tertiary">{row.label}</span>
                        <span className="text-sm font-mono font-bold" style={{ color: row.color }}>{row.value}</span>
                      </div>
                    ))}

                    {/* Positions table */}
                    {lending.positions && lending.positions.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-mono text-text-tertiary mb-2">Active Positions (liquidatable highlighted)</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs font-mono">
                            <thead>
                              <tr className="text-text-tertiary border-b border-(--color-border)">
                                <th className="text-left py-1 pr-4">Wallet</th>
                                <th className="text-right py-1 pr-4">Debt</th>
                                <th className="text-right py-1 pr-4">Collateral</th>
                                <th className="text-right py-1">Health</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lending.positions.slice(0, 8).map((pos: any, i: number) => {
                                const hf = pos.health_factor ?? 999;
                                const hfColor = hf < 1 ? '#ff0033' : hf < 1.2 ? '#ff3860' : hf < 1.5 ? '#f0a500' : '#22c55e';
                                return (
                                  <tr key={i} className={`border-b border-(--color-border) last:border-0 ${hf < 1 ? 'bg-[#ff003308]' : ''}`}>
                                    <td className="py-1.5 pr-4 text-text-primary">{(pos.wallet ?? '').slice(0, 10)}…</td>
                                    <td className="py-1.5 pr-4 text-right text-[#ff3860]">{fmt(pos.debt ?? 0)}</td>
                                    <td className="py-1.5 pr-4 text-right text-[#22c55e]">{fmt(pos.collateral ?? 0)}</td>
                                    <td className="py-1.5 text-right font-bold" style={{ color: hfColor }}>{hf > 100 ? '∞' : hf.toFixed(2)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs font-mono text-text-tertiary">Start simulation to view lending state.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── BLOCKCHAIN TAB ──────────────────────────────────────────────── */}
        {activeTab === 'blockchain' && (
          <div className="p-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Stats */}
              <div>
                <h3 className="text-sm font-mono font-bold text-text-primary mb-3">⛓ Sepolia On-Chain Recording</h3>
                {blockchainStats ? (
                  <div className="space-y-3">
                    {[
                      { label: 'Connected', value: blockchainStats.connected ? '✅ Live Sepolia' : '❌ Disconnected', color: blockchainStats.connected ? '#22c55e' : '#ff3860' },
                      { label: 'Current Block', value: `#${blockchainStats.current_block?.toLocaleString()}`, color: '#00d4ff' },
                      { label: 'Contracts Loaded', value: blockchainStats.contracts_loaded ? 'Yes (5 contracts)' : 'No', color: blockchainStats.contracts_loaded ? '#22c55e' : '#ff3860' },
                      { label: 'Real TXs Enabled', value: blockchainStats.real_txs_enabled ? '✅ ON' : '○ Simulated only', color: blockchainStats.real_txs_enabled ? '#22c55e' : '#f0a500' },
                      { label: 'Total Recorded TXs', value: String(blockchainStats.total_txs), color: '#b367ff' },
                      { label: 'On-Chain TXs', value: String(blockchainStats.on_chain_txs), color: '#22c55e' },
                      { label: 'Simulated TXs', value: String(blockchainStats.simulated_txs), color: '#64748b' },
                      { label: 'Total Gas Used', value: (blockchainStats.total_gas_used ?? 0).toLocaleString(), color: '#f0a500' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-2 border-b border-(--color-border) last:border-0">
                        <span className="text-xs font-mono text-text-tertiary">{row.label}</span>
                        <span className="text-xs font-mono font-bold" style={{ color: row.color }}>{row.value}</span>
                      </div>
                    ))}

                    {/* By contract breakdown */}
                    {blockchainStats.by_contract && Object.keys(blockchainStats.by_contract).length > 0 && (
                      <div className="pt-2">
                        <p className="text-xs font-mono text-text-tertiary mb-2">Transactions by Contract</p>
                        {Object.entries(blockchainStats.by_contract).map(([contract, count]) => (
                          <div key={contract} className="flex justify-between text-xs font-mono py-1">
                            <span className="text-text-secondary">{contract}</span>
                            <span className="text-[#00d4ff] font-bold">{String(count)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Contract addresses */}
                    {blockchainStats.contract_addresses && (
                      <div className="pt-2 border-t border-(--color-border)">
                        <p className="text-xs font-mono text-text-tertiary mb-2">Contract Addresses (Sepolia)</p>
                        {Object.entries(blockchainStats.contract_addresses).map(([name, addr]) => (
                          <div key={name} className="flex justify-between items-center text-xs font-mono py-1">
                            <span className="text-text-secondary">{name}</span>
                            <a href={`https://sepolia.etherscan.io/address/${addr}`} target="_blank" rel="noopener noreferrer"
                              className="text-[#00d4ff] hover:underline">
                              {String(addr).slice(0, 8)}…{String(addr).slice(-6)} ↗
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs font-mono text-text-tertiary">Loading blockchain stats…</p>
                )}
              </div>

              {/* TX History */}
              <div>
                <h3 className="text-sm font-mono font-bold text-text-primary mb-3">📜 Transaction History</h3>
                {txHistory.length === 0 ? (
                  <p className="text-xs font-mono text-text-tertiary">No blockchain transactions recorded yet. Start simulation to generate transactions.</p>
                ) : (
                  <div className="space-y-2 max-h-[450px] overflow-y-auto">
                    {txHistory.map((tx: any, i: number) => {
                      const isReal = tx.args?.on_chain;
                      const statusColor = tx.status === 'success' ? '#22c55e' : tx.status === 'pending' ? '#f0a500' : '#ff3860';
                      return (
                        <div key={i} className={`rounded border p-2.5 text-xs font-mono ${isReal ? 'border-[#22c55e33] bg-[#22c55e08]' : 'border-(--color-border)'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-text-primary">{tx.contract} · {tx.function}</span>
                            <span style={{ color: statusColor }}>{tx.status}</span>
                          </div>
                          <div className="flex items-center gap-2 text-text-tertiary">
                            <span>Block #{tx.block_number}</span>
                            <span>·</span>
                            <span>{(tx.gas_used ?? 0).toLocaleString()} gas</span>
                            {isReal && <span className="text-[#22c55e] font-bold">● REAL</span>}
                          </div>
                          {isReal && (
                            <a href={`https://sepolia.etherscan.io/tx/${tx.tx_hash}`} target="_blank" rel="noopener noreferrer"
                              className="text-[#00d4ff] hover:underline mt-1 block">
                              {tx.tx_hash.slice(0, 20)}… ↗
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── AI CONSOLE TAB ──────────────────────────────────────────────── */}
        {activeTab === 'ai' && (
          <div className="p-5 space-y-5">
            {/* Groq Narrative */}
            <div>
              <h3 className="text-sm font-mono font-bold text-text-primary mb-3">🤖 Groq Market Narrative (llama-3.3-70b-versatile)</h3>
              <div className="rounded-lg border border-[#b367ff33] bg-[#b367ff08] p-4">
                {aiNarrative ? (
                  <p className="text-sm font-mono text-text-primary italic">"{aiNarrative}"</p>
                ) : (
                  <p className="text-xs font-mono text-text-tertiary">Fetching Groq market narrative…</p>
                )}
              </div>
            </div>

            {/* AI Agent Decisions from feed */}
            <div>
              <h3 className="text-sm font-mono font-bold text-text-primary mb-3">🧠 Recent AI Agent Decisions</h3>
              {feed.filter(ev => ev.event_type === 'ai_decision').length === 0 ? (
                <p className="text-xs font-mono text-text-tertiary">No Groq AI decisions yet. AI decisions appear every ~30 simulation steps.</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {feed.filter(ev => ev.event_type === 'ai_decision').slice(0, 10).map((ev, i) => {
                    const advice = ev.data?.groq_advice ?? {};
                    const cfg = AGENT_CONFIG[ev.agent_type];
                    return (
                      <div key={i} className="rounded border border-[#b367ff22] bg-[#b367ff08] p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span style={{ color: cfg?.color ?? '#b367ff' }}>{cfg?.icon ?? '◈'}</span>
                          <span className="text-xs font-mono font-bold text-text-primary">{ev.agent_name}</span>
                          {advice.action && (
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#b367ff1a] text-[#b367ff] font-bold">
                              {advice.action?.toUpperCase()}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-text-tertiary ml-auto">{timeAgo(ev.timestamp)}</span>
                        </div>
                        {advice.reasoning && (
                          <p className="text-xs font-mono text-text-secondary italic">"{advice.reasoning}"</p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {advice.amount_pct && <span className="text-[10px] font-mono text-text-tertiary">Amount: {advice.amount_pct}%</span>}
                          {advice.token && <span className="text-[10px] font-mono text-[#00d4ff]">{advice.token}</span>}
                          {advice.severity && <span className="text-[10px] font-mono" style={{ color: SEVERITY_COLOR[advice.severity] ?? '#64748b' }}>{advice.severity}</span>}
                          {advice.attack_type && <span className="text-[10px] font-mono text-[#ff0033]">{advice.attack_type}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI Narratives from feed */}
            <div>
              <h3 className="text-sm font-mono font-bold text-text-primary mb-3">📰 Market Narratives (Live)</h3>
              {feed.filter(ev => ev.event_type === 'ai_narrative').length === 0 ? (
                <p className="text-xs font-mono text-text-tertiary">Groq market narratives appear every 15 seconds of real market data refresh.</p>
              ) : (
                <div className="space-y-2">
                  {feed.filter(ev => ev.event_type === 'ai_narrative').slice(0, 5).map((ev, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs font-mono text-text-secondary">
                      <span className="text-[#b367ff] flex-shrink-0">{'›'}</span>
                      <span className="italic">"{ev.data?.narrative}"</span>
                      <span className="text-text-tertiary flex-shrink-0">{timeAgo(ev.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Agent Class Reference ────────────────────────────────────────── */}
      <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-5">
        <h2 className="text-sm font-mono font-bold text-text-primary mb-4">📚 Agent Class Reference (Behavioral Models)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(AGENT_CONFIG).map(([type, cfg]) => (
            <div key={type} className="rounded border border-(--color-border) bg-(--color-bg-primary) p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg" style={{ color: cfg.color }}>{cfg.icon}</span>
                <span className="text-xs font-mono font-bold text-text-primary">{cfg.label}</span>
              </div>
              <div className="space-y-1 text-[11px] font-mono">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Risk</span>
                  <span style={{ color: cfg.color }}>{cfg.risk}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Speed</span>
                  <span className="text-text-primary">{cfg.speed}</span>
                </div>
                <div className="text-text-tertiary mt-1">{cfg.strategy}</div>
                <div className="text-[10px] text-text-tertiary opacity-60 mt-0.5">{cfg.capital_model}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
