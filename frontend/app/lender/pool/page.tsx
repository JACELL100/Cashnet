'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { useAuthStore } from '@/store/authStore';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SEPOLIA = 'https://sepolia.etherscan.io';

// ── Types ──────────────────────────────────────────────────────────────────
interface PoolState {
  reserve_a: number;
  reserve_b: number;
  price_a_per_b: number;
  price_b_per_a: number;
  total_liquidity: number;
  total_lp_supply: number;
  fee_pct: number;
  token_a: string;
  token_b: string;
  token_a_address: string;
  token_b_address: string;
  contract_address: string;
}

interface Balances {
  pal_balance: number;
  bad_balance: number;
  lp_balance: number;
}

interface TxRecord {
  hash: string;
  type: string;
  wallet: string | null;
  amount: number | null;
  token: string | null;
  timestamp: number | null;
  metadata: Record<string, unknown>;
}

interface SlippagePoint {
  trade_size_pct: number;
  slippage_pct: number;
  trade_size_token: number;
}

interface DepthLevel {
  price: number;
  cumulative_token0: number;
  liquidity_usd: number;
}

interface DepthData {
  spot_price: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

interface StressResult {
  withdrawal_percentage: number;
  total_liquidity: number;
  withdrawal_amount: number;
  remaining_liquidity: number;
  estimated_slippage: number;
  time_to_drain_minutes: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (v: number, dec = 2) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: dec }).format(v);

const fmtToken = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M`
  : v >= 1_000   ? `${(v / 1_000).toFixed(1)}K`
  : fmt(v, 2);

const fmtUSD = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M`
  : v >= 1_000   ? `$${(v / 1_000).toFixed(1)}K`
  : `$${v.toFixed(2)}`;

const txTypeColor: Record<string, string> = {
  ADD_LIQUIDITY:    '#22c55e',
  REMOVE_LIQUIDITY: '#ff3860',
  SWAP:             '#00d4ff',
};

const impactColor = (pct: number) =>
  pct > 2 ? '#ff3860' : pct > 0.5 ? '#f0a500' : '#22c55e';

