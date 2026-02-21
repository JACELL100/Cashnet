'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import type { UserRole } from '@/store/authStore';

export default function AuditorSignupPage() {
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
    const res = await authApi.emailSignup(name.trim(), email.trim(), password, 'AUDITOR');
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
    window.location.href = '/auditor';
  };

  return (
    <div className="min-h-screen bg-[color:var(--color-bg-primary)] grid grid-cols-1 md:grid-cols-2">
      {/* Left panel */}
      <div className="hidden md:flex flex-col justify-between p-8 bg-[color:var(--color-bg-secondary)] border-r border-[color:var(--color-border)]">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#f0a500] rounded flex items-center justify-center text-sm font-bold text-white">CN</div>
          <span className="font-mono text-lg font-bold text-text-primary">cashnet <span className="text-[#f0a500]">auditor</span></span>
        </Link>
        <div className="space-y-6">
          <div>
            <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-2">Create Account</div>
            <h2 className="text-2xl font-bold font-mono text-text-primary">Auditor Access</h2>
            <p className="text-sm text-text-secondary font-mono mt-2">
              Create an Auditor account with email and password to review and monitor the protocol.
            </p>
          </div>
          <div className="space-y-3 text-sm font-mono text-text-secondary">
            <div className="flex items-start gap-3 p-3 bg-[rgba(240,165,0,0.05)] border border-[rgba(240,165,0,0.2)] rounded">
              <span className="text-[#f0a500] text-base">◆</span>
              <div>
                <div className="text-text-primary font-bold text-xs">AUDITOR</div>
                <div className="text-xs text-text-tertiary mt-0.5">Read-only access — view all participant data, credit scores, and pool activity</div>
              </div>
            </div>
          </div>
          <div className="space-y-2 text-xs font-mono text-text-secondary">
            {['View all participants & scores', 'Monitor lending pool activity', 'Review credit history', 'Generate compliance reports'].map((f) => (
              <div key={f} className="flex items-center gap-2">
                <span className="text-[#f0a500]">→</span> {f}
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-[rgba(240,165,0,0.1)] border border-[#f0a500] text-[#f0a500] rounded text-xs font-mono">AUDITOR</span>
          <span className="px-3 py-1 bg-[rgba(0,212,99,0.1)] border border-[#00d463] text-[#00d463] rounded text-xs font-mono">read-only</span>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-col justify-center items-center p-8 md:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-[#f0a500] rounded-lg flex items-center justify-center text-lg font-bold text-white mx-auto">CN</div>
            <h1 className="text-2xl font-bold font-mono text-text-primary">Create Auditor Account</h1>
            <p className="text-sm text-text-secondary font-mono">Read-only protocol access</p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-[rgba(240,165,0,0.1)] border border-[rgba(240,165,0,0.3)] rounded text-xs font-mono text-[#f0a500]">
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
                className="w-full px-3 py-2.5 text-sm font-mono bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded outline-none focus:border-[#f0a500] text-text-primary placeholder:text-text-tertiary"
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
                className="w-full px-3 py-2.5 text-sm font-mono bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded outline-none focus:border-[#f0a500] text-text-primary placeholder:text-text-tertiary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-text-tertiary">Password <span className="text-text-tertiary">(min 8 chars)</span></label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 text-sm font-mono bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded outline-none focus:border-[#f0a500] text-text-primary placeholder:text-text-tertiary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono text-text-tertiary">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                className={`w-full px-3 py-2.5 text-sm font-mono bg-[color:var(--color-bg-accent)] border rounded outline-none text-text-primary placeholder:text-text-tertiary transition-colors ${confirm && confirm !== password ? 'border-[#f0a500]' : 'border-[color:var(--color-border)] focus:border-[#f0a500]'}`}
              />
              {confirm && confirm !== password && (
                <p className="text-xs font-mono text-[#f0a500]">Passwords don&apos;t match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#f0a500] text-white rounded font-mono text-sm font-medium hover:bg-[#d4920a] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating account…' : 'Create Auditor Account'}
            </button>
          </form>

          <div className="text-center text-xs font-mono text-text-tertiary pt-2 border-t border-[color:var(--color-border)]">
            Already have an account?{' '}
            <Link href="/auditor/login" className="text-[#f0a500] hover:underline">Sign in →</Link>
          </div>
          <div className="text-center text-xs font-mono text-text-tertiary">
            Admin?{' '}
            <Link href="/admin/signup" className="text-[#ff3860] hover:underline">Create Admin account →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
