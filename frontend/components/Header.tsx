'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Badge from './Badge';
import { useAuthStore } from '@/store/authStore';

interface HeaderProps {
  title?: string;
  breadcrumb?: Array<{ label: string; href?: string }>;
  simTime?: number;
  network?: string;
  role?: string;
  onSettingsClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({
  title = 'Dashboard',
  breadcrumb = [],
  simTime = 0,
  network = 'sepolia',
  role = 'admin',
  onSettingsClick,
}) => {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <header className="fixed top-0 left-16 right-0 h-16 md:left-60 bg-[color:var(--color-bg-secondary)] border-b border-[color:var(--color-border)] z-30">
      <div className="h-full px-6 flex items-center justify-between gap-4">
        {/* Left Section - Breadcrumb & Title */}
        <div className="flex-1 min-w-0">
          {breadcrumb.length > 0 && (
            <div className="text-xs text-text-tertiary font-mono mb-1">
              {breadcrumb.map((item, idx) => (
                <span key={idx}>
                  {item.href ? (
                    <a href={item.href} className="hover:text-accent transition-colors">
                      {item.label}
                    </a>
                  ) : (
                    <span>{item.label}</span>
                  )}
                  {idx < breadcrumb.length - 1 && <span className="mx-2">/</span>}
                </span>
              ))}
            </div>
          )}
          <h1 className="text-lg font-mono font-bold text-text-primary truncate">
            {title}
          </h1>
        </div>

        {/* Right Section - Status Pills */}
        <div className="flex items-center gap-3">
          {/* Sim Time */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded">
            <span className="text-xs font-mono text-text-tertiary">SIM TIME</span>
            <span className="text-sm font-mono font-bold text-accent">
              {formatTime(simTime)}
            </span>
          </div>

          {/* Network Badge */}
          <Badge variant="cyan">
            {network.toUpperCase()}
          </Badge>

          {/* Role Badge */}
          <Badge variant={
            user?.role === 'ADMIN' ? 'purple' :
            user?.role === 'AUDITOR' ? 'high' :
            user?.role === 'LENDER' ? 'success' :
            'cyan'
          }>
            {user?.role || role.toUpperCase()}
          </Badge>

          {/* User Info Dropdown */}
          {user && (
            <div className="hidden sm:flex items-center gap-2 pl-3 pr-1.5 py-1.5 bg-[color:var(--color-bg-accent)] border border-[color:var(--color-border)] rounded hover:border-accent transition-colors group cursor-pointer">
              <div className="flex flex-col items-end text-right">
                <span className="text-xs font-mono font-bold text-text-primary group-hover:text-accent">
                  {user.name || (user.walletAddress ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : 'User')}
                </span>
                <span className="text-xs font-mono text-text-tertiary">
                  {user.email ? user.email.split('@')[1] : (user.walletAddress ? 'Wallet User' : user.role || 'User')}
                </span>
              </div>
              <div className="w-6 h-6 rounded bg-accent/20 border border-accent flex items-center justify-center text-xs font-mono font-bold text-accent ml-2">
                {(user.name?.charAt(0) || user.walletAddress?.charAt(2) || 'U').toUpperCase()}
              </div>
              <div className="absolute top-full right-0 mt-2 hidden group-hover:block bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded shadow-lg py-1 z-50 min-w-48">
                <button
                  onClick={() => router.push('/dashboard/profile')}
                  className="w-full text-left px-4 py-2 text-sm font-mono text-text-secondary hover:text-accent hover:bg-[color:var(--color-bg-accent)] transition-colors"
                >
                  Profile
                </button>
                <button
                  onClick={() => router.push('/dashboard/settings')}
                  className="w-full text-left px-4 py-2 text-sm font-mono text-text-secondary hover:text-accent hover:bg-[color:var(--color-bg-accent)] transition-colors"
                >
                  Settings
                </button>
                <div className="border-t border-[color:var(--color-border)] my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm font-mono text-danger hover:bg-[danger]/10 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          )}

          {/* Settings Button */}
          <button
            onClick={onSettingsClick}
            className="p-2 hover:bg-[color:var(--color-bg-accent)] rounded transition-colors text-text-secondary hover:text-text-primary"
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
