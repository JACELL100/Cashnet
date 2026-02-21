'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useSystemControl } from '@/hooks/useSystemControl';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

export default function SystemControlPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const addToast = useUIStore((s) => s.addToast);
  const { status, loading, error, pauseSystem, unpauseSystem, refreshStatus } = useSystemControl();

  // Redirect if not admin
  React.useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      addToast({ message: 'Admin access required', severity: 'error' });
      router.push('/admin');
    }
  }, [user, router]);

  const handlePause = async () => {
    const success = await pauseSystem();
    if (success) {
      addToast({ 
        message: 'System paused successfully. All contract operations are now frozen.', 
        severity: 'success' 
      });
    } else {
      addToast({ message: error || 'Failed to pause system', severity: 'error' });
    }
  };

  const handleUnpause = async () => {
    const success = await unpauseSystem();
    if (success) {
      addToast({ 
        message: 'System resumed successfully. All contract operations are now active.', 
        severity: 'success' 
      });
    } else {
      addToast({ message: error || 'Failed to unpause system', severity: 'error' });
    }
  };

  if (!status) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-text-tertiary font-mono text-sm">Loading system status...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-text-primary">System Control</h1>
          <p className="text-sm text-text-tertiary font-mono mt-1">
            Emergency pause controls for all smart contracts
          </p>
        </div>
        <button
          onClick={refreshStatus}
          className="px-4 py-2 bg-bg-secondary border border-border rounded font-mono text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* System Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-bg-secondary border border-border rounded">
          <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-2">
            Blockchain
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status.connected ? 'bg-[#22c55e]' : 'bg-[#ff3860]'}`} />
            <div className="text-lg font-bold font-mono text-text-primary">
              {status.connected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
          {status.connected && (
            <div className="text-xs font-mono text-text-tertiary mt-1">
              Block #{status.block_number.toLocaleString()}
            </div>
          )}
        </div>

        <div className="p-4 bg-bg-secondary border border-border rounded">
          <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-2">
            System Status
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status.paused ? 'bg-[#ff3860]' : 'bg-[#22c55e]'} animate-pulse`} />
            <div className="text-lg font-bold font-mono text-text-primary">
              {status.paused ? 'PAUSED' : 'ACTIVE'}
            </div>
          </div>
          <div className="text-xs font-mono text-text-tertiary mt-1">
            {status.paused ? 'All operations frozen' : 'All systems operational'}
          </div>
        </div>

        <div className="p-4 bg-bg-secondary border border-border rounded md:col-span-2">
          <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-2">
            AccessControl Contract
          </div>
          <div className="text-sm font-mono text-text-primary break-all">
            {status.access_control_address}
          </div>
          <a
            href={`https://sepolia.etherscan.io/address/${status.access_control_address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-accent hover:underline mt-1 inline-block"
          >
            View on Etherscan →
          </a>
        </div>
      </div>

      {/* Emergency Controls */}
      <div className="bg-bg-secondary border border-border rounded p-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold font-mono text-text-primary mb-2">
            Emergency Controls
          </h2>
          <p className="text-sm font-mono text-text-secondary">
            Use these controls to pause or resume all contract operations system-wide.
          </p>
        </div>

        {status.paused ? (
          <div className="space-y-4">
            <div className="p-4 bg-[rgba(255,56,96,0.08)] border border-[#ff3860] rounded">
              <div className="flex items-start gap-3">
                <div className="text-2xl">⚠️</div>
                <div className="flex-1 space-y-2">
                  <div className="font-bold font-mono text-[#ff3860]">
                    SYSTEM PAUSED
                  </div>
                  <div className="text-sm font-mono text-text-secondary">
                    All contract operations are currently frozen:
                  </div>
                  <ul className="text-xs font-mono text-text-tertiary space-y-1 ml-4">
                    <li>• Lending pool deposits & withdrawals</li>
                    <li>• Liquidity pool swaps</li>
                    <li>• Collateral deposits & withdrawals</li>
                    <li>• Borrowing & repayments</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              onClick={handleUnpause}
              disabled={loading}
              className="w-full px-6 py-4 bg-[#22c55e] text-white font-mono font-bold rounded hover:bg-[#16a34a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '⏳ Processing...' : '▶ Resume System Operations'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-[rgba(34,197,94,0.08)] border border-[#22c55e] rounded">
              <div className="flex items-start gap-3">
                <div className="text-2xl">✓</div>
                <div className="flex-1 space-y-2">
                  <div className="font-bold font-mono text-[#22c55e]">
                    SYSTEM ACTIVE
                  </div>
                  <div className="text-sm font-mono text-text-secondary">
                    All contract operations are currently enabled and functioning normally.
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handlePause}
              disabled={loading}
              className="w-full px-6 py-4 bg-[#ff3860] text-white font-mono font-bold rounded hover:bg-[#e6324e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '⏳ Processing...' : '⏸ EMERGENCY PAUSE'}
            </button>

            <div className="p-3 bg-[rgba(240,165,0,0.08)] border border-[#f0a500] rounded text-xs font-mono text-text-tertiary">
              <strong className="text-[#f0a500]">Warning:</strong> This will freeze all lending, borrowing, and collateral operations across the entire protocol. Only use in emergency situations.
            </div>
          </div>
        )}
      </div>

      {/* Affected Contracts */}
      <div className="bg-bg-secondary border border-border rounded p-6">
        <h2 className="text-lg font-bold font-mono text-text-primary mb-4">
          Affected Contracts
        </h2>
        <div className="space-y-2">
          {[
            { name: 'LendingPool', desc: 'Loan creation and repayment' },
            { name: 'LiquidityPool', desc: 'Token swaps and liquidity provision' },
            { name: 'CollateralVault', desc: 'Collateral deposits and withdrawals' },
          ].map((contract) => (
            <div
              key={contract.name}
              className="flex items-center justify-between p-3 bg-bg-primary border border-border rounded"
            >
              <div>
                <div className="font-mono text-sm text-text-primary">{contract.name}</div>
                <div className="font-mono text-xs text-text-tertiary">{contract.desc}</div>
              </div>
              <div className={`px-3 py-1 rounded text-xs font-mono font-bold ${
                status.paused 
                  ? 'bg-[rgba(255,56,96,0.1)] text-[#ff3860] border border-[#ff3860]' 
                  : 'bg-[rgba(34,197,94,0.1)] text-[#22c55e] border border-[#22c55e]'
              }`}>
                {status.paused ? 'FROZEN' : 'ACTIVE'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-[rgba(255,56,96,0.08)] border border-[#ff3860] rounded">
          <div className="font-bold font-mono text-[#ff3860] mb-1">Error</div>
          <div className="text-sm font-mono text-text-secondary">{error}</div>
        </div>
      )}
    </div>
  );
}
