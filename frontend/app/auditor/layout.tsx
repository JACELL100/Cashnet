'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { ToastContainer } from '@/components/Toast';

const auditorNav = [
  { href: '/auditor', label: 'Overview', icon: '⊡' },
  { href: '/auditor/events', label: 'Event Log', icon: '◆' },
  { href: '/auditor/alerts', label: 'Fraud Alerts', icon: '⚠' },
  { href: '/auditor/credit', label: 'Credit Scores', icon: '✓' },
  { href: '/auditor/wallets', label: 'Wallet Profiles', icon: '⊙' },
  { href: '/auditor/reports', label: 'Reports', icon: '≈' },
  { href: '/auditor/settings', label: 'Settings', icon: '⚙' },
];

export default function AuditorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);

  const isAuthPage = pathname === '/auditor/login' || pathname === '/auditor/signup';
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (isAuthPage) return;
    if (!isAuthenticated || !user) { router.push('/auditor/login'); return; }
    if (user.role !== 'AUDITOR') { router.push('/auditor/login'); }
  }, [hasHydrated, isAuthenticated, user, router, isAuthPage]);

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[color:var(--color-bg-primary)]">
        <div className="text-center">
          <div className="text-4xl font-bold text-[#f0a500] font-mono mb-4">AU</div>
          <p className="text-text-secondary font-mono">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthPage) return <>{children}</>;

  if (!isAuthenticated || user?.role !== 'AUDITOR') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[color:var(--color-bg-primary)]">
        <div className="text-center">
          <div className="text-4xl font-bold text-[#f0a500] font-mono mb-4">AU</div>
          <p className="text-text-secondary font-mono">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--color-bg-primary)]">
      <aside className="fixed left-0 top-0 h-screen w-16 md:w-60 bg-[color:var(--color-bg-secondary)] border-r border-[color:var(--color-border)] z-40 flex flex-col">
        <div className="p-4 border-b border-[color:var(--color-border)] flex items-center gap-2">
          <div className="w-8 h-8 bg-[#f0a500] rounded flex items-center justify-center text-xs font-bold text-white shrink-0">AU</div>
          <div className="hidden md:block overflow-hidden">
            <div className="text-xs font-mono font-bold text-text-primary truncate">cashnet auditor</div>
            <div className="text-xs font-mono text-[#f0a500] truncate">● AUDITOR</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {auditorNav.map((item) => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-mono transition-colors ${pathname === item.href ? 'bg-[#f0a500] text-white' : 'hover:bg-[color:var(--color-bg-accent)] text-text-secondary'}`}>
              <span className="text-lg shrink-0">{item.icon}</span>
              <span className="hidden md:inline truncate">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-[color:var(--color-border)]">
          <div className="hidden md:block mb-2 text-xs font-mono text-text-tertiary truncate">
            {user.email || (user.walletAddress ? `${user.walletAddress.slice(0, 10)}...` : user.name || 'Auditor')}
          </div>
          <button onClick={() => { logout(); router.push('/auditor/login'); }} className="w-full py-2 text-xs font-mono text-[#f0a500] border border-[#f0a500] rounded hover:bg-[rgba(240,165,0,0.1)] transition-colors hidden md:block">
            Sign Out
          </button>
        </div>
      </aside>

      <header className="fixed top-0 right-0 left-0 md:left-60 h-14 bg-[color:var(--color-bg-secondary)] border-b border-[color:var(--color-border)] z-30 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-text-tertiary">auditor</span>
          <span className="text-text-tertiary">/</span>
          <span className="text-xs font-mono text-text-primary capitalize">{pathname.split('/').pop() || 'overview'}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-[rgba(240,165,0,0.1)] border border-[#f0a500] text-[#f0a500] rounded text-xs font-mono">READ-ONLY</span>
          <div className="w-7 h-7 rounded-full bg-[#f0a500] flex items-center justify-center text-xs font-bold text-white">
            {(user.name?.[0] || user.walletAddress?.[2] || 'A').toUpperCase()}
          </div>
        </div>
      </header>

      <main className="ml-16 md:ml-60 pt-14 pb-8">
        <div className="p-6 max-w-7xl">{children}</div>
      </main>
      <ToastContainer />
    </div>
  );
}
