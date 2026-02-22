'use client';

import React from 'react';
import Link from 'next/link';

const ACCENT = '#ff3860';

export default function AdminSignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060a18] p-6 sm:p-10">
      {/* Faint hex grid */}
      <svg className="fixed inset-0 w-full h-full opacity-[0.02] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="hexAS" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(1.5)">
            <path d="M28 2L54 18V50L28 66L2 50V18Z" fill="none" stroke="white" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hexAS)" />
      </svg>

      <div className="w-full max-w-[440px] relative z-10">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 justify-center mb-10">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center border border-[#1e2540]" style={{ background: `${ACCENT}12` }}>
            <span className="text-xs font-bold" style={{ color: ACCENT }}>CN</span>
          </div>
          <div>
            <span className="text-sm font-semibold text-white tracking-tight">CashNet</span>
            <span className="text-[10px] uppercase tracking-[0.15em] block" style={{ color: ACCENT }}>Admin</span>
          </div>
        </Link>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-white tracking-tight">Admin Account Request</h1>
          <p className="text-sm text-[#5a6478] mt-1.5 max-w-[340px] mx-auto leading-relaxed">
            Admin accounts are provisioned directly by the system operator and linked to a Google account.
          </p>
        </div>

        {/* Steps card */}
        <div className="rounded-xl border border-[#1e2540] bg-[#0c1224] p-6 space-y-5 mb-6">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#3a4358]">How to get Admin access</p>

          <div className="space-y-4">
            {[
              'Contact your system operator with your Google account email',
              'Operator provisions your account and assigns the ADMIN role on-chain',
              'You receive a confirmation email',
              'Sign in using your Google account on the Admin login page',
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-[11px] font-semibold border"
                  style={{ color: ACCENT, borderColor: `${ACCENT}25`, background: `${ACCENT}08` }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[13px] text-[#8b95a5] leading-relaxed pt-0.5">{step}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/admin/login"
          className="flex items-center justify-center w-full h-11 rounded-lg text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
          style={{ background: ACCENT }}
        >
          Go to Admin Login &rarr;
        </Link>

        {/* Cross-portal links */}
        <div className="flex items-center justify-center gap-4 text-xs text-[#3a4358] mt-8">
          <Link href="/credit/login" className="hover:text-[#00d4ff] transition-colors">Borrower</Link>
          <span>·</span>
          <Link href="/lender/login" className="hover:text-[#b367ff] transition-colors">Lender</Link>
          <span>·</span>
          <Link href="/auditor/login" className="hover:text-[#f0a500] transition-colors">Auditor</Link>
        </div>
      </div>
    </div>
  );
}
