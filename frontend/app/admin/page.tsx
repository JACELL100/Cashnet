'use client';

import React, { useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAgentStore } from '@/store/agentStore';
import { useThreatStore } from '@/store/threatStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const roleBreakdown = [
  { role: 'BORROWER', count: 94, color: '#00d4ff' },
  { role: 'LENDER', count: 22, color: '#b367ff' },
  { role: 'AUDITOR', count: 8, color: '#f0a500' },
  { role: 'ADMIN', count: 4, color: '#ff3860' },
];

const contracts = [
  { name: 'LendingPool', status: 'active', address: '0x1a2b...3c4d' },
  { name: 'CollateralVault', status: 'active', address: '0x2b3c...4d5e' },
  { name: 'CreditRegistry', status: 'active', address: '0x3c4d...5e6f' },
  { name: 'IdentityRegistry', status: 'active', address: '0x4d5e...6f7a' },
  { name: 'LiquidityPool', status: 'active', address: '0x5e6f...7a8b' },
  { name: 'AccessControl', status: 'paused', address: '0x6f7a...8b9c' },
];

const recentRegistrations = [
  { wallet: '0xabc1...ef23', role: 'BORROWER', status: 'verified', time: '2m ago' },
  { wallet: '0xdef4...gh56', role: 'LENDER', status: 'pending', time: '14m ago' },
  { wallet: '0x789a...bc01', role: 'BORROWER', status: 'verified', time: '1h ago' },
  { wallet: '0x456d...ef78', role: 'AUDITOR', status: 'verified', time: '3h ago' },
  { wallet: '0x123g...hi90', role: 'BORROWER', status: 'flagged', time: '6h ago' },
];

const statusColor: Record<string, string> = { verified: '#22c55e', pending: '#f0a500', flagged: '#ff3860' };

const typeColor: Record<string, string> = {
  arbitrage: '#00d4ff', arbitrage_bot: '#00d4ff',
  liquidator: '#ff3860', liquidator_bot: '#ff3860',
  maker: '#22c55e',
  trader: '#b367ff', retail_trader: '#b367ff',
  oracle: '#f0a500',
  governance: '#64748b',
  mev_bot: '#f0a500',
  whale: '#22c55e',
  attacker: '#ff0033',
};

const typeIcon: Record<string, string> = {
  arbitrage: '⇄', arbitrage_bot: '⇄',
  liquidator: '⚡', liquidator_bot: '⚡',
  maker: '⊕',
  trader: '◈', retail_trader: '◈',
  oracle: '◎',
  governance: '⊙',
  mev_bot: '▲',
  whale: '🐋',
  attacker: '☠',
};

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

