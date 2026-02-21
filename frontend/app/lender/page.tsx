'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { useLendingStore } from '@/store/lendingStore';
import { useLendingActions } from '@/hooks/useLendingActions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const healthColor = (h: number) => {
  if (h >= 1.5) return '#22c55e';
  if (h >= 1.2) return '#f0a500';
  return '#ff3860';
};

const statusColor: Record<string, string> = {
  healthy: '#22c55e', warning: '#f0a500', danger: '#ff3860',
};

export default function LenderPage() {
  const borrowers = useLendingStore((state) => state.borrowers);
  const totalDeposits = useLendingStore((state) => state.totalDeposits);
  const totalBorrows = useLendingStore((state) => state.totalBorrows);
  const utilizationRate = useLendingStore((state) => state.utilizationRate);
  const borrowApr = useLendingStore((state) => state.borrowApr);

  const setBorrowers = useLendingStore((state) => state.setBorrowers);
  const setMetrics = useLendingStore((state) => state.setMetrics);

  // MetaMask contract actions
  const {
    depositCollateral, borrow, approveRepay, repay, liquidate, reset,
    isConnected, isSigning, isConfirming, isConfirmed, txHash, error,
  } = useLendingActions();

  // Form state for action inputs
  const [depositAmt, setDepositAmt] = useState('0.01');
  const [borrowAmt, setBorrowAmt] = useState('100');
  const [repayAmt, setRepayAmt] = useState('50');

  // Fetch borrowers + metrics from API
  const fetchLendingData = useCallback(async () => {
    try {
      const [borrowersRes, metricsRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/lending/borrowers`),
        fetch(`${API_URL}/api/lending/metrics`),
      ]);

      if (borrowersRes.status === 'fulfilled' && borrowersRes.value.ok) {
        const json = await borrowersRes.value.json();
        const items = (json.data ?? []).map((b: any) => ({
          id: b.id ?? b.wallet,
          wallet: b.wallet,
          collateral: b.collateral_value ?? 0,
          borrowed: b.debt_value ?? 0,
          healthFactor: b.health_factor ?? 999,
          creditScore: b.credit_score ?? 500,
          liquidationPrice: b.collateral_value && b.debt_value
            ? Math.round(b.debt_value * 1.5 / (b.collateral_value / 2000))
            : 0,
          status: b.at_risk
            ? 'danger' as const
            : b.health_factor < 1.8
              ? 'warning' as const
              : 'healthy' as const,
        }));
        setBorrowers(items);
      }

      if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
        const json = await metricsRes.value.json();
        const m = json.data ?? {};
        setMetrics({
          totalDeposits: m.total_collateral ?? 0,
          totalBorrows: m.total_debt ?? 0,
          utilizationRate: (m.utilization_rate ?? 0) / 100,
          borrowApr: m.borrow_apr ?? 0,
          totalSupplied: m.total_supplied ?? 0,
        });
      }
    } catch { /* retry on next tick */ }
  }, [setBorrowers, setMetrics]);

  // Initial load + polling
  useEffect(() => {
    fetchLendingData();
    const interval = setInterval(fetchLendingData, 4000);
    return () => clearInterval(interval);
  }, [fetchLendingData]);

  // Derived KPIs
  // In a real app, this would be scoped to the logged-in user.
  // For now, we simulate "My Liquidity" as 15% of the total pool.
  const myLiquidity = totalDeposits * 0.15;
  const interestEarned = myLiquidity * borrowApr;

  const atRiskCount = borrowers.filter((b) => b.status === 'danger' || b.status === 'warning').length;

  const kpis = [
    { label: 'My Liquidity', value: `$${myLiquidity >= 1000000 ? (myLiquidity / 1000000).toFixed(2) + 'M' : (myLiquidity / 1000).toFixed(1) + 'K'}`, sub: 'In active pool', color: '#b367ff' },
    { label: 'Interest Earned', value: `$${interestEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: `↑ ${(borrowApr * 100).toFixed(1)}% APY`, color: '#22c55e' },
    { label: 'Active Loans', value: `${borrowers.length}`, sub: `${atRiskCount} at-risk`, color: '#00d4ff' },
    { label: 'At-Risk Borrowers', value: atRiskCount.toString(), sub: 'HF < 1.8', color: '#f0a500' },
  ];

  const availableLiquidity = totalDeposits - totalBorrows;
  const avgLoanSize = borrowers.length > 0 ? totalBorrows / borrowers.length : 0;

  const poolStats = [
    { label: 'Total Pool Reserves', value: `$${totalDeposits >= 1000000 ? (totalDeposits / 1000000).toFixed(2) + 'M' : (totalDeposits / 1000).toFixed(1) + 'K'}`, color: '#b367ff' },
    { label: 'Available Liquidity', value: `$${availableLiquidity >= 1000000 ? (availableLiquidity / 1000000).toFixed(2) + 'M' : (availableLiquidity / 1000).toFixed(1) + 'K'}`, color: '#22c55e' },
    { label: 'Utilization Rate', value: `${(utilizationRate * 100).toFixed(1)}%`, color: '#00d4ff' },
    { label: 'Avg Loan Size', value: `$${(avgLoanSize / 1000).toFixed(1)}K`, color: '#f0a500' },
  ];

  const sortedBorrowers = [...borrowers].sort((a, b) => a.healthFactor - b.healthFactor);

  return (
    <div className="space-y-8 animate-fadeUp">
      <div>
        <h1 className="text-2xl font-bold font-mono text-text-primary">Lender Dashboard</h1>
        <p className="text-sm text-text-tertiary font-mono mt-1">Liquidity overview · Loan portfolio · Borrower health · <span className="text-[#22c55e]">Live on Sepolia</span></p>
      </div>

      {/* ── Transaction Status Bar ── */}
      {(isSigning || isConfirming || isConfirmed || error) && (
        <div className={`rounded-lg border p-3 font-mono text-xs flex items-center gap-2 ${error ? 'border-red-500/40 bg-red-500/10 text-red-400'
          : isConfirmed ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
            : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300'
          }`}>
          {isSigning && '⏳ Waiting for MetaMask approval...'}
          {isConfirming && '⛏️ Transaction submitted, confirming on Sepolia...'}
          {isConfirmed && (
            <>
              ✅ Transaction confirmed!{' '}
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline text-[#b367ff]"
              >
                View on Etherscan ↗
              </a>
            </>
          )}
          {error && `❌ ${(error as any)?.shortMessage || error.message}`}
          <button onClick={reset} className="ml-auto text-text-tertiary hover:text-text-primary">✕</button>
        </div>
      )}

      {/* ── Quick Actions (MetaMask) ── */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
        <h2 className="text-sm font-mono font-bold text-text-primary mb-4">Quick Actions {!isConnected && <span className="text-red-400 font-normal">(connect wallet first)</span>}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Deposit */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-text-tertiary">Deposit Collateral (Sepolia ETH)</label>
            <div className="flex gap-2">
              <input
                type="number" step="0.001" min="0"
                value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)}
                className="flex-1 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-2 py-1.5 text-xs font-mono text-text-primary outline-none focus:border-[#b367ff]"
              />
              <button
                onClick={() => depositCollateral(depositAmt)}
                disabled={!isConnected || isSigning}
                className="px-3 py-1.5 rounded text-xs font-mono font-bold bg-[#b367ff] hover:bg-[#a050f0] text-white disabled:opacity-40 transition-all"
              >
                Deposit
              </button>
            </div>
          </div>
          {/* Borrow */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-text-tertiary">Borrow Tokens (PLDM)</label>
            <div className="flex gap-2">
              <input
                type="number" step="1" min="0"
                value={borrowAmt} onChange={(e) => setBorrowAmt(e.target.value)}
                className="flex-1 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-2 py-1.5 text-xs font-mono text-text-primary outline-none focus:border-[#00d4ff]"
              />
              <button
                onClick={() => borrow(borrowAmt)}
                disabled={!isConnected || isSigning}
                className="px-3 py-1.5 rounded text-xs font-mono font-bold bg-[#00d4ff] hover:bg-[#00b8e6] text-black disabled:opacity-40 transition-all"
              >
                Borrow
              </button>
            </div>
          </div>
          {/* Repay */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-text-tertiary">Repay Loan (PLDM)</label>
            <div className="flex gap-2">
              <input
                type="number" step="1" min="0"
                value={repayAmt} onChange={(e) => setRepayAmt(e.target.value)}
                className="flex-1 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-2 py-1.5 text-xs font-mono text-text-primary outline-none focus:border-[#22c55e]"
              />
              <div className="flex gap-1">
                <button
                  onClick={() => approveRepay(repayAmt)}
                  disabled={!isConnected || isSigning}
                  className="px-2 py-1.5 rounded text-[10px] font-mono font-bold border border-[#22c55e] text-[#22c55e] hover:bg-[#22c55e20] disabled:opacity-40 transition-all"
                  title="First approve the LendingPool to spend your PLDM tokens"
                >
                  Approve
                </button>
                <button
                  onClick={() => repay(repayAmt)}
                  disabled={!isConnected || isSigning}
                  className="px-3 py-1.5 rounded text-xs font-mono font-bold bg-[#22c55e] hover:bg-[#1aab4e] text-black disabled:opacity-40 transition-all"
                >
                  Repay
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-4 transition-all hover:border-[color:var(--color-border-hover)]">
            <div className="text-xs font-mono text-text-tertiary mb-2">{k.label}</div>
            <div className="text-3xl font-bold font-mono transition-colors" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs font-mono text-text-tertiary mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pool Stats */}
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
          <h2 className="text-sm font-mono font-bold text-text-primary mb-4">Pool Reserves</h2>
          <div className="space-y-4">
            {poolStats.map((s) => (
              <div key={s.label}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-mono text-text-tertiary">{s.label}</span>
                  <span className="text-xs font-mono font-bold transition-colors" style={{ color: s.color }}>{s.value}</span>
                </div>
                <div className="h-1.5 bg-[color:var(--color-bg-primary)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: '100%', background: `${s.color}40` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[color:var(--color-border)]">
            <div className="text-xs font-mono text-text-tertiary mb-2">Utilization</div>
            <div className="h-2 bg-[color:var(--color-bg-primary)] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${utilizationRate > 0.8 ? 'bg-[#ff3860]' : 'bg-[#b367ff]'}`} style={{ width: `${utilizationRate * 100}%` }} />
            </div>
            <div className="text-xs font-mono text-text-tertiary mt-1">
              <span className="text-[#b367ff]">{(utilizationRate * 100).toFixed(1)}%</span> utilized
            </div>
          </div>
        </div>

        {/* Yield Chart placeholder */}
        <div className="lg:col-span-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
          <h2 className="text-sm font-mono font-bold text-text-primary mb-4">Interest Earned (30d Trend)</h2>
          <div className="h-48 flex items-end gap-1.5">
            {/* Generate some pseudo-random chart data that trends up and ends at the actual interestEarned */}
            {Array.from({ length: 30 }).map((_, i) => {
              const baseValue = Math.max(100, interestEarned * 0.4);
              const progress = i / 29;
              const trend = baseValue + (interestEarned - baseValue) * progress;
              const noise = trend * 0.1 * (Math.sin(i * 1.5) + Math.cos(i * 2.3));
              const value = Math.max(50, trend + noise);
              // Ensure the last bar is exactly the current value
              const finalVal = i === 29 ? interestEarned : value;
              const maxChartVal = Math.max(interestEarned * 1.2, 500);

              const pctHeight = Math.min(100, (finalVal / maxChartVal) * 100);

              return (
                <div
                  key={i}
                  className="flex-1 rounded-t transition-all duration-500 hover:opacity-80"
                  style={{
                    height: `${pctHeight}%`,
                    background: i === 29 ? '#b367ff' : 'rgba(179,103,255,0.25)',
                    minHeight: '4px'
                  }}
                />
              )
            })}
          </div>
          <div className="flex justify-between text-xs font-mono text-text-tertiary mt-2">
            <span>30d ago</span>
            <span className="text-[#22c55e] font-bold">+${interestEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })} this month</span>
            <span>today</span>
          </div>
        </div>
      </div>

      {/* Loan Portfolio Table */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono font-bold text-text-primary">Active Loan Portfolio</h2>
          <div className="text-xs font-mono text-text-tertiary">
            Sorted by Risk
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-text-tertiary border-b border-[color:var(--color-border)]">
                <th className="text-left py-2 pr-6">Borrower</th>
                <th className="text-left py-2 pr-6">Borrowed amount</th>
                <th className="text-left py-2 pr-6">Collateral amount</th>
                <th className="text-left py-2 pr-6">Health Factor</th>
                <th className="text-left py-2 pr-6">Status</th>
                <th className="text-left py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedBorrowers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-text-tertiary italic">
                    [No active borrowers — Start the simulation engine]
                  </td>
                </tr>
              )}
              {sortedBorrowers.slice(0, 10).map((l, i) => (
                <tr key={l.id || i} className="border-b border-[color:var(--color-border)] last:border-0 hover:bg-[color:var(--color-bg-primary)] transition-colors">
                  <td className="py-3 pr-6 text-text-primary">{l.wallet}</td>
                  <td className="py-3 pr-6 text-[#b367ff] font-bold">${(l.borrowed / 1000).toFixed(1)}K</td>
                  <td className="py-3 pr-6 text-[#22c55e]">
                    ${(l.collateral / 1000).toFixed(1)}K
                  </td>
                  <td className="py-3 pr-6">
                    <div className="flex items-center gap-2">
                      <span className="transition-colors w-10" style={{ color: healthColor(l.healthFactor) }}>
                        {l.healthFactor.toFixed(2)}
                      </span>
                      <div className="w-16 h-1.5 bg-[color:var(--color-bg-primary)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((l.healthFactor / 3) * 100, 100)}%`, background: healthColor(l.healthFactor) }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-6">
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold transition-colors" style={{ color: statusColor[l.status] || '#22c55e', border: `1px solid ${statusColor[l.status] || '#22c55e'}`, background: `${statusColor[l.status] || '#22c55e'}1a` }}>
                      {l.status}
                    </span>
                  </td>
                  <td className="py-3">
                    {(l.status === 'danger' || l.status === 'warning') && (
                      <button
                        onClick={() => liquidate(l.wallet)}
                        disabled={!isConnected || isSigning}
                        className="px-2 py-1 rounded text-[10px] font-mono font-bold bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 disabled:opacity-40 transition-all"
                      >
                        Liquidate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedBorrowers.length > 10 && (
            <div className="mt-4 text-center">
              <button className="text-xs font-mono text-text-tertiary hover:text-text-primary transition-colors">
                View {sortedBorrowers.length - 10} more...
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
