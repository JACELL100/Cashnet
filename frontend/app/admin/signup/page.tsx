'use client';

import React from 'react';
import Link from 'next/link';

export default function AdminSignupPage() {
  return (
    <div className="min-h-screen bg-[color:var(--color-bg-primary)] flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="w-16 h-16 bg-[#ff3860] rounded-xl flex items-center justify-center text-2xl font-bold text-white mx-auto">CN</div>
        <div className="space-y-3">
          <h1 className="text-2xl font-bold font-mono text-text-primary">Admin Account Request</h1>
          <p className="text-sm text-text-secondary font-mono leading-relaxed">
            Admin accounts are not self-registered. They are provisioned directly by the system operator and linked to a Google account.
          </p>
        </div>
        <div className="p-6 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded space-y-4 text-left">
          <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider">How to get Admin access</div>
          {[
            '1. Contact your system operator with your Google account email',
            '2. Operator provisions your account and assigns the ADMIN role on-chain',
            '3. You receive a confirmation email',
            '4. Sign in using your Google account on the Admin login page',
          ].map((s) => (
            <div key={s} className="text-sm font-mono text-text-secondary flex items-start gap-2">
              <span className="text-[#ff3860] mt-0.5 shrink-0">→</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
        <Link
          href="/admin/login"
          className="block w-full py-3 bg-[#ff3860] hover:bg-[#e02b52] text-white rounded font-mono text-sm font-semibold transition-colors"
        >
          Go to Admin Login →
        </Link>
        <div className="text-xs font-mono text-text-tertiary">
          <Link href="/login" className="text-accent hover:underline">Borrower login</Link>
          {' · '}
          <Link href="/lender/login" className="text-[#b367ff] hover:underline">Lender login</Link>
          {' · '}
          <Link href="/auditor/login" className="text-[#f0a500] hover:underline">Auditor login</Link>
        </div>
      </div>
    </div>
  );
}
