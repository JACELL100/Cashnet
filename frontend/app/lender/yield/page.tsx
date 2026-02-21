'use client';

import React, { useEffect, useCallback, useState, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Types ────────────────────────────────────────────────────────────────────
interface PoolState {
  pool_id: string;
  name: string;
  token0: string;
  token1: string;
  reserve0: number;
  reserve1: number;
  fee_pct: number;
  price_token0_per_token1: number;
  price_token1_per_token0: number;
  total_lp_tokens: number;
  tvl: number;
  volume_24h: number;
  swap_count: number;
  provider_count: number;
  k_product: number;
}

interface BlockchainPoolState {
  reserve_a: number;
  reserve_b: number;
  price_a_per_b: number;
  price_b_per_a: number;
  total_liquidity: number;
}

interface PoolEvent {
  event_id: string;
  event_type: string;
  description: string;
  timestamp: number;
  metadata: Record<string, number | string | boolean | null>;
}

interface YieldSnapshot {
  ts: number;
  fee_revenue: number;
  apy: number;
  tvl: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number, dec = 2) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: dec }).format(v);

const fmtUSD = (v: number, forceFull = false) => {
  if (forceFull) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
};

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

/** Impermanent loss given price ratio k = current/entry */
const calcIL = (k: number) => {
  if (k <= 0) return 0;
  return (2 * Math.sqrt(k)) / (1 + k) - 1;
};

/** APY from 24 h fee revenue and TVL */
const calcAPY = (feeRevenue24h: number, tvl: number) =>
  tvl > 0 ? (feeRevenue24h / tvl) * 365 * 100 : 0;

