'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { loginWithWallet, api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import type { UserRole } from '@/store/authStore';

const ACCENT = '#b367ff';

export default function LenderLoginPage() {
  const addToast = useUIStore((s) => s.addToast);
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async () => {
    if (!isConnected || !address) { setErrorMsg('Connect your wallet first'); return; }
    setErrorMsg('');
    setLoading(true);

    try {
      const nonceRes = await api.post('/api/auth/nonce', { wallet_address: address });
      const nonceData = nonceRes?.data ?? nonceRes;
      const message = nonceData?.message;
      if (!message) throw new Error('Failed to get nonce');

      const signature = await signMessageAsync({ message });
      const data = await loginWithWallet(address, signature, undefined, undefined, 'LENDER' as UserRole);

      if (data.role !== 'LENDER') { setLoading(false); setErrorMsg('This wallet is not registered as a Lender account.'); return; }

      useAuthStore.setState({
        user: { id: data.uid, email: data.email ?? '', name: data.name ?? address, role: data.role as UserRole, plan: 'starter', createdAt: Date.now(), avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${address}`, token: data.token },
        token: data.token, isAuthenticated: true, loading: false,
      });
      addToast({ message: `Welcome back, ${data.name ?? address}!`, severity: 'success' });
      window.location.href = '/lender';
    } catch (err: unknown) {
      setLoading(false);
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  return (
    <div className="min-h-screen flex bg-[#060a18]">
      {/* ── Branding Panel ─────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between p-10 relative overflow-hidden bg-[#0a0f1f]">
        <div className="absolute top-0 left-0 w-[3px] h-full" style={{ background: `linear-gradient(180deg, ${ACCENT}, transparent 70%)` }} />

        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hexLL" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(1.2)">
              <path d="M28 2L54 18V50L28 66L2 50V18Z" fill="none" stroke="white" strokeWidth="0.5"/>
              <path d="M28 68L54 84V116L28 132L2 116V84Z" fill="none" stroke="white" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hexLL)" />
        </svg>

        <Link href="/" className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center border border-[#1e2540]" style={{ background: `${ACCENT}12` }}>
            <span className="text-xs font-bold" style={{ color: ACCENT }}>CN</span>
          </div>
          <div>
            <span className="text-sm font-semibold text-white tracking-tight">CashNet</span>
            <span className="text-[10px] uppercase tracking-[0.15em] block" style={{ color: ACCENT }}>Lending</span>
          </div>
        </Link>

        <div className="relative z-10 space-y-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] mb-3" style={{ color: `${ACCENT}99` }}>Lender Portal</p>
            <h1 className="text-[28px] font-semibold text-white leading-[1.2] tracking-tight">
              Liquidity<br />Management
            </h1>
            <p className="text-sm text-[#5a6478] leading-relaxed mt-3 max-w-[320px]">
              Manage your liquidity positions, issue loans, monitor borrower health, and earn yield on your capital.
            </p>
          </div>

          <div className="space-y-3">
            {[
              'Deposit & withdraw liquidity',
              'Monitor loan portfolio',
              'View borrower health factors',
              'Trigger liquidations',
              'Track interest earned',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="text-[10px]" style={{ color: ACCENT }}>⬡</span>
                <span className="text-[13px] text-[#8b95a5]">{item}</span>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: '$125M', label: 'TVL' },
              { value: '8.2%', label: 'Avg APY' },
              { value: '12', label: 'Lenders' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-[#1e2540] bg-[#0c1224] p-3">
                <div className="text-lg font-semibold font-mono" style={{ color: ACCENT }}>{s.value}</div>
                <div className="text-[10px] text-[#3a4358] mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <span className="px-2.5 py-1 rounded text-[10px] font-medium tracking-wider border" style={{ color: ACCENT, borderColor: `${ACCENT}30`, background: `${ACCENT}0a` }}>LENDER</span>
          <span className="px-2.5 py-1 rounded text-[10px] font-medium tracking-wider border border-[#00d46330] text-[#00d463] bg-[#00d4630a]">SEPOLIA</span>
        </div>
      </div>

      {/* ── Login Form ─────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px] space-y-8">
          <Link href="/" className="lg:hidden flex items-center gap-2.5 justify-center">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#1e2540]" style={{ background: `${ACCENT}12` }}>
              <span className="text-[10px] font-bold" style={{ color: ACCENT }}>CN</span>
            </div>
            <span className="text-sm font-semibold text-white">CashNet <span style={{ color: ACCENT }}>Lending</span></span>
          </Link>

          <div className="text-center">
            <h2 className="text-xl font-semibold text-white tracking-tight">Lender Sign In</h2>
            <p className="text-sm text-[#5a6478] mt-1">Connect your wallet to access the lending dashboard</p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg border border-[#ff386030] bg-[#ff38600a] text-xs text-[#ff6b6b]">
              {errorMsg}
            </div>
          )}

          {/* Wallet Connection */}
          <div className="space-y-4">
            <label className="text-[11px] uppercase tracking-[0.1em] text-[#5a6478]">Wallet</label>
            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <div>
                    {!connected ? (
                      <button onClick={openConnectModal}
                        className="w-full h-11 rounded-lg text-sm font-medium border border-[#1e2540] bg-[#0c1224] text-white hover:border-[#2e3550] transition-all flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" /></svg>
                        Connect Wallet
                      </button>
                    ) : (
                      <button onClick={openAccountModal}
                        className="w-full h-11 rounded-lg text-sm font-mono border px-4 flex items-center justify-between transition-all"
                        style={{ borderColor: `${ACCENT}30`, background: `${ACCENT}08`, color: ACCENT }}>
                        <span>{account.displayName}</span>
                        <span className="text-[10px] text-[#5a6478]">{chain.name}</span>
                      </button>
                    )}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>

          {/* Security Note */}
          <div className="rounded-lg border border-[#1e2540] bg-[#0c1224] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-[#00d463]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
              <span className="text-[11px] text-[#8b95a5] font-medium">Secure Authentication</span>
            </div>
            <p className="text-[11px] text-[#3a4358] leading-relaxed">
              Uses EIP-4361 sign-in. Your private key never leaves your wallet.
            </p>
          </div>

          {/* Sign In Button */}
          <button onClick={handleLogin} disabled={loading || !isConnected}
            className="w-full h-11 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: ACCENT }}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Authenticating&hellip;
              </span>
            ) : 'Sign In with Wallet'}
          </button>

          <div className="relative flex items-center">
            <div className="flex-1 border-t border-[#1e2540]" />
            <span className="px-3 text-[10px] uppercase tracking-[0.15em] text-[#3a4358]">Wallet login</span>
            <div className="flex-1 border-t border-[#1e2540]" />
          </div>

          <p className="text-center text-xs text-[#5a6478]">
            Don&apos;t have an account?{' '}
            <Link href="/lender/signup" className="font-medium hover:underline" style={{ color: ACCENT }}>Create Lender account &rarr;</Link>
          </p>

          <div className="flex items-center justify-center gap-4 text-xs text-[#3a4358]">
            <Link href="/credit/login" className="hover:text-[#00d4ff] transition-colors">Borrower</Link>
            <span>·</span>
            <Link href="/auditor/login" className="hover:text-[#f0a500] transition-colors">Auditor</Link>
            <span>·</span>
            <Link href="/admin/login" className="hover:text-[#ff3860] transition-colors">Admin</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
