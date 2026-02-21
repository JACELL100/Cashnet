'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import type { UserRole } from '@/store/authStore';

export default function LenderSignupPage() {
  const addToast = useUIStore((s) => s.addToast);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) { setErrorMsg('Name is required'); return; }
    if (!email.trim()) { setErrorMsg('Email is required'); return; }
    if (password.length < 8) { setErrorMsg('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setErrorMsg('Passwords do not match'); return; }

    setLoading(true);
    const res = await authApi.emailSignup(name.trim(), email.trim(), password, 'LENDER');
    if (!res.success || !res.data) {
      setLoading(false);
      setErrorMsg(
        res.error?.includes('409') ? 'An account with this email already exists' :
        (res.error ?? 'Signup failed. Is the backend running?')
      );
      return;
    }

    const data = res.data;
    useAuthStore.setState({
      user: {
        id: data.uid,
        email: data.email,
        name: data.name,
        role: data.role as UserRole,
        plan: 'starter',
        createdAt: Date.now(),
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.email}`,
        token: data.token,
      },
      token: data.token,
      isAuthenticated: true,
      loading: false,
    });
    addToast({ message: `Account created. Welcome, ${data.name}!`, severity: 'success' });
    window.location.href = '/lender';
  };

  return (
    <div className="min-h-screen bg-[color:var(--color-bg-primary)] grid grid-cols-1 md:grid-cols-2">
      {/* Left panel */}
      <div className="hidden md:flex flex-col justify-start gap-10 p-8 bg-[color:var(--color-bg-secondary)] border-r border-[color:var(--color-border)]">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#b367ff] rounded flex items-center justify-center text-sm font-bold text-white">CN</div>
          <span className="font-mono text-lg font-bold text-text-primary">cashnet <span className="text-[#b367ff]">lending</span></span>
        </Link>
        <div className="space-y-6">
          <div>
            <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-2">Create Account</div>
            <h2 className="text-2xl font-bold font-mono text-text-primary">Lender Registration</h2>
            <p className="text-sm text-text-secondary font-mono mt-2">
              Sign up to provide liquidity, manage your loan portfolio, and earn yield on the protocol.
            </p>
          </div>
          <div className="space-y-3 text-sm font-mono text-text-secondary">
            <div className="flex items-start gap-3 p-3 bg-[rgba(179,103,255,0.05)] border border-[rgba(179,103,255,0.2)] rounded">
              <span className="text-[#b367ff] text-base">◆</span>
              <div>
                <div className="text-text-primary font-bold text-xs">LENDER</div>
                <div className="text-xs text-text-tertiary mt-0.5">Full access — deposit liquidity, issue loans, monitor borrower health, trigger liquidations</div>
              </div>
            </div>
          </div>
          <div className="space-y-2 text-xs font-mono text-text-secondary">
            {['Deposit & withdraw liquidity', 'Monitor loan portfolio health', 'Track interest earned & APY', 'Trigger liquidations on defaulting loans', 'View borrower credit scores'].map((f) => (
              <div key={f} className="flex items-center gap-2">
                <span className="text-[#b367ff]">→</span> {f}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[{ v: '$2.4B', l: 'Total TVL' }, { v: '8.2%', l: 'Avg APY' }, { v: '12', l: 'Active Lenders' }, { v: '97.8%', l: 'Repayment Rate' }].map((s) => (
              <div key={s.l} className="p-3 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded">
                <div className="text-lg font-bold font-mono text-[#b367ff]">{s.v}</div>
                <div className="text-xs text-text-tertiary font-mono">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-[rgba(179,103,255,0.1)] border border-[#b367ff] text-[#b367ff] rounded text-xs font-mono">LENDER</span>
          <span className="px-3 py-1 bg-[rgba(0,212,99,0.1)] border border-[#00d463] text-[#00d463] rounded text-xs font-mono">sepolia</span>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-col justify-center items-center p-8 md:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-[#b367ff] rounded-lg flex items-center justify-center text-lg font-bold text-white mx-auto">CN</div>
            <h1 className="text-2xl font-bold font-mono text-text-primary">Create Lender Account</h1>
            <p className="text-sm text-text-secondary font-mono">Provide liquidity · Earn yield</p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-[rgba(179,103,255,0.1)] border border-[rgba(179,103,255,0.3)] rounded text-xs font-mono text-[#b367ff]">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-mono text-text-tertiary">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ashley Almeida"
                className="w-full px-3 py-2.5 text-sm font-mono bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded outline-none focus:border-[#b367ff] text-text-primary placeholder:text-text-tertiary"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-text-tertiary">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 text-sm font-mono bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded outline-none focus:border-[#b367ff] text-text-primary placeholder:text-text-tertiary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-text-tertiary">Password <span className="text-text-tertiary">(min 8 chars)</span></label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 text-sm font-mono bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded outline-none focus:border-[#b367ff] text-text-primary placeholder:text-text-tertiary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-text-tertiary">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                className={`w-full px-3 py-2.5 text-sm font-mono bg-[color:var(--color-bg-accent)] border rounded outline-none text-text-primary placeholder:text-text-tertiary transition-colors ${confirm && confirm !== password ? 'border-[#b367ff]' : 'border-[color:var(--color-border)] focus:border-[#b367ff]'}`}
              />
              {confirm && confirm !== password && (
                <p className="text-xs font-mono text-[#b367ff]">Passwords don&apos;t match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#b367ff] text-white rounded font-mono text-sm font-medium hover:bg-[#9f4ef0] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating account…' : 'Create Lender Account'}
            </button>
          </form>

          <div className="text-center text-xs font-mono text-text-tertiary pt-2 border-t border-[color:var(--color-border)]">
            Already have an account?{' '}
            <Link href="/lender/login" className="text-[#b367ff] hover:underline">Sign in →</Link>
          </div>
          <div className="text-center text-xs font-mono text-text-tertiary">
            Borrower?{' '}
            <Link href="/credit/signup" className="text-[#00d4ff] hover:underline">Create Credit account →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
