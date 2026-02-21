'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useSimulationStore } from '@/store/simulationStore';

export default function LoginPage() {
  const router = useRouter();
  const addToast = useUIStore((state) => state.addToast);
  const loginWithWallet = useAuthStore((state) => state.loginWithWallet);
  const setUserId = useSimulationStore((state) => state.setUserId);

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Handle wallet connection and authentication
  const handleAuthenticate = async () => {
    if (!address || !isConnected) {
      addToast({
        message: 'Please connect your wallet first',
        severity: 'warning',
      });
      return;
    }

    try {
      console.log('[AUTH] Starting authentication for wallet:', address);
      
      // Get nonce from backend
      const nonceResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: address }),
      });

      console.log('[AUTH] Nonce response status:', nonceResponse.status);

      if (!nonceResponse.ok) {
        const errorText = await nonceResponse.text();
        console.error('[AUTH] Nonce error:', errorText);
        throw new Error('Failed to get authentication nonce');
      }

      const nonceData = await nonceResponse.json();
      console.log('[AUTH] Nonce data received:', nonceData);
      const { message } = nonceData;

      // Request signature from user
      console.log('[AUTH] Requesting signature for message:', message);
      const signature = await signMessageAsync({ message });
      console.log('[AUTH] Signature received:', signature);

      // Authenticate with backend
      console.log('[AUTH] Calling loginWithWallet...');
      await loginWithWallet(address, signature);
      console.log('[AUTH] loginWithWallet completed');

      // Get updated user state after authentication
      const authState = useAuthStore.getState();
      console.log('[AUTH] Auth state after login:', {
        isAuthenticated: authState.isAuthenticated,
        hasUser: !!authState.user,
        hasToken: !!authState.token,
        user: authState.user,
      });
      
      if (authState.isAuthenticated && authState.user) {
        console.log('[AUTH] Auth successful, setting user ID and preparing redirect');
        setUserId(authState.user.id);
        addToast({
          message: `Welcome, ${authState.user.name || 'User'}!`,
          severity: 'success',
        });
        console.log('[AUTH] Toast shown, initiating redirect to /dashboard');
        // Use setTimeout to ensure state is fully updated and persisted before redirect
        setTimeout(() => {
          console.log('[AUTH] Executing redirect now...');
          router.replace('/dashboard');
        }, 300);
      } else {
        console.error('[AUTH] User state not updated properly:', authState);
        throw new Error('Authentication succeeded but user state not updated');
      }
    } catch (error) {
      console.error('[AUTH] Authentication error:', error);
      addToast({
        message: error instanceof Error ? error.message : 'Authentication failed',
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
          {/* Quote */}
          <div>
            <blockquote className="text-text-secondary italic font-mono text-sm">
              "Non-custodial authentication powered by your wallet signature."
            </blockquote>
            <p className="text-text-tertiary text-xs mt-2">— Web3 Security</p>
          </div>

          {/* Mini Terminal */}
          <div className="bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded p-4 text-xs font-mono space-y-1">
            <div className="text-accent">→ wallet authentication ready</div>
            <div className="text-success">✓ signature verification enabled</div>
            <div className="text-warn">⚠ connect your wallet to continue</div>
          </div>

          {/* Status Pills */}
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-[rgba(0,212,99,0.1)] border border-success text-success rounded text-xs font-mono">
              non-custodial
            </span>
            <span className="px-3 py-1 bg-[rgba(0,212,255,0.1)] border border-accent text-accent rounded text-xs font-mono">
              secure
            </span>
          </div>
        </div>
      </div>

      {/* Right Panel - Wallet Auth */}
      <div className="flex flex-col justify-center items-center p-8 md:p-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile Logo */}
          <Link href="/" className="md:hidden flex items-center gap-2 justify-center mb-8">
            <div className="w-8 h-8 bg-accent rounded flex items-center justify-center text-xs font-bold text-[color:var(--color-bg-primary)]">
              RE
            </div>
            <span className="font-mono text-base font-bold text-text-primary">cashnet</span>
          </Link>

          {/* Heading */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold font-mono text-text-primary">
              Sign In
            </h1>
            <p className="text-text-secondary text-sm font-mono">
              Connect your wallet to access cashnet
            </p>
          </div>

          {/* Wallet Connection */}
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-4 p-8 border border-[color:var(--color-border)] rounded-lg bg-[color:var(--color-bg-secondary)]">
              <div className="text-6xl mb-2">🦊</div>
              <h3 className="text-lg font-bold font-mono text-text-primary">
                MetaMask & Wallet Login
              </h3>
              <p className="text-text-secondary text-sm font-mono text-center">
                Sign a message with MetaMask or any Web3 wallet. No gas fees required.
              </p>
              <div className="text-xs text-text-secondary font-mono mt-2 p-3 bg-[color:var(--color-bg-primary)] rounded border border-[color:var(--color-border)]">
                💡 <strong>MetaMask users:</strong> Choose "Browser" for extension or "WalletConnect" for QR code (mobile)
              </div>
              
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
                                onClick={handleAuthenticate}
                                type="button"
                                className="btn accent w-full py-3"
                              >
                                Sign In with Wallet
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
                    Secure & Non-Custodial
                  </h4>
                  <ul className="text-xs text-text-secondary font-mono space-y-1">
                    <li>• We never access your private keys</li>
                    <li>• You approve all transactions in your wallet</li>
                    <li>• Authentication is signature-based only</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Sign Up Link */}
          <div className="text-center">
            <p className="text-text-secondary text-sm font-mono">
              New to cashnet?{' '}
              <Link
                href="/signup"
                className="text-accent hover:text-accent-light transition-colors font-bold"
              >
                Get started
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
