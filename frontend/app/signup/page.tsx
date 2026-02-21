'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore, UserRole } from '@/store/authStore';
import { useSimulationStore } from '@/store/simulationStore';

const roleConfig: Record<UserRole, { title: string; icon: string; description: string; color: string; dashboardPath: string; features: string[] }> = {
  ADMIN: {
    title: 'Administrator',
    icon: '⚙',
    description: 'Full platform access',
    color: 'text-purple-400 border-purple-400/50 bg-purple-400/10',
    dashboardPath: '/dashboard',
    features: [
      'Full system administration',
      'User management & permissions',
      'Platform configuration',
      'All module access',
    ],
  },
  AUDITOR: {
    title: 'Auditor',
    icon: '◆',
    description: 'Audit & compliance',
    color: 'text-amber-400 border-amber-400/50 bg-amber-400/10',
    dashboardPath: '/dashboard/audit',
    features: [
      'Transaction audit trails',
      'Compliance verification',
      'Smart contract reviews',
      'Risk assessment reports',
    ],
  },
  LENDER: {
    title: 'Lender',
    icon: '≈',
    description: 'Provide liquidity',
    color: 'text-emerald-400 border-emerald-400/50 bg-emerald-400/10',
    dashboardPath: '/dashboard/lending',
    features: [
      'Liquidity pool management',
      'Interest rate optimization',
      'Portfolio analytics',
      'Yield strategies',
    ],
  },
  BORROWER: {
    title: 'Borrower',
    icon: '⎇',
    description: 'Access credit',
    color: 'text-cyan-400 border-cyan-400/50 bg-cyan-400/10',
    dashboardPath: '/dashboard/credit',
    features: [
      'Credit score tracking',
      'Loan management',
      'Collateral monitoring',
      'Payment scheduling',
    ],
  },
};

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const addToast = useUIStore((state) => state.addToast);
  const loginWithWallet = useAuthStore((state) => state.loginWithWallet);
  const setUserId = useSimulationStore((state) => state.setUserId);

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Get role from query params
  const roleParam = searchParams.get('role') as UserRole | null;
  const [selectedRole, setSelectedRole] = useState<UserRole>(roleParam || 'BORROWER');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Redirect to landing page if no role is selected
  useEffect(() => {
    if (!roleParam) {
      router.replace('/');
    }
  }, [roleParam, router]);

  const currentRole = roleConfig[selectedRole];

  // Handle wallet connection and signup
  const handleSignup = async () => {
    if (!address || !isConnected) {
      addToast({
        message: 'Please connect your wallet first',
        severity: 'warning',
      });
      return;
    }

    try {
      console.log('[SIGNUP] Starting signup for wallet:', address, 'as', selectedRole);
      
      // Get nonce from backend
      const nonceResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address }),
      });

      if (!nonceResponse.ok) {
        throw new Error('Failed to get authentication nonce');
      }

      const { message } = await nonceResponse.json();

      // Request signature from user
      const signature = await signMessageAsync({ message });

      // Authenticate with backend (signup + login in one step) with role
      await loginWithWallet(address, signature, name || undefined, email || undefined, selectedRole);

      // Get updated user state after authentication
      const authState = useAuthStore.getState();
      
      if (authState.isAuthenticated && authState.user) {
        console.log('[SIGNUP] Auth successful, setting user ID and preparing redirect');
        setUserId(authState.user.id);
        addToast({
          message: `Welcome to cashnet, ${authState.user.name || currentRole.title}!`,
          severity: 'success',
        });
        
        // Role-based redirect
        const dashboardPath = roleConfig[authState.user.role].dashboardPath;
        console.log('[SIGNUP] Redirecting to:', dashboardPath);
        
        setTimeout(() => {
          console.log('[SIGNUP] Executing redirect now...');
          router.replace(dashboardPath);
        }, 300);
      } else {
        console.error('[SIGNUP] User state not updated properly:', authState);
        throw new Error('Authentication succeeded but user state not updated');
      }
    } catch (error) {
      console.error('Signup error:', error);
      addToast({
        message: error instanceof Error ? error.message : 'Signup failed',
        severity: 'error',
      });
    }
  };

  return (
    <div className="min-h-screen bg-[color:var(--color-bg-primary)] grid grid-cols-1 md:grid-cols-2">
      {/* Left Panel - Branding */}
      <div className="hidden md:flex flex-col justify-between p-8 bg-gradient-to-b from-[color:var(--color-bg-secondary)] to-[color:var(--color-bg-primary)] border-r border-[color:var(--color-border)]">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-accent rounded flex items-center justify-center text-base font-bold text-[color:var(--color-bg-primary)]">
            RE
          </div>
          <span className="font-mono text-lg font-bold text-text-primary">cashnet</span>
        </Link>

        <div className="space-y-8">
          {/* Role Badge */}
          <div className={`inline-flex items-center gap-3 px-4 py-3 rounded-lg border ${currentRole.color}`}>
            <span className="text-2xl">{currentRole.icon}</span>
            <div>
              <div className="font-bold font-mono text-text-primary">{currentRole.title}</div>
              <div className="text-xs text-text-secondary font-mono">{currentRole.description}</div>
            </div>
          </div>

          {/* Features */}
          <div>
            <h3 className="text-text-primary font-mono font-bold mb-4">What you get as {currentRole.title}:</h3>
            <ul className="space-y-3 text-text-secondary text-sm font-mono">
              {currentRole.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-accent">✓</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Status Pills */}
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-[rgba(0,212,99,0.1)] border border-success text-success rounded text-xs font-mono">
              web3-native
            </span>
            <span className="px-3 py-1 bg-[rgba(0,212,255,0.1)] border border-accent text-accent rounded text-xs font-mono">
              secure
            </span>
          </div>
        </div>
      </div>

      {/* Right Panel - Signup Form */}
      <div className="flex flex-col justify-center items-center p-8 md:p-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile Logo */}
          <Link href="/" className="md:hidden flex items-center gap-2 justify-center mb-8">
            <div className="w-8 h-8 bg-accent rounded flex items-center justify-center text-xs font-bold text-[color:var(--color-bg-primary)]">
              RE
            </div>
            <span className="font-mono text-base font-bold text-text-primary">cashnet</span>
          </Link>

          {/* Role Badge (Mobile) */}
          <div className={`md:hidden flex items-center justify-center gap-3 px-4 py-3 rounded-lg border ${currentRole.color}`}>
            <span className="text-2xl">{currentRole.icon}</span>
            <div>
              <div className="font-bold font-mono text-text-primary">{currentRole.title}</div>
              <div className="text-xs text-text-secondary font-mono">{currentRole.description}</div>
            </div>
          </div>

          {/* Heading */}
          <div className="text-center space-y-2">
            <div className="text-5xl mb-2">{currentRole.icon}</div>
            <h1 className="text-3xl font-bold font-mono text-text-primary">
              Get Started
            </h1>
            <p className="text-text-secondary text-sm font-mono">
              Join cashnet as {currentRole.title.toLowerCase()}
            </p>
            <div className="text-xs text-text-secondary font-mono mt-3 p-3 bg-[color:var(--color-bg-primary)] rounded border border-[color:var(--color-border)] text-left">
              💡 <strong>MetaMask:</strong> Choose "Browser" for extension or "WalletConnect" for mobile QR
            </div>
          </div>

          {/* Optional Profile Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="form-label text-xs">
                Display Name (Optional)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-input"
                placeholder="Your name"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="form-label text-xs">
                Email (Optional)
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                placeholder="your@email.com"
              />
              <p className="text-xs text-text-tertiary font-mono">
                Optional: for notifications and updates
              </p>
            </div>
          </div>

          {/* Wallet Connection */}
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 p-8 border border-[color:var(--color-border)] rounded-lg bg-[color:var(--color-bg-secondary)]">
              <div className="text-6xl mb-2">🦊</div>
              <h3 className="text-lg font-bold font-mono text-text-primary">
                Connect Your Wallet
              </h3>
              <p className="text-text-secondary text-sm font-mono text-center">
                Sign up with MetaMask or any Ethereum wallet. No passwords needed!
              </p>
              
              <div className="w-full mt-4">
                <ConnectButton.Custom>
                  {({
                    account,
                    chain,
                    openAccountModal,
                    openChainModal,
                    openConnectModal,
                    authenticationStatus,
                    mounted,
                  }: any) => {
                    const ready = mounted && authenticationStatus !== 'loading';
                    const connected =
                      ready &&
                      account &&
                      chain &&
                      (!authenticationStatus || authenticationStatus === 'authenticated');

                    return (
                      <div
                        {...(!ready && {
                          'aria-hidden': true,
                          style: {
                            opacity: 0,
                            pointerEvents: 'none',
                            userSelect: 'none',
                          },
                        })}
                      >
                        {(() => {
                          if (!connected) {
                            return (
                              <button
                                onClick={openConnectModal}
                                type="button"
                                className="btn accent w-full py-3"
                              >
                                Connect Wallet
                              </button>
                            );
                          }

                          if (chain.unsupported) {
                            return (
                              <button
                                onClick={openChainModal}
                                type="button"
                                className="btn ghost w-full py-3 border-danger text-danger"
                              >
                                Wrong network
                              </button>
                            );
                          }

                          return (
                            <div className="flex flex-col gap-3">
                              <div className="flex gap-2">
                                <button
                                  onClick={openChainModal}
                                  type="button"
                                  className="btn ghost flex-1 py-2 text-xs"
                                >
                                  {chain.hasIcon && (
                                    <div
                                      style={{
                                        background: chain.iconBackground,
                                        width: 12,
                                        height: 12,
                                        borderRadius: 999,
                                        overflow: 'hidden',
                                        marginRight: 4,
                                      }}
                                    >
                                      {chain.iconUrl && (
                                        <img
                                          alt={chain.name ?? 'Chain icon'}
                                          src={chain.iconUrl}
                                          style={{ width: 12, height: 12 }}
                                        />
                                      )}
                                    </div>
                                  )}
                                  {chain.name}
                                </button>

                                <button
                                  onClick={openAccountModal}
                                  type="button"
                                  className="btn ghost flex-1 py-2 text-xs"
                                >
                                  {account.displayName}
                                </button>
                              </div>

                              <button
                                onClick={handleSignup}
                                type="button"
                                className="btn accent w-full py-3"
                              >
                                Sign Up with Wallet
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
              </div>
            </div>

            {/* Security Notice */}
            <div className="bg-[rgba(0,212,255,0.05)] border border-accent rounded-lg p-4">
              <div className="flex gap-3">
                <div className="text-accent text-xl">🔒</div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold font-mono text-text-primary">
                    Your Keys, Your Control
                  </h4>
                  <ul className="text-xs text-text-secondary font-mono space-y-1">
                    <li>• No passwords to remember</li>
                    <li>• You control your private keys</li>
                    <li>• Approve each transaction yourself</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Login Link */}
          <div className="text-center">
            <p className="text-text-secondary text-sm font-mono">
              Already have an account?{' '}
              <Link
                href={`/login?role=${selectedRole}`}
                className="text-accent hover:text-accent-light transition-colors font-bold"
              >
                Sign in
              </Link>
            </p>
          </div>

          {/* Change Role Link */}
          <div className="text-center">
            <Link
              href="/"
              className="text-text-tertiary text-xs font-mono hover:text-text-secondary transition-colors"
            >
              ← Change role
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
