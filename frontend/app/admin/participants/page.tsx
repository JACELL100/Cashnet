'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { participantApi } from '@/lib/api';

type Role = 'BORROWER' | 'LENDER' | 'ADMIN' | 'AUDITOR';
type FilterTab = 'ALL' | Role | 'UNREGISTERED';

interface Participant {
  id: number;
  wallet: string;
  role: Role;
  score: number;
  created_at: string;
}

interface BorrowerRecord {
  id: number;
  wallet_address: string;
  name: string | null;
  email: string | null;
  is_active: number;
  created_at: string | null;
  last_login: string | null;
}

interface AdminAuditor {
  uid: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'AUDITOR';
  created_at: string;
}

interface Row {
  key: string;
  id: number;
  wallet: string;
  role: Role | 'UNREGISTERED';
  score: number | null;
  created_at: string;
  name?: string | null;
  email?: string | null;
  last_login?: string | null;
  is_active?: number;
  isAdminAccount?: boolean;
  source: 'participant' | 'borrower_only' | 'admin';
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN:        'bg-[rgba(255,56,96,0.15)] text-[#ff3860] border border-[rgba(255,56,96,0.3)]',
  AUDITOR:      'bg-[rgba(255,200,56,0.15)] text-[#ffc838] border border-[rgba(255,200,56,0.3)]',
  LENDER:       'bg-[rgba(56,180,255,0.15)] text-[#38b4ff] border border-[rgba(56,180,255,0.3)]',
  BORROWER:     'bg-[rgba(56,255,140,0.15)] text-[#38ff8c] border border-[rgba(56,255,140,0.3)]',
  UNREGISTERED: 'bg-[rgba(180,180,180,0.15)] text-text-tertiary border border-[rgba(180,180,180,0.3)]',
};

