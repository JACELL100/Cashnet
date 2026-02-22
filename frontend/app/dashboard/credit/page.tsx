'use client';

import React, { useState, useEffect, useCallback } from 'react';
import KPICard from '@/components/KPICard';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://cash-net.onrender.com';

interface CreditHistory {
  id: string;
  date: string;
  score: number;
  change: number;
  reason: string;
}

interface Loan {
  id: string;
  amount: number;
  borrowed: number;
  collateral: number;
  interest_rate: number;
  status: 'active' | 'paid' | 'defaulted';
  due_date: string;
}

export default function CreditPage() {
  const addToast = useUIStore((state) => state.addToast);
  const user = useAuthStore((state) => state.user);

  const [creditScore, setCreditScore] = useState(500);
  const [scoreChange, setScoreChange] = useState(0);
  const [totalBorrowed, setTotalBorrowed] = useState(0);
  const [totalCollateral, setTotalCollateral] = useState(0);
  const [creditHistory, setCreditHistory] = useState<CreditHistory[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);

  const fetchCreditData = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Fetch credit score
      const scoreRes = await fetch(`${API_URL}/api/credit/score?wallet=${user.id}`);
      if (scoreRes.ok) {
        const data = await scoreRes.json();
        setCreditScore(data.score || 500);
        setScoreChange(data.change || 0);
      }

      // Fetch loans
      const loansRes = await fetch(`${API_URL}/api/loans?wallet=${user.id}`);
      if (loansRes.ok) {
        const data = await loansRes.json();
        const loansList = data.data || data || [];
        setLoans(loansList);
        
        const totalBorrow = loansList.reduce((sum: number, loan: Loan) => sum + loan.borrowed, 0);
        const totalCol = loansList.reduce((sum: number, loan: Loan) => sum + loan.collateral, 0);
        setTotalBorrowed(totalBorrow);
        setTotalCollateral(totalCol);
      }

      // Fetch credit history
      const historyRes = await fetch(`${API_URL}/api/credit/history?wallet=${user.id}`);
      if (historyRes.ok) {
        const data = await historyRes.json();
        setCreditHistory(data.data || data || []);
      }
    } catch (error) {
      console.error('Error fetching credit data:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCreditData();
    const interval = setInterval(fetchCreditData, 10000);
    return () => clearInterval(interval);
  }, [fetchCreditData]);

  const getCreditRating = (score: number) => {
    if (score >= 750) return { label: 'Excellent', color: 'success' as const };
    if (score >= 700) return { label: 'Good', color: 'cyan' as const };
    if (score >= 650) return { label: 'Fair', color: 'medium' as const };
    if (score >= 600) return { label: 'Poor', color: 'high' as const };
    return { label: 'Very Poor', color: 'critical' as const };
  };

  const rating = getCreditRating(creditScore);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-mono text-text-primary mb-2">
          Credit Score & History
        </h1>
        <p className="text-sm text-text-secondary font-mono">
          Track your creditworthiness and borrowing activity
        </p>
      </div>

      {/* Credit Score Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono text-text-tertiary uppercase">Credit Score</span>
            <Badge variant={rating.color}>{rating.label}</Badge>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold font-mono text-text-primary">{creditScore}</span>
            <span className="text-sm text-text-tertiary font-mono">/ 850</span>
          </div>
          {scoreChange !== 0 && (
            <div className={`text-xs font-mono ${scoreChange > 0 ? 'text-success' : 'text-danger'}`}>
              {scoreChange > 0 ? '↑' : '↓'} {Math.abs(scoreChange)} points
            </div>
          )}
        </div>

        <KPICard
          label="Total Borrowed"
          value={totalBorrowed}
          unit="$"
          color="accent"
        />

        <KPICard
          label="Total Collateral"
          value={totalCollateral}
          unit="$"
          color="success"
        />

        <KPICard
          label="Active Loans"
          value={loans.filter(l => l.status === 'active').length}
          unit=""
          color="warn"
        />
      </div>

      {/* Credit Score Explanation */}
      <div className="card p-6 space-y-4">
        <h3 className="text-sm font-mono font-bold text-text-primary uppercase">
          Score Breakdown
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div>
            <div className="text-text-tertiary mb-1">300-599 • Very Poor</div>
            <div className="text-text-secondary">High risk, limited access to credit</div>
          </div>
          <div>
            <div className="text-text-tertiary mb-1">600-699 • Fair to Poor</div>
            <div className="text-text-secondary">Moderate risk, average interest rates</div>
          </div>
          <div>
            <div className="text-text-tertiary mb-1">700-850 • Good to Excellent</div>
            <div className="text-text-secondary">Low risk, best rates and terms</div>
          </div>
        </div>
      </div>

      {/* Active Loans */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">
            Active Loans ({loans.filter(l => l.status === 'active').length})
          </h3>
        </div>

        <DataTable
          columns={[
            {
              header: 'Loan ID',
              accessor: (row: Loan) => row.id.substring(0, 8) + '...',
              className: 'font-mono text-xs',
            },
            {
              header: 'Borrowed',
              accessor: (row: Loan) => `$${row.borrowed.toLocaleString()}`,
              className: 'text-xs font-bold',
            },
            {
              header: 'Collateral',
              accessor: (row: Loan) => `$${row.collateral.toLocaleString()}`,
              className: 'text-xs',
            },
            {
              header: 'Interest',
              accessor: (row: Loan) => `${(row.interest_rate * 100).toFixed(2)}%`,
              className: 'text-xs',
            },
            {
              header: 'Due Date',
              accessor: (row: Loan) => new Date(row.due_date).toLocaleDateString(),
              className: 'text-xs',
            },
            {
              header: 'Status',
              accessor: (row: Loan) => (
                <Badge
                  variant={
                    row.status === 'active'
                      ? 'success'
                      : row.status === 'paid'
                      ? 'medium'
                      : 'critical'
                  }
                >
                  {row.status.toUpperCase()}
                </Badge>
              ),
            },
          ]}
          data={loans}
        />
      </div>

      {/* Credit History */}
      <div className="card space-y-4">
        <h3 className="text-sm font-mono font-bold text-text-primary uppercase">
          Credit History
        </h3>

        <DataTable
          columns={[
            {
              header: 'Date',
              accessor: (row: CreditHistory) => new Date(row.date).toLocaleDateString(),
              className: 'font-mono text-xs',
            },
            {
              header: 'Score',
              accessor: (row: CreditHistory) => row.score,
              className: 'text-xs font-bold',
            },
            {
              header: 'Change',
              accessor: (row: CreditHistory) => (
                <span className={row.change > 0 ? 'text-success' : 'text-danger'}>
                  {row.change > 0 ? '+' : ''}
                  {row.change}
                </span>
              ),
              className: 'text-xs font-mono',
            },
            {
              header: 'Reason',
              accessor: (row: CreditHistory) => row.reason,
              className: 'text-xs',
            },
          ]}
          data={creditHistory}
        />
      </div>

      {/* Tips */}
      <div className="card p-6 bg-[rgba(0,212,99,0.05)] border border-success/20">
        <h3 className="text-sm font-mono font-bold text-success uppercase mb-3">
          💡 How to Improve Your Credit Score
        </h3>
        <ul className="space-y-2 text-xs font-mono text-text-secondary">
          <li>✓ Make timely loan repayments</li>
          <li>✓ Maintain healthy collateral-to-debt ratios</li>
          <li>✓ Avoid defaults and liquidations</li>
          <li>✓ Build a positive borrowing history</li>
          <li>✓ Keep active loans manageable</li>
        </ul>
      </div>
    </div>
  );
}
