'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

const ACCENT = '#ff3860';

export default function AdminLoginPage() {
  const loginWithGoogleCredential = useAuthStore((s) => s.loginWithGoogleCredential);
  const addToast = useUIStore((s) => s.addToast);
  const [loading, setLoading] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setAccessDenied(false);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      const { role } = await loginWithGoogleCredential(idToken);
      addToast({ message: `Welcome, ${role}`, severity: 'success' });
      window.location.href = '/admin';
    } catch (err: any) {
      setLoading(false);
      if (err?.code === 'access_denied') {
        setAccessDenied(true);
      } else if (err?.code !== 'auth/popup-closed-by-user') {
        addToast({ message: err?.message ?? 'Authentication failed', severity: 'error' });
      }
    }
  };

  return (
    <div className="min-h-screen flex bg-[#060a18]">
      {/* ── Branding Panel ──────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between p-10 relative overflow-hidden bg-[#0a0f1f]">
        {/* Accent stripe */}
        <div className="absolute top-0 left-0 w-[3px] h-full" style={{ background: `linear-gradient(180deg, ${ACCENT}, transparent 70%)` }} />

        {/* Faint hex grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hexA" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(1.2)">
              <path d="M28 2L54 18V50L28 66L2 50V18Z" fill="none" stroke="white" strokeWidth="0.5"/>
              <path d="M28 68L54 84V116L28 132L2 116V84Z" fill="none" stroke="white" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hexA)" />
        </svg>

        {/* Top logo */}
        <Link href="/" className="relative z-10 flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center border border-[#1e2540]" style={{ background: `${ACCENT}12` }}>
            <span className="text-xs font-bold" style={{ color: ACCENT }}>CN</span>
          </div>
          <div>
            <span className="text-sm font-semibold text-white tracking-tight">CashNet</span>
            <span className="text-[10px] uppercase tracking-[0.15em] block" style={{ color: ACCENT }}>Admin</span>
          </div>
        </Link>

        {/* Center content */}
        <div className="relative z-10 space-y-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: `${ACCENT}99` }}>System Administration</p>
            <h1 className="text-[28px] font-semibold text-white leading-[1.2] tracking-tight">
              Protocol<br />Control Center
            </h1>
            <p className="text-sm text-[#5a6478] leading-relaxed mt-3 max-w-[320px]">
              Full administrative access to manage participants, assign roles, deploy contracts, and monitor all protocol activity.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon: '⬡', label: 'Manage all registered participants' },
              { icon: '⬡', label: 'Assign and revoke on-chain roles' },
              { icon: '⬡', label: 'Pause & resume smart contracts' },
              { icon: '⬡', label: 'Monitor system-wide analytics' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-[10px]" style={{ color: ACCENT }}>{item.icon}</span>
                <span className="text-[13px] text-[#8b95a5]">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#ff386018] bg-[#ff38600a]">
            <svg className="w-4 h-4 shrink-0" style={{ color: ACCENT }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <span className="text-xs text-[#8b95a5]">Access restricted to provisioned Google accounts. Unauthorized attempts are logged.</span>
          </div>
        </div>

        {/* Bottom badges */}
        <div className="relative z-10 flex items-center gap-2">
          <span className="px-2.5 py-1 rounded text-[10px] font-medium tracking-wider border" style={{ color: ACCENT, borderColor: `${ACCENT}30`, background: `${ACCENT}0a` }}>ADMIN</span>
          <span className="px-2.5 py-1 rounded text-[10px] font-medium tracking-wider border border-[#00d46330] text-[#00d463] bg-[#00d4630a]">SEPOLIA</span>
        </div>
      </div>

      {/* ── Login Form ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px] space-y-8">
          {/* Mobile logo */}
          <Link href="/" className="lg:hidden flex items-center gap-2.5 justify-center">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#1e2540]" style={{ background: `${ACCENT}12` }}>
              <span className="text-[10px] font-bold" style={{ color: ACCENT }}>CN</span>
            </div>
            <span className="text-sm font-semibold text-white">CashNet <span style={{ color: ACCENT }}>Admin</span></span>
          </Link>

          {/* Header */}
          <div className="text-center">
            <h2 className="text-xl font-semibold text-white tracking-tight">Admin Sign In</h2>
            <p className="text-sm text-[#5a6478] mt-1">Authenticate with your Google account</p>
          </div>

          {/* Access denied alert */}
          {accessDenied && (
            <div className="p-4 rounded-xl border border-[#ff386030] bg-[#ff38600a]">
              <p className="text-sm font-medium" style={{ color: ACCENT }}>Access Denied</p>
              <p className="text-xs text-[#5a6478] mt-1 leading-relaxed">
                Your Google account is not provisioned for admin access. Contact the system operator.
              </p>
              <Link href="/login?role=BORROWER" className="text-xs mt-2 inline-block hover:underline" style={{ color: '#00d4ff' }}>
                Go to Borrower login &rarr;
              </Link>
            </div>
          )}

          {/* Card */}
          <div className="rounded-xl border border-[#1e2540] bg-[#0c1224] p-6 space-y-5">
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-4">
                <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: `${ACCENT}30`, borderTopColor: ACCENT }} />
                <span className="text-sm text-[#5a6478]">Authenticating&hellip;</span>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 h-11 bg-white hover:bg-gray-50 text-[#1a1a2e] rounded-lg text-sm font-medium transition-all hover:shadow-[0_2px_12px_rgba(255,255,255,0.08)] active:scale-[0.98]"
              >
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
            )}

            <div className="relative flex items-center">
              <div className="flex-1 border-t border-[#1e2540]" />
              <span className="px-3 text-[10px] uppercase tracking-[0.15em] text-[#3a4358]">Google SSO only</span>
              <div className="flex-1 border-t border-[#1e2540]" />
            </div>

            <p className="text-center text-xs text-[#5a6478]">
              Need access?{' '}
              <Link href="/admin/signup" className="font-medium hover:underline" style={{ color: ACCENT }}>Request access &rarr;</Link>
            </p>
          </div>

          {/* Cross-portal links */}
          <div className="flex items-center justify-center gap-4 text-xs text-[#3a4358]">
            <Link href="/auditor/login" className="hover:text-[#f0a500] transition-colors">Auditor</Link>
            <span>·</span>
            <Link href="/lender/login" className="hover:text-[#b367ff] transition-colors">Lender</Link>
            <span>·</span>
            <Link href="/credit/login" className="hover:text-[#00d4ff] transition-colors">Borrower</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
