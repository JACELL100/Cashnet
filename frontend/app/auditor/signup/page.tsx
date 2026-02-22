'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import type { UserRole } from '@/store/authStore';

const ACCENT = '#f0a500';

export default function AuditorSignupPage() {
  const addToast = useUIStore((s) => s.addToast);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
      setErrorMsg(res.error?.includes('409') ? 'An account with this email already exists' : (res.error ?? 'Signup failed'));
      return;
    }
    const data = res.data;
    useAuthStore.setState({
      user: { id: data.uid, email: data.email, name: data.name, role: data.role as UserRole, plan: 'starter', createdAt: Date.now(), avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.email}`, token: data.token },
      token: data.token, isAuthenticated: true, loading: false,
    });
    addToast({ message: `Account created. Welcome, ${data.name}!`, severity: 'success' });
    window.location.href = '/auditor';
  };

  const inputCls = 'w-full h-11 px-3 text-sm bg-[#080c1a] border border-[#1e2540] rounded-lg outline-none text-white placeholder:text-[#3a4358] transition-all focus:border-[#f0a500] focus:shadow-[0_0_0_3px_rgba(240,165,0,0.1)]';

  return (
    <div className="min-h-screen flex bg-[#060a18]">
      {/* ── Branding Panel ─────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between p-10 relative overflow-hidden bg-[#0a0f1f]">
        <div className="absolute top-0 left-0 w-[3px] h-full" style={{ background: `linear-gradient(180deg, ${ACCENT}, transparent 70%)` }} />

        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hexAuS" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(1.2)">
              <path d="M28 2L54 18V50L28 66L2 50V18Z" fill="none" stroke="white" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hexAuS)" />
        </svg>

        <Link href="/" className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center border border-[#1e2540]" style={{ background: `${ACCENT}12` }}>
            <span className="text-xs font-bold" style={{ color: ACCENT }}>CN</span>
          </div>
          <div>
            <span className="text-sm font-semibold text-white tracking-tight">CashNet</span>
            <span className="text-[10px] uppercase tracking-[0.15em] block" style={{ color: ACCENT }}>Auditor</span>
          </div>
        </Link>

        <div className="relative z-10 space-y-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: `${ACCENT}99` }}>Create Account</p>
            <h1 className="text-[28px] font-semibold text-white leading-[1.2] tracking-tight">
              Auditor<br />Registration
            </h1>
            <p className="text-sm text-[#5a6478] leading-relaxed mt-3 max-w-[320px]">
              Create an account to review and monitor the protocol with read-only access.
            </p>
          </div>

          <div className="rounded-lg border border-[#1e2540] bg-[#0c1224] p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ background: `${ACCENT}12` }}>
                <svg className="w-4 h-4" style={{ color: ACCENT }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-medium text-white">Auditor Role</p>
                <p className="text-[11px] text-[#5a6478] mt-0.5">Read-only access — view all participant data, credit scores, and pool activity</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {['View all participants & scores', 'Monitor lending pool activity', 'Review credit history', 'Generate compliance reports'].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <span className="text-[10px]" style={{ color: ACCENT }}>⬡</span>
                <span className="text-[13px] text-[#8b95a5]">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <span className="px-2.5 py-1 rounded text-[10px] font-medium tracking-wider border" style={{ color: ACCENT, borderColor: `${ACCENT}30`, background: `${ACCENT}0a` }}>AUDITOR</span>
          <span className="px-2.5 py-1 rounded text-[10px] font-medium tracking-wider border border-[#00d46330] text-[#00d463] bg-[#00d4630a]">READ-ONLY</span>
        </div>
      </div>

      {/* ── Signup Form ──────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px] space-y-8">
          <Link href="/" className="lg:hidden flex items-center gap-2.5 justify-center">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#1e2540]" style={{ background: `${ACCENT}12` }}>
              <span className="text-[10px] font-bold" style={{ color: ACCENT }}>CN</span>
            </div>
            <span className="text-sm font-semibold text-white">CashNet <span style={{ color: ACCENT }}>Auditor</span></span>
          </Link>

          <div className="text-center">
            <h2 className="text-xl font-semibold text-white tracking-tight">Create Auditor Account</h2>
            <p className="text-sm text-[#5a6478] mt-1">Read-only protocol access</p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg border border-[#ff386030] bg-[#ff38600a] text-xs text-[#ff6b6b]">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.1em] text-[#5a6478]">Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ashley Almeida" autoFocus className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.1em] text-[#5a6478]">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.1em] text-[#5a6478]">Password <span className="normal-case text-[#3a4358]">(min 8)</span></label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={`${inputCls} pr-10`} />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a4358] hover:text-[#5a6478] transition-colors">
                  {showPw ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.1em] text-[#5a6478]">Confirm Password</label>
              <div className="relative">
                <input type={showConfirm ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••"
                  className={`${inputCls} pr-10 ${confirm && confirm !== password ? '!border-[#ff3860]' : ''}`} />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a4358] hover:text-[#5a6478] transition-colors">
                  {showConfirm ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
              {confirm && confirm !== password && <p className="text-[11px] text-[#ff3860]">Passwords don&apos;t match</p>}
            </div>

            <button type="submit" disabled={loading}
              className="w-full h-11 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: ACCENT }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account&hellip;
                </span>
              ) : 'Create Auditor Account'}
            </button>
          </form>

          <div className="text-center text-xs text-[#5a6478] pt-4 border-t border-[#1e2540]">
            Already have an account?{' '}
            <Link href="/auditor/login" className="font-medium hover:underline" style={{ color: ACCENT }}>Sign in &rarr;</Link>
          </div>

          <div className="flex items-center justify-center gap-4 text-xs text-[#3a4358]">
            <Link href="/admin/signup" className="hover:text-[#ff3860] transition-colors">Admin</Link>
            <span>·</span>
            <Link href="/lender/signup" className="hover:text-[#b367ff] transition-colors">Lender</Link>
            <span>·</span>
            <Link href="/credit/signup" className="hover:text-[#00d4ff] transition-colors">Borrower</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
