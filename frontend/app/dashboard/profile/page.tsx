'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useAccount } from 'wagmi';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://cash-net.onrender.com';
const SEPOLIA = 'https://sepolia.etherscan.io';

/* role → accent colour map */
const roleAccent: Record<string, string> = {
  BORROWER: '#00d4ff',
  LENDER: '#b367ff',
  ADMIN: '#ff3860',
  AUDITOR: '#f0a500',
};

interface WalletStats {
  totalDeposited: number;
  totalBorrowed: number;
  txCount: number;
  firstSeen: string;
  healthFactor: number;
  creditScore: number;
}

export default function DashboardProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { address, isConnected, chain } = useAccount();

  const accent = roleAccent[user?.role || 'BORROWER'] || '#00d4ff';

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  /* ── fetch account stats ── */
  const fetchStats = useCallback(async () => {
    try {
      const [metricsRes, txRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/lending/metrics`),
        fetch(`${API_URL}/pool/transactions?limit=100`),
      ]);

      const s: WalletStats = {
        totalDeposited: 0,
        totalBorrowed: 0,
        txCount: 0,
        firstSeen: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—',
        healthFactor: 999,
        creditScore: 500,
      };

      if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
        const m = (await metricsRes.value.json()).data ?? {};
        s.totalDeposited = m.total_collateral ?? 0;
        s.totalBorrowed = m.total_debt ?? 0;
      }

      if (txRes.status === 'fulfilled' && txRes.value.ok) {
        const txs = (await txRes.value.json()).data ?? [];
        s.txCount = txs.length;
      }

      /* health factor */
      try {
        const hfRes = await fetch(`${API_URL}/api/lending/health-factor/${address}`);
        if (hfRes.ok) {
          const hf = await hfRes.json();
          s.healthFactor = hf.health_factor ?? 999;
        }
      } catch { /* noop */ }

      /* credit score */
      try {
        const crRes = await fetch(`${API_URL}/api/credit/dynamic-rates`);
        if (crRes.ok) {
          const cr = await crRes.json();
          s.creditScore = cr.data?.credit_score ?? 500;
        }
      } catch { /* noop */ }

      setStats(s);
    } catch { /* noop */ }
  }, [address, user?.createdAt]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  /* ── save profile ── */
  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setUser({ ...user, name: name.trim() || undefined, email: email.trim() || undefined });
    await new Promise((r) => setTimeout(r, 400));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCopy = () => {
    if (user?.walletAddress || address) {
      navigator.clipboard.writeText((user?.walletAddress || address) as string);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1500);
    }
  };

  const walletAddr = user?.walletAddress || address || '—';
  const shortAddr = walletAddr.length > 10
    ? `${walletAddr.slice(0, 6)}...${walletAddr.slice(-4)}`
    : walletAddr;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-mono text-text-primary">Profile</h1>
        <p className="text-sm text-text-secondary font-mono mt-1">Your identity and account overview</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ──── Left: Identity Card ──── */}
        <div className="lg:col-span-1 space-y-6">
          {/* Avatar Card */}
          <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6 flex flex-col items-center gap-4">
            <div className="relative">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white border-4"
                style={{ backgroundColor: accent, borderColor: `${accent}40` }}
              >
                {(user?.name?.[0] || user?.walletAddress?.[2] || 'U').toUpperCase()}
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#22c55e] border-2 border-[color:var(--color-bg-secondary)] flex items-center justify-center">
                <span className="text-[10px] text-white">✓</span>
              </div>
            </div>

            <div className="text-center">
              <div className="text-lg font-bold font-mono text-text-primary">
                {user?.name || user?.role || 'User'}
              </div>
              <span
                className="inline-block mt-1 px-3 py-0.5 rounded text-xs font-mono font-bold border"
                style={{ color: accent, borderColor: accent, background: `${accent}18` }}
              >
                {user?.role || 'BORROWER'}
              </span>
            </div>

            {/* Wallet Address */}
            <div className="w-full">
              <div className="text-xs font-mono text-text-tertiary mb-1">Wallet Address</div>
              <div className="flex items-center gap-2 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2">
                <span className="text-sm font-mono text-text-primary flex-1 truncate">{shortAddr}</span>
                <button onClick={handleCopy} className="text-xs hover:text-white transition-colors shrink-0" style={{ color: accent }} title="Copy">
                  {copySuccess ? '✓' : '⧉'}
                </button>
                {walletAddr !== '—' && (
                  <a href={`${SEPOLIA}/address/${walletAddr}`} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-white transition-colors shrink-0" title="Etherscan">
                    ↗
                  </a>
                )}
              </div>
            </div>

            {/* Connection status */}
            <div className="w-full flex items-center gap-2 text-xs font-mono">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#22c55e]' : 'bg-[#ff3860]'}`} />
              <span className="text-text-secondary">
                {isConnected ? `Connected · ${chain?.name || 'Sepolia'}` : 'Wallet disconnected'}
              </span>
            </div>
          </div>

          {/* Membership */}
          <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-5">
            <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-3">Membership</div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm font-mono">
                <span className="text-text-secondary">Plan</span>
                <span className="font-bold capitalize" style={{ color: accent }}>{user?.plan || 'starter'}</span>
              </div>
              <div className="flex justify-between text-sm font-mono">
                <span className="text-text-secondary">Member Since</span>
                <span className="text-text-primary">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</span>
              </div>
              <div className="flex justify-between text-sm font-mono">
                <span className="text-text-secondary">User ID</span>
                <span className="text-text-primary text-xs truncate max-w-[140px]" title={user?.id}>{user?.id?.slice(0, 12)}...</span>
              </div>
            </div>
          </div>

          {/* Credit Score (borrowers) */}
          {(user?.role === 'BORROWER' || !user?.role) && (
            <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-5">
              <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-3">Credit Score</div>
              <div className="flex items-end gap-3">
                <span className="text-4xl font-bold font-mono" style={{ color: accent }}>
                  {stats?.creditScore ?? '—'}
                </span>
                <span className="text-xs font-mono text-text-tertiary mb-1">/ 850</span>
              </div>
              <div className="w-full h-2 bg-[color:var(--color-bg-primary)] rounded-full mt-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${((stats?.creditScore ?? 500) / 850) * 100}%`, backgroundColor: accent }}
                />
              </div>
              <div className="flex justify-between text-xs font-mono text-text-tertiary mt-1">
                <span>Poor</span>
                <span>Excellent</span>
              </div>
            </div>
          )}
        </div>

        {/* ──── Right: Edit + Stats ──── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Edit Profile */}
          <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6">
            <h2 className="text-base font-bold font-mono text-text-primary mb-4">Edit Profile</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-text-tertiary uppercase tracking-wider">Display Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-tertiary focus:outline-none transition-colors"
                  style={{ ['--tw-ring-color' as any]: accent }}
                  placeholder="Your display name"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-text-tertiary uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2.5 text-sm font-mono text-text-primary placeholder:text-text-tertiary focus:outline-none transition-colors"
                  placeholder="you@example.com"
                />
                <p className="text-xs font-mono text-text-tertiary">Used for notifications only. Never shared.</p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2.5 text-white rounded text-sm font-mono font-semibold transition-colors disabled:opacity-50"
                  style={{ backgroundColor: accent }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                {saved && <span className="text-xs font-mono text-[#22c55e]">✓ Profile updated</span>}
              </div>
            </div>
          </div>

          {/* Account Stats */}
          <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6">
            <h2 className="text-base font-bold font-mono text-text-primary mb-4">Account Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Collateral', value: stats ? `$${stats.totalDeposited.toLocaleString()}` : '—', color: '#22c55e' },
                { label: 'Debt', value: stats ? `$${stats.totalBorrowed.toLocaleString()}` : '—', color: '#f0a500' },
                { label: 'Transactions', value: stats ? stats.txCount.toString() : '—', color: '#00d4ff' },
                {
                  label: 'Health Factor',
                  value: stats ? (stats.healthFactor >= 100 ? '∞' : stats.healthFactor.toFixed(2)) : '—',
                  color: stats ? (stats.healthFactor >= 1.5 ? '#22c55e' : stats.healthFactor >= 1.2 ? '#f0a500' : '#ff3860') : '#22c55e',
                },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded p-4">
                  <div className="text-xs font-mono text-text-tertiary mb-1">{kpi.label}</div>
                  <div className="text-xl font-bold font-mono" style={{ color: kpi.color }}>{kpi.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity */}
          <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6">
            <h2 className="text-base font-bold font-mono text-text-primary mb-4">Recent Activity</h2>
            <div className="space-y-3">
              {[
                { action: 'Authenticated via wallet signature', time: 'Just now', icon: '🔐', color: accent },
                { action: 'Connected to Sepolia testnet', time: 'Session start', icon: '⛓', color: '#00d4ff' },
                { action: 'Account created', time: stats?.firstSeen || '—', icon: '✦', color: '#22c55e' },
              ].map((evt, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-[color:var(--color-border)] last:border-0">
                  <div className="w-8 h-8 rounded flex items-center justify-center text-sm shrink-0" style={{ background: `${evt.color}15`, color: evt.color }}>
                    {evt.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono text-text-primary">{evt.action}</div>
                    <div className="text-xs font-mono text-text-tertiary">{evt.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-[rgba(255,56,96,0.05)] border border-[rgba(255,56,96,0.3)] rounded-lg p-6">
            <h2 className="text-base font-bold font-mono text-[#ff3860] mb-2">Danger Zone</h2>
            <p className="text-xs font-mono text-text-secondary mb-4">
              Disconnecting your wallet will sign you out. You can reconnect at any time.
            </p>
            <button
              onClick={() => {
                useAuthStore.getState().logout();
                window.location.href = '/';
              }}
              className="px-4 py-2 border border-[#ff3860] text-[#ff3860] rounded text-sm font-mono hover:bg-[rgba(255,56,96,0.1)] transition-colors"
            >
              Disconnect &amp; Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