export default function AdminPage() {
  const { agents, setAgents, setActivityFeed } = useAgentStore();
  const { threatScores, activeAlerts, setThreatScores, addAlert } = useThreatStore();

  const fetchAdminData = useCallback(async () => {
    try {
      const [agentsRes, feedRes, scoresRes, alertsRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/agents`),
        fetch(`${API_URL}/api/sim/activity-feed?limit=50`),
        fetch(`${API_URL}/api/threats/scores`),
        fetch(`${API_URL}/api/threats/alerts`),
      ]);

      if (agentsRes.status === 'fulfilled' && agentsRes.value.ok) {
        const json = await agentsRes.value.json();
        setAgents(json.data ?? json ?? []);
      }
      if (feedRes.status === 'fulfilled' && feedRes.value.ok) {
        const json = await feedRes.value.json();
        setActivityFeed(json.data ?? json ?? []);
      }
      if (scoresRes.status === 'fulfilled' && scoresRes.value.ok) {
        const json = await scoresRes.value.json();
        setThreatScores(json.data ?? json ?? []);
      }
      if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
        const json = await alertsRes.value.json();
        const data = json.data ?? json ?? [];
        data.forEach((a: any) => {
          if (!activeAlerts.some(existing => existing.id === a.id)) {
            addAlert(a);
          }
        });
      }
    } catch {
      // ignore
    }
  }, [setAgents, setActivityFeed, setThreatScores, addAlert, activeAlerts]);

  useEffect(() => {
    fetchAdminData();
    const interval = setInterval(fetchAdminData, 5000);
    return () => clearInterval(interval);
  }, [fetchAdminData]);

  const activeAgents = agents.filter((a) => a.active);
  const totalPnl = agents.reduce((s, a) => s + (a.pnl ?? 0), 0);
  const unresolvedAlerts = activeAlerts.filter((a) => !a.resolved);
  const criticalAlerts = unresolvedAlerts.filter((a) => a.severity === 'critical' || a.severity === 'high');
  const displayScores = threatScores;

  const kpis = [
    { label: 'Total Participants', value: '128', sub: '+4 this week', color: '#ff3860' },
    { label: 'Active Contracts', value: '6', sub: 'All systems live', color: '#00d4ff' },
    { label: 'Active Agents', value: String(activeAgents.length || agents.length), sub: `${agents.length} total`, color: '#b367ff' },
    { label: 'Total Value Locked', value: '$2.4M', sub: '↑ 12% 7d', color: '#22c55e' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-mono text-text-primary">System Overview</h1>
        <p className="text-sm text-text-tertiary font-mono mt-1">Rust-eze Simulation Lab · Admin Console</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-4">
            <div className="text-xs font-mono text-text-tertiary mb-2">{k.label}</div>
            <div className="text-3xl font-bold font-mono" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs font-mono text-text-tertiary mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Agents + Threats row ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Agents Widget */}
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono font-bold text-text-primary">◈ Agents</h2>
            <Link href="/admin/agents" className="text-xs font-mono text-[#b367ff] hover:underline">
              View all →
            </Link>
          </div>

          {/* summary stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Total', value: String(agents.length), color: '#b367ff' },
              { label: 'Active', value: String(activeAgents.length), color: '#22c55e' },
              { label: 'Net PnL', value: (totalPnl >= 0 ? '+' : '') + fmt(totalPnl), color: totalPnl >= 0 ? '#22c55e' : '#ff3860' },
            ].map((s) => (
              <div key={s.label} className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-2 text-center">
                <div className="text-xs font-mono text-text-tertiary mb-0.5">{s.label}</div>
                <div className="text-sm font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* agent rows */}
          <div className="space-y-2">
            {agents.slice(0, 5).map((a: any) => {
              const color = typeColor[a.type] ?? '#64748b';
              const icon = typeIcon[a.type] ?? '◌';
              const pnl = a.pnl ?? 0;
              return (
                <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-[color:var(--color-border)] last:border-0">
                  <div className="flex items-center gap-2">
                    <span style={{ color }} className="text-sm">{icon}</span>
                    <div>
                      <div className="text-xs font-mono font-bold text-text-primary">{a.name}</div>
                      <div className="text-xs font-mono text-text-tertiary capitalize">{a.type?.replace(/_/g, ' ')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span style={{ color: pnl >= 0 ? '#22c55e' : '#ff3860' }} className="font-bold">
                      {pnl >= 0 ? '+' : ''}{fmt(pnl)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-xs"
                      style={{ color: a.active ? '#22c55e' : '#64748b', border: `1px solid ${a.active ? '#22c55e' : '#64748b'}`, background: a.active ? '#22c55e1a' : '#64748b1a' }}>
                      {a.active ? 'LIVE' : 'OFF'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {agents.length === 0 && (
            <p className="text-xs font-mono text-text-tertiary text-center py-4">No agents loaded.</p>
          )}
        </div>

        {/* Threats Widget */}
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono font-bold text-text-primary">⚠ Threats</h2>
            <Link href="/admin/threats" className="text-xs font-mono text-[#f0a500] hover:underline">
              View all →
            </Link>
          </div>

          {/* alert summary badges */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Active', value: String(unresolvedAlerts.length), color: unresolvedAlerts.length > 0 ? '#ff3860' : '#22c55e' },
              { label: 'Critical', value: String(criticalAlerts.length), color: criticalAlerts.length > 0 ? '#ff0033' : '#22c55e' },
              { label: 'Resolved', value: String(activeAlerts.filter(a => a.resolved).length), color: '#22c55e' },
            ].map((s) => (
              <div key={s.label} className="rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] p-2 text-center">
                <div className="text-xs font-mono text-text-tertiary mb-0.5">{s.label}</div>
                <div className="text-sm font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* risk vector bars */}
          <div className="space-y-2.5">
            {displayScores.map((ts) => {
              const barColor = ts.status === 'critical' ? '#ff0033' : ts.status === 'warning' ? '#f0a500' : '#22c55e';
              return (
                <div key={ts.axis}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-mono text-text-secondary">{ts.axis}</span>
                    <span className="text-xs font-mono font-bold" style={{ color: barColor }}>{ts.score}</span>
                  </div>
                  <div className="h-1.5 bg-[color:var(--color-bg-primary)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${ts.score}%`, background: barColor }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* top unresolved alert */}
          {unresolvedAlerts.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[color:var(--color-border)]">
              {(() => {
                const a = unresolvedAlerts[0];
                const sc = a.severity === 'critical' ? '#ff0033' : a.severity === 'high' ? '#ff3860' : a.severity === 'medium' ? '#f0a500' : '#22c55e';
                return (
                  <div className="rounded border p-2.5 space-y-1" style={{ borderColor: sc, background: `${sc}0d` }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{ color: sc, border: `1px solid ${sc}`, background: `${sc}30` }}>
                        {a.severity}
                      </span>
                      <span className="text-xs font-mono font-bold text-text-primary">{a.type}</span>
                    </div>
                    <p className="text-xs font-mono text-text-secondary">{a.description}</p>
                  </div>
                );
              })()}
              {unresolvedAlerts.length > 1 && (
                <p className="text-xs font-mono text-text-tertiary mt-2">
                  +{unresolvedAlerts.length - 1} more alert{unresolvedAlerts.length > 2 ? 's' : ''} —{' '}
                  <Link href="/admin/threats" className="text-[#f0a500] hover:underline">view all</Link>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Participants / Quick Actions ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Role Breakdown */}
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
          <h2 className="text-sm font-mono font-bold text-text-primary mb-4">Participant Breakdown</h2>
          <div className="space-y-3">
            {roleBreakdown.map((r) => (
              <div key={r.role} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                  <span className="text-xs font-mono text-text-secondary">{r.role}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 bg-[color:var(--color-bg-primary)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(r.count / 128) * 100}%`, background: r.color }} />
                  </div>
                  <span className="text-xs font-mono" style={{ color: r.color }}>{r.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
          <h2 className="text-sm font-mono font-bold text-text-primary mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link href="/admin/agents" className="block w-full py-3 font-mono text-sm text-center bg-[rgba(179,103,255,0.1)] border border-[#b367ff] text-[#b367ff] rounded hover:bg-[rgba(179,103,255,0.2)] transition-colors">
              ◈ Manage Agents
            </Link>
            <Link href="/admin/threats" className="block w-full py-3 font-mono text-sm text-center bg-[rgba(240,165,0,0.1)] border border-[#f0a500] text-[#f0a500] rounded hover:bg-[rgba(240,165,0,0.2)] transition-colors">
              ⚠ View Threats
            </Link>
            <button className="w-full py-3 font-mono text-sm bg-[rgba(34,197,94,0.1)] border border-[#22c55e] text-[#22c55e] rounded hover:bg-[rgba(34,197,94,0.2)] transition-colors">
              ⊕ Register Wallet
            </button>
          </div>
        </div>
      </div>

      {/* Recent Registrations */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
        <h2 className="text-sm font-mono font-bold text-text-primary mb-4">Recent Wallet Registrations</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-text-tertiary border-b border-[color:var(--color-border)]">
                <th className="text-left py-2 pr-6">Wallet</th>
                <th className="text-left py-2 pr-6">Role</th>
                <th className="text-left py-2 pr-6">Status</th>
                <th className="text-left py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentRegistrations.map((r, i) => (
                <tr key={i} className="border-b border-[color:var(--color-border)] last:border-0">
                  <td className="py-3 pr-6 text-text-primary">{r.wallet}</td>
                  <td className="py-3 pr-6 text-[#00d4ff]">{r.role}</td>
                  <td className="py-3 pr-6">
                    <span className="px-2 py-0.5 rounded"
                      style={{ color: statusColor[r.status], border: `1px solid ${statusColor[r.status]}`, background: `${statusColor[r.status]}1a` }}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-3 text-text-tertiary">{r.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