// ── Component ──────────────────────────────────────────────────────────────
export default function LiquidityPoolPage() {
  const wallet = useAuthStore((s) => s.user?.walletAddress ?? '');

  const [pool,     setPool]     = useState<PoolState | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [txs,      setTxs]      = useState<TxRecord[]>([]);
  const [slippage, setSlippage] = useState<SlippagePoint[]>([]);
  const [depth,    setDepth]    = useState<DepthData>({ spot_price: 0, bids: [], asks: [] });
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Add liquidity form
  const [addAmtA,    setAddAmtA]    = useState('');
  const [addAmtB,    setAddAmtB]    = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addResult,  setAddResult]  = useState<string | null>(null);

  // Remove liquidity form
  const [removeShares,  setRemoveShares]  = useState('');
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeResult,  setRemoveResult]  = useState<string | null>(null);

  // Swap form
  const [swapDir,     setSwapDir]    = useState<'PAL_to_BAD' | 'BAD_to_PAL'>('PAL_to_BAD');
  const [swapAmount,  setSwapAmount] = useState('');
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapResult,  setSwapResult] = useState<{
    amountOut: number; priceImpact: number; txHash: string; tokenIn: string; tokenOut: string;
  } | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Stress test
  const [stressWithdrawal, setStressWithdrawal] = useState('50');
  const [stressLoading,    setStressLoading]    = useState(false);
  const [stressResult,     setStressResult]     = useState<StressResult | null>(null);

  // ── Fetch all pool data from on-chain reads ────────────────────────────
  const fetchAll = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [stateRes, slippageRes, depthRes, txsRes] = await Promise.allSettled([
        fetch(`${API}/pool/state`),
        fetch(`${API}/pool/slippage-curve?direction=PAL_to_BAD&steps=20`),
        fetch(`${API}/pool/depth-chart?levels=20`),
        fetch(`${API}/pool/transactions?limit=20`),
      ]);

      if (stateRes.status === 'fulfilled' && stateRes.value.ok) {
        setPool(await stateRes.value.json());
        setError(null);
      } else {
        setError('Cannot reach backend — is the server running?');
      }
      if (slippageRes.status === 'fulfilled' && slippageRes.value.ok) {
        const j = await slippageRes.value.json();
        setSlippage(j.data ?? []);
      }
      if (depthRes.status === 'fulfilled' && depthRes.value.ok) {
        const j = await depthRes.value.json();
        if (j.data?.bids) setDepth(j.data);
      }
      if (txsRes.status === 'fulfilled' && txsRes.value.ok) {
        const j = await txsRes.value.json();
        setTxs(j.data ?? []);
      }
    } catch {
      setError('Cannot reach backend — is the server running?');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBalances = useCallback(async () => {
    if (!wallet) return;
    try {
      const res = await fetch(`${API}/pool/balances/${wallet}`);
      if (res.ok) setBalances(await res.json());
    } catch { /* ignore */ }
  }, [wallet]);

  useEffect(() => {
    fetchAll();
    fetchBalances();
    const iv = setInterval(() => { fetchAll(true); fetchBalances(); }, 10000);
    return () => clearInterval(iv);
  }, [fetchAll, fetchBalances]);

  // Auto-fill amount_b from current price ratio
  const handleAddAmtAChange = (v: string) => {
    setAddAmtA(v);
    const num = parseFloat(v);
    if (pool && num > 0 && pool.reserve_a > 0) {
      setAddAmtB((num * pool.reserve_b / pool.reserve_a).toFixed(6));
    }
  };

  // ── Add Liquidity ────────────────────────────────────────────────────────
  const handleAddLiquidity = async () => {
    const amtA = parseFloat(addAmtA);
    const amtB = parseFloat(addAmtB);
    if (!amtA || amtA <= 0 || !amtB || amtB <= 0) return;
    if (!wallet) { setAddResult('✗ No wallet connected'); return; }
    setAddLoading(true); setAddResult(null);
    try {
      const res = await fetch(`${API}/pool/add-liquidity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, amount_a: amtA, amount_b: amtB }),
      });
      const j = await res.json();
      if (j.status === 'success') {
        setAddResult(`✓ ${j.message} · tx: ${j.tx_hash.slice(0, 16)}…`);
        setAddAmtA(''); setAddAmtB('');
        fetchAll(true); fetchBalances();
      } else {
        setAddResult(`✗ ${j.detail || 'Failed'}`);
      }
    } catch {
      setAddResult('✗ Request failed — is the backend running?');
    } finally {
      setAddLoading(false);
    }
  };

  // ── Remove Liquidity ─────────────────────────────────────────────────────
  const handleRemoveLiquidity = async () => {
    const shares = parseFloat(removeShares);
    if (!shares || shares <= 0) return;
    if (!wallet) { setRemoveResult('✗ No wallet connected'); return; }
    setRemoveLoading(true); setRemoveResult(null);
    try {
      const res = await fetch(`${API}/pool/remove-liquidity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, amount: shares }),
      });
      const j = await res.json();
      if (j.status === 'success') {
        setRemoveResult(`✓ ${j.message} · tx: ${j.tx_hash.slice(0, 16)}…`);
        setRemoveShares('');
        fetchAll(true); fetchBalances();
      } else {
        setRemoveResult(`✗ ${j.detail || 'Failed'}`);
      }
    } catch {
      setRemoveResult('✗ Request failed — is the backend running?');
    } finally {
      setRemoveLoading(false);
    }
  };

  // ── Swap ─────────────────────────────────────────────────────────────────
  const handleSwap = async () => {
    const amt = parseFloat(swapAmount);
    if (!amt || amt <= 0) return;
    if (!wallet) { setSwapError('No wallet connected'); return; }
    setSwapLoading(true); setSwapResult(null); setSwapError(null);
    const tokenIn  = swapDir === 'PAL_to_BAD' ? 'PAL' : 'BAD';
    const tokenOut = swapDir === 'PAL_to_BAD' ? 'BAD' : 'PAL';
    try {
      const res = await fetch(`${API}/pool/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, token_in: tokenIn, token_out: tokenOut, amount_in: amt }),
      });
      const j = await res.json();
      if (j.status === 'success') {
        setSwapResult({ amountOut: j.amount_out, priceImpact: j.price_impact, txHash: j.tx_hash, tokenIn: j.token_in, tokenOut: j.token_out });
        setSwapAmount('');
        fetchAll(true); fetchBalances();
      } else {
        setSwapError(j.detail || 'Swap failed');
      }
    } catch {
      setSwapError('Request failed — is the backend running?');
    } finally {
      setSwapLoading(false);
    }
  };

  // ── Stress Test (read-only from chain reserves) ───────────────────────────
  const handleStressTest = async () => {
    const pct = parseFloat(stressWithdrawal);
    if (!pct || pct <= 0) return;
    setStressLoading(true); setStressResult(null);
    try {
      const res = await fetch(`${API}/pool/stress-test?withdrawal_percentage=${pct}`, { method: 'POST' });
      const j = await res.json();
      if (j.status === 'projected') setStressResult(j);
    } catch { /* ignore */ }
    finally { setStressLoading(false); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const maxSlippage = Math.max(...slippage.map((p) => p.slippage_pct), 1);
  const maxDepth    = Math.max(
    ...depth.bids.map((d) => d.liquidity_usd),
    ...depth.asks.map((d) => d.liquidity_usd),
    1,
  );
  const inLabel  = swapDir === 'PAL_to_BAD' ? (pool?.token_a ?? 'PAL') : (pool?.token_b ?? 'BAD');
  const outLabel = swapDir === 'PAL_to_BAD' ? (pool?.token_b ?? 'BAD') : (pool?.token_a ?? 'PAL');


  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fadeUp">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono text-text-primary flex items-center gap-2">
            Liquidity Pool
            <span className="text-xs font-normal font-mono px-2 py-0.5 rounded bg-[rgba(0,212,255,0.12)] text-[#00d4ff] border border-[rgba(0,212,255,0.3)]">
              &#x26D3; Sepolia
            </span>
          </h1>
          <p className="text-xs text-text-tertiary font-mono mt-1">
            PAL/BAD &middot; Constant Product AMM &middot; 0.3% fee
            {pool?.contract_address && (
              <a
                href={`${SEPOLIA}/address/${pool.contract_address}`}
                target="_blank" rel="noreferrer"
                className="ml-3 text-[#b367ff] hover:underline"
              >
                {pool.contract_address.slice(0, 10)}&hellip;{pool.contract_address.slice(-6)} &uarr;
              </a>
            )}
          </p>
        </div>
        {balances && (
          <div className="flex gap-3 text-xs font-mono">
            {[
              { label: 'PAL', value: fmtToken(balances.pal_balance), color: '#00d4ff' },
              { label: 'BAD', value: fmtToken(balances.bad_balance), color: '#22c55e' },
              { label: 'LP',  value: fmtToken(balances.lp_balance),  color: '#b367ff' },
            ].map((b) => (
              <div key={b.label} className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] px-3 py-1.5 text-center">
                <div className="text-text-tertiary text-[10px]">{b.label}</div>
                <div className="font-bold" style={{ color: b.color }}>{b.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Backend offline banner */}
      {error && (
        <div className="rounded-lg border border-[#ff3860] bg-[rgba(255,56,96,0.08)] px-4 py-3 text-xs font-mono text-[#ff3860]">
          &#9888; {error}
        </div>
      )}

      {/* ── KPI row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'TVL',                      value: pool ? fmtUSD(pool.total_liquidity)         : '—', color: '#b367ff' },
          { label: `${pool?.token_a ?? 'PAL'} Reserve`, value: pool ? fmtToken(pool.reserve_a)   : '—', color: '#00d4ff' },
          { label: `${pool?.token_b ?? 'BAD'} Reserve`, value: pool ? fmtToken(pool.reserve_b)   : '—', color: '#22c55e' },
          { label: 'Spot Price',               value: pool ? `${fmt(pool.price_a_per_b, 4)} PAL/BAD` : '—', color: '#f0a500' },
          { label: 'Fee',                      value: pool ? `${(pool.fee_pct ?? 0).toFixed(2)}%`    : '—', color: '#ff3860' },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-4">
            <div className="text-xs font-mono text-text-tertiary mb-1">{k.label}</div>
            <div className="text-lg font-bold font-mono truncate" style={{ color: k.color }}>
              {loading && !pool ? '···' : k.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Main 3-column grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Col 1: Add / Remove Liquidity ───────────────────────── */}
        <div className="space-y-4">

          {/* Add Liquidity */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <h2 className="text-sm font-mono font-bold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-[#22c55e]">&#x2295;</span> Add Liquidity
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono text-text-tertiary block mb-1">PAL Amount</label>
                <input
                  type="number" min="0" placeholder="e.g. 1000"
                  value={addAmtA}
                  onChange={(e) => handleAddAmtAChange(e.target.value)}
                  className="w-full bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-[#22c55e] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-mono text-text-tertiary block mb-1">BAD Amount (auto-filled)</label>
                <input
                  type="number" min="0" placeholder="auto"
                  value={addAmtB}
                  onChange={(e) => setAddAmtB(e.target.value)}
                  className="w-full bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-[#22c55e] transition-colors"
                />
              </div>
              {!wallet && (
                <p className="text-xs font-mono text-[#f0a500]">&#9888; Connect wallet to transact</p>
              )}
              <button
                onClick={handleAddLiquidity}
                disabled={addLoading || !addAmtA || !addAmtB}
                className="w-full py-2.5 font-mono text-sm rounded border border-[#22c55e] text-[#22c55e] hover:bg-[rgba(34,197,94,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {addLoading ? 'Sending tx…' : '&#x2295; Add Liquidity'}
              </button>
              {addResult && (
                <div className={`text-xs font-mono px-3 py-2 rounded border ${
                  addResult.startsWith('✓')
                    ? 'border-[#22c55e] text-[#22c55e] bg-[rgba(34,197,94,0.08)]'
                    : 'border-[#ff3860] text-[#ff3860] bg-[rgba(255,56,96,0.08)]'
                }`}>{addResult}</div>
              )}
            </div>
          </div>

          {/* Remove Liquidity */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <h2 className="text-sm font-mono font-bold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-[#ff3860]">&#x2296;</span> Remove Liquidity
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono text-text-tertiary block mb-1">LP Shares to burn</label>
                <input
                  type="number" min="0" placeholder="e.g. 100"
                  value={removeShares}
                  onChange={(e) => setRemoveShares(e.target.value)}
                  className="w-full bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-[#ff3860] transition-colors"
                />
              </div>
              {pool && (
                <div className="text-xs font-mono text-text-tertiary">
                  Your LP balance: {balances ? fmtToken(balances.lp_balance) : '—'} &nbsp;|&nbsp; Total supply: {fmtToken(pool.total_lp_supply)}
                </div>
              )}
              {!wallet && (
                <p className="text-xs font-mono text-[#f0a500]">&#9888; Connect wallet to transact</p>
              )}
              <button
                onClick={handleRemoveLiquidity}
                disabled={removeLoading || !removeShares}
                className="w-full py-2.5 font-mono text-sm rounded border border-[#ff3860] text-[#ff3860] hover:bg-[rgba(255,56,96,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {removeLoading ? 'Sending tx…' : '&#x2296; Remove Liquidity'}
              </button>
              {removeResult && (
                <div className={`text-xs font-mono px-3 py-2 rounded border ${
                  removeResult.startsWith('✓')
                    ? 'border-[#22c55e] text-[#22c55e] bg-[rgba(34,197,94,0.08)]'
                    : 'border-[#ff3860] text-[#ff3860] bg-[rgba(255,56,96,0.08)]'
                }`}>{removeResult}</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Col 2: Swap + Slippage Chart ────────────────────────── */}
        <div className="space-y-4">

          {/* Swap */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <h2 className="text-sm font-mono font-bold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-[#00d4ff]">&#x21C4;</span> Swap
            </h2>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setSwapDir('PAL_to_BAD')}
                  className={`flex-1 py-2 text-xs font-mono rounded border transition-colors ${
                    swapDir === 'PAL_to_BAD'
                      ? 'border-[#00d4ff] text-[#00d4ff] bg-[rgba(0,212,255,0.1)]'
                      : 'border-[color:var(--color-border)] text-text-tertiary'
                  }`}
                >
                  PAL &rarr; BAD
                </button>
                <button
                  onClick={() => setSwapDir('BAD_to_PAL')}
                  className={`flex-1 py-2 text-xs font-mono rounded border transition-colors ${
                    swapDir === 'BAD_to_PAL'
                      ? 'border-[#00d4ff] text-[#00d4ff] bg-[rgba(0,212,255,0.1)]'
                      : 'border-[color:var(--color-border)] text-text-tertiary'
                  }`}
                >
                  BAD &rarr; PAL
                </button>
              </div>
              <div>
                <label className="text-xs font-mono text-text-tertiary block mb-1">Amount ({inLabel})</label>
                <input
                  type="number" min="0" placeholder="e.g. 500"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                  className="w-full bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm font-mono text-text-primary outline-none focus:border-[#00d4ff] transition-colors"
                />
              </div>
              {!wallet && (
                <p className="text-xs font-mono text-[#f0a500]">&#9888; Connect wallet to transact</p>
              )}
              <button
                onClick={handleSwap}
                disabled={swapLoading || !swapAmount}
                className="w-full py-2.5 font-mono text-sm rounded border border-[#00d4ff] text-[#00d4ff] hover:bg-[rgba(0,212,255,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {swapLoading ? 'Sending tx…' : `&#x21C4; Swap ${inLabel} \u2192 ${outLabel}`}
              </button>
              {swapResult && (
                <div className="bg-[color:var(--color-bg-primary)] border border-[#00d4ff] rounded p-3 space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-text-tertiary">Received</span>
                    <span className="text-[#00d4ff] font-bold">{fmt(swapResult.amountOut, 6)} {outLabel}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-text-tertiary">Price Impact</span>
                    <span style={{ color: impactColor(swapResult.priceImpact) }}>{swapResult.priceImpact.toFixed(4)}%</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono border-t border-[color:var(--color-border)] pt-1.5 mt-0.5">
                    <span className="text-text-tertiary">Tx Hash</span>
                    <a
                      href={`${SEPOLIA}/tx/${swapResult.txHash}`}
                      target="_blank" rel="noreferrer"
                      className="text-[#b367ff] hover:underline"
                      title={swapResult.txHash}
                    >
                      {swapResult.txHash.slice(0, 18)}&hellip;
                    </a>
                  </div>
                </div>
              )}
              {swapError && (
                <div className="text-xs font-mono px-3 py-2 rounded border border-[#ff3860] text-[#ff3860] bg-[rgba(255,56,96,0.08)]">
                  &#x2717; {swapError}
                </div>
              )}
            </div>
          </div>

          {/* Slippage Curve */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <h2 className="text-sm font-mono font-bold text-text-primary mb-1">Slippage Curve</h2>
            <p className="text-xs font-mono text-text-tertiary mb-4">Slippage vs. trade size (PAL &rarr; BAD)</p>
            <div className="h-28 flex items-end gap-0.5">
              {slippage.map((p, i) => {
                const h = Math.min(100, (p.slippage_pct / maxSlippage) * 100);
                const color = p.slippage_pct > 2 ? '#ff3860' : p.slippage_pct > 0.5 ? '#f0a500' : '#22c55e';
                return (
                  <div
                    key={i}
                    title={`${p.trade_size_pct?.toFixed(1) ?? ''}% of pool \u2192 ${p.slippage_pct.toFixed(3)}% slippage`}
                    className="flex-1 rounded-t transition-all duration-300 cursor-pointer hover:opacity-70"
                    style={{ height: `${Math.max(h, 2)}%`, background: color }}
                  />
                );
              })}
              {slippage.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-xs font-mono text-text-tertiary">
                  {loading ? '···' : 'No data'}
                </div>
              )}
            </div>
            <div className="flex justify-between text-xs font-mono text-text-tertiary mt-2">
              <span>Small trade</span><span>Large trade</span>
            </div>
          </div>
        </div>

        {/* ── Col 3: Depth Chart + Stress Test ────────────────────── */}
        <div className="space-y-4">

          {/* Depth Chart */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <h2 className="text-sm font-mono font-bold text-text-primary mb-1">Depth Chart</h2>
            <p className="text-xs font-mono text-text-tertiary mb-4">Cumulative bid/ask liquidity &plusmn;10% price</p>
            <div className="h-28 flex items-end gap-0.5">
              {[...depth.bids].reverse().map((d, i) => (
                <div
                  key={`bid-${i}`}
                  title={`Price: ${fmt(d.price, 4)} | Bid: ${fmtUSD(d.liquidity_usd)}`}
                  className="flex-1 rounded-t transition-all duration-300 cursor-pointer hover:opacity-70"
                  style={{ height: `${Math.max(Math.min(100, (d.liquidity_usd / maxDepth) * 100), 2)}%`, background: 'rgba(34,197,94,0.65)' }}
                />
              ))}
              <div className="w-px bg-[#f0a500] self-stretch opacity-60" />
              {depth.asks.map((d, i) => (
                <div
                  key={`ask-${i}`}
                  title={`Price: ${fmt(d.price, 4)} | Ask: ${fmtUSD(d.liquidity_usd)}`}
                  className="flex-1 rounded-t transition-all duration-300 cursor-pointer hover:opacity-70"
                  style={{ height: `${Math.max(Math.min(100, (d.liquidity_usd / maxDepth) * 100), 2)}%`, background: 'rgba(255,56,96,0.65)' }}
                />
              ))}
              {depth.bids.length === 0 && depth.asks.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-xs font-mono text-text-tertiary">
                  {loading ? '···' : 'No data'}
                </div>
              )}
            </div>
            <div className="flex justify-between text-xs font-mono mt-2">
              <span className="text-[#22c55e]">&larr; Bids</span>
              <span className="text-text-tertiary">Spot</span>
              <span className="text-[#ff3860]">Asks &rarr;</span>
            </div>
          </div>

          {/* Stress Test */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
            <h2 className="text-sm font-mono font-bold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-[#f0a500]">&#x26A1;</span> Stress Test
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono text-text-tertiary block mb-1">
                  Withdrawal %: {stressWithdrawal}%
                </label>
                <input
                  type="range" min="1" max="99" step="1"
                  value={stressWithdrawal}
                  onChange={(e) => setStressWithdrawal(e.target.value)}
                  className="w-full accent-[#f0a500]"
                />
                <div className="flex justify-between text-xs font-mono text-text-tertiary">
                  <span>1% mild</span><span>99% extreme</span>
                </div>
              </div>
              <button
                onClick={handleStressTest}
                disabled={stressLoading}
                className="w-full py-2.5 font-mono text-sm rounded border border-[#f0a500] text-[#f0a500] hover:bg-[rgba(240,165,0,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {stressLoading ? 'Running…' : '&#x26A1; Run Stress Test'}
              </button>
              {stressResult && (
                <div className="space-y-1.5 pt-1">
                  {[
                    { label: 'Total Liquidity',      value: fmtToken(stressResult.total_liquidity),      danger: false },
                    { label: 'Withdrawal Amount',    value: fmtToken(stressResult.withdrawal_amount),    danger: true  },
                    { label: 'Remaining Liquidity',  value: fmtToken(stressResult.remaining_liquidity),  danger: stressResult.remaining_liquidity < stressResult.total_liquidity * 0.3 },
                    { label: 'Est. Slippage',        value: `${stressResult.estimated_slippage.toFixed(1)}%`, danger: stressResult.estimated_slippage > 20 },
                    { label: 'Drain Time',           value: `${stressResult.time_to_drain_minutes.toFixed(1)} min`, danger: false },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between text-xs font-mono">
                      <span className="text-text-tertiary">{row.label}</span>
                      <span style={{ color: row.danger ? '#ff3860' : '#22c55e' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Transaction Log ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono font-bold text-text-primary">Transaction Log</h2>
          <span className="text-xs font-mono text-text-tertiary">{txs.length} recent</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-text-tertiary border-b border-[color:var(--color-border)]">
                <th className="text-left py-2 pr-4 w-36">Time</th>
                <th className="text-left py-2 pr-4 w-36">Type</th>
                <th className="text-left py-2 pr-4">Wallet</th>
                <th className="text-right py-2 pr-4">Amount</th>
                <th className="text-left py-2">Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-text-tertiary italic">
                    {loading ? 'Loading…' : 'No transactions yet — interact with the pool.'}
                  </td>
                </tr>
              )}
              {txs.map((tx) => (
                <tr key={tx.hash} className="border-b border-[color:var(--color-border)] last:border-0 hover:bg-[color:var(--color-bg-primary)] transition-colors">
                  <td className="py-2.5 pr-4 text-text-tertiary">
                    {tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString() : '—'}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                      style={{
                        color: txTypeColor[tx.type] ?? '#b0b8d1',
                        background: `${txTypeColor[tx.type] ?? '#b0b8d1'}18`,
                        border: `1px solid ${txTypeColor[tx.type] ?? '#b0b8d1'}44`,
                      }}
                    >
                      {tx.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-text-secondary">
                    {tx.wallet ? `${tx.wallet.slice(0, 8)}…` : '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-right text-text-primary">
                    {tx.amount != null ? `${fmt(tx.amount, 4)} ${tx.token ?? ''}` : '—'}
                  </td>
                  <td className="py-2.5">
                    <a
                      href={`${SEPOLIA}/tx/${tx.hash}`}
                      target="_blank" rel="noreferrer"
                      className="text-[#b367ff] hover:underline"
                      title={tx.hash}
                    >
                      {tx.hash.slice(0, 16)}&hellip;
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