function scoreColor(score: number) {
  if (score >= 750) return 'text-[#38ff8c]';
  if (score >= 650) return 'text-[#ffc838]';
  return 'text-[#ff3860]';
}
function scoreBar(score: number) {
  const pct = Math.min(100, Math.max(0, ((score - 300) / 550) * 100));
  const color = score >= 750 ? '#38ff8c' : score >= 650 ? '#ffc838' : '#ff3860';
  return { pct, color };
}
function shortWallet(w: string) {
  if (w.startsWith('0x') && w.length >= 10) return `${w.slice(0, 6)}â€¦${w.slice(-4)}`;
  return w.length > 16 ? `${w.slice(0, 8)}â€¦` : w;
}
function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ParticipantsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'id' | 'score' | 'created_at' | 'role' | 'last_login'>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Row | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [pRes, bRes, aaRes] = await Promise.all([
      participantApi.getAll(),
      participantApi.getBorrowers(),
      participantApi.getAdminsAuditors(),
    ]);

    if (!pRes.success) { setError('Failed to load participants. Is the backend running?'); setLoading(false); return; }

    const participants: Participant[] = pRes.data ?? [];
    const borrowers: BorrowerRecord[] = bRes.success ? (bRes.data ?? []) : [];
    const admins: AdminAuditor[] = aaRes.success ? (aaRes.data ?? []) : [];

    // Build borrower lookup by wallet (lowercase key)
    const borrowerMap = new Map<string, BorrowerRecord>(
      borrowers.map(b => [b.wallet_address.toLowerCase(), b])
    );

    const built: Row[] = [];

    // 1. Registered participants â€” enrich with borrower data if wallet matches
    for (const p of participants) {
      const b = borrowerMap.get(p.wallet.toLowerCase());
      built.push({
        key: `p-${p.id}`,
        id: p.id,
        wallet: p.wallet,
        role: p.role,
        score: p.score,
        created_at: p.created_at,
        name: b?.name,
        email: b?.email,
        last_login: b?.last_login,
        is_active: b?.is_active,
        source: 'participant',
      });
      if (b) borrowerMap.delete(p.wallet.toLowerCase());
    }

    // 2. Borrowers that authenticated but were never registered as participants
    for (const b of borrowerMap.values()) {
      built.push({
        key: `b-${b.id}`,
        id: b.id,
        wallet: b.wallet_address,
        role: 'UNREGISTERED',
        score: null,
        created_at: b.created_at ?? '',
        name: b.name,
        email: b.email,
        last_login: b.last_login,
        is_active: b.is_active,
        source: 'borrower_only',
      });
    }

    // 3. Admin / Auditor SSO accounts
    for (let i = 0; i < admins.length; i++) {
      const aa = admins[i];
      built.push({
        key: `aa-${i}`,
        id: -(i + 1),
        wallet: aa.uid,
        role: aa.role,
        score: null,
        created_at: aa.created_at,
        name: aa.name,
        email: aa.email,
        isAdminAccount: true,
        source: 'admin',
      });
    }

    setRows(built);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const handleDelete = async (wallet: string) => {
    setDeleting(true);
    const res = await participantApi.delete(wallet);
    if (res.success) {
      setRows(rs => rs.filter(r => r.wallet !== wallet));
      setDeleteConfirm(null);
      if (selected?.wallet === wallet) setSelected(null);
    }
    setDeleting(false);
  };

  const getSortVal = (r: Row): number | string => {
    if (sortBy === 'score') return r.score ?? -1;
    if (sortBy === 'role') return r.role;
    if (sortBy === 'created_at') return new Date(r.created_at || 0).getTime();
    if (sortBy === 'last_login') return r.last_login ? new Date(r.last_login).getTime() : 0;
    return Math.abs(r.id);
  };

  const filtered = rows
    .filter(r => filter === 'ALL' || r.role === filter)
    .filter(r => {
      const q = search.toLowerCase();
      return !q || r.wallet.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const va = getSortVal(a), vb = getSortVal(b);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const counts = {
    total: rows.length,
    BORROWER: rows.filter(r => r.role === 'BORROWER').length,
    LENDER: rows.filter(r => r.role === 'LENDER').length,
    ADMIN: rows.filter(r => r.role === 'ADMIN').length,
    AUDITOR: rows.filter(r => r.role === 'AUDITOR').length,
    UNREGISTERED: rows.filter(r => r.role === 'UNREGISTERED').length,
  };
  const scoredRows = rows.filter(r => r.score !== null && r.score > 0);
  const avgScore = scoredRows.length
    ? Math.round(scoredRows.reduce((s, r) => s + (r.score ?? 0), 0) / scoredRows.length)
    : 0;

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col
      ? <span className="ml-1 text-[#ff3860]">{sortDir === 'asc' ? 'â†‘' : 'â†“'}</span>
      : <span className="ml-1 opacity-20">â†•</span>;

  const tabs: FilterTab[] = ['ALL', 'BORROWER', 'LENDER', 'ADMIN', 'AUDITOR', 'UNREGISTERED'];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-text-primary">Participants</h1>
          <p className="text-sm text-text-secondary font-mono mt-0.5">
            All registered wallets, borrowers, and system accounts
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 text-xs font-mono border border-[color:var(--color-border)] rounded hover:border-[#ff3860] hover:text-[#ff3860] transition-colors"
        >
          â†» Refresh
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Total',        value: counts.total,        color: 'text-text-primary' },
          { label: 'Borrowers',    value: counts.BORROWER,     color: 'text-[#38ff8c]' },
          { label: 'Lenders',      value: counts.LENDER,       color: 'text-[#38b4ff]' },
          { label: 'Admins',       value: counts.ADMIN,        color: 'text-[#ff3860]' },
          { label: 'Unregistered', value: counts.UNREGISTERED, color: 'text-text-tertiary' },
          { label: 'Avg Credit',   value: avgScore || 'â€”',     color: avgScore ? scoreColor(avgScore) : 'text-text-tertiary' },
        ].map(k => (
          <div key={k.label} className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-4">
            <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider">{k.label}</div>
            <div className={`text-2xl font-bold font-mono mt-1 ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filter + Search */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${filter === tab ? 'bg-[#ff3860] text-white' : 'border border-[color:var(--color-border)] text-text-secondary hover:border-[#ff3860] hover:text-[#ff3860]'}`}
            >
              {tab === 'ALL' ? `ALL (${counts.total})` : `${tab} (${counts[tab as keyof typeof counts]})`}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search wallet, email, nameâ€¦"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full md:w-64 px-3 py-2 text-xs font-mono bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded outline-none focus:border-[#ff3860] text-text-primary placeholder:text-text-tertiary"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-[rgba(255,56,96,0.1)] border border-[rgba(255,56,96,0.3)] rounded text-sm font-mono text-[#ff3860]">
          {error}
        </div>
      )}

      {/* Table + Detail Panel */}
      <div className="flex gap-4">
        <div className="flex-1 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg overflow-hidden min-w-0">
          {loading ? (
            <div className="p-12 text-center text-text-tertiary font-mono text-sm">Loadingâ€¦</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-text-tertiary font-mono text-sm">No participants found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-text-tertiary text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 cursor-pointer hover:text-text-primary whitespace-nowrap" onClick={() => handleSort('id')}># <SortIcon col="id" /></th>
                    <th className="text-left px-4 py-3">Identity</th>
                    <th className="text-left px-4 py-3 cursor-pointer hover:text-text-primary whitespace-nowrap" onClick={() => handleSort('role')}>Role <SortIcon col="role" /></th>
                    <th className="text-left px-4 py-3 cursor-pointer hover:text-text-primary whitespace-nowrap" onClick={() => handleSort('score')}>Credit <SortIcon col="score" /></th>
                    <th className="text-left px-4 py-3 cursor-pointer hover:text-text-primary whitespace-nowrap" onClick={() => handleSort('last_login')}>Last Login <SortIcon col="last_login" /></th>
                    <th className="text-left px-4 py-3 cursor-pointer hover:text-text-primary whitespace-nowrap" onClick={() => handleSort('created_at')}>Registered <SortIcon col="created_at" /></th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const bar = r.score !== null ? scoreBar(r.score) : null;
                    return (
                      <tr
                        key={r.key}
                        onClick={() => setSelected(r)}
                        className={`border-b border-[color:var(--color-border)] cursor-pointer transition-colors hover:bg-[rgba(255,56,96,0.04)] ${selected?.key === r.key ? 'bg-[rgba(255,56,96,0.07)]' : ''}`}
                      >
                        <td className="px-4 py-3 text-text-tertiary">{r.id > 0 ? r.id : 'â€”'}</td>
                        <td className="px-4 py-3">
                          <div className="text-text-primary text-xs" title={r.wallet}>
                            {r.isAdminAccount ? (r.name || r.email) : shortWallet(r.wallet)}
                          </div>
                          {!r.isAdminAccount && (r.name || r.email) && (
                            <div className="text-text-tertiary text-xs mt-0.5">
                              {r.name}{r.name && r.email && ' Â· '}{r.email}
                            </div>
                          )}
                          {r.isAdminAccount && r.email && (
                            <div className="text-text-tertiary text-xs mt-0.5">{r.email}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${ROLE_COLORS[r.role]}`}>{r.role}</span>
                          {r.is_active === 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-[rgba(255,56,96,0.1)] text-[#ff3860]">inactive</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {bar && r.score !== null ? (
                            <div className="flex items-center gap-2">
                              <span className={`w-10 text-right ${scoreColor(r.score)}`}>{r.score}</span>
                              <div className="w-16 h-1.5 bg-[color:var(--color-bg-accent)] rounded overflow-hidden">
                                <div className="h-full rounded" style={{ width: `${bar.pct}%`, background: bar.color }} />
                              </div>
                            </div>
                          ) : <span className="text-text-tertiary">â€”</span>}
                        </td>
                        <td className="px-4 py-3 text-text-tertiary text-xs whitespace-nowrap">{timeAgo(r.last_login)}</td>
                        <td className="px-4 py-3 text-text-tertiary text-xs whitespace-nowrap">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : 'â€”'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.source === 'participant' && (
                            <button
                              onClick={e => { e.stopPropagation(); setDeleteConfirm(r.wallet); }}
                              className="text-xs text-text-tertiary hover:text-[#ff3860] transition-colors px-2 py-1 rounded hover:bg-[rgba(255,56,96,0.1)]"
                            >âœ•</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="w-72 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-5 space-y-4 shrink-0 self-start sticky top-20">
            <div className="flex items-start justify-between">
              <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider">Detail</div>
              <button onClick={() => setSelected(null)} className="text-text-tertiary hover:text-text-primary text-lg leading-none">Ã—</button>
            </div>

            <div>
              <div className="text-xs font-mono text-text-tertiary mb-1">
                {selected.isAdminAccount ? 'Google UID' : 'Wallet'}
              </div>
              <div className="text-xs font-mono text-text-primary break-all bg-[color:var(--color-bg-accent)] p-2 rounded">
                {selected.wallet}
              </div>
            </div>

            {selected.name && (
              <div>
                <div className="text-xs font-mono text-text-tertiary mb-1">Name</div>
                <div className="text-sm font-mono text-text-primary">{selected.name}</div>
              </div>
            )}
            {selected.email && (
              <div>
                <div className="text-xs font-mono text-text-tertiary mb-1">Email</div>
                <div className="text-sm font-mono text-text-primary">{selected.email}</div>
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex-1">
                <div className="text-xs font-mono text-text-tertiary mb-1">Role</div>
                <span className={`px-2 py-0.5 rounded text-xs ${ROLE_COLORS[selected.role]}`}>{selected.role}</span>
              </div>
              {selected.is_active !== undefined && (
                <div className="flex-1">
                  <div className="text-xs font-mono text-text-tertiary mb-1">Status</div>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono ${selected.is_active ? 'text-[#38ff8c] bg-[rgba(56,255,140,0.1)]' : 'text-[#ff3860] bg-[rgba(255,56,96,0.1)]'}`}>
                    {selected.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              )}
            </div>

            {selected.score !== null && (
              <div>
                <div className="text-xs font-mono text-text-tertiary mb-1">Credit Score</div>
                <div className={`text-3xl font-bold font-mono ${scoreColor(selected.score)}`}>{selected.score}</div>
                <div className="mt-2 h-2 bg-[color:var(--color-bg-accent)] rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${scoreBar(selected.score).pct}%`, background: scoreBar(selected.score).color }} />
                </div>
                <div className="flex justify-between text-xs font-mono text-text-tertiary mt-1">
                  <span>300</span><span>850</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-text-tertiary">Last Login</span>
                <span className="text-text-primary">{timeAgo(selected.last_login)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">Registered</span>
                <span className="text-text-primary">{selected.created_at ? new Date(selected.created_at).toLocaleDateString() : 'â€”'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-tertiary">Source</span>
                <span className="text-text-primary capitalize">{selected.source.replace('_', ' ')}</span>
              </div>
            </div>

            {!selected.isAdminAccount && (
              <div className="pt-2 border-t border-[color:var(--color-border)] space-y-2">
                <a
                  href={`https://sepolia.etherscan.io/address/${selected.wallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center py-2 text-xs font-mono border border-[color:var(--color-border)] rounded hover:border-[#38b4ff] hover:text-[#38b4ff] transition-colors"
                >
                  View on Etherscan â†—
                </a>
                {selected.source === 'participant' && (
                  <button
                    onClick={() => setDeleteConfirm(selected.wallet)}
                    className="w-full py-2 text-xs font-mono border border-[rgba(255,56,96,0.4)] text-[#ff3860] rounded hover:bg-[rgba(255,56,96,0.1)] transition-colors"
                  >
                    Remove Participant
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-xs font-mono text-text-tertiary">
        Showing {filtered.length} of {rows.length} total accounts
        {counts.UNREGISTERED > 0 && ` Â· ${counts.UNREGISTERED} wallet-auth only (not in participants table)`}
      </div>

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[color:var(--color-bg-secondary)] border border-[rgba(255,56,96,0.4)] rounded-xl p-6 w-80 space-y-4">
            <div className="text-base font-bold font-mono text-[#ff3860]">Remove Participant</div>
            <div className="text-sm font-mono text-text-secondary">
              Remove <span className="text-text-primary">{shortWallet(deleteConfirm)}</span>? This cannot be undone.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 text-xs font-mono border border-[color:var(--color-border)] rounded transition-colors">
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="flex-1 py-2 text-xs font-mono bg-[#ff3860] text-white rounded hover:bg-[#cc2d4d] disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Removingâ€¦' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
