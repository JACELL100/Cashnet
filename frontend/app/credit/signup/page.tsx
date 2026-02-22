'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import type { UserRole } from '@/store/authStore';

const ACCENT = '#00d4ff';

export default function CreditSignupPage() {
  const addToast = useUIStore((s) => s.addToast);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!name.trim()) { setErrorMsg('Full name is required'); return; }
    if (!email.trim()) { setErrorMsg('Email is required'); return; }
    if (password.length < 6) { setErrorMsg('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setErrorMsg('Passwords do not match'); return; }

    setLoading(true);
    const res = await authApi.emailSignup(name.trim(), email.trim(), password, 'BORROWER');
    if (!res.success || !res.data) {
      setLoading(false);
      setErrorMsg(res.error?.includes('409') ? 'Email already registered' : (res.error ?? 'Signup failed'));
      return;
    }
    const data = res.data;

    useAuthStore.setState({
      user: { id: data.uid, email: data.email, name: data.name, role: data.role as UserRole, plan: 'starter', createdAt: Date.now(), avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.email}`, token: data.token },
      token: data.token, isAuthenticated: true, loading: false,
    });
    addToast({ message: `Welcome to CashNet Credit, ${data.name}!`, severity: 'success' });
    window.location.href = '/dashboard/credit';
  };

  const inputCls = 'w-full h-11 px-3 text-sm bg-[#080c1a] border border-[#1e2540] rounded-lg outline-none text-white placeholder:text-[#3a4358] transition-all focus:border-[#00d4ff] focus:shadow-[0_0_0_3px_rgba(0,212,255,0.1)]';

  return (
    <div className="min-h-screen flex bg-[#060a18]">
      {/* ── Branding Panel ─────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between p-10 relative overflow-hidden bg-[#0a0f1f]">
        <div className="absolute top-0 left-0 w-[3px] h-full" style={{ background: `linear-gradient(180deg, ${ACCENT}, transparent 70%)` }} />

        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hexCS" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(1.2)">
              <path d="M28 2L54 18V50L28 66L2 50V18Z" fill="none" stroke="white" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hexCS)" />
        </svg>

        <Link href="/" className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center border border-[#1e2540]" style={{ background: `${ACCENT}12` }}>
            <span className="text-xs font-bold" style={{ color: ACCENT }}>CN</span>
          </div>
          <div>
            <span className="text-sm font-semibold text-white tracking-tight">CashNet</span>
            <span className="text-[10px] uppercase tracking-[0.15em] block" style={{ color: ACCENT }}>Credit</span>
          </div>
        </Link>

        <div className="relative z-10 space-y-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: `${ACCENT}99` }}>Join as Borrower</p>
            <h1 className="text-[28px] font-semibold text-white leading-[1.2] tracking-tight">
              Build Credit.<br />Unlock Capital.
            </h1>
            <p className="text-sm text-[#5a6478] leading-relaxed mt-3 max-w-[320px]">
              Access decentralized lending, build your on-chain credit history, and unlock better rates over time.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: '300-850', label: 'Credit Range' },
              { value: '4.5%', label: 'Min. Interest Rate' },
              { value: '150%', label: 'Min. Collateral' },
              { value: '24', label: 'Active Borrowers' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-[#1e2540] bg-[#0c1224] p-3">
                <div className="text-lg font-semibold font-mono" style={{ color: ACCENT }}>{s.value}</div>
                <div className="text-[10px] text-[#3a4358] mt-0.5 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {['Build on-chain credit score', 'Competitive borrowing rates', 'Multi-asset collateral support'].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <span className="text-[10px]" style={{ color: ACCENT }}>⬡</span>
                <span className="text-[13px] text-[#8b95a5]">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <span className="px-2.5 py-1 rounded text-[10px] font-medium tracking-wider border" style={{ color: ACCENT, borderColor: `${ACCENT}30`, background: `${ACCENT}0a` }}>BORROWER</span>
          <span className="px-2.5 py-1 rounded text-[10px] font-medium tracking-wider border border-[#00d46330] text-[#00d463] bg-[#00d4630a]">SEPOLIA</span>
        </div>
      </div>

      {/* ── Signup Form ──────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px] space-y-8">
          <Link href="/" className="lg:hidden flex items-center gap-2.5 justify-center">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#1e2540]" style={{ background: `${ACCENT}12` }}>
              <span className="text-[10px] font-bold" style={{ color: ACCENT }}>CN</span>
            </div>
            <span className="text-sm font-semibold text-white">CashNet <span style={{ color: ACCENT }}>Credit</span></span>
          </Link>

          <div className="text-center">
            <h2 className="text-xl font-semibold text-white tracking-tight">Create Borrower Account</h2>
            <p className="text-sm text-[#5a6478] mt-1">Start building on-chain credit</p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg border border-[#ff386030] bg-[#ff38600a] text-xs text-[#ff6b6b]">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.1em] text-[#5a6478]">Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jordan Chen" autoFocus className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.1em] text-[#5a6478]">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.1em] text-[#5a6478]">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" className={`${inputCls} pr-10`} />
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
                <input type={showCf ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password"
                  className={`${inputCls} pr-10 ${confirm && confirm !== password ? '!border-[#ff3860]' : ''}`} />
                <button type="button" onClick={() => setShowCf(!showCf)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3a4358] hover:text-[#5a6478] transition-colors">
                  {showCf ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full h-11 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: ACCENT }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account&hellip;
                </span>
              ) : 'Create Account'}
            </button>
          </form>

          <div className="text-center text-xs text-[#5a6478] pt-4 border-t border-[#1e2540]">
            Already have an account?{' '}
            <Link href="/credit/login" className="font-medium hover:underline" style={{ color: ACCENT }}>Sign in &rarr;</Link>
          </div>

          <div className="flex items-center justify-center gap-4 text-xs text-[#3a4358]">
            <Link href="/lender/signup" className="hover:text-[#b367ff] transition-colors">Lender</Link>
            <span>·</span>
            <Link href="/auditor/signup" className="hover:text-[#f0a500] transition-colors">Auditor</Link>
            <span>·</span>
            <Link href="/admin/login" className="hover:text-[#ff3860] transition-colors">Admin</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
