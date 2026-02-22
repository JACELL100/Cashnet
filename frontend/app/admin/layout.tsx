'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import { ToastContainer } from '@/components/Toast';
import LoadingHex from '@/components/LoadingHex';

/** Decode JWT exp claim (returns ms timestamp, or null if invalid) */
function getTokenExpiry(token?: string | null): number | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

const adminNav = [
  { href: '/admin', label: 'Overview', icon: '⊡' },
  { href: '/admin/system', label: 'System Control', icon: '⏸' },
  { href: '/admin/participants', label: 'Participants', icon: '⊙' },
  { href: '/admin/simulation', label: 'Simulation', icon: '≈' },
  { href: '/admin/agents', label: 'Agents', icon: '◈' },
  { href: '/admin/threats', label: 'Threats', icon: '⚠' },
  { href: '/admin/credit', label: 'Credit', icon: '✓' },
  { href: '/admin/audit', label: 'Audit Log', icon: '◆' },
  { href: '/dashboard/contract-analyzer', label: 'SC Analyzer', icon: '⬡' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const refreshSession = useAuthStore((s) => s.refreshSession);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [threatCount, setThreatCount] = useState(0);

  // Poll threat unread count
  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/threats/unread-count`);
        if (res.ok) { const j = await res.json(); setThreatCount(j.data?.count ?? 0); }
      } catch { /* ignore */ }
    };
    poll();
    const iv = setInterval(poll, 10000);
    return () => clearInterval(iv);
  }, []);

  // Don't guard auth pages
  const isAuthPage = pathname === '/admin/login' || pathname === '/admin/signup';

  // Silent re-auth: refresh token before it expires, kick to login if Firebase session gone
  useEffect(() => {
    if (!hasHydrated) return;
    if (isAuthPage) return;

    const tryRefresh = async (forceIfExpired = false) => {
      const token = user?.token;
      const expiry = getTokenExpiry(token);
      const now = Date.now();
      const thirtyMin = 30 * 60 * 1000;
      // Refresh if expired or expiring within 30 min
      if (!expiry || expiry - now < thirtyMin || forceIfExpired) {
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
          const ok = await refreshSession(() => firebaseUser.getIdToken(true));
          if (!ok) { logout(); router.push('/admin/login'); }
        } else {
          // Firebase session gone — wait briefly for onAuthStateChanged before kicking out
          return;
        }
      }
    };

    // Guard: must be authed as ADMIN
    if (!isAuthenticated || !user) { router.push('/admin/login'); return; }
    if (user.role !== 'ADMIN') { router.push('/admin/login'); return; }

    // Check immediately on mount
    tryRefresh();

    // Re-check every 10 minutes while the tab is open
    const interval = setInterval(() => tryRefresh(), 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [hasHydrated, isAuthenticated, user, router, isAuthPage, logout, refreshSession]);

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[color:var(--color-bg-primary)]">
        <LoadingHex />
      </div>
    );
  }

  if (isAuthPage) return <>{children}</>;

  if (!isAuthenticated || !user || user.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[color:var(--color-bg-primary)]">
        <LoadingHex />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--color-bg-primary)]">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen bg-[color:var(--color-bg-secondary)] border-r border-[color:var(--color-border)] transition-all duration-300 z-40 flex flex-col ${sidebarOpen ? 'w-60' : 'w-16'} md:w-60`}>
        <div className="p-4 border-b border-[color:var(--color-border)] flex items-center gap-2">
          <div className="w-8 h-8 bg-[#ff3860] rounded flex items-center justify-center text-xs font-bold text-white shrink-0">CN</div>
          <div className="hidden md:block overflow-hidden">
            <div className="text-xs font-mono font-bold text-text-primary truncate">cashnet admin</div>
            <div className="text-xs font-mono text-[#ff3860] truncate">● SYSTEM ADMIN</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {adminNav.map((item) => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-mono transition-colors ${pathname === item.href ? 'bg-[#ff3860] text-white' : 'hover:bg-[color:var(--color-bg-accent)] text-text-secondary'}`}>
              <span className="text-lg shrink-0 relative">
                {item.icon}
                {item.href === '/admin/threats' && threatCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-[#ff0033] text-white font-bold flex items-center justify-center" style={{ fontSize: '9px', lineHeight: 1 }}>{threatCount > 9 ? '9+' : threatCount}</span>
                )}
              </span>
              <span className="hidden md:inline truncate flex items-center gap-1.5">
                {item.label}
                {item.href === '/admin/threats' && threatCount > 0 && (
                  <span className="ml-auto bg-[#ff0033] text-white rounded-full font-bold" style={{ fontSize: '9px', minWidth: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{threatCount > 9 ? '9+' : threatCount}</span>
                )}
              </span>
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-[color:var(--color-border)]">
          <div className="hidden md:block mb-2 text-xs font-mono text-text-tertiary truncate">
            {user.email || (user.walletAddress ? `${user.walletAddress.slice(0, 10)}...` : user.name || 'Admin')}
          </div>
          <button onClick={() => { logout(); router.push('/admin/login'); }} className="w-full py-2 text-xs font-mono text-[#ff3860] border border-[#ff3860] rounded hover:bg-[rgba(255,56,96,0.1)] transition-colors hidden md:block">
            Sign Out
          </button>
        </div>
      </aside>

      {/* Top bar */}
      <header className="fixed top-0 right-0 left-0 md:left-60 h-14 bg-[color:var(--color-bg-secondary)] border-b border-[color:var(--color-border)] z-30 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-text-tertiary">admin</span>
          <span className="text-text-tertiary">/</span>
          <span className="text-xs font-mono text-text-primary capitalize">{pathname.split('/').pop() || 'overview'}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-[rgba(255,56,96,0.1)] border border-[#ff3860] text-[#ff3860] rounded text-xs font-mono">ADMIN</span>
          <div className="w-7 h-7 rounded-full bg-[#ff3860] flex items-center justify-center text-xs font-bold text-white">
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
