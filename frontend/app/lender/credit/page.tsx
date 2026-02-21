'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function CreditPage() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [factors, setFactors] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | undefined>();

  const fetchGlobalData = useCallback(async () => {
    try {
      const [lbRes, ratesRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/credit/leaderboard`),
        fetch(`${API_URL}/api/credit/dynamic-rates`),
      ]);

      if (lbRes.status === 'fulfilled' && lbRes.value.ok) {
        const json = await lbRes.value.json();
        const data = json.data ?? json ?? [];
        setLeaderboard(data);
        if (data.length > 0 && !selectedWallet) {
          setSelectedWallet(data[0].wallet);
        }
      }
      if (ratesRes.status === 'fulfilled' && ratesRes.value.ok) {
        const json = await ratesRes.value.json();
        setRates(json.data ?? json ?? []);
      }
    } catch {
      // ignore
    }
  }, [selectedWallet]);

  const fetchWalletData = useCallback(async (wallet: string) => {
    try {
      const [scoreRes, histRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/credit/scores/${wallet}`),
        fetch(`${API_URL}/api/credit/scores/${wallet}/history`),
      ]);

      if (scoreRes.status === 'fulfilled' && scoreRes.value.ok) {
        const json = await scoreRes.value.json();
        const data = json.data ?? json;
        setFactors(Array.isArray(data.factors) ? data.factors : Array.isArray(data) ? data : []);
      }
      if (histRes.status === 'fulfilled' && histRes.value.ok) {
        const json = await histRes.value.json();
        setHistory(json.data ?? json ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchGlobalData();
    const interval = setInterval(fetchGlobalData, 10000);
    return () => clearInterval(interval);
  }, [fetchGlobalData]);

  useEffect(() => {
    if (selectedWallet) {
      fetchWalletData(selectedWallet);
    }
  }, [selectedWallet, fetchWalletData]);

  const selectedScore = leaderboard.find((s) => s.wallet === selectedWallet);

  return (
    <div className="space-y-8 animate-fadeUp">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold font-mono text-text-primary mb-2">
          Credit Scoring Engine
        </h1>
        <p className="text-text-secondary text-sm font-mono">
          Dynamic rates, leaderboard rankings, and score composition
        </p>
      </div>

      {/* Leaderboard */}
      <div className="card space-y-4">
        <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Credit Score Leaderboard</h3>
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Wallet</th>
                <th>Score</th>
                <th>Tier</th>
                <th>Type</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((score, idx) => (
                <tr
                  key={score.wallet}
                  onClick={() => setSelectedWallet(score.wallet)}
                  className="cursor-pointer hover:bg-[color:var(--color-bg-accent)]/50"
                >
                  <td className="font-mono text-xs font-bold">{idx + 1}</td>
                  <td className="font-mono text-xs truncate">{score.wallet.slice(0, 12)}...</td>
                  <td className="font-mono text-xs font-bold text-accent">{score.score ?? 0}</td>
                  <td>
                    <Badge variant={score.tier === 'platinum' ? 'purple' : score.tier === 'gold' ? 'high' : 'medium'}>
                      {score.tier?.toUpperCase() || 'N/A'}
                    </Badge>
                  </td>
                  <td className="font-mono text-xs capitalize">{score.type || 'unknown'}</td>
                  <td className={`font-mono text-xs font-bold ${(score.delta ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>
                    {(score.delta ?? 0) >= 0 ? '+' : ''}{score.delta ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Wallet Details */}
      {selectedScore && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Score Radar */}
          <div className="card p-6">
            <h4 className="text-sm font-mono font-bold text-text-primary uppercase mb-4">
              Score Composition
            </h4>
            <div className="space-y-3">
              {(Array.isArray(factors) ? factors : []).map((factor) => (
                <div key={factor.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono text-text-secondary">{factor.name}</span>
                    <span className="font-mono font-bold text-accent">{factor.contribution}</span>
                  </div>
                  <div className="h-2 bg-[color:var(--color-bg-accent)] rounded overflow-hidden">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${(factor.contribution / 312) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Score History */}
          <div className="card p-6">
            <h4 className="text-sm font-mono font-bold text-text-primary uppercase mb-4">
              30-Day History
            </h4>
            <div className="h-32 bg-[color:var(--color-bg-accent)] rounded flex items-end gap-0.5">
              {(history.length > 0 ? history : [...Array(30)]).map((histItem, idx) => {
                const height = typeof histItem === 'number' ? histItem : (histItem?.score || 40 + Math.sin(idx / 5) * 30);
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-accent opacity-60 rounded-t"
                    style={{
                      height: `${height}%`,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Factor Breakdown */}
          <div className="card p-6">
            <h4 className="text-sm font-mono font-bold text-text-primary uppercase mb-4">
              Factor Impact
            </h4>
            <div className="space-y-2">
              {factors.slice(0, 3).map((factor) => (
                <div
                  key={factor.name}
                  className="p-2 bg-[color:var(--color-bg-accent)] rounded text-xs"
                >
                  <div className="font-mono font-bold text-text-primary">{factor.name}</div>
                  <div className="text-text-tertiary font-mono">
                    +{factor.contribution} impact
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Rate Table */}
      <div className="card space-y-4">
        <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Dynamic Rate Tiers</h3>
        <DataTable
          columns={[
            { header: 'Tier', accessor: 'tier', className: 'font-mono font-bold text-xs' },
            { header: 'LTV', accessor: (row) => `${row.ltv * 100}%`, className: 'font-mono text-xs' },
            { header: 'Borrow Rate', accessor: (row) => `${row.borrowRate}%`, className: 'font-mono text-xs' },
            { header: 'Liquidation Buffer', accessor: (row) => `${row.liquidationBuffer}x`, className: 'font-mono text-xs' },
          ]}
          data={rates.map((r, idx) => ({ ...r, tier: r.tier, id: `tier-${idx}` }))}
        />
      </div>
    </div>
  );
}
