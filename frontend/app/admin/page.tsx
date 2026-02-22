'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAgentStore } from '@/store/agentStore';
import { useThreatStore } from '@/store/threatStore';
import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://cash-net.onrender.com';

// Real deployed contract addresses (Sepolia)
const CONTRACTS = [
  { name: 'LendingPool', address: '0x21ef825C55Ad215cD1BD438A64B59ec5C2028A3f' },
  { name: 'CollateralVault', address: '0x4dA93A5782aE7eb5a36314CF818604283DA87875' },
  { name: 'CreditRegistry', address: '0x9449a34A5Cdeb02480936B605960b22aE049909b' },
  { name: 'LiquidityPool', address: '0x4dE122297CbB79287f826822F68ce77146956b75' },
  { name: 'Palladium (PAL)', address: '0x983A613d5f224459D2919e0d9E9e77C72E032042' },
  { name: 'Badassium (BAD)', address: '0x2960e22Ed3256E2bAfF233F5d03A20f597f14e07' },
];

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

interface RoleCounts {
  BORROWER: number;
  LENDER: number;
  ADMIN: number;
  AUDITOR: number;
  total: number;
}

interface RecentParticipant {
  wallet: string;
  role: string;
  created_at: string;
}

export default function AdminPage() {
  const { agents, setAgents, setActivityFeed } = useAgentStore();
  const { threatScores, activeAlerts, setThreatScores, addAlert } = useThreatStore();
  const user = useAuthStore((s) => s.user);

  // Live data state
  const [roleCounts, setRoleCounts] = useState<RoleCounts>({ BORROWER: 0, LENDER: 0, ADMIN: 0, AUDITOR: 0, total: 0 });
  const [recentParticipants, setRecentParticipants] = useState<RecentParticipant[]>([]);
  const [lendingMetrics, setLendingMetrics] = useState<any>(null);

  const fetchAdminData = useCallback(async () => {
    try {
      const [agentsRes, feedRes, scoresRes, alertsRes, participantsRes, borrowersRes, adminsRes, metricsRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/agents`),
        fetch(`${API_URL}/api/sim/activity-feed?limit=50`),
        fetch(`${API_URL}/api/threats/scores`),
        fetch(`${API_URL}/api/threats/alerts`),
        fetch(`${API_URL}/participants/`),
        fetch(`${API_URL}/api/auth/borrowers`),
        fetch(`${API_URL}/auth/adminandauditor`),
        fetch(`${API_URL}/api/lending/metrics`),
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

      // Build role breakdown from real participant + borrower + admin data
      const counts: RoleCounts = { BORROWER: 0, LENDER: 0, ADMIN: 0, AUDITOR: 0, total: 0 };
      const allParticipants: RecentParticipant[] = [];

      if (participantsRes.status === 'fulfilled' && participantsRes.value.ok) {
        const pData: any[] = (await participantsRes.value.json()) ?? [];
        for (const p of pData) {
          const role = p.role?.toUpperCase() ?? '';
          if (role in counts) (counts as any)[role]++;
          allParticipants.push({ wallet: p.wallet, role: p.role, created_at: p.created_at });
        }
      }
      if (borrowersRes.status === 'fulfilled' && borrowersRes.value.ok) {
        const bData: any[] = (await borrowersRes.value.json()) ?? [];
        // Count borrowers who aren't already in participants
        const existingWallets = new Set(allParticipants.map(p => p.wallet?.toLowerCase()));
        for (const b of bData) {
          if (!existingWallets.has(b.wallet_address?.toLowerCase())) {
            counts.BORROWER++;
            allParticipants.push({ wallet: b.wallet_address, role: 'BORROWER', created_at: b.created_at });
          }
        }
      }
      if (adminsRes.status === 'fulfilled' && adminsRes.value.ok) {
        const aData: any[] = (await adminsRes.value.json()) ?? [];
        for (const a of aData) {
          const role = a.role?.toUpperCase() ?? '';
          if (role in counts) (counts as any)[role]++;
          allParticipants.push({ wallet: a.uid || a.email, role: a.role, created_at: a.created_at });
        }
      }
      counts.total = counts.BORROWER + counts.LENDER + counts.ADMIN + counts.AUDITOR;
      setRoleCounts(counts);

      // Sort by created_at descending, take 5 most recent
      allParticipants.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setRecentParticipants(allParticipants.slice(0, 5));

      // Lending metrics for TVL
      if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
        const mJson = await metricsRes.value.json();
        setLendingMetrics(mJson.data ?? mJson ?? null);
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
  const criticalAlerts = unresolvedAlerts.filter((a) => a.severity === 'critical' || a.severity === 'high' || a.severity === 'CRITICAL' || a.severity === 'HIGH');
  const displayScores = threatScores;

  const tvl = lendingMetrics
    ? (lendingMetrics.total_supplied ?? 0) + (lendingMetrics.total_collateral ?? 0)
    : 0;

  const kpis = [
    { label: 'Total Participants', value: String(roleCounts.total || '—'), sub: `${roleCounts.BORROWER} borrowers · ${roleCounts.LENDER} lenders`, color: '#ff3860' },
    { label: 'Active Contracts', value: String(CONTRACTS.length), sub: 'Deployed on Sepolia', color: '#00d4ff' },
    { label: 'Active Agents', value: String(activeAgents.length || agents.length), sub: `${agents.length} total`, color: '#b367ff' },
    { label: 'Total Value Locked', value: tvl > 0 ? fmt(tvl) : '—', sub: 'From on-chain lending metrics', color: '#22c55e' },
  ];

  const roleBreakdown = [
    { role: 'BORROWER', count: roleCounts.BORROWER, color: '#00d4ff' },
    { role: 'LENDER', count: roleCounts.LENDER, color: '#b367ff' },
    { role: 'AUDITOR', count: roleCounts.AUDITOR, color: '#f0a500' },
    { role: 'ADMIN', count: roleCounts.ADMIN, color: '#ff3860' },
  ];

  function timeAgo(iso: string | null | undefined) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function shortAddr(addr: string) {
    if (addr.startsWith('0x') && addr.length >= 10) return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    return addr.length > 16 ? `${addr.slice(0, 10)}…` : addr;
  }

  return (
    <div className="space-y-8">
      {/* Dev Mode - Show logged in admin */}
      {user && (
        <div className="bg-[rgba(0,212,255,0.08)] border border-[#00d4ff] rounded p-3 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[#00d4ff]">🔓 ADMIN</span>
            <span className="text-text-tertiary">•</span>
            <span className="text-text-secondary">Logged in as:</span>
            <span className="text-text-primary font-bold">{user.email || user.name}</span>
          </div>
          <div className="text-text-tertiary">
            All data from Sepolia blockchain and live APIs
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold font-mono text-text-primary">System Overview</h1>
        <p className="text-sm text-text-tertiary font-mono mt-1">Rust-eze Simulation Lab · Admin Console</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-4">
            <div className="text-xs font-mono text-text-tertiary mb-2">{k.label}</div>
            <div className="text-3xl font-bold font-mono" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs font-mono text-text-tertiary mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Agents + Threats row ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Agents Widget */}
        <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-5">
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
              <div key={s.label} className="rounded border border-(--color-border) bg-(--color-bg-primary) p-2 text-center">
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
                <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-(--color-border) last:border-0">
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
            <p className="text-xs font-mono text-text-tertiary text-center py-4">No agents loaded. Start a simulation to see agents.</p>
          )}
        </div>

        {/* Threats Widget */}
        <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-5">
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
              <div key={s.label} className="rounded border border-(--color-border) bg-(--color-bg-primary) p-2 text-center">
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
                  <div className="h-1.5 bg-(--color-bg-primary) rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${ts.score}%`, background: barColor }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* top unresolved alert */}
          {unresolvedAlerts.length > 0 && (
            <div className="mt-4 pt-3 border-t border-(--color-border)">
              {(() => {
                const a = unresolvedAlerts[0];
                const sc = a.severity === 'critical' || a.severity === 'CRITICAL' ? '#ff0033' : a.severity === 'high' || a.severity === 'HIGH' ? '#ff3860' : a.severity === 'medium' || a.severity === 'MEDIUM' ? '#f0a500' : '#22c55e';
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

      {/* ── Participants + Contracts ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Role Breakdown (live from DB) */}
        <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono font-bold text-text-primary">Participant Breakdown</h2>
            <Link href="/admin/participants" className="text-xs font-mono text-[#ff3860] hover:underline">
              Manage →
            </Link>
          </div>
          <div className="space-y-3">
            {roleBreakdown.map((r) => (
              <div key={r.role} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                  <span className="text-xs font-mono text-text-secondary">{r.role}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 bg-(--color-bg-primary) rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${roleCounts.total > 0 ? (r.count / roleCounts.total) * 100 : 0}%`, background: r.color }} />
                  </div>
                  <span className="text-xs font-mono w-6 text-right" style={{ color: r.color }}>{r.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Deployed Contracts (real addresses) */}
        <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono font-bold text-text-primary">Deployed Contracts</h2>
            <Link href="/admin/blockchain" className="text-xs font-mono text-[#00d4ff] hover:underline">
              Explorer →
            </Link>
          </div>
          <div className="space-y-2">
            {CONTRACTS.map((c) => (
              <div key={c.name} className="flex items-center justify-between py-1.5 border-b border-(--color-border) last:border-0">
                <div className="text-xs font-mono text-text-primary font-bold">{c.name}</div>
                <a
                  href={`https://sepolia.etherscan.io/address/${c.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-[#00d4ff] hover:underline"
                >
                  {shortAddr(c.address)} ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Registrations (live from DB) */}
      <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono font-bold text-text-primary">Recent Registrations</h2>
          <Link href="/admin/participants" className="text-xs font-mono text-[#ff3860] hover:underline">
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-text-tertiary border-b border-(--color-border)">
                <th className="text-left py-2 pr-6">Wallet / ID</th>
                <th className="text-left py-2 pr-6">Role</th>
                <th className="text-left py-2">Registered</th>
              </tr>
            </thead>
            <tbody>
              {recentParticipants.length > 0 ? recentParticipants.map((r, i) => (
                <tr key={i} className="border-b border-(--color-border) last:border-0">
                  <td className="py-3 pr-6 text-text-primary">{shortAddr(r.wallet || '—')}</td>
                  <td className="py-3 pr-6 text-[#00d4ff]">{r.role}</td>
                  <td className="py-3 text-text-tertiary">{timeAgo(r.created_at)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-text-tertiary">No registrations yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-5">
        <h2 className="text-sm font-mono font-bold text-text-primary mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link href="/admin/agents" className="block w-full py-3 font-mono text-sm text-center bg-[rgba(179,103,255,0.1)] border border-[#b367ff] text-[#b367ff] rounded hover:bg-[rgba(179,103,255,0.2)] transition-colors">
            ◈ Manage Agents
          </Link>
          <Link href="/admin/stress" className="block w-full py-3 font-mono text-sm text-center bg-[rgba(240,165,0,0.1)] border border-[#f0a500] text-[#f0a500] rounded hover:bg-[rgba(240,165,0,0.2)] transition-colors">
            ⚔ Stress Testing
          </Link>
          <Link href="/admin/participants" className="block w-full py-3 font-mono text-sm text-center bg-[rgba(34,197,94,0.1)] border border-[#22c55e] text-[#22c55e] rounded hover:bg-[rgba(34,197,94,0.2)] transition-colors">
            ⊕ Manage Participants
          </Link>
        </div>
      </div>
    </div>
  );
}
