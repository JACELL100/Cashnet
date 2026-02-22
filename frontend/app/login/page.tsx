'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { loginWithWallet, api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import type { UserRole } from '@/store/authStore';

const roleConfig: Record<string, { label: string; slug: string; path: string; accent: string; features: string[] }> = {
  ADMIN:    { label: 'Admin',    slug: 'admin',    path: '/admin',            accent: '#ff3860', features: ['System governance', 'User management', 'Token minting'] },
  AUDITOR:  { label: 'Auditor',  slug: 'auditor',  path: '/auditor',          accent: '#f0a500', features: ['Transaction audit', 'Risk analysis', 'Compliance reports'] },
  LENDER:   { label: 'Lender',   slug: 'lender',   path: '/lender',           accent: '#b367ff', features: ['Pool management', 'Interest earnings', 'APY tracking'] },
  BORROWER: { label: 'Borrower', slug: 'credit',   path: '/dashboard/credit', accent: '#00d4ff', features: ['Credit building', 'Loan access', 'Collateral management'] },
};

export default function LoginPage() {
  const searchParams = useSearchParams();
  const addToast = useUIStore((s) => s.addToast);
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [selectedRole, setSelectedRole] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const r = searchParams.get('role')?.toUpperCase();
    if (r && roleConfig[r]) setSelectedRole(r);
  }, [searchParams]);

  const accent = selectedRole ? roleConfig[selectedRole].accent : '#00d4ff';

  const handleLogin = async () => {
    if (!isConnected || !address) { setErrorMsg('Connect your wallet first'); return; }
    if (!selectedRole) { setErrorMsg('Select a role first'); return; }
    setErrorMsg('');
    setLoading(true);

    try {
      const nonceRes = await api.post('/api/auth/nonce', { wallet_address: address });
      const nonceData = nonceRes?.data ?? nonceRes;
      const message = nonceData?.message;
      if (!message) throw new Error('Failed to get nonce');

      const signature = await signMessageAsync({ message });
      const data = await loginWithWallet(address, signature, undefined, undefined, selectedRole as UserRole);

      useAuthStore.setState({
        user: { id: data.uid, email: data.email ?? '', name: data.name ?? address, role: data.role as UserRole, plan: 'starter', createdAt: Date.now(), avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${address}`, token: data.token },
        token: data.token, isAuthenticated: true, loading: false,
      });
      addToast({ message: `Signed in as ${roleConfig[selectedRole].label}`, severity: 'success' });
      window.location.href = roleConfig[selectedRole].path;
    } catch (err: unknown) {
      setLoading(false);
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  return (
    <div className="min-h-screen flex bg-[#060a18]">
      {/* ── Branding Panel ─────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between p-10 relative overflow-hidden bg-[#0a0f1f]">
        <div className="absolute top-0 left-0 w-[3px] h-full transition-all duration-500" style={{ background: `linear-gradient(180deg, ${accent}, transparent 70%)` }} />

        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hexL" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(1.2)">
              <path d="M28 2L54 18V50L28 66L2 50V18Z" fill="none" stroke="white" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hexL)" />
        </svg>

        <Link href="/" className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center border border-[#1e2540] transition-all duration-300" style={{ background: `${accent}12` }}>
            <span className="text-xs font-bold transition-all duration-300" style={{ color: accent }}>CN</span>
          </div>
          <div>
            <span className="text-sm font-semibold text-white tracking-tight">CashNet</span>
            <span className="text-[10px] uppercase tracking-[0.15em] block text-[#5a6478]">DeFi Platform</span>
          </div>
        </Link>

        <div className="relative z-10 space-y-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] mb-3 transition-all duration-300" style={{ color: `${accent}99` }}>
              {selectedRole ? `${roleConfig[selectedRole].label} Portal` : 'Select Your Role'}
            </p>
            <h1 className="text-[28px] font-semibold text-white leading-[1.2] tracking-tight">
              Web3-Native<br />Authentication.
            </h1>
            <p className="text-sm text-[#5a6478] leading-relaxed mt-3 max-w-[320px]">
              Sign in with your wallet. No passwords, no emails — just your keys, your identity.
            </p>
          </div>

          {selectedRole && (
            <div className="space-y-3">
              {roleConfig[selectedRole].features.map((f) => (
                <div key={f} className="flex items-center gap-3">
                  <span className="text-[10px]" style={{ color: accent }}>⬡</span>
                  <span className="text-[13px] text-[#8b95a5]">{f}</span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-[#1e2540] bg-[#0c1224] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-[#00d463]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
              <span className="text-[11px] text-[#8b95a5] font-medium">Security</span>
            </div>
            <p className="text-[11px] text-[#3a4358] leading-relaxed">
              Connection uses EIP-4361 sign-in. Your private key never leaves your wallet.
            </p>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          {selectedRole ? (
            <span className="px-2.5 py-1 rounded text-[10px] font-medium tracking-wider border transition-all duration-300" style={{ color: accent, borderColor: `${accent}30`, background: `${accent}0a` }}>{selectedRole}</span>
          ) : (
            <span className="px-2.5 py-1 rounded text-[10px] font-medium tracking-wider border border-[#1e2540] text-[#3a4358]">NO ROLE</span>
          )}
          <span className="px-2.5 py-1 rounded text-[10px] font-medium tracking-wider border border-[#00d46330] text-[#00d463] bg-[#00d4630a]">SEPOLIA</span>
        </div>
      </div>

      {/* ── Login Form ────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px] space-y-8">
          <Link href="/" className="lg:hidden flex items-center gap-2.5 justify-center">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#1e2540]" style={{ background: `${accent}12` }}>
              <span className="text-[10px] font-bold" style={{ color: accent }}>CN</span>
            </div>
            <span className="text-sm font-semibold text-white">CashNet</span>
          </Link>

          <div className="text-center">
            <h2 className="text-xl font-semibold text-white tracking-tight">Wallet Sign In</h2>
            <p className="text-sm text-[#5a6478] mt-1">Connect and authenticate in seconds</p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg border border-[#ff386030] bg-[#ff38600a] text-xs text-[#ff6b6b]">
              {errorMsg}
            </div>
          )}

          {/* Role Selector */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-[0.1em] text-[#5a6478]">Select Role</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(roleConfig).map(([key, cfg]) => (
                <button key={key} onClick={() => setSelectedRole(key)}
                  className="p-3 rounded-lg border text-left transition-all"
                  style={{
                    borderColor: selectedRole === key ? `${cfg.accent}50` : '#1e2540',
                    background: selectedRole === key ? `${cfg.accent}0a` : '#0c1224',
                  }}>
                  <div className="text-xs font-medium transition-colors" style={{ color: selectedRole === key ? cfg.accent : '#8b95a5' }}>
                    {cfg.label}
                  </div>
                  <div className="text-[10px] text-[#3a4358] mt-0.5">/{cfg.slug}</div>
                </button>
              ))}
            </div>
          </div>

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
                        className="w-full h-11 rounded-lg text-sm font-medium border border-[#1e2540] bg-[#0c1224] text-white hover:border-[#2e3550] transition-all">
                        Connect Wallet
                      </button>
                    ) : (
                      <button onClick={openAccountModal}
                        className="w-full h-11 rounded-lg text-sm font-mono border px-4 flex items-center justify-between transition-all"
                        style={{ borderColor: `${accent}30`, background: `${accent}08`, color: accent }}>
                        <span>{account.displayName}</span>
                        <span className="text-[10px] text-[#5a6478]">
                          {chain.name}
                        </span>
                      </button>
                    )}
                  </div>
                );
              }}
            </ConnectButton.Custom>

            <button onClick={handleLogin} disabled={loading || !isConnected || !selectedRole}
              className="w-full h-11 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: accent }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating&hellip;
                </span>
              ) : 'Sign In'}
            </button>
          </div>

          <div className="text-center text-xs text-[#5a6478] pt-4 border-t border-[#1e2540]">
            Don&apos;t have an account?{' '}
            <Link href={`/signup${selectedRole ? `?role=${selectedRole}` : ''}`} className="font-medium hover:underline" style={{ color: accent }}>
              Create one &rarr;
            </Link>
          </div>

          <div className="flex items-center justify-center gap-4 text-xs text-[#3a4358]">
            <Link href="/lender/login" className="hover:text-[#b367ff] transition-colors">Lender</Link>
            <span>·</span>
            <Link href="/credit/login" className="hover:text-[#00d4ff] transition-colors">Credit</Link>
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