// ── Mini sparkline via divs ───────────────────────────────────────────────────
function Sparkline({
  data,
  color = '#b367ff',
  height = 48,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  if (data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return (
    <div className="flex items-end gap-px" style={{ height }}>
      {data.map((v, i) => {
        const h = Math.max(4, ((v - min) / range) * height);
        return (
          <div
            key={i}
            className="flex-1 rounded-t transition-all duration-300"
            style={{ height: h, background: color, opacity: 0.6 + (i / data.length) * 0.4 }}
          />
        );
      })}
    </div>
  );
}

// ── IL Curve ─────────────────────────────────────────────────────────────────
function ILCurve({ entryPrice, currentPrice }: { entryPrice: number; currentPrice: number }) {
  const steps = 40;
  const ratios = Array.from({ length: steps }, (_, i) => 0.2 + (i / (steps - 1)) * 3.8); // 0.2× – 4.0×
  const losses = ratios.map((r) => Math.abs(calcIL(r)) * 100);
  const maxLoss = Math.max(...losses);

  const currentRatio = entryPrice > 0 ? currentPrice / entryPrice : 1;
  const currentLoss = Math.abs(calcIL(currentRatio)) * 100;
  const markerIdx = Math.round(((Math.min(Math.max(currentRatio, 0.2), 4.0) - 0.2) / 3.8) * (steps - 1));

  return (
    <div>
      <div className="flex items-end gap-px" style={{ height: 80 }}>
        {losses.map((loss, i) => {
          const h = Math.max(3, (loss / maxLoss) * 80);
          const isMarker = i === markerIdx;
          const lossColor = loss > 10 ? '#ff3860' : loss > 4 ? '#f0a500' : '#22c55e';
          return (
            <div
              key={i}
              title={`Price ratio ${(0.2 + (i / (steps - 1)) * 3.8).toFixed(2)}× → IL ${loss.toFixed(2)}%`}
              className="flex-1 rounded-t transition-all duration-200 cursor-pointer hover:opacity-80"
              style={{
                height: h,
                background: isMarker ? '#ffffff' : lossColor,
                opacity: isMarker ? 1 : 0.7,
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-xs font-mono text-text-tertiary mt-1.5">
        <span>0.2×</span>
        <span className="text-text-secondary">Current: {currentRatio.toFixed(2)}× → <span style={{ color: currentLoss > 10 ? '#ff3860' : currentLoss > 4 ? '#f0a500' : '#22c55e' }}>{currentLoss.toFixed(2)}% IL</span></span>
        <span>4×</span>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function YieldAnalyticsPage() {
  const [simPool, setSimPool] = useState<PoolState | null>(null);
  const [chainPool, setChainPool] = useState<BlockchainPoolState | null>(null);
  const [events, setEvents] = useState<PoolEvent[]>([]);
  const [history, setHistory] = useState<YieldSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // IL calculator state
  const [entryPrice, setEntryPrice] = useState('');
  const [currentPriceOverride, setCurrentPriceOverride] = useState('');
  const [lpAmount, setLpAmount] = useState('');

  // Snapshot history ref so we can append without re-render loops
  const historyRef = useRef<YieldSnapshot[]>([]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [simRes, chainRes, eventsRes] = await Promise.allSettled([
        fetch(`${API}/liquidity-engine/pools/default/state`),
        fetch(`${API}/pool/state`),
        fetch(`${API}/liquidity-engine/pools/default/events?limit=50`),
      ]);

      let poolData: PoolState | null = null;
      let chainData: BlockchainPoolState | null = null;

      if (simRes.status === 'fulfilled' && simRes.value.ok) {
        const j = await simRes.value.json();
        poolData = j.data as PoolState;
        setSimPool(poolData);
        setError(null);
      } else {
        setError('Simulation engine offline — showing on-chain data only.');
      }

      if (chainRes.status === 'fulfilled' && chainRes.value.ok) {
        const j = await chainRes.value.json();
        chainData = j as BlockchainPoolState;
        setChainPool(chainData);
      }

      if (eventsRes.status === 'fulfilled' && eventsRes.value.ok) {
        const j = await eventsRes.value.json();
        setEvents(j.data ?? []);
      }

      // Build a yield snapshot from whatever we have
      if (poolData) {
        const fee24h = (poolData.volume_24h ?? 0) * (poolData.fee_pct / 100);
        const tvl = poolData.tvl ?? 0;
        const snap: YieldSnapshot = {
          ts: Date.now(),
          fee_revenue: fee24h,
          apy: calcAPY(fee24h, tvl),
          tvl,
        };
        historyRef.current = [...historyRef.current.slice(-47), snap];
        setHistory([...historyRef.current]);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(() => fetchAll(true), 5000);
    return () => clearInterval(id);
  }, [fetchAll]);

  // ── Derived metrics ────────────────────────────────────────────────────────
  const fee24h = simPool ? (simPool.volume_24h ?? 0) * (simPool.fee_pct / 100) : 0;
  const tvl = simPool?.tvl ?? chainPool?.total_liquidity ?? 0;
  const apy = calcAPY(fee24h, tvl);
  const volume24h = simPool?.volume_24h ?? 0;
  const feePct = simPool?.fee_pct ?? 0.3;
  const swapCount = simPool?.swap_count ?? 0;
  const providerCount = simPool?.provider_count ?? 1;
  const avgFeePerSwap = swapCount > 0 ? fee24h / swapCount : 0;
  const feePerProvider = providerCount > 0 ? fee24h / providerCount : 0;

  // Spot price — prefer sim, fall back to chain
  const spotPrice =
    simPool?.price_token0_per_token1 ??
    chainPool?.price_a_per_b ??
    0;

  // IL calculator
  const ilEntryPrice = parseFloat(entryPrice) || spotPrice;
  const ilCurrentPrice = parseFloat(currentPriceOverride) || spotPrice;
  const ilRatio = ilEntryPrice > 0 ? ilCurrentPrice / ilEntryPrice : 1;
  const ilPct = Math.abs(calcIL(ilRatio)) * 100;
  const lpAmt = parseFloat(lpAmount) || 0;
  const ilLoss = lpAmt * (ilPct / 100);
  const holdValue = lpAmt;
  const lpValue = lpAmt * (1 - ilPct / 100);

  // Fee APY breakdown for the breakdown bar
  const yieldComponents = [
    { label: 'LP Fee Yield', pct: apy, color: '#b367ff' },
    { label: 'Volume Boost', pct: volume24h > tvl * 0.1 ? apy * 0.15 : 0, color: '#00d4ff' },
    { label: '— IL Drag', pct: ilPct * -1, color: '#ff3860' },
  ];

  const apyHistory = history.map((s) => s.apy);
  const tvlHistory = history.map((s) => s.tvl);
  const feeHistory = history.map((s) => s.fee_revenue);

  // Swap volume breakdown by event type
  const swapEvents = events.filter((e) => e.event_type === 'SWAP');
  const addEvents = events.filter((e) => e.event_type === 'ADD');
  const removeEvents = events.filter((e) => e.event_type === 'REMOVE');

  return (
    <div className="space-y-6 animate-fadeUp">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-text-primary flex items-center gap-2">
            <span className="text-[#b367ff]">◆</span> Yield Analytics
          </h1>
          <p className="text-sm text-text-tertiary font-mono mt-1">
            {simPool
              ? `${simPool.token0}/${simPool.token1} · ${feePct.toFixed(2)}% fee · ${swapCount} swaps today · ${providerCount} LPs`
              : 'Live fee revenue, APY & impermanent loss tracker'}
          </p>
        </div>
        <button
          onClick={() => fetchAll()}
          className="text-xs font-mono px-3 py-1.5 rounded border border-[color:var(--color-border)] text-text-tertiary hover:text-[#b367ff] hover:border-[#b367ff] transition-colors"
        >
          ↺ Refresh
        </button>
      </div>

      {/* Backend offline banner */}
      {error && (
        <div className="rounded-lg border border-[#f0a500] bg-[rgba(240,165,0,0.08)] px-4 py-3 text-xs font-mono text-[#f0a500]">
          ⚠ {error}
        </div>
      )}

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Pool APY',
            value: loading && !simPool ? '···' : `${apy.toFixed(2)}%`,
            sub: 'fee yield annualised',
            color: '#b367ff',
          },
          {
            label: 'Fee Revenue 24 h',
            value: loading && !simPool ? '···' : fmtUSD(fee24h),
            sub: `${fmtUSD(volume24h)} volume`,
            color: '#00d4ff',
          },
          {
            label: 'Total Value Locked',
            value: loading && !simPool ? '···' : fmtUSD(tvl),
            sub: chainPool ? `Chain: ${fmtUSD(chainPool.total_liquidity)}` : 'on-chain n/a',
            color: '#22c55e',
          },
          {
            label: 'IL (current)',
            value: loading ? '···' : `${ilPct.toFixed(2)}%`,
            sub: `price ratio ${ilRatio.toFixed(3)}×`,
            color: ilPct > 10 ? '#ff3860' : ilPct > 4 ? '#f0a500' : '#22c55e',
          },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-4"
          >
            <div className="text-xs font-mono text-text-tertiary mb-1 uppercase tracking-wider">
              {k.label}
            </div>
            <div className="text-2xl font-bold font-mono" style={{ color: k.color }}>
              {k.value}
            </div>
            <div className="text-xs font-mono text-text-tertiary mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Main 3-column layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Col 1: Fee Breakdown + IL Calculator ─────────────────────── */}
        <div className="space-y-4">

          {/* Yield Breakdown */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <h2 className="text-sm font-mono font-bold text-text-primary mb-4">
              Yield Components
            </h2>
            <div className="space-y-3">
              {yieldComponents.map((c) => {
                const abs = Math.abs(c.pct);
                const barW = Math.min(100, (abs / (Math.max(...yieldComponents.map((x) => Math.abs(x.pct))) || 1)) * 100);
                return (
                  <div key={c.label}>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-text-secondary">{c.label}</span>
                      <span style={{ color: c.color }} className="font-bold">
                        {fmtPct(c.pct)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-[color:var(--color-bg-primary)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${barW}%`, background: c.color, opacity: 0.8 }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="border-t border-[color:var(--color-border)] pt-3 mt-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-text-tertiary">Net Yield (est.)</span>
                  <span
                    className="font-bold"
                    style={{ color: apy - ilPct >= 0 ? '#22c55e' : '#ff3860' }}
                  >
                    {fmtPct(apy - ilPct)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Fee stats */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <h2 className="text-sm font-mono font-bold text-text-primary mb-4">
              Fee Statistics
            </h2>
            <div className="space-y-2">
              {[
                { label: 'Fee Rate', value: `${feePct.toFixed(3)}%` },
                { label: 'Swaps (24 h)', value: fmt(swapCount, 0) },
                { label: 'Avg Fee / Swap', value: fmtUSD(avgFeePerSwap) },
                { label: 'Fee / LP Provider', value: fmtUSD(feePerProvider) },
                { label: 'Volume / TVL', value: tvl > 0 ? `${((volume24h / tvl) * 100).toFixed(1)}%` : '—' },
                {
                  label: 'k (invariant)',
                  value: simPool ? (simPool.k_product >= 1e9 ? `${(simPool.k_product / 1e9).toFixed(2)}B` : fmt(simPool.k_product, 0)) : '—',
                },
              ].map((row) => (
                <div key={row.label} className="flex justify-between text-xs font-mono">
                  <span className="text-text-tertiary">{row.label}</span>
                  <span className="text-text-primary">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* IL Calculator */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <h2 className="text-sm font-mono font-bold text-text-primary mb-1 flex items-center gap-2">
              <span className="text-[#f0a500]">△</span> IL Calculator
            </h2>
            <p className="text-xs font-mono text-text-tertiary mb-4">
              Impermanent loss vs. holding
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono text-text-tertiary block mb-1">
                  Entry Price ({simPool?.token0 ?? 'TokenA'}/{simPool?.token1 ?? 'TokenB'})
                </label>
                <input
                  type="number"
                  placeholder={`${spotPrice > 0 ? spotPrice.toFixed(6) : 'e.g. 1.0'}`}
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="w-full bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-[#f0a500] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-mono text-text-tertiary block mb-1">
                  Current Price (leave blank for live)
                </label>
                <input
                  type="number"
                  placeholder={`live: ${spotPrice > 0 ? spotPrice.toFixed(6) : '—'}`}
                  value={currentPriceOverride}
                  onChange={(e) => setCurrentPriceOverride(e.target.value)}
                  className="w-full bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-[#f0a500] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-mono text-text-tertiary block mb-1">
                  LP Position Value ($)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 10000"
                  value={lpAmount}
                  onChange={(e) => setLpAmount(e.target.value)}
                  className="w-full bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-[#f0a500] transition-colors"
                />
              </div>

              {/* Result */}
              <div className="bg-[color:var(--color-bg-primary)] rounded px-3 py-3 border border-[color:var(--color-border)] space-y-1.5">
                {[
                  { label: 'Price Ratio', value: `${ilRatio.toFixed(4)}×`, color: '#b0b8d1' },
                  { label: 'IL', value: `${ilPct.toFixed(3)}%`, color: ilPct > 10 ? '#ff3860' : ilPct > 4 ? '#f0a500' : '#22c55e' },
                  ...(lpAmt > 0
                    ? [
                        { label: 'Hold Value', value: fmtUSD(holdValue, true), color: '#b0b8d1' },
                        { label: 'LP Value', value: fmtUSD(lpValue, true), color: ilPct > 4 ? '#f0a500' : '#22c55e' },
                        { label: 'Loss vs. Hold', value: `-${fmtUSD(ilLoss, true)}`, color: '#ff3860' },
                      ]
                    : []),
                ].map((r) => (
                  <div key={r.label} className="flex justify-between text-xs font-mono">
                    <span className="text-text-tertiary">{r.label}</span>
                    <span style={{ color: r.color }} className="font-bold">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Col 2: Sparklines + IL curve ─────────────────────────────── */}
        <div className="space-y-4">

          {/* APY sparkline */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-mono font-bold text-text-primary">APY Over Time</h2>
              <span className="text-xs font-mono" style={{ color: '#b367ff' }}>
                {apyHistory.length > 0 ? `${apyHistory[apyHistory.length - 1].toFixed(2)}%` : '—'}
              </span>
            </div>
            {apyHistory.length > 1 ? (
              <Sparkline data={apyHistory} color="#b367ff" height={60} />
            ) : (
              <div className="h-14 flex items-center justify-center text-xs font-mono text-text-tertiary">
                {loading ? '···' : 'Accumulating data...'}
              </div>
            )}
            <div className="flex justify-between text-xs font-mono text-text-tertiary mt-2">
              <span>{apyHistory.length > 0 ? `${Math.min(...apyHistory).toFixed(1)}% min` : ''}</span>
              <span>{apyHistory.length > 0 ? `${Math.max(...apyHistory).toFixed(1)}% max` : ''}</span>
            </div>
          </div>

          {/* TVL sparkline */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-mono font-bold text-text-primary">TVL Over Time</h2>
              <span className="text-xs font-mono text-[#22c55e]">
                {tvlHistory.length > 0 ? fmtUSD(tvlHistory[tvlHistory.length - 1]) : '—'}
              </span>
            </div>
            {tvlHistory.length > 1 ? (
              <Sparkline data={tvlHistory} color="#22c55e" height={60} />
            ) : (
              <div className="h-14 flex items-center justify-center text-xs font-mono text-text-tertiary">
                {loading ? '···' : 'Accumulating data...'}
              </div>
            )}
            <div className="flex justify-between text-xs font-mono text-text-tertiary mt-2">
              <span>{tvlHistory.length > 0 ? `${fmtUSD(Math.min(...tvlHistory))} min` : ''}</span>
              <span>{tvlHistory.length > 0 ? `${fmtUSD(Math.max(...tvlHistory))} max` : ''}</span>
            </div>
          </div>

          {/* Fee revenue sparkline */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-mono font-bold text-text-primary">Fee Revenue</h2>
              <span className="text-xs font-mono text-[#00d4ff]">
                {feeHistory.length > 0 ? fmtUSD(feeHistory[feeHistory.length - 1]) : '—'}
              </span>
            </div>
            {feeHistory.length > 1 ? (
              <Sparkline data={feeHistory} color="#00d4ff" height={60} />
            ) : (
              <div className="h-14 flex items-center justify-center text-xs font-mono text-text-tertiary">
                {loading ? '···' : 'Accumulating data...'}
              </div>
            )}
            <div className="flex justify-between text-xs font-mono text-text-tertiary mt-2">
              <span>rolling 48 snapshots</span>
              <span>5 s interval</span>
            </div>
          </div>

          {/* IL Curve */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <h2 className="text-sm font-mono font-bold text-text-primary mb-1">IL Curve</h2>
            <p className="text-xs font-mono text-text-tertiary mb-4">
              Loss % vs. price ratio (white bar = current)
            </p>
            <ILCurve
              entryPrice={ilEntryPrice}
              currentPrice={ilCurrentPrice}
            />
          </div>
        </div>

        {/* ── Col 3: On-chain reserves + Event log ─────────────────────── */}
        <div className="space-y-4">

          {/* On-chain Pool Snapshot */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <h2 className="text-sm font-mono font-bold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-[#00d4ff]">⛓</span> On-chain Snapshot
            </h2>
            {chainPool ? (
              <div className="space-y-2.5">
                {[
                  { label: 'Reserve A', value: fmt(chainPool.reserve_a, 4), color: '#00d4ff' },
                  { label: 'Reserve B', value: fmt(chainPool.reserve_b, 4), color: '#b367ff' },
                  { label: 'Price A/B', value: fmt(chainPool.price_a_per_b, 6), color: '#f0a500' },
                  { label: 'Price B/A', value: fmt(chainPool.price_b_per_a, 6), color: '#f0a500' },
                  { label: 'Total Liquidity', value: fmt(chainPool.total_liquidity, 2), color: '#22c55e' },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between text-xs font-mono">
                    <span className="text-text-tertiary">{row.label}</span>
                    <span style={{ color: row.color }} className="font-bold">{row.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs font-mono text-text-tertiary py-4 text-center">
                {loading ? '···' : 'Contract unreachable'}
              </div>
            )}
          </div>

          {/* Reserve balance bar */}
          {(simPool || chainPool) && (
            <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
              <h2 className="text-sm font-mono font-bold text-text-primary mb-4">
                Reserve Balance
              </h2>
              {(() => {
                const r0 = simPool?.reserve0 ?? chainPool?.reserve_a ?? 0;
                const r1 = simPool?.reserve1 ?? chainPool?.reserve_b ?? 0;
                const total = r0 + r1 || 1;
                const pctA = (r0 / total) * 100;
                const pctB = (r1 / total) * 100;
                const tok0 = simPool?.token0 ?? 'Token A';
                const tok1 = simPool?.token1 ?? 'Token B';
                const isImbalanced = Math.abs(pctA - 50) > 15;
                return (
                  <div className="space-y-3">
                    <div className="flex h-3 rounded-full overflow-hidden">
                      <div
                        className="transition-all duration-500"
                        style={{ width: `${pctA}%`, background: '#00d4ff' }}
                      />
                      <div
                        className="transition-all duration-500"
                        style={{ width: `${pctB}%`, background: '#b367ff' }}
                      />
                    </div>
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-[#00d4ff]">{tok0} {pctA.toFixed(1)}%</span>
                      <span className="text-[#b367ff]">{tok1} {pctB.toFixed(1)}%</span>
                    </div>
                    {isImbalanced && (
                      <div className="text-xs font-mono text-[#f0a500] border border-[rgba(240,165,0,0.3)] rounded px-2.5 py-1.5 bg-[rgba(240,165,0,0.06)]">
                        ⚠ Pool is imbalanced ({'>'}15% drift from 50/50)
                      </div>
                    )}
                    <div className="space-y-1.5 pt-1">
                      {[
                        { label: tok0, val: r0, color: '#00d4ff' },
                        { label: tok1, val: r1, color: '#b367ff' },
                      ].map((t) => (
                        <div key={t.label} className="flex justify-between text-xs font-mono">
                          <span className="text-text-tertiary">{t.label}</span>
                          <span style={{ color: t.color }}>{fmt(t.val, 4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Activity breakdown */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <h2 className="text-sm font-mono font-bold text-text-primary mb-4">
              Activity (last 50 events)
            </h2>
            <div className="space-y-2.5">
              {[
                { label: 'Swaps', count: swapEvents.length, color: '#00d4ff' },
                { label: 'Adds', count: addEvents.length, color: '#22c55e' },
                { label: 'Removes', count: removeEvents.length, color: '#ff3860' },
                { label: 'Other', count: events.length - swapEvents.length - addEvents.length - removeEvents.length, color: '#b0b8d1' },
              ].map((row) => {
                const pct = events.length > 0 ? (row.count / events.length) * 100 : 0;
                return (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span className="text-text-secondary">{row.label}</span>
                      <span style={{ color: row.color }}>{row.count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-1 bg-[color:var(--color-bg-primary)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: row.color, opacity: 0.75 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Events ────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono font-bold text-text-primary">Recent Pool Events</h2>
          <span className="text-xs font-mono text-text-tertiary">{events.length} events</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-text-tertiary border-b border-[color:var(--color-border)]">
                <th className="text-left py-2 pr-6 w-32">Time</th>
                <th className="text-left py-2 pr-4 w-24">Type</th>
                <th className="text-left py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-text-tertiary italic">
                    {loading ? 'Loading events…' : 'No events yet.'}
                  </td>
                </tr>
              ) : (
                events.slice(0, 20).map((ev) => {
                  const typeColors: Record<string, string> = {
                    ADD: '#22c55e',
                    REMOVE: '#ff3860',
                    SWAP: '#00d4ff',
                    STRESS: '#f0a500',
                    CREATE: '#b367ff',
                  };
                  const c = typeColors[ev.event_type] ?? '#b0b8d1';
                  return (
                    <tr
                      key={ev.event_id}
                      className="border-b border-[color:var(--color-border)] last:border-0 hover:bg-[color:var(--color-bg-primary)] transition-colors"
                    >
                      <td className="py-2.5 pr-6 text-text-tertiary">
                        {new Date(ev.timestamp * 1000).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={{
                            color: c,
                            background: `${c}18`,
                            border: `1px solid ${c}44`,
                          }}
                        >
                          {ev.event_type}
                        </span>
                      </td>
                      <td className="py-2.5 text-text-secondary">{ev.description}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
