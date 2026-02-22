'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSystemControl } from '@/hooks/useSystemControl';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://cash-net.onrender.com';

export default function SystemControlPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const addToast = useUIStore((s) => s.addToast);
  const { status, loading, error, pauseSystem, unpauseSystem, refreshStatus } = useSystemControl();

  // Role management state
  const [walletAddress, setWalletAddress] = useState('');
  const [selectedRole, setSelectedRole] = useState('BORROWER');
  const [grantingRole, setGrantingRole] = useState(false);
  const [checkingRole, setCheckingRole] = useState(false);
  const [roleCheckResult, setRoleCheckResult] = useState<any>(null);

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

  const handleGrantRole = async () => {
    if (!walletAddress.trim()) {
      addToast({ message: 'Please enter a wallet address', severity: 'error' });
      return;
    }

    setGrantingRole(true);
    try {
      const response = await fetch(`${API_URL}/system/grant-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().token}`
        },
        body: JSON.stringify({
          wallet_address: walletAddress.trim(),
          role: selectedRole
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        addToast({ 
          message: `${selectedRole} role granted successfully to ${walletAddress}`, 
          severity: 'success' 
        });
        setWalletAddress('');
        setRoleCheckResult(null);
      } else {
        addToast({ 
          message: data.message || data.detail || 'Failed to grant role', 
          severity: 'error' 
        });
      }
    } catch (err: any) {
      addToast({ message: err.message || 'Failed to grant role', severity: 'error' });
    } finally {
      setGrantingRole(false);
    }
  };

  const handleCheckRole = async () => {
    if (!walletAddress.trim()) {
      addToast({ message: 'Please enter a wallet address', severity: 'error' });
      return;
    }

    setCheckingRole(true);
    setRoleCheckResult(null);
    try {
      const response = await fetch(
        `${API_URL}/api/lending/check-borrower-role/${walletAddress.trim()}`
      );
      const data = await response.json();
      setRoleCheckResult(data);

      if (data.has_role) {
        addToast({ message: 'Wallet has BORROWER role', severity: 'success' });
      } else {
        addToast({ message: 'Wallet does NOT have BORROWER role', severity: 'warning' });
      }
    } catch (err: any) {
      addToast({ message: 'Failed to check role', severity: 'error' });
    } finally {
      setCheckingRole(false);
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
            Use these controls to pause or resume all smart contract operations system-wide.
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
                    All blockchain contract operations are currently frozen:
                  </div>
                  <ul className="text-xs font-mono text-text-tertiary space-y-1 ml-4">
                    <li>• Liquidity pool swaps and liquidity management</li>
                    <li>• Lending pool deposits & withdrawals</li>
                    <li>• Collateral deposits & withdrawals</li>
                    <li>• Borrowing & repayments</li>
                  </ul>
                  <div className="mt-3 p-3 bg-bg-primary rounded border border-border">
                    <div className="text-xs font-mono text-text-tertiary">
                      <strong className="text-[#f0a500]">Note:</strong> Users attempting transactions will receive a "Service Unavailable" error. All API endpoints for blockchain operations are disabled.
                    </div>
                  </div>
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
              <strong className="text-[#f0a500]">Warning:</strong> This will immediately freeze all lending, borrowing, liquidity, and collateral operations across the entire protocol. Users will receive error responses for all transaction attempts. Only use in emergency situations.
            </div>
          </div>
        )}
      </div>

      {/* Affected Contracts */}
      <div className="bg-bg-secondary border border-border rounded p-6">
        <h2 className="text-lg font-bold font-mono text-text-primary mb-4">
          Affected Contracts & Endpoints
        </h2>
        <div className="space-y-2">
          {[
            { name: 'LendingPool', desc: 'Loan creation, repayment, and liquidations', endpoints: '/lending/*' },
            { name: 'LiquidityPool', desc: 'Token swaps and liquidity provision/removal', endpoints: '/pool/swap, /pool/add-liquidity, /pool/remove-liquidity' },
            { name: 'CollateralVault', desc: 'Collateral deposits and withdrawals', endpoints: '/lending/deposit-collateral' },
          ].map((contract) => (
            <div
              key={contract.name}
              className="p-3 bg-bg-primary border border-border rounded"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-sm text-text-primary">{contract.name}</div>
                <div className={`px-3 py-1 rounded text-xs font-mono font-bold ${
                  status.paused 
                    ? 'bg-[rgba(255,56,96,0.1)] text-[#ff3860] border border-[#ff3860]' 
                    : 'bg-[rgba(34,197,94,0.1)] text-[#22c55e] border border-[#22c55e]'
                }`}>
                  {status.paused ? 'FROZEN' : 'ACTIVE'}
                </div>
              </div>
              <div className="font-mono text-xs text-text-tertiary mb-1">{contract.desc}</div>
              <div className="font-mono text-xs text-text-tertiary opacity-70">
                API: {contract.endpoints}
              </div>
            </div>
          ))}
        </div>
        {status.paused && (
          <div className="mt-4 p-3 bg-[rgba(255,56,96,0.05)] border border-[rgba(255,56,96,0.3)] rounded">
            <div className="text-xs font-mono text-text-tertiary">
              <strong className="text-[#ff3860]">System Behavior:</strong> All API endpoints listed above will return <code className="px-1 py-0.5 bg-bg-secondary rounded">503 Service Unavailable</code> with the message: "System is currently paused. All blockchain transactions are frozen."
            </div>
          </div>
        )}
      </div>

      {/* Role Management */}
      <div className="bg-bg-secondary border border-border rounded p-6">
        <div className="mb-6">
          <h2 className="text-lg font-bold font-mono text-text-primary mb-2">
            🔑 Role Management
          </h2>
          <p className="text-sm font-mono text-text-secondary">
            Grant blockchain roles to wallet addresses. Required for borrowing and other protocol operations.
          </p>
        </div>

        <div className="space-y-4">
          {/* Wallet Address Input */}
          <div>
            <label className="block text-sm font-mono text-text-secondary mb-2">
              Wallet Address
            </label>
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-2 bg-bg-primary border border-border rounded font-mono text-sm text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-mono text-text-secondary mb-2">
              Role to Grant
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-4 py-2 bg-bg-primary border border-border rounded font-mono text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="BORROWER">BORROWER - Can borrow from lending pool</option>
              <option value="LENDER">LENDER - Can lend to lending pool</option>
              <option value="AUDITOR">AUDITOR - Can view system logs</option>
              <option value="ORACLE">ORACLE - Can update price feeds</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleCheckRole}
              disabled={checkingRole || !walletAddress.trim()}
              className="flex-1 px-4 py-3 bg-bg-primary border border-border text-text-primary font-mono text-sm rounded hover:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkingRole ? '⏳ Checking...' : '🔍 Check BORROWER Role'}
            </button>
            <button
              onClick={handleGrantRole}
              disabled={grantingRole || !walletAddress.trim()}
              className="flex-1 px-4 py-3 bg-accent text-white font-mono text-sm font-bold rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {grantingRole ? '⏳ Granting...' : `✓ Grant ${selectedRole} Role`}
            </button>
          </div>

          {/* Role Check Result */}
          {roleCheckResult && (
            <div className={`p-4 rounded border ${
              roleCheckResult.has_role
                ? 'bg-[rgba(34,197,94,0.08)] border-[#22c55e]'
                : 'bg-[rgba(240,165,0,0.08)] border-[#f0a500]'
            }`}>
              <div className="flex items-center gap-2">
                <div className="text-xl">{roleCheckResult.has_role ? '✅' : '⚠️'}</div>
                <div>
                  <div className="font-mono text-sm font-bold" style={{ 
                    color: roleCheckResult.has_role ? '#22c55e' : '#f0a500' 
                  }}>
                    {roleCheckResult.message}
                  </div>
                  <div className="font-mono text-xs text-text-tertiary mt-1">
                    Wallet: {roleCheckResult.wallet_address}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Role Info */}
          <div className="p-4 bg-bg-primary border border-border rounded space-y-2">
            <div className="text-xs font-mono text-text-tertiary">
              <strong className="text-text-secondary">Important:</strong> Users need the BORROWER role to borrow tokens from the lending pool. Without this role, they will receive "Not verified borrower" errors.
            </div>
            <div className="text-xs font-mono text-text-tertiary">
              <strong className="text-text-secondary">Note:</strong> Role grants require admin privileges on the AccessControl contract and will trigger a blockchain transaction.
            </div>
          </div>
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
