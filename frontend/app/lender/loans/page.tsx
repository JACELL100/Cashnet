'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useLendingStore, BorrowerPosition } from '@/store/lendingStore';
import { useLendingActions } from '@/hooks/useLendingActions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SEPOLIA = 'https://sepolia.etherscan.io';

// ── Helpers ─────────────────────────────────────────────────────────────────
const healthColor = (h: number) =>
  h >= 1.5 ? '#22c55e' : h >= 1.2 ? '#f0a500' : '#ff3860';

const statusColor: Record<string, string> = {
  healthy: '#22c55e',
  warning: '#f0a500',
  danger: '#ff3860',
};

const fmt = (v: number, dec = 2) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: dec }).format(v);

const fmtUSD = (v: number) =>
  v >= 1_000_000
    ? `$${(v / 1e6).toFixed(2)}M`
    : v >= 1_000
      ? `$${(v / 1e3).toFixed(1)}K`
      : `$${v.toFixed(2)}`;

const shortAddr = (a: string) =>
  a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';

const ago = (ts: number) => {
  const secs = Math.floor(Date.now() / 1000 - ts);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
};

// ── Types ───────────────────────────────────────────────────────────────────
interface TxRecord {
  hash: string;
  type: string;
  wallet: string;
  amount: number;
  token: string;
  timestamp: number | null;
  metadata?: Record<string, unknown>;
}

interface CascadeEvent {
  id: string;
  wallet: string;
  amount: number;
  timestamp: string;
}

