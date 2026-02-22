'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useLendingActions } from '@/hooks/useLendingActions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SEPOLIA = 'https://sepolia.etherscan.io';

const hfColor = (h: number) =>
  h >= 1.5 ? '#22c55e' : h >= 1.2 ? '#f0a500' : '#ff3860';

const fmtUSD = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1e6).toFixed(2)}M`
    : v >= 1_000 ? `$${(v / 1e3).toFixed(1)}K`
    : `$${v.toFixed(2)}`;

const scoreColor = (s: number) =>
  s >= 750 ? '#22c55e' : s >= 700 ? '#00d4ff' : s >= 650 ? '#f0a500' : '#ff3860';

const scoreLabel = (s: number) =>
  s >= 750 ? 'Excellent' : s >= 700 ? 'Good' : s >= 650 ? 'Fair' : s >= 600 ? 'Poor' : 'Very Poor';

interface Position {
  collateral_value: number;
  debt_value: number;
  health_factor: number;
  at_risk: boolean;
}

interface Loan {
  id: string;
  borrowed: number;
  collateral: number;
  interest_rate: number;
  status: 'active' | 'paid' | 'defaulted';
  due_date: string;
}

const loanStatusStyle: Record<string, { color: string }> = {
  active:    { color: '#00d4ff' },
  paid:      { color: '#22c55e' },
  defaulted: { color: '#ff3860' },
};

export default function DashboardBorrowerPage() {
  const user = useAuthStore((s) => s.user);

  const {
    depositCollateral, borrow, approveRepay, repay,
    isConnected, isSigning, isConfirming, isConfirmed, txHash, error, reset,
  } = useLendingActions();

  const [position, setPosition] = useState<Position | null>(null);
  const [creditScore, setCreditScore] = useState(0);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  const [depositAmt, setDepositAmt] = useState('');
  const [borrowAmt, setBorrowAmt] = useState('');
  const [repayAmt, setRepayAmt] = useState('');
  const [tab, setTab] = useState<'overview' | 'loans' | 'credit'>('overview');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const wallet = user.walletAddress || user.id;
      const [posRes, scoreRes, loansRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/lending/borrower/${wallet}`),
        fetch(`${API_URL}/api/credit/score?wallet=${user.id}`),
        fetch(`${API_URL}/api/loans?wallet=${user.id}`),
      ]);
      if (posRes.status === 'fulfilled' && posRes.value.ok) {
        const d = await posRes.value.json();
        setPosition(d.data ?? d);
      }
      if (scoreRes.status === 'fulfilled' && scoreRes.value.ok) {
        const d = await scoreRes.value.json();
        setCreditScore(d.score ?? d.data?.score ?? 0);
      }
      if (loansRes.status === 'fulfilled' && loansRes.value.ok) {
        const d = await loansRes.value.json();
        setLoans(d.data ?? d ?? []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [user?.id, user?.walletAddress]);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchData]);

  useEffect(() => {
    if (isConfirmed) { fetchData(); reset?.(); }
  }, [isConfirmed, fetchData, reset]);

  const activeLoans = loans.filter((l) => l.status === 'active');
  const totalBorrowed = activeLoans.reduce((s, l) => s + (l.borrowed ?? 0), 0);
  const totalCollateral = activeLoans.reduce((s, l) => s + (l.collateral ?? 0), 0);
  const hf = position?.health_factor ?? 999;
  const scorePct = Math.max(0, Math.min(100, ((creditScore - 300) / 550) * 100));

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Borrower</h1>
          <p className="text-sm text-text-tertiary mt-1">
            Manage your loans, collateral, and credit position
          </p>
        </div>
        <button
          onClick={fetchData}
          className="text-xs px-3 py-1.5 rounded border border-[#00d4ff55] text-[#00d4ff] bg-[rgba(0,212,255,0.05)] hover:bg-[rgba(0,212,255,0.1)] transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Credit Score */}
        <div className="card p-5 space-y-2">
          <div className="text-xs text-text-tertiary uppercase tracking-wider">Credit Score</div>
          {loading ? (
            <div className="h-8 w-20 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />
          ) : (
            <>
              <div className="text-3xl font-bold" style={{ color: scoreColor(creditScore) }}>
                {creditScore || '—'}
              </div>
              <div className="text-xs" style={{ color: scoreColor(creditScore) }}>
                {scoreLabel(creditScore)}
              </div>
              <div className="h-1.5 bg-[color:var(--color-bg-accent)] rounded-full overflow-hidden mt-1">
                <div className="h-full rounded-full" style={{ width: `${scorePct}%`, background: scoreColor(creditScore) }} />
              </div>
            </>
          )}
        </div>

        {/* Health Factor */}
        <div className="card p-5 space-y-2">
          <div className="text-xs text-text-tertiary uppercase tracking-wider">Health Factor</div>
          {loading ? (
            <div className="h-8 w-20 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />
          ) : (
            <>
              <div className="text-3xl font-bold" style={{ color: hfColor(hf) }}>
                {hf >= 100 ? '∞' : hf.toFixed(2)}
              </div>
              <div className="text-xs" style={{ color: hfColor(hf) }}>
                {hf >= 1.5 ? 'Safe' : hf >= 1.2 ? 'At Risk' : 'Danger'}
              </div>
              {position?.at_risk && (
                <div className="text-xs text-[#ff3860] bg-[rgba(255,56,96,0.1)] border border-[rgba(255,56,96,0.3)] rounded px-2 py-0.5 mt-1">
                  ⚠ Position at risk
                </div>
              )}
            </>
          )}
        </div>

        {/* Total Borrowed */}
        <div className="card p-5 space-y-2">
          <div className="text-xs text-text-tertiary uppercase tracking-wider">Total Borrowed</div>
          {loading ? (
            <div className="h-8 w-24 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />
          ) : (
            <>
              <div className="text-3xl font-bold text-text-primary">{fmtUSD(totalBorrowed)}</div>
              <div className="text-xs text-text-tertiary">{activeLoans.length} active loan{activeLoans.length !== 1 ? 's' : ''}</div>
            </>
          )}
        </div>

        {/* Collateral */}
        <div className="card p-5 space-y-2">
          <div className="text-xs text-text-tertiary uppercase tracking-wider">Collateral</div>
          {loading ? (
            <div className="h-8 w-24 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />
          ) : (
            <>
              <div className="text-3xl font-bold text-text-primary">{fmtUSD(totalCollateral)}</div>
              <div className="text-xs text-text-tertiary">deposited</div>
            </>
          )}
        </div>
      </div>

      {/* Tx Status */}
      {(isSigning || isConfirming || isConfirmed || error) && (
        <div
          className="p-3 rounded-lg border text-sm flex items-center justify-between"
          style={{
            borderColor: error ? '#ff386055' : isConfirmed ? '#22c55e55' : '#00d4ff55',
            background: error ? '#ff386010' : isConfirmed ? '#22c55e10' : '#00d4ff10',
            color: error ? '#ff3860' : isConfirmed ? '#22c55e' : '#00d4ff',
          }}
        >
          <span>
            {isSigning && '⏳ Waiting for MetaMask signature…'}
            {isConfirming && !isSigning && '⛓ Broadcasting to Sepolia…'}
            {isConfirmed && '✓ Transaction confirmed'}
            {error && `✗ ${(error as Error)?.message ?? 'Transaction failed'}`}
          </span>
          {isConfirmed && txHash && (
            <a href={`${SEPOLIA}/tx/${txHash}`} target="_blank" rel="noreferrer" className="underline text-xs">
              View tx ↗
            </a>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[color:var(--color-border)]">
        {(['overview', 'loans', 'credit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-[#00d4ff] text-[#00d4ff]'
                : 'border-transparent text-text-tertiary hover:text-text-primary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Deposit */}
            <div className="card p-5 space-y-3">
              <div className="text-xs font-bold text-[#00d4ff] uppercase tracking-wider">Deposit Collateral</div>
              <input
                type="number"
                placeholder="ETH amount"
                value={depositAmt}
                onChange={(e) => setDepositAmt(e.target.value)}
                className="w-full bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-[#00d4ff] transition-colors"
              />
              <button
                onClick={() => depositAmt && depositCollateral(depositAmt)}
                disabled={!isConnected || isSigning || isConfirming || !depositAmt}
                className="w-full py-2 rounded text-xs font-bold bg-[#00d4ff] text-[color:var(--color-bg-primary)] hover:bg-[#00b8d9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSigning ? 'Signing…' : isConfirming ? 'Confirming…' : 'Deposit'}
              </button>
            </div>

            {/* Borrow */}
            <div className="card p-5 space-y-3">
              <div className="text-xs font-bold text-[#b367ff] uppercase tracking-wider">Borrow</div>
              <input
                type="number"
                placeholder="BADM amount"
                value={borrowAmt}
                onChange={(e) => setBorrowAmt(e.target.value)}
                className="w-full bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-[#b367ff] transition-colors"
              />
              <button
                onClick={() => borrowAmt && borrow(borrowAmt)}
                disabled={!isConnected || isSigning || isConfirming || !borrowAmt}
                className="w-full py-2 rounded text-xs font-bold bg-[#b367ff] text-white hover:bg-[#9b50e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSigning ? 'Signing…' : isConfirming ? 'Confirming…' : 'Borrow'}
              </button>
            </div>

            {/* Repay */}
            <div className="card p-5 space-y-3">
              <div className="text-xs font-bold text-[#22c55e] uppercase tracking-wider">Repay</div>
              <input
                type="number"
                placeholder="BADM amount"
                value={repayAmt}
                onChange={(e) => setRepayAmt(e.target.value)}
                className="w-full bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-[#22c55e] transition-colors"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => repayAmt && approveRepay(repayAmt)}
                  disabled={!isConnected || isSigning || isConfirming || !repayAmt}
                  className="flex-1 py-2 rounded text-xs font-bold border border-[#22c55e] text-[#22c55e] hover:bg-[rgba(34,197,94,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => repayAmt && repay(repayAmt)}
                  disabled={!isConnected || isSigning || isConfirming || !repayAmt}
                  className="flex-1 py-2 rounded text-xs font-bold bg-[#22c55e] text-[color:var(--color-bg-primary)] hover:bg-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Repay
                </button>
              </div>
            </div>
          </div>

          {/* Recent loans */}
          <div className="card">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--color-border)]">
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Recent Loans</h2>
              <button onClick={() => setTab('loans')} className="text-xs text-[#00d4ff] hover:underline">
                View all →
              </button>
            </div>
            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-8 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />)}
              </div>
            ) : loans.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-tertiary">No loans yet. Deposit collateral to get started.</div>
            ) : (
              <div className="divide-y divide-[color:var(--color-border)]">
                {loans.slice(0, 5).map((loan) => {
                  const s = loanStatusStyle[loan.status] ?? loanStatusStyle.active;
                  return (
                    <div key={loan.id} className="flex items-center justify-between px-6 py-3 hover:bg-[color:var(--color-bg-accent)] transition-colors">
                      <div className="flex items-center gap-3">
                        <span
                          className="px-2 py-0.5 rounded border text-xs font-bold"
                          style={{ color: s.color, borderColor: `${s.color}55`, background: `${s.color}15` }}
                        >
                          {loan.status.toUpperCase()}
                        </span>
                        <span className="text-xs text-text-tertiary">{loan.id?.slice(0, 12) || '—'}</span>
                      </div>
                      <div className="flex gap-6 text-xs text-text-tertiary">
                        <span>Borrowed: <span className="text-text-primary">{fmtUSD(loan.borrowed ?? 0)}</span></span>
                        <span>Collateral: <span className="text-text-primary">{fmtUSD(loan.collateral ?? 0)}</span></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Loans Tab ── */}
      {tab === 'loans' && (
        <div className="card">
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />)}
            </div>
          ) : loans.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-tertiary">No loans found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    {['Status', 'Borrowed', 'Collateral', 'Interest Rate', 'Due Date'].map((h) => (
                      <th key={h} className="px-6 py-3 text-left text-text-tertiary uppercase tracking-wider font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {loans.map((loan) => {
                    const s = loanStatusStyle[loan.status] ?? loanStatusStyle.active;
                    return (
                      <tr key={loan.id} className="hover:bg-[color:var(--color-bg-accent)] transition-colors">
                        <td className="px-6 py-3">
                          <span className="px-2 py-0.5 rounded border font-bold" style={{ color: s.color, borderColor: `${s.color}55`, background: `${s.color}15` }}>
                            {loan.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-3 font-bold text-text-primary">{fmtUSD(loan.borrowed ?? 0)}</td>
                        <td className="px-6 py-3 text-text-secondary">{fmtUSD(loan.collateral ?? 0)}</td>
                        <td className="px-6 py-3 text-text-secondary">{((loan.interest_rate ?? 0) * 100).toFixed(2)}%</td>
                        <td className="px-6 py-3 text-text-tertiary">
                          {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Credit Tab ── */}
      {tab === 'credit' && (
        <div className="space-y-4">
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary uppercase tracking-wider">Your Credit Score</span>
              {!loading && (
                <span
                  className="px-2 py-0.5 rounded border text-xs font-bold"
                  style={{ color: scoreColor(creditScore), borderColor: `${scoreColor(creditScore)}55`, background: `${scoreColor(creditScore)}15` }}
                >
                  {scoreLabel(creditScore)}
                </span>
              )}
            </div>
            {loading ? (
              <div className="h-12 w-32 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold" style={{ color: scoreColor(creditScore) }}>{creditScore || '—'}</span>
                  <span className="text-sm text-text-tertiary">/ 850</span>
                </div>
                <div className="h-2 bg-[color:var(--color-bg-accent)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${scorePct}%`, background: scoreColor(creditScore) }} />
                </div>
                <div className="flex justify-between text-xs text-text-tertiary">
                  <span>300 — Very Poor</span><span>850 — Excellent</span>
                </div>
              </>
            )}
          </div>

          {/* Tips */}
          <div className="card p-5 bg-[rgba(0,212,255,0.03)] border border-[rgba(0,212,255,0.15)]">
            <div className="text-xs font-bold text-[#00d4ff] uppercase tracking-wider mb-3">💡 Improve Your Score</div>
            <ul className="space-y-1.5 text-xs text-text-secondary">
              {['Make loan repayments on time', 'Maintain a healthy collateral-to-debt ratio', 'Avoid defaults and liquidations', 'Build a consistent borrowing history'].map((tip) => (
                <li key={tip} className="flex items-start gap-2">
                  <span className="text-[#00d4ff] shrink-0">✓</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
