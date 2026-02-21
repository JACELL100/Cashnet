'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import type { UserRole } from '@/store/authStore';

export default function CreditLoginPage() {
  const addToast = useUIStore((s) => s.addToast);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim()) { setErrorMsg('Email is required'); return; }
    if (!password) { setErrorMsg('Password is required'); return; }

    setLoading(true);
    const res = await authApi.emailLogin(email.trim(), password);
    if (!res.success || !res.data) {
      setLoading(false);
      setErrorMsg(
        res.error?.includes('401') ? 'Invalid email or password' :
        res.error?.includes('404') ? 'No account found with this email' :
        (res.error ?? 'Login failed. Is the backend running?')
      );
      return;
    }

    const data = res.data;
    if (data.role !== 'BORROWER') {
      setLoading(false);
      setErrorMsg('This account is not a Borrower account. Please use the correct portal.');
      return;
    }

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
    addToast({ message: `Welcome back, ${data.name}!`, severity: 'success' });
    window.location.href = '/dashboard/credit';
  };

  return (
    <div className="min-h-screen bg-[color:var(--color-bg-primary)] grid grid-cols-1 md:grid-cols-2">
      {/* Left panel */}
      <div className="hidden md:flex flex-col justify-start gap-10 p-8 bg-[color:var(--color-bg-secondary)] border-r border-[color:var(--color-border)]">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#00d4ff] rounded flex items-center justify-center text-sm font-bold text-white">CN</div>
          <span className="font-mono text-lg font-bold text-text-primary">cashnet <span className="text-[#00d4ff]">credit</span></span>
        </Link>
        <div className="space-y-6">
          <div>
            <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-2">Borrower Portal</div>
            <h2 className="text-2xl font-bold font-mono text-text-primary">Credit & Loans</h2>
            <p className="text-sm text-text-secondary font-mono mt-2">
              Manage your loans, track your credit score, and monitor collateral health in real time.
            </p>
          </div>
          <div className="space-y-2">
            {['Request and manage loans', 'Track credit score (300–850)', 'Monitor collateral health factor', 'View dynamic interest rates', 'Repayment scheduling'].map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm font-mono text-text-secondary">
                <span className="text-[#00d4ff]">◆</span> {f}
              </div>
            ))}
          </div>
          <div className="p-4 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded text-xs font-mono space-y-1">
            <div className="text-[#00d4ff]">◆ 24 active borrowers</div>
            <div className="text-success">✓ avg credit score: 680</div>
            <div className="text-accent">→ min rate: 4.5% APR</div>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-[rgba(0,212,255,0.1)] border border-[#00d4ff] text-[#00d4ff] rounded text-xs font-mono">BORROWER</span>
          <span className="px-3 py-1 bg-[rgba(0,212,99,0.1)] border border-[#00d463] text-[#00d463] rounded text-xs font-mono">sepolia</span>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-col justify-center items-center p-8 md:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-[#00d4ff] rounded-lg flex items-center justify-center text-lg font-bold text-white mx-auto">CN</div>
            <h1 className="text-2xl font-bold font-mono text-text-primary">Borrower Sign In</h1>
            <p className="text-sm text-text-secondary font-mono">Access your credit dashboard</p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-[rgba(0,212,255,0.1)] border border-[rgba(0,212,255,0.3)] rounded text-xs font-mono text-[#00d4ff]">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-mono text-text-tertiary">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 text-sm font-mono bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded outline-none focus:border-[#00d4ff] text-text-primary placeholder:text-text-tertiary"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-text-tertiary">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 text-sm font-mono bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded outline-none focus:border-[#00d4ff] text-text-primary placeholder:text-text-tertiary"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#00d4ff] text-white rounded font-mono text-sm font-medium hover:bg-[#00b8db] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[color:var(--color-border)]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-[color:var(--color-bg-primary)] text-text-tertiary font-mono">borrower · email login</span>
            </div>
          </div>

          <div className="text-center text-xs font-mono text-text-tertiary space-y-2">
            <div>
              Don&apos;t have an account?{' '}
              <Link href="/credit/signup" className="text-[#00d4ff] hover:underline">Create Credit account →</Link>
            </div>
          </div>

          <div className="text-xs font-mono text-text-tertiary text-center space-x-3">
            <Link href="/lender/login" className="text-[#b367ff] hover:underline">Lender login</Link>
            <span>·</span>
            <Link href="/auditor/login" className="text-[#f0a500] hover:underline">Auditor login</Link>
            <span>·</span>
            <Link href="/admin/login" className="text-[#ff3860] hover:underline">Admin login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
