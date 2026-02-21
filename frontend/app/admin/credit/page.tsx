'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { participantApi } from '@/lib/api';

interface Participant {
  id: number;
  wallet: string;
  role: string;
  score: number;
  created_at: string;
}

interface BorrowerRecord {
  wallet_address: string;
  name: string | null;
  email: string | null;
}

interface Row extends Participant {
  name?: string | null;
  email?: string | null;
}

type GradeFilter = 'ALL' | 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';

function grade(score: number): { label: string; color: string; bg: string; band: GradeFilter } {
  if (score >= 750) return { label: 'Excellent', color: '#38ff8c', bg: 'rgba(56,255,140,0.12)', band: 'EXCELLENT' };
  if (score >= 650) return { label: 'Good',      color: '#38b4ff', bg: 'rgba(56,180,255,0.12)', band: 'GOOD' };
  if (score >= 550) return { label: 'Fair',       color: '#ffc838', bg: 'rgba(255,200,56,0.12)',  band: 'FAIR' };
  return              { label: 'Poor',       color: '#ff3860', bg: 'rgba(255,56,96,0.12)',   band: 'POOR' };
}

function scoreBar(score: number) {
  const pct = Math.min(100, Math.max(0, ((score - 300) / 550) * 100));
  const g = grade(score);
  return { pct, color: g.color };
}

function shortWallet(w: string) {
  if (w.startsWith('0x') && w.length >= 10) return `${w.slice(0, 6)}…${w.slice(-4)}`;
  return w.length > 16 ? `${w.slice(0, 8)}…` : w;
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN:    'bg-[rgba(255,56,96,0.15)] text-[#ff3860]',
  AUDITOR:  'bg-[rgba(255,200,56,0.15)] text-[#ffc838]',
  LENDER:   'bg-[rgba(56,180,255,0.15)] text-[#38b4ff]',
  BORROWER: 'bg-[rgba(56,255,140,0.15)] text-[#38ff8c]',
};