interface RateTier {
  score_range: string;
  rate: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function LoanPortfolioPage() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress ?? '');

  // Zustand store
  const borrowers      = useLendingStore((s) => s.borrowers);
  const totalDeposits  = useLendingStore((s) => s.totalDeposits);
  const totalBorrows   = useLendingStore((s) => s.totalBorrows);
  const utilizationRate = useLendingStore((s) => s.utilizationRate);
  const borrowApr      = useLendingStore((s) => s.borrowApr);
  const setBorrowers   = useLendingStore((s) => s.setBorrowers);
  const setMetrics     = useLendingStore((s) => s.setMetrics);

  // MetaMask
  const {
    liquidate, reset,
    isConnected, isSigning, isConfirming, isConfirmed, txHash, error,
  } = useLendingActions();

  // Local state
  const [transactions, setTransactions]     = useState<TxRecord[]>([]);
  const [cascadeEvents, setCascadeEvents]   = useState<CascadeEvent[]>([]);
  const [rateTiers, setRateTiers]           = useState<RateTier[]>([]);
  const [tab, setTab]                       = useState<'active' | 'history' | 'cascade'>('active');
  const [sortKey, setSortKey]               = useState<'hf' | 'debt' | 'collateral'>('hf');
  const [sortDir, setSortDir]               = useState<'asc' | 'desc'>('asc');
  const [search, setSearch]                 = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch everything ────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    try {
      const [bRes, mRes, tRes, cRes, rRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/lending/borrowers`),
        fetch(`${API_URL}/api/lending/metrics`),
        fetch(`${API_URL}/pool/transactions?limit=50`),
        fetch(`${API_URL}/api/lending/cascade-events`),
        fetch(`${API_URL}/api/credit/dynamic-rates`),
      ]);

      // Borrowers
      if (bRes.status === 'fulfilled' && bRes.value.ok) {
        const json = await bRes.value.json();
        const rows: BorrowerPosition[] = (json.data ?? []).map(
          (b: Record<string, unknown>, i: number) => ({
            id:               (b.id as string) ?? String(i),
            wallet:           (b.wallet as string) ?? '',
            collateral:       (b.collateral_value as number) ?? 0,
            borrowed:         (b.debt_value as number) ?? 0,
            healthFactor:     (b.health_factor as number) ?? 0,
            liquidationPrice: (b.liquidation_price as number) ?? 0,
            creditScore:      (b.credit_score as number) ?? 0,
            status:
              ((b.health_factor as number) ?? 0) >= 1.5
                ? 'healthy'
                : ((b.health_factor as number) ?? 0) >= 1.2
                  ? 'warning'
                  : 'danger',
          }),
        );
        setBorrowers(rows);
      }

      // Metrics
      if (mRes.status === 'fulfilled' && mRes.value.ok) {
        const json = await mRes.value.json();
        const m = json.data ?? {};
        setMetrics({
          totalDeposits:   m.total_collateral  ?? 0,
          totalBorrows:    m.total_debt         ?? 0,
          utilizationRate: (m.utilization_rate  ?? 0) / 100,
          borrowApr:       m.borrow_apr         ?? 0,
          totalSupplied:   m.total_supplied     ?? 0,
        });
      }

      // Transactions
      if (tRes.status === 'fulfilled' && tRes.value.ok) {
        const json = await tRes.value.json();
        setTransactions(json.data ?? []);
      }

      // Cascade events
      if (cRes.status === 'fulfilled' && cRes.value.ok) {
        const json = await cRes.value.json();
        setCascadeEvents(json.data ?? []);
      }

      // Rate tiers
      if (rRes.status === 'fulfilled' && rRes.value.ok) {
        const json = await rRes.value.json();
        setRateTiers(json.data ?? []);
      }
    } catch {
      /* swallow */
    }
  }, [setBorrowers, setMetrics]);

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, 6000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchAll]);

  useEffect(() => {
    if (isConfirmed) fetchAll();
  }, [isConfirmed, fetchAll]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const availableLiquidity = totalDeposits - totalBorrows;
  const avgHF = borrowers.length
    ? borrowers.reduce((s, b) => s + b.healthFactor, 0) / borrowers.length
    : 0;
  const dangerCount  = borrowers.filter((b) => b.status === 'danger').length;
  const warningCount = borrowers.filter((b) => b.status === 'warning').length;
  const healthyCount = borrowers.filter((b) => b.status === 'healthy').length;

  // Weighted avg rate based on credit scores
  const weightedRate = borrowers.length
    ? borrowers.reduce((sum, b) => {
        const score = b.creditScore ?? 500;
        const tier = rateTiers.find((t) => {
          const [lo, hi] = t.score_range.split('-').map(Number);
          return score >= lo && score <= hi;
        });
        return sum + (tier?.rate ?? borrowApr * 100);
      }, 0) / borrowers.length
    : borrowApr * 100;

  // Sorting
  const sorted = [...borrowers]
    .filter((b) => !search || b.wallet.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const k = sortKey === 'hf' ? 'healthFactor' : sortKey === 'debt' ? 'borrowed' : 'collateral';
      return sortDir === 'asc' ? a[k] - b[k] : b[k] - a[k];
    });

  // My position (if found in borrowers list)
  const myLoan = borrowers.find(
    (b) => b.wallet.toLowerCase() === walletAddress.toLowerCase(),
  );

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // ── KPIs ───────────────────────────────────────────────────────────────
  const kpis = [
    { label: 'Total Loaned',       value: fmtUSD(totalBorrows), color: '#b367ff', icon: '⟁' },
    { label: 'Available Liquidity', value: fmtUSD(availableLiquidity), color: '#22c55e', icon: '≈' },
    { label: 'Utilization',        value: `${(utilizationRate * 100).toFixed(1)}%`, color: '#00d4ff', icon: '◈' },
    { label: 'Borrow APR',         value: `${(borrowApr * 100).toFixed(2)}%`, color: '#f0a500', icon: '⟐' },
  ];

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[color:var(--color-bg-primary)] p-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">Loan Portfolio</h1>
            <span
              className="text-xs px-2 py-0.5 rounded border font-bold"
              style={{ color: '#00d4ff', borderColor: '#00d4ff', background: '#00d4ff18' }}
            >
              SEPOLIA
            </span>
          </div>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Active loans · Repayment history · Cascade events · Credit-based rates
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="text-xs px-3 py-1.5 rounded border transition-colors"
          style={{ color: '#00d4ff', borderColor: '#00d4ff55', background: '#00d4ff10' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Tx status bar */}
      {(isSigning || isConfirming || isConfirmed || error) && (
        <div
          className="mb-5 p-3 rounded-lg border text-sm flex items-center justify-between"
          style={{
            borderColor: error ? '#ff386055' : isConfirmed ? '#22c55e55' : '#b367ff55',
            background: error ? '#ff386010' : isConfirmed ? '#22c55e10' : '#b367ff10',
            color: error ? '#ff3860' : isConfirmed ? '#22c55e' : '#b367ff',
          }}
        >
          <span>
            {isSigning && '⏳ Waiting for MetaMask signature…'}
            {isConfirming && !isSigning && '⛓ Broadcasting to Sepolia…'}
            {isConfirmed && '✓ Transaction confirmed'}
            {error && `✗ ${(error as Error).message ?? 'Transaction failed'}`}
          </span>
          <div className="flex items-center gap-3">
            {isConfirmed && txHash && (
              <a
                href={`${SEPOLIA}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline text-xs"
              >
                View on Etherscan ↗
              </a>
            )}
            <button onClick={reset} className="opacity-50 hover:opacity-100 text-lg leading-none">
              ×
            </button>
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border p-4"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                {k.label}
              </span>
              <span style={{ color: k.color }}>{k.icon}</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: k.color }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Left sidebar cards */}
        <div className="xl:col-span-1 flex flex-col gap-6">
          {/* My Loan */}
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}
          >
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#b367ff' }}>
              My Loan Position
            </h2>
            {!isConnected ? (
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Connect your wallet to view your loan.
              </p>
            ) : myLoan ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Wallet</span>
                  <a
                    href={`${SEPOLIA}/address/${myLoan.wallet}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                    style={{ color: '#00d4ff' }}
                  >
                    {shortAddr(myLoan.wallet)} ↗
                  </a>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Outstanding Debt</span>
                  <span style={{ color: '#f0a500' }}>{fmtUSD(myLoan.borrowed)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Collateral</span>
                  <span style={{ color: '#22c55e' }}>{fmtUSD(myLoan.collateral)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Health Factor</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(((myLoan.healthFactor - 1) / 1.5) * 100, 100)}%`,
                          background: healthColor(myLoan.healthFactor),
                        }}
                      />
                    </div>
                    <span style={{ color: healthColor(myLoan.healthFactor) }}>
                      {fmt(myLoan.healthFactor)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Collateral Ratio</span>
                  <span className="text-white">
                    {myLoan.borrowed > 0
                      ? `${((myLoan.collateral / myLoan.borrowed) * 100).toFixed(0)}%`
                      : '∞'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Credit Score</span>
                  <span
                    style={{
                      color:
                        (myLoan.creditScore ?? 0) >= 700
                          ? '#22c55e'
                          : (myLoan.creditScore ?? 0) >= 550
                            ? '#f0a500'
                            : '#ff3860',
                    }}
                  >
                    {myLoan.creditScore ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Status</span>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] uppercase font-bold"
                    style={{
                      color: statusColor[myLoan.status],
                      border: `1px solid ${statusColor[myLoan.status]}`,
                      background: `${statusColor[myLoan.status]}18`,
                    }}
                  >
                    {myLoan.status}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                No active loan found for {shortAddr(walletAddress)}.
              </p>
            )}
          </div>

          {/* Portfolio Breakdown */}
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}
          >
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#00d4ff' }}>
              Portfolio Breakdown
            </h2>
            <div className="space-y-3 text-xs">
              {/* Bar chart showing healthy / warning / danger distribution */}
              <div>
                <div className="flex justify-between mb-1">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Loan Status Distribution</span>
                  <span className="text-white">{borrowers.length} total</span>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
                  {borrowers.length > 0 && (
                    <>
                      <div
                        className="h-full"
                        style={{
                          width: `${(healthyCount / borrowers.length) * 100}%`,
                          background: '#22c55e',
                        }}
                      />
                      <div
                        className="h-full"
                        style={{
                          width: `${(warningCount / borrowers.length) * 100}%`,
                          background: '#f0a500',
                        }}
                      />
                      <div
                        className="h-full"
                        style={{
                          width: `${(dangerCount / borrowers.length) * 100}%`,
                          background: '#ff3860',
                        }}
                      />
                    </>
                  )}
                </div>
                <div className="flex justify-between mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>
                    <span style={{ color: '#22c55e' }}>●</span> {healthyCount} healthy
                  </span>
                  <span>
                    <span style={{ color: '#f0a500' }}>●</span> {warningCount} warning
                  </span>
                  <span>
                    <span style={{ color: '#ff3860' }}>●</span> {dangerCount} danger
                  </span>
                </div>
              </div>

              <div className="border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex justify-between mb-1">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Avg Health Factor</span>
                  <span style={{ color: healthColor(avgHF) }}>{fmt(avgHF)}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Weighted Avg Rate</span>
                  <span style={{ color: '#f0a500' }}>{fmt(weightedRate)}%</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Total Collateral</span>
                  <span style={{ color: '#22c55e' }}>{fmtUSD(totalDeposits)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Credit-based Rate Tiers */}
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}
          >
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#f0a500' }}>
              Credit-Based Rate Tiers
            </h2>
            {rateTiers.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>
            ) : (
              <div className="space-y-2">
                {rateTiers.map((tier) => {
                  const maxRate = Math.max(...rateTiers.map((t) => t.rate), 1);
                  return (
                    <div key={tier.score_range} className="text-xs">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-white">{tier.score_range}</span>
                        <span style={{ color: tier.rate <= 5 ? '#22c55e' : tier.rate <= 10 ? '#f0a500' : '#ff3860' }}>
                          {tier.rate}%
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(tier.rate / maxRate) * 100}%`,
                            background: tier.rate <= 5 ? '#22c55e' : tier.rate <= 10 ? '#f0a500' : '#ff3860',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right — tabbed content area */}
        <div
          className="xl:col-span-2 rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}
        >
          {/* Tabs + controls */}
          <div className="p-4 border-b flex flex-wrap items-center gap-3" style={{ borderColor: 'var(--color-border)' }}>
            {(['active', 'history', 'cascade'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="text-xs px-3 py-1 rounded font-bold transition-colors"
                style={{
                  background: tab === t ? '#b367ff20' : 'transparent',
                  color: tab === t ? '#b367ff' : 'var(--color-text-secondary)',
                  border: tab === t ? '1px solid #b367ff55' : '1px solid transparent',
                }}
              >
                {t === 'active' ? `Active Loans (${sorted.length})` : t === 'history' ? `Tx History (${transactions.length})` : `Liquidations (${cascadeEvents.length})`}
              </button>
            ))}
            <div className="flex-1" />

            {tab === 'active' && (
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search wallet…"
                className="text-xs px-2 py-1 rounded border bg-transparent text-white w-40"
                style={{ borderColor: 'var(--color-border)' }}
              />
            )}
          </div>

          {/* === Active Loans Tab === */}
          {tab === 'active' && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th className="text-left px-4 py-3 uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                      Borrower
                    </th>
                    <SortHeader label="Debt" active={sortKey === 'debt'} dir={sortDir} onClick={() => toggleSort('debt')} />
                    <SortHeader label="Collateral" active={sortKey === 'collateral'} dir={sortDir} onClick={() => toggleSort('collateral')} />
                    <SortHeader label="Health Factor" active={sortKey === 'hf'} dir={sortDir} onClick={() => toggleSort('hf')} />
                    <th className="text-left px-4 py-3 uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                      Credit
                    </th>
                    <th className="text-left px-4 py-3 uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                      Status
                    </th>
                    <th className="text-left px-4 py-3 uppercase tracking-widest font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12" style={{ color: 'var(--color-text-secondary)' }}>
                        {borrowers.length === 0 ? 'No active loans — polling…' : 'No matching loans'}
                      </td>
                    </tr>
                  )}
                  {sorted.map((b, i) => {
                    const isMe = b.wallet.toLowerCase() === walletAddress.toLowerCase();
                    const ratio = b.borrowed > 0 ? (b.collateral / b.borrowed) * 100 : Infinity;
                    return (
                      <tr
                        key={b.id}
                        className="transition-colors hover:bg-white/5"
                        style={{
                          borderBottom: i < sorted.length - 1 ? '1px solid var(--color-border)' : undefined,
                          background: isMe ? '#b367ff08' : undefined,
                        }}
                      >
                        <td className="px-4 py-3">
                          <a
                            href={`${SEPOLIA}/address/${b.wallet}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:no-underline"
                            style={{ color: isMe ? '#b367ff' : '#00d4ff' }}
                          >
                            {shortAddr(b.wallet)}
                            {isMe && <span className="ml-1 text-[9px] opacity-60">(you)</span>}
                          </a>
                        </td>
                        <td className="px-4 py-3" style={{ color: '#f0a500' }}>
                          {fmtUSD(b.borrowed)}
                        </td>
                        <td className="px-4 py-3">
                          <span style={{ color: '#22c55e' }}>{fmtUSD(b.collateral)}</span>
                          <span className="ml-1 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                            ({ratio === Infinity ? '∞' : `${ratio.toFixed(0)}%`})
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-[110px]">
                            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(((b.healthFactor - 1) / 1.5) * 100, 100)}%`,
                                  background: healthColor(b.healthFactor),
                                }}
                              />
                            </div>
                            <span className="text-xs" style={{ color: healthColor(b.healthFactor) }}>
                              {fmt(b.healthFactor)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {b.creditScore != null ? (
                            <span
                              style={{
                                color:
                                  (b.creditScore ?? 0) >= 700
                                    ? '#22c55e'
                                    : (b.creditScore ?? 0) >= 550
                                      ? '#f0a500'
                                      : '#ff3860',
                              }}
                            >
                              {b.creditScore}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] uppercase font-bold"
                            style={{
                              color: statusColor[b.status],
                              border: `1px solid ${statusColor[b.status]}`,
                              background: `${statusColor[b.status]}18`,
                            }}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {b.status === 'danger' && isConnected ? (
                            <button
                              onClick={() => liquidate(b.wallet)}
                              disabled={isSigning || isConfirming}
                              className="text-xs px-2 py-0.5 rounded font-bold disabled:opacity-40"
                              style={{ background: '#ff3860', color: '#fff' }}
                            >
                              Liquidate
                            </button>
                          ) : (
                            <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer totals */}
              {sorted.length > 0 && (
                <div
                  className="grid grid-cols-4 gap-4 p-4 text-xs border-t"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  <div>
                    Total debt: <span style={{ color: '#f0a500' }}>{fmtUSD(sorted.reduce((s, b) => s + b.borrowed, 0))}</span>
                  </div>
                  <div>
                    Total collateral: <span style={{ color: '#22c55e' }}>{fmtUSD(sorted.reduce((s, b) => s + b.collateral, 0))}</span>
                  </div>
                  <div>
                    Avg HF: <span style={{ color: healthColor(avgHF) }}>{fmt(avgHF)}</span>
                  </div>
                  <div>
                    Danger: <span style={{ color: '#ff3860' }}>{dangerCount}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === Transaction History Tab === */}
          {tab === 'history' && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {['Tx Hash', 'Type', 'Wallet', 'Amount', 'Token', 'Time'].map((col) => (
                      <th
                        key={col}
                        className="text-left px-4 py-3 uppercase tracking-widest font-semibold"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12" style={{ color: 'var(--color-text-secondary)' }}>
                        No transaction history yet
                      </td>
                    </tr>
                  )}
                  {transactions.map((tx, i) => {
                    const typeColor: Record<string, string> = {
                      ADD_LIQUIDITY: '#22c55e',
                      REMOVE_LIQUIDITY: '#ff3860',
                      SWAP: '#00d4ff',
                      DEPOSIT_COLLATERAL: '#b367ff',
                      BORROW: '#f0a500',
                      REPAY: '#22c55e',
                      LIQUIDATE: '#ff3860',
                    };
                    return (
                      <tr
                        key={tx.hash + i}
                        className="transition-colors hover:bg-white/5"
                        style={{
                          borderBottom: i < transactions.length - 1 ? '1px solid var(--color-border)' : undefined,
                        }}
                      >
                        <td className="px-4 py-3">
                          <a
                            href={`${SEPOLIA}/tx/${tx.hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                            style={{ color: '#00d4ff' }}
                          >
                            {shortAddr(tx.hash)}
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] uppercase font-bold"
                            style={{
                              color: typeColor[tx.type] ?? '#fff',
                              border: `1px solid ${typeColor[tx.type] ?? '#555'}`,
                              background: `${typeColor[tx.type] ?? '#555'}18`,
                            }}
                          >
                            {(tx.type ?? '').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white">
                          {shortAddr(tx.wallet)}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#f0a500' }}>
                          {tx.amount != null ? fmt(tx.amount) : '—'}
                        </td>
                        <td className="px-4 py-3 text-white">
                          {tx.token ?? '—'}
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                          {tx.timestamp ? ago(tx.timestamp) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* === Cascade / Liquidation Events Tab === */}
          {tab === 'cascade' && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {['ID', 'Wallet', 'Amount Liquidated', 'Timestamp'].map((col) => (
                      <th
                        key={col}
                        className="text-left px-4 py-3 uppercase tracking-widest font-semibold"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cascadeEvents.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-12" style={{ color: 'var(--color-text-secondary)' }}>
                        No liquidation events recorded
                      </td>
                    </tr>
                  )}
                  {cascadeEvents.map((ev, i) => (
                    <tr
                      key={ev.id}
                      className="transition-colors hover:bg-white/5"
                      style={{
                        borderBottom: i < cascadeEvents.length - 1 ? '1px solid var(--color-border)' : undefined,
                      }}
                    >
                      <td className="px-4 py-3 text-white">#{ev.id}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`${SEPOLIA}/address/${ev.wallet}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                          style={{ color: '#00d4ff' }}
                        >
                          {shortAddr(ev.wallet)}
                        </a>
                      </td>
                      <td className="px-4 py-3" style={{ color: '#ff3860' }}>
                        {fmtUSD(ev.amount ?? 0)}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                        {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Utilization gauge + quick stats row */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: '#b367ff' }}>
            Pool Utilization
          </h2>
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {fmtUSD(totalBorrows)} / {fmtUSD(totalDeposits + totalBorrows)}
          </span>
        </div>
        <div className="h-4 rounded-full bg-white/5 overflow-hidden mb-3">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(utilizationRate * 100, 100)}%`,
              background:
                utilizationRate > 0.9
                  ? '#ff3860'
                  : utilizationRate > 0.75
                    ? '#f0a500'
                    : '#b367ff',
            }}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>Pool Reserves</span>
            <div className="text-white font-bold mt-0.5">{fmtUSD(totalDeposits)}</div>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>Active Loans</span>
            <div className="text-white font-bold mt-0.5">{borrowers.length}</div>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>Base APR</span>
            <div className="font-bold mt-0.5" style={{ color: '#f0a500' }}>{(borrowApr * 100).toFixed(2)}%</div>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-secondary)' }}>Weighted Avg Rate</span>
            <div className="font-bold mt-0.5" style={{ color: '#f0a500' }}>{fmt(weightedRate)}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sortable column header component ─────────────────────────────────────────
function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <th
      className="text-left px-4 py-3 uppercase tracking-widest font-semibold cursor-pointer select-none hover:text-white transition-colors"
      style={{ color: active ? '#b367ff' : 'var(--color-text-secondary)' }}
      onClick={onClick}
    >
      {label} {active ? (dir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );
}
