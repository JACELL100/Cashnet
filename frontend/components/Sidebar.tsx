'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore, UserRole } from '@/store/authStore';
import { useAccount } from 'wagmi';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://cash-net.onrender.com';

interface BorrowerPosition {
  collateral_eth: number;
  collateral_value: number;
  debt_value: number;
  health_factor: number;
  at_risk: boolean;
}

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
  { href: '/dashboard/market-intelligence', label: 'Markets', icon: '◈', roles: ['ADMIN', 'AUDITOR', 'LENDER', 'BORROWER'] },
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
  const { address } = useAccount();

  // Borrower position state
  const [position, setPosition] = useState<BorrowerPosition | null>(null);
  const [loading, setLoading] = useState(false);

  // Filter nav items based on user role
  const navItems = allNavItems.filter((item) => item.roles.includes(userRole));

  // Fetch borrower position if user is a borrower
  const fetchPosition = useCallback(async () => {
    if (userRole !== 'BORROWER' && userRole !== 'ADMIN') return;
    const wallet = address || user?.walletAddress || user?.id;
    if (!wallet) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/lending/borrower/${wallet}`);
      if (res.ok) {
        const data = await res.json();
        setPosition(data.data);
      }
    } catch (err) {
      console.error('Error fetching borrower position:', err);
    } finally {
      setLoading(false);
    }
  }, [userRole, address, user?.walletAddress, user?.id]);

  useEffect(() => {
    fetchPosition();
    const interval = setInterval(fetchPosition, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [fetchPosition]);

  const fmtETH = (v: number) =>
    v >= 1 ? `${v.toFixed(4)} ETH`
      : v >= 0.0001 ? `${v.toFixed(6)} ETH`
      : v > 0 ? `${v.toExponential(2)} ETH`
      : '0 ETH';

  const hfColor = (h: number) =>
    h >= 1.5 ? '#22c55e' : h >= 1.2 ? '#f0a500' : '#ff3860';

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

        {/* Borrower Position Stats */}
        {(userRole === 'BORROWER' || userRole === 'ADMIN') && position && (
          <div className="p-3 border-t border-(--color-border)">
            <div className={`space-y-2 text-xs font-mono ${sidebarOpen ? 'block' : 'hidden md:block'}`}>
              <div className="text-text-tertiary uppercase text-[10px] tracking-wider mb-2">
                Your Position
              </div>
              
              {/* Collateral */}
              <div className="bg-(--color-bg-accent) rounded p-2">
                <div className="text-text-tertiary text-[10px] mb-0.5">Collateral</div>
                <div className="text-text-primary font-bold">
                  {fmtETH(position.collateral_eth)}
                </div>
                <div className="text-text-tertiary text-[9px]">
                  ≈ ${position.collateral_value.toFixed(2)}
                </div>
              </div>

              {/* Borrowed */}
              {position.debt_value > 0 && (
                <div className="bg-(--color-bg-accent) rounded p-2">
                  <div className="text-text-tertiary text-[10px] mb-0.5">Borrowed</div>
                  <div className="text-text-primary font-bold">
                    {position.debt_value.toFixed(2)} BADM
                  </div>
                </div>
              )}

              {/* Health Factor */}
              <div className="bg-(--color-bg-accent) rounded p-2">
                <div className="text-text-tertiary text-[10px] mb-0.5">Health Factor</div>
                <div className="font-bold" style={{ color: hfColor(position.health_factor) }}>
                  {position.health_factor >= 100 ? '∞' : position.health_factor.toFixed(2)}
                </div>
              </div>
            </div>
            
            {/* Compact view when collapsed */}
            {!sidebarOpen && (
              <div className="md:hidden flex flex-col gap-1">
                <div className="text-[9px] text-text-tertiary">Collateral</div>
                <div className="text-xs font-bold text-text-primary">
                  {fmtETH(position.collateral_eth).split(' ')[0]}
                </div>
              </div>
            )}
          </div>
        )}
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