export default function CreditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GradeFilter>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'id' | 'role' | 'wallet'>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editScore, setEditScore] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [pRes, bRes] = await Promise.all([
      participantApi.getAll(),
      participantApi.getBorrowers(),
    ]);
    if (!pRes.success) {
      setError('Failed to load participants. Is the backend running?');
      setLoading(false);
      return;
    }
    const participants: Participant[] = pRes.data ?? [];
    const borrowers: BorrowerRecord[] = bRes.success ? (bRes.data ?? []) : [];
    const bMap = new Map(borrowers.map(b => [b.wallet_address.toLowerCase(), b]));
    const built: Row[] = participants
      .filter(p => p.score > 0)
      .map(p => {
        const b = bMap.get(p.wallet.toLowerCase());
        return { ...p, name: b?.name, email: b?.email };
      });
    setRows(built);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir(col === 'score' ? 'desc' : 'asc'); }
  };

  const openEdit = (r: Row) => {
    setEditRow(r);
    setEditScore(String(r.score));
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!editRow) return;
    const val = parseInt(editScore, 10);
    if (isNaN(val) || val < 300 || val > 850) { setSaveError('Score must be between 300 and 850'); return; }
    setSaving(true);
    setSaveError(null);
    const res = await participantApi.updateScore(editRow.wallet, val);
    if (res.success) {
      setRows(rs => rs.map(r => r.wallet === editRow.wallet ? { ...r, score: val } : r));
      setEditRow(null);
    } else {
      setSaveError((res as any).error || 'Failed to update score');
    }
    setSaving(false);
  };

  const counts = {
    EXCELLENT: rows.filter(r => r.score >= 750).length,
    GOOD:      rows.filter(r => r.score >= 650 && r.score < 750).length,
    FAIR:      rows.filter(r => r.score >= 550 && r.score < 650).length,
    POOR:      rows.filter(r => r.score < 550).length,
  };
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;

  const filtered = rows
    .filter(r => filter === 'ALL' || grade(r.score).band === filter)
    .filter(r => {
      const q = search.toLowerCase();
      return !q || r.wallet.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (sortBy === 'score') { va = a.score; vb = b.score; }
      else if (sortBy === 'id') { va = a.id; vb = b.id; }
      else if (sortBy === 'role') { va = a.role; vb = b.role; }
      else { va = a.wallet; vb = b.wallet; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col
      ? <span className="ml-1 text-[#ff3860]">{sortDir === 'asc' ? '↑' : '↓'}</span>
      : <span className="ml-1 opacity-20">↕</span>;

  // Distribution bars (buckets of 50 points from 300-850)
  const buckets = Array.from({ length: 11 }, (_, i) => {
    const lo = 300 + i * 50, hi = lo + 49;
    const count = rows.filter(r => r.score >= lo && r.score <= hi).length;
    return { lo, hi, count };
  });
  const maxBucket = Math.max(...buckets.map(b => b.count), 1);

  const grades: { key: GradeFilter; label: string; color: string; range: string }[] = [
    { key: 'ALL',       label: `All (${rows.length})`,        color: 'text-text-primary',  range: '' },
    { key: 'EXCELLENT', label: `Excellent (${counts.EXCELLENT})`, color: 'text-[#38ff8c]', range: '750–850' },
    { key: 'GOOD',      label: `Good (${counts.GOOD})`,       color: 'text-[#38b4ff]',     range: '650–749' },
    { key: 'FAIR',      label: `Fair (${counts.FAIR})`,       color: 'text-[#ffc838]',     range: '550–649' },
    { key: 'POOR',      label: `Poor (${counts.POOR})`,       color: 'text-[#ff3860]',     range: '300–549' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-text-primary">Credit Scores</h1>
          <p className="text-sm text-text-secondary font-mono mt-0.5">On-chain credit ratings for registered participants</p>
        </div>
        <button onClick={load} className="px-4 py-2 text-xs font-mono border border-[color:var(--color-border)] rounded hover:border-[#ff3860] hover:text-[#ff3860] transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Average',   value: avg || '—', color: avg ? grade(avg).color : 'text-text-tertiary' },
          { label: 'Excellent', value: counts.EXCELLENT, color: 'text-[#38ff8c]' },
          { label: 'Good',      value: counts.GOOD,      color: 'text-[#38b4ff]' },
          { label: 'Fair',      value: counts.FAIR,      color: 'text-[#ffc838]' },
          { label: 'Poor',      value: counts.POOR,      color: 'text-[#ff3860]' },
        ].map(k => (
          <div key={k.label} className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-4">
            <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider">{k.label}</div>
            <div className={`text-2xl font-bold font-mono mt-1 ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Distribution Chart */}
      <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-5">
        <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-4">Score Distribution</div>
        <div className="flex items-end gap-1 h-24">
          {buckets.map(b => {
            const heightPct = (b.count / maxBucket) * 100;
            const g = grade(b.lo + 25);
            return (
              <div key={b.lo} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity text-text-primary whitespace-nowrap z-10 bg-[color:var(--color-bg-secondary)] px-1 rounded">
                  {b.lo}–{b.hi}: {b.count}
                </div>
                <div
                  className="w-full rounded-sm transition-all"
                  style={{ height: `${Math.max(4, heightPct)}%`, background: g.color, opacity: b.count ? 0.8 : 0.15 }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-xs font-mono text-text-tertiary">
          <span>300</span>
          <span className="text-[#ff3860]">Poor</span>
          <span className="text-[#ffc838]">Fair</span>
          <span className="text-[#38b4ff]">Good</span>
          <span className="text-[#38ff8c]">Excellent</span>
          <span>850</span>
        </div>
      </div>

      {/* Filter + Search */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {grades.map(g => (
            <button
              key={g.key}
              onClick={() => setFilter(g.key)}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${filter === g.key ? 'bg-[#ff3860] text-white' : 'border border-[color:var(--color-border)] text-text-secondary hover:border-[#ff3860] hover:text-[#ff3860]'}`}
            >
              {g.label}
              {g.range && <span className="ml-1 opacity-60">{g.range}</span>}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search wallet, name, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full md:w-64 px-3 py-2 text-xs font-mono bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded outline-none focus:border-[#ff3860] text-text-primary placeholder:text-text-tertiary"
        />
      </div>

      {error && (
        <div className="p-4 bg-[rgba(255,56,96,0.1)] border border-[rgba(255,56,96,0.3)] rounded text-sm font-mono text-[#ff3860]">{error}</div>
      )}

      {/* Table */}
      <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-text-tertiary font-mono text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-text-tertiary font-mono text-sm">No participants found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-text-tertiary text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 cursor-pointer hover:text-text-primary" onClick={() => handleSort('id')}># <SortIcon col="id" /></th>
                  <th className="text-left px-4 py-3 cursor-pointer hover:text-text-primary" onClick={() => handleSort('wallet')}>Wallet <SortIcon col="wallet" /></th>
                  <th className="text-left px-4 py-3 cursor-pointer hover:text-text-primary" onClick={() => handleSort('role')}>Role <SortIcon col="role" /></th>
                  <th className="text-left px-4 py-3 cursor-pointer hover:text-text-primary" onClick={() => handleSort('score')}>Score <SortIcon col="score" /></th>
                  <th className="text-left px-4 py-3">Grade</th>
                  <th className="text-left px-4 py-3">Distribution</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const g = grade(r.score);
                  const bar = scoreBar(r.score);
                  return (
                    <tr key={r.id} className="border-b border-[color:var(--color-border)] hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                      <td className="px-4 py-3 text-text-tertiary">{r.id}</td>
                      <td className="px-4 py-3">
                        <div className="text-text-primary text-xs" title={r.wallet}>{shortWallet(r.wallet)}</div>
                        {(r.name || r.email) && (
                          <div className="text-text-tertiary text-xs mt-0.5">{r.name}{r.name && r.email && ' · '}{r.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${ROLE_COLORS[r.role] ?? 'text-text-secondary'}`}>{r.role}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-lg font-bold" style={{ color: g.color }}>{r.score}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-mono" style={{ color: g.color, background: g.bg }}>{g.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-28 h-2 bg-[color:var(--color-bg-accent)] rounded overflow-hidden">
                            <div className="h-full rounded transition-all" style={{ width: `${bar.pct}%`, background: bar.color }} />
                          </div>
                          <span className="text-xs text-text-tertiary">{Math.round(bar.pct)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openEdit(r)}
                          className="text-xs text-text-tertiary hover:text-[#ff3860] transition-colors px-2 py-1 border border-[color:var(--color-border)] rounded hover:border-[#ff3860]"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs font-mono text-text-tertiary">
        Showing {filtered.length} of {rows.length} scored participants
      </div>

      {/* Edit Score Modal */}
      {editRow && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-xl p-6 w-96 space-y-4">
            <div className="text-base font-bold font-mono text-text-primary">Edit Credit Score</div>

            <div className="space-y-1 text-xs font-mono">
              <div className="text-text-tertiary">Wallet</div>
              <div className="text-text-primary bg-[color:var(--color-bg-accent)] px-3 py-2 rounded break-all">{editRow.wallet}</div>
            </div>

            {(editRow.name || editRow.email) && (
              <div className="text-xs font-mono text-text-secondary">{editRow.name}{editRow.name && editRow.email && ' · '}{editRow.email}</div>
            )}

            {/* Current score display */}
            <div className="flex items-center gap-3 p-3 bg-[color:var(--color-bg-accent)] rounded">
              <div>
                <div className="text-xs font-mono text-text-tertiary">Current Score</div>
                <div className="text-2xl font-bold font-mono" style={{ color: grade(editRow.score).color }}>{editRow.score}</div>
              </div>
              <div className="flex-1 h-2 bg-[color:var(--color-bg-secondary)] rounded overflow-hidden">
                <div className="h-full rounded" style={{ width: `${scoreBar(editRow.score).pct}%`, background: scoreBar(editRow.score).color }} />
              </div>
              <span className="text-xs font-mono" style={{ color: grade(editRow.score).color }}>{grade(editRow.score).label}</span>
            </div>

            {/* Score input */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-text-tertiary">New Score (300–850)</label>
              <input
                type="number"
                min={300}
                max={850}
                value={editScore}
                onChange={e => setEditScore(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded outline-none focus:border-[#ff3860] text-text-primary"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              {/* Live preview bar */}
              {editScore && !isNaN(parseInt(editScore)) && (() => {
                const val = Math.max(300, Math.min(850, parseInt(editScore)));
                const bar2 = scoreBar(val);
                const g2 = grade(val);
                return (
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <div className="flex-1 h-1.5 bg-[color:var(--color-bg-accent)] rounded overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${bar2.pct}%`, background: bar2.color }} />
                    </div>
                    <span style={{ color: g2.color }}>{g2.label}</span>
                  </div>
                );
              })()}
            </div>

            {saveError && (
              <div className="text-xs font-mono text-[#ff3860] bg-[rgba(255,56,96,0.1)] px-3 py-2 rounded">{saveError}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditRow(null)} className="flex-1 py-2 text-xs font-mono border border-[color:var(--color-border)] rounded hover:border-[#ff3860] transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 text-xs font-mono bg-[#ff3860] text-white rounded hover:bg-[#cc2d4d] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save Score'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
