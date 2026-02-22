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
  collateralETH: number;
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
  const [lastUpdated, setLastUpdated] = useState<string>('');

  /* ── fetch account stats ── */
  const fetchStats = useCallback(async () => {
    const wallet = address || user?.walletAddress;
    if (!wallet) return;

    try {
      const [borrowerRes, txRes, scoreRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/lending/borrower/${wallet}`),
        fetch(`${API_URL}/pool/transactions?limit=100`),
        fetch(`${API_URL}/api/credit/score?wallet=${wallet}`),
      ]);

      const s: WalletStats = {
        collateralETH: 0,
        totalDeposited: 0,
        totalBorrowed: 0,
        txCount: 0,
        firstSeen: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—',
        healthFactor: 999,
        creditScore: 0,
      };

      // Fetch live collateral from blockchain (CollateralVault contract)
      if (borrowerRes.status === 'fulfilled' && borrowerRes.value.ok) {
        const data = await borrowerRes.value.json();
        const position = data.data ?? data;
        s.collateralETH = position.collateral_eth ?? 0;
        s.totalDeposited = position.collateral_value ?? 0;
        s.totalBorrowed = position.debt_value ?? 0;
        s.healthFactor = position.health_factor ?? 999;
        console.log('📊 Live collateral from blockchain:', position);
      }

      if (txRes.status === 'fulfilled' && txRes.value.ok) {
        const txs = (await txRes.value.json()).data ?? [];
        s.txCount = txs.length;
      }

      // Credit score from blockchain
      if (scoreRes.status === 'fulfilled' && scoreRes.value.ok) {
        const cr = await scoreRes.value.json();
        s.creditScore = cr.score ?? cr.data?.score ?? 0;
      }

      setStats(s);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Error fetching profile stats:', err);
    }
  }, [address, user?.walletAddress, user?.createdAt]);

  useEffect(() => {
    fetchStats();
    // Auto-refresh collateral data every 10 seconds
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [fetchStats]);

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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold font-mono text-text-primary">Account Summary</h2>
              {lastUpdated && (
                <span className="text-xs font-mono text-text-tertiary">Updated: {lastUpdated}</span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Collateral (ETH) */}
              <div className="bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-mono text-text-tertiary">Collateral</div>
                  {stats && stats.collateralETH > 0 && (
                    <div className="text-[9px] text-[#00d4ff]">⛓ Live</div>
                  )}
                </div>
                <div className="text-xl font-bold font-mono" style={{ color: '#22c55e' }}>
                  {stats ? `${stats.collateralETH.toFixed(4)} ETH` : '—'}
                </div>
                {stats && stats.collateralETH > 0 && (
                  <div className="text-[10px] text-text-tertiary mt-0.5">
                    ≈ ${stats.totalDeposited.toLocaleString()}
                  </div>
                )}
              </div>

              {/* Debt */}
              <div className="bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-mono text-text-tertiary">Debt</div>
                  {stats && stats.totalBorrowed > 0 && (
                    <div className="text-[9px] text-[#00d4ff]">⛓ Live</div>
                  )}
                </div>
                <div className="text-xl font-bold font-mono" style={{ color: '#f0a500' }}>
                  {stats ? `${stats.totalBorrowed.toFixed(2)} BADM` : '—'}
                </div>
              </div>

              {/* Transactions */}
              <div className="bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded p-4">
                <div className="text-xs font-mono text-text-tertiary mb-1">Transactions</div>
                <div className="text-xl font-bold font-mono" style={{ color: '#00d4ff' }}>
                  {stats ? stats.txCount.toString() : '—'}
                </div>
              </div>

              {/* Health Factor */}
              <div className="bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-mono text-text-tertiary">Health Factor</div>
                  {stats && stats.healthFactor < 100 && (
                    <div className="text-[9px] text-[#00d4ff]">⛓ Live</div>
                  )}
                </div>
                <div
                  className="text-xl font-bold font-mono"
                  style={{
                    color: stats
                      ? stats.healthFactor >= 1.5
                        ? '#22c55e'
                        : stats.healthFactor >= 1.2
                        ? '#f0a500'
                        : '#ff3860'
                      : '#22c55e',
                  }}
                >
                  {stats ? (stats.healthFactor >= 100 ? '∞' : stats.healthFactor.toFixed(2)) : '—'}
                </div>
              </div>
            </div>

            {/* Second row - Credit Score */}
            {stats && stats.creditScore > 0 && (
              <div className="mt-4">
                <div className="bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-mono text-text-tertiary">Credit Score</div>
                    <div className="text-[9px] text-[#00d4ff]">⛓ Live</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div
                      className="text-2xl font-bold font-mono"
                      style={{
                        color: stats.creditScore >= 750
                          ? '#22c55e'
                          : stats.creditScore >= 700
                          ? '#00d4ff'
                          : stats.creditScore >= 650
                          ? '#f0a500'
                          : '#ff3860',
                      }}
                    >
                      {stats.creditScore}
                    </div>
                    <div className="flex-1">
                      <div
                        className="text-xs font-mono mb-1"
                        style={{
                          color: stats.creditScore >= 750
                            ? '#22c55e'
                            : stats.creditScore >= 700
                            ? '#00d4ff'
                            : stats.creditScore >= 650
                            ? '#f0a500'
                            : '#ff3860',
                        }}
                      >
                        {stats.creditScore >= 750
                          ? 'Excellent'
                          : stats.creditScore >= 700
                          ? 'Good'
                          : stats.creditScore >= 650
                          ? 'Fair'
                          : stats.creditScore >= 600
                          ? 'Poor'
                          : 'Very Poor'}
                      </div>
                      <div className="h-2 bg-[color:var(--color-bg-accent)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(0, Math.min(100, ((stats.creditScore - 300) / 550) * 100))}%`,
                            background: stats.creditScore >= 750
                              ? '#22c55e'
                              : stats.creditScore >= 700
                              ? '#00d4ff'
                              : stats.creditScore >= 650
                              ? '#f0a500'
                              : '#ff3860',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
