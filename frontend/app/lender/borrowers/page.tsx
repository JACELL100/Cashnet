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

const fmt = (v: number, dec = 2) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: dec }).format(v);

const fmtUSD = (v: number) =>
  v >= 1_000_000
    ? `$${(v / 1e6).toFixed(2)}M`
    : v >= 1_000
      ? `$${(v / 1e3).toFixed(1)}K`
      : `$${v.toFixed(2)}`;

const shortAddr = (addr: string) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';

interface LookupResult {
  wallet: string;
  collateral_value: number;
  debt_value: number;
  health_factor: number;
  liquidation_threshold: number;
  at_risk: boolean;
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function BorrowersPage() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress ?? '');

  const borrowers = useLendingStore((s) => s.borrowers);
  const totalBorrows = useLendingStore((s) => s.totalBorrows);
  const setBorrowers = useLendingStore((s) => s.setBorrowers);
  const setMetrics = useLendingStore((s) => s.setMetrics);

  const {
    depositCollateral, borrow, approveRepay, repay, liquidate, reset,
    isConnected, isSigning, isConfirming, isConfirmed, txHash, error,
  } = useLendingActions();

  // My-position inputs
  const [depositAmt, setDepositAmt] = useState('');
  const [borrowAmt, setBorrowAmt] = useState('');
  const [repayAmt, setRepayAmt] = useState('');

  // Wallet lookup
  const [lookupWallet, setLookupWallet] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  // My own position (fetched from chain for connected wallet)
  const [myPosition, setMyPosition] = useState<LookupResult | null>(null);

  // Sort / filter
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'healthy' | 'warning' | 'danger'>('all');
  const [search, setSearch] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch all borrowers + metrics ────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [bRes, mRes] = await Promise.all([
        fetch(`${API_URL}/api/lending/borrowers`),
        fetch(`${API_URL}/api/lending/metrics`),
      ]);

      if (bRes.ok) {
        const json = await bRes.json();
        const rows: BorrowerPosition[] = (json.data ?? json ?? []).map(
          (b: {
            id?: string;
            wallet: string;
            collateral_value?: number;
            debt_value?: number;
            health_factor?: number;
            liquidation_price?: number;
            credit_score?: number;
            at_risk?: boolean;
          }, i: number) => ({
            id: b.id ?? String(i),
            wallet: b.wallet,
            collateral: b.collateral_value ?? 0,
            borrowed: b.debt_value ?? 0,
            healthFactor: b.health_factor ?? 0,
            liquidationPrice: b.liquidation_price ?? 0,
            creditScore: b.credit_score ?? 0,
            status:
              (b.health_factor ?? 0) >= 1.5
                ? 'healthy'
                : (b.health_factor ?? 0) >= 1.2
                  ? 'warning'
                  : 'danger',
          })
        );
        setBorrowers(rows);
      }

      if (mRes.ok) {
        const json = await mRes.json();
        const m = json.data ?? json;
        setMetrics({
          totalDeposits: m.total_collateral ?? 0,
          totalBorrows: m.total_debt ?? 0,
          utilizationRate: (m.utilization_rate ?? 0) / 100,
          borrowApr: m.borrow_apr ?? 0,
          totalSupplied: m.total_supplied ?? 0,
        });
      }
    } catch {
      // swallow poll errors silently
    }
  }, [setBorrowers, setMetrics]);

  // ── Poll every 5 s ───────────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchData]);

  // ── Fetch own position when wallet changes ───────────────────────────────
  useEffect(() => {
    if (!walletAddress) return;
    fetch(`${API_URL}/lending/health-factor/${walletAddress}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMyPosition(d ?? null))
      .catch(() => setMyPosition(null));
  }, [walletAddress, isConfirmed]);

  // ── Reset tx on new action ───────────────────────────────────────────────
  useEffect(() => {
    if (isConfirmed) fetchData();
  }, [isConfirmed, fetchData]);

  // ── Wallet lookup ────────────────────────────────────────────────────────
  const handleLookup = async () => {
    if (!lookupWallet.trim()) return;
    setLookupLoading(true);
    setLookupError('');
    setLookupResult(null);
    try {
      const res = await fetch(`${API_URL}/lending/health-factor/${lookupWallet.trim()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLookupResult(data);
    } catch (e: unknown) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  };



  // ── Derived data ─────────────────────────────────────────────────────────
  const atRiskCount = borrowers.filter((b) => b.status !== 'healthy').length;
  const avgHF = borrowers.length
    ? borrowers.reduce((s, b) => s + b.healthFactor, 0) / borrowers.length
    : 0;

  const filtered = borrowers
    .filter((b) => filterStatus === 'all' || b.status === filterStatus)
    .filter((b) => !search || b.wallet.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sortDir === 'asc' ? a.healthFactor - b.healthFactor : b.healthFactor - a.healthFactor
    );

  // ── KPI cards ─────────────────────────────────────────────────────────────
  const kpis = [
    {
      label: 'Total Borrowers',
      value: borrowers.length,
      color: '#00d4ff',
      icon: '⊙',
    },
    {
      label: 'At-Risk',
      value: atRiskCount,
      color: '#ff3860',
      icon: '⚠',
    },
    {
      label: 'Avg Health Factor',
      value: fmt(avgHF),
      color: healthColor(avgHF),
      icon: '♥',
    },
    {
      label: 'Total Borrowed',
      value: fmtUSD(totalBorrows),
      color: '#b367ff',
      icon: '⟁',
    },
  ];

  // ── Status badge ──────────────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: BorrowerPosition['status'] }) => {
    const map = {
      healthy: { color: '#22c55e', label: 'HEALTHY' },
      warning: { color: '#f0a500', label: 'WARNING' },
      danger: { color: '#ff3860', label: 'DANGER' },
    };
    const { color, label } = map[status];
    return (
      <span
        className="px-2 py-0.5 rounded text-xs font-bold font-mono"
        style={{ color, border: `1px solid ${color}`, background: `${color}18` }}
      >
        {label}
      </span>
    );
  };

  // ── Health bar ────────────────────────────────────────────────────────────
  const HealthBar = ({ value }: { value: number }) => {
    const pct = Math.min(((value - 1) / 1.5) * 100, 100);
    return (
      <div className="flex items-center gap-2 min-w-[110px]">
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: healthColor(value) }}
          />
        </div>
        <span className="text-xs font-mono" style={{ color: healthColor(value) }}>
          {fmt(value)}
        </span>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[color:var(--color-bg-primary)] p-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">Borrowers</h1>
            <span
              className="text-xs px-2 py-0.5 rounded border font-bold"
              style={{ color: '#00d4ff', borderColor: '#00d4ff', background: '#00d4ff18' }}
            >
              SEPOLIA
            </span>
          </div>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Monitor and manage active borrower positions on-chain
          </p>
        </div>
        <button
          onClick={fetchData}
          className="text-xs px-3 py-1.5 rounded border transition-colors"
          style={{
            color: '#00d4ff',
            borderColor: '#00d4ff55',
            background: '#00d4ff10',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Transaction status bar */}
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
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-bg-secondary)',
            }}
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

      {/* Main grid: My Position + Wallet Lookup | Borrower Table */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="xl:col-span-1 flex flex-col gap-6">
          {/* My Position */}
          <div
            className="rounded-xl border p-5"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-bg-secondary)',
            }}
          >
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#b367ff' }}>
              My Position
            </h2>

            {!isConnected ? (
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                Connect your wallet to view your position.
              </p>
            ) : (
              <>
                {/* Position summary */}
                {myPosition ? (
                  <div className="space-y-2 mb-4 text-xs">
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--color-text-secondary)' }}>Wallet</span>
                      <span className="text-white">{shortAddr(myPosition.wallet)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--color-text-secondary)' }}>Collateral</span>
                      <span style={{ color: '#22c55e' }}>{fmtUSD(myPosition.collateral_value)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--color-text-secondary)' }}>Debt</span>
                      <span style={{ color: '#f0a500' }}>{fmtUSD(myPosition.debt_value)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span style={{ color: 'var(--color-text-secondary)' }}>Health Factor</span>
                      <HealthBar value={myPosition.health_factor} />
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--color-text-secondary)' }}>Liq. Threshold</span>
                      <span className="text-white">{(myPosition.liquidation_threshold * 100).toFixed(0)}%</span>
                    </div>
                    {myPosition.at_risk && (
                      <div
                        className="mt-1 text-center text-xs py-1 rounded"
                        style={{ color: '#ff3860', background: '#ff386018', border: '1px solid #ff386055' }}
                      >
                        ⚠ Position at risk of liquidation
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                    No active position found for {shortAddr(walletAddress)}.
                  </p>
                )}

                {/* Deposit Collateral */}
                <div className="mb-3">
                  <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
                    Deposit Collateral (ETH)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={depositAmt}
                      onChange={(e) => setDepositAmt(e.target.value)}
                      placeholder="0.05"
                      className="flex-1 text-xs px-2 py-1.5 rounded border bg-transparent text-white"
                      style={{ borderColor: 'var(--color-border)' }}
                    />
                    <button
                      onClick={() => depositCollateral(depositAmt)}
                      disabled={!depositAmt || isSigning || isConfirming}
                      className="text-xs px-3 py-1.5 rounded font-bold disabled:opacity-40 transition-colors"
                      style={{ background: '#22c55e', color: '#000' }}
                    >
                      {isSigning || isConfirming ? '…' : 'Deposit'}
                    </button>
                  </div>
                </div>

                {/* Borrow */}
                <div className="mb-3">
                  <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
                    Borrow PAL Tokens
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={borrowAmt}
                      onChange={(e) => setBorrowAmt(e.target.value)}
                      placeholder="100"
                      className="flex-1 text-xs px-2 py-1.5 rounded border bg-transparent text-white"
                      style={{ borderColor: 'var(--color-border)' }}
                    />
                    <button
                      onClick={() => borrow(borrowAmt)}
                      disabled={!borrowAmt || isSigning || isConfirming}
                      className="text-xs px-3 py-1.5 rounded font-bold disabled:opacity-40 transition-colors"
                      style={{ background: '#00d4ff', color: '#000' }}
                    >
                      {isSigning || isConfirming ? '…' : 'Borrow'}
                    </button>
                  </div>
                </div>

                {/* Repay */}
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
                    Repay PAL Tokens (2-step)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={repayAmt}
                      onChange={(e) => setRepayAmt(e.target.value)}
                      placeholder="100"
                      className="flex-1 text-xs px-2 py-1.5 rounded border bg-transparent text-white"
                      style={{ borderColor: 'var(--color-border)' }}
                    />
                    <button
                      onClick={() => approveRepay(repayAmt)}
                      disabled={!repayAmt || isSigning || isConfirming}
                      className="text-xs px-3 py-1.5 rounded font-bold disabled:opacity-40"
                      style={{ background: '#f0a500', color: '#000' }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => repay(repayAmt)}
                      disabled={!repayAmt || isSigning || isConfirming}
                      className="text-xs px-3 py-1.5 rounded font-bold disabled:opacity-40"
                      style={{ background: '#b367ff', color: '#000' }}
                    >
                      Repay
                    </button>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Step 1: Approve token spend → Step 2: Repay
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Wallet Lookup */}
          <div
            className="rounded-xl border p-5"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-bg-secondary)',
            }}
          >
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#00d4ff' }}>
              Wallet Lookup
            </h2>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={lookupWallet}
                onChange={(e) => setLookupWallet(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                placeholder="0xAddress…"
                className="flex-1 text-xs px-2 py-1.5 rounded border bg-transparent text-white"
                style={{ borderColor: 'var(--color-border)' }}
              />
              <button
                onClick={handleLookup}
                disabled={lookupLoading}
                className="text-xs px-3 py-1.5 rounded font-bold disabled:opacity-40 transition-colors"
                style={{ background: '#00d4ff', color: '#000' }}
              >
                {lookupLoading ? '…' : 'Look up'}
              </button>
            </div>

            {lookupError && (
              <p className="text-xs" style={{ color: '#ff3860' }}>✗ {lookupError}</p>
            )}

            {lookupResult && (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Wallet</span>
                  <a
                    href={`${SEPOLIA}/address/${lookupResult.wallet}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                    style={{ color: '#00d4ff' }}
                  >
                    {shortAddr(lookupResult.wallet)} ↗
                  </a>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Collateral</span>
                  <span style={{ color: '#22c55e' }}>{fmtUSD(lookupResult.collateral_value)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Debt</span>
                  <span style={{ color: '#f0a500' }}>{fmtUSD(lookupResult.debt_value)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Health Factor</span>
                  <HealthBar value={lookupResult.health_factor} />
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Liq. Threshold</span>
                  <span className="text-white">{(lookupResult.liquidation_threshold * 100).toFixed(0)}%</span>
                </div>
                {lookupResult.at_risk && (
                  <div
                    className="text-center text-xs py-1 rounded mt-2"
                    style={{ color: '#ff3860', background: '#ff386018', border: '1px solid #ff386055' }}
                  >
                    ⚠ Position at risk
                  </div>
                )}
                {/* On-chain liquidate for looked-up wallet */}
                {lookupResult.at_risk && isConnected && (
                  <button
                    onClick={() => liquidate(lookupResult.wallet)}
                    disabled={isSigning || isConfirming}
                    className="w-full mt-2 text-xs py-1.5 rounded font-bold disabled:opacity-40"
                    style={{ background: '#ff3860', color: '#fff' }}
                  >
                    Liquidate on-chain
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column — Borrower Table */}
        <div
          className="xl:col-span-2 rounded-xl border overflow-hidden"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-bg-secondary)',
          }}
        >
          {/* Table header controls */}
          <div className="p-4 border-b flex flex-wrap items-center gap-3" style={{ borderColor: 'var(--color-border)' }}>
            <h2 className="text-sm font-bold uppercase tracking-widest flex-1" style={{ color: '#b367ff' }}>
              All Borrowers ({filtered.length})
            </h2>

            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search wallet…"
              className="text-xs px-2 py-1 rounded border bg-transparent text-white w-40"
              style={{ borderColor: 'var(--color-border)' }}
            />

            {/* Status filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="text-xs px-2 py-1 rounded border bg-[color:var(--color-bg-primary)] text-white"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <option value="all">All statuses</option>
              <option value="healthy">Healthy</option>
              <option value="warning">Warning</option>
              <option value="danger">Danger</option>
            </select>

            {/* Sort toggle */}
            <button
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="text-xs px-2 py-1 rounded border"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              HF {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['Wallet', 'Collateral', 'Borrowed', 'Health Factor', 'Credit Score', 'Status', 'Action'].map(
                    (col) => (
                      <th
                        key={col}
                        className="text-left px-4 py-3 uppercase tracking-widest font-semibold"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12" style={{ color: 'var(--color-text-secondary)' }}>
                      {borrowers.length === 0 ? 'No borrowers data — polling…' : 'No matching borrowers'}
                    </td>
                  </tr>
                )}
                {filtered.map((b, i) => (
                  <tr
                    key={b.id}
                    className="transition-colors hover:bg-white/5"
                    style={{
                      borderBottom:
                        i < filtered.length - 1 ? '1px solid var(--color-border)' : undefined,
                      background: b.wallet === walletAddress ? '#b367ff08' : undefined,
                    }}
                  >
                    {/* Wallet */}
                    <td className="px-4 py-3">
                      <a
                        href={`${SEPOLIA}/address/${b.wallet}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:no-underline"
                        style={{ color: b.wallet === walletAddress ? '#b367ff' : '#00d4ff' }}
                      >
                        {shortAddr(b.wallet)}
                        {b.wallet === walletAddress && (
                          <span className="ml-1 text-[9px] opacity-60">(you)</span>
                        )}
                      </a>
                    </td>

                    {/* Collateral */}
                    <td className="px-4 py-3" style={{ color: '#22c55e' }}>
                      {fmtUSD(b.collateral)}
                    </td>

                    {/* Borrowed */}
                    <td className="px-4 py-3" style={{ color: '#f0a500' }}>
                      {fmtUSD(b.borrowed)}
                    </td>

                    {/* Health Factor */}
                    <td className="px-4 py-3">
                      <HealthBar value={b.healthFactor} />
                    </td>

                    {/* Credit Score */}
                    <td className="px-4 py-3 text-white">
                      {b.creditScore != null ? (
                        <span style={{ color: (b.creditScore ?? 0) >= 700 ? '#22c55e' : (b.creditScore ?? 0) >= 550 ? '#f0a500' : '#ff3860' }}>
                          {b.creditScore}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3">
                      {b.status === 'danger' && isConnected ? (
                        <button
                          onClick={() => liquidate(b.wallet)}
                          disabled={isSigning || isConfirming}
                          title="Liquidate on-chain via MetaMask"
                          className="text-xs px-2 py-0.5 rounded font-bold disabled:opacity-40 transition-colors"
                          style={{ background: '#ff3860', color: '#fff' }}
                        >
                          ⚡ Liquidate
                        </button>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table footer stats */}
          {filteredSummary(filtered)}
        </div>
      </div>
    </div>
  );
}

// ── Footer summary row ────────────────────────────────────────────────────────
function filteredSummary(rows: BorrowerPosition[]) {
  if (!rows.length) return null;
  const totalCollateral = rows.reduce((s, b) => s + b.collateral, 0);
  const totalBorrowed = rows.reduce((s, b) => s + b.borrowed, 0);
  const dangerCount = rows.filter((b) => b.status === 'danger').length;
  const fmtUSD = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1_000 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(2)}`;

  return (
    <div
      className="grid grid-cols-3 gap-4 p-4 text-xs border-t"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
    >
      <div>
        Total collateral: <span className="text-white">{fmtUSD(totalCollateral)}</span>
      </div>
      <div>
        Total borrowed: <span style={{ color: '#f0a500' }}>{fmtUSD(totalBorrowed)}</span>
      </div>
      <div>
        Danger positions: <span style={{ color: '#ff3860' }}>{dangerCount}</span>
      </div>
    </div>
  );
}
