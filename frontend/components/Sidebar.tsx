'use client';

import React from 'react';
import Link from 'next/link';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore, UserRole } from '@/store/authStore';

// Define nav items with role access
const allNavItems = [
  { href: '/dashboard', label: 'Overview', icon: '⊡', roles: ['ADMIN', 'AUDITOR', 'LENDER', 'BORROWER'] },
  { href: '/dashboard/identity', label: 'Identity', icon: '⊙', roles: ['ADMIN', 'AUDITOR'] },
  { href: '/dashboard/liquidity', label: 'Liquidity', icon: '≈', roles: ['ADMIN', 'LENDER'] },
  { href: '/dashboard/lending', label: 'Lending', icon: '⎇', roles: ['ADMIN', 'LENDER'] },
  { href: '/dashboard/borrower', label: 'Borrower', icon: '⟁', roles: ['ADMIN', 'BORROWER'] },
  { href: '/dashboard/agents', label: 'Agents', icon: '◈', roles: ['ADMIN', 'AUDITOR'] },
  { href: '/dashboard/threats', label: 'Threats', icon: '⚠', roles: ['ADMIN', 'AUDITOR'] },
  { href: '/dashboard/credit', label: 'Credit', icon: '✓', roles: ['ADMIN', 'BORROWER', 'LENDER'] },
  { href: '/dashboard/audit', label: 'Audit', icon: '◆', roles: ['ADMIN', 'AUDITOR'] },
  { href: '/dashboard/contract-analyzer', label: 'SC Analyzer', icon: '⬡', roles: ['ADMIN', 'AUDITOR', 'LENDER', 'BORROWER'] },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙', roles: ['ADMIN', 'AUDITOR', 'LENDER', 'BORROWER'] },
  { href: '/dashboard/profile', label: 'Profile', icon: '⛯', roles: ['ADMIN', 'AUDITOR', 'LENDER', 'BORROWER'] },
];

const Sidebar: React.FC = () => {
  const activeNavItem = useUIStore((state) => state.activeNavItem);
  const setActiveNavItem = useUIStore((state) => state.setActiveNavItem);
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  
  // Get user role
  const user = useAuthStore((state) => state.user);
  const userRole: UserRole = user?.role || 'BORROWER';

  // Filter nav items based on user role
  const navItems = allNavItems.filter((item) => item.roles.includes(userRole));

  return (
    <>
      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 h-screen bg-(--color-bg-secondary) border-r border-(--color-border)
          transition-all duration-300 z-40 flex flex-col
          ${sidebarOpen ? 'w-60' : 'w-16'}
          md:w-60
        `}
      >
        {/* Logo */}
        <div className="p-4 border-b border-(--color-border) flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#00d4ff] rounded flex items-center justify-center text-xs font-bold text-[color:var(--color-bg-primary)]">
              CN
            </div>
            {sidebarOpen && (
              <span className="font-mono text-xs font-bold uppercase hidden md:inline">
                cashnet
              </span>
            )}
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-(--color-bg-accent) rounded transition-colors md:hidden"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setActiveNavItem(item.href)}
              className={`
                flex items-center gap-3 px-3 py-2 rounded text-sm font-mono transition-colors
                ${
                  activeNavItem === item.href
                    ? 'bg-[#00d4ff] text-(--color-bg-primary)'
                    : 'hover:bg-(--color-bg-accent) text-text-secondary'
                }
              `}
            >
              <span className="text-lg">{item.icon}</span>
              {sidebarOpen && <span className="hidden md:inline truncate">{item.label}</span>}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </>
  );
};

export default Sidebar;
