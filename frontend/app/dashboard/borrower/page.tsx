'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useLendingActions } from '@/hooks/useLendingActions';
import { useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { BADASSIUM_ADDRESS } from '@/lib/contracts';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SEPOLIA = 'https://sepolia.etherscan.io';

const hfColor = (h: number) =>
  h >= 1.5 ? '#22c55e' : h >= 1.2 ? '#f0a500' : '#ff3860';

const fmtUSD = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1e6).toFixed(2)}M`
    : v >= 1_000 ? `$${(v / 1e3).toFixed(1)}K`
    : `$${v.toFixed(2)}`;

const fmtETH = (v: number) =>
  v >= 1_000 ? `${(v / 1e3).toFixed(2)}K ETH`
    : v >= 1 ? `${v.toFixed(4)} ETH`
    : v >= 0.0001 ? `${v.toFixed(6)} ETH`
    : v > 0 ? `${v.toExponential(2)} ETH`
    : '0 ETH';

const fmtBADM = (v: number) =>
  v >= 1_000_000 ? `${(v / 1e6).toFixed(2)}M BADM`
    : v >= 1_000 ? `${(v / 1e3).toFixed(1)}K BADM`
    : v >= 1 ? `${v.toFixed(2)} BADM`
    : v > 0 ? `${v.toFixed(4)} BADM`
    : '0 BADM';

const scoreColor = (s: number) =>
  s >= 750 ? '#22c55e' : s >= 700 ? '#00d4ff' : s >= 650 ? '#f0a500' : '#ff3860';

const scoreLabel = (s: number) =>
  s >= 750 ? 'Excellent' : s >= 700 ? 'Good' : s >= 650 ? 'Fair' : s >= 600 ? 'Poor' : 'Very Poor';

interface Position {
  collateral_eth: number;
  collateral_value: number;
  debt_value: number;
  health_factor: number;
  at_risk: boolean;
}

interface Loan {
  id: string;
  borrowed: number;
  collateral: number;
  interest_rate: number;
  status: 'active' | 'paid' | 'defaulted';
  due_date: string;
}

const loanStatusStyle: Record<string, { color: string }> = {
  active:    { color: '#00d4ff' },
  paid:      { color: '#22c55e' },
  defaulted: { color: '#ff3860' },
};

export default function DashboardBorrowerPage() {
  const user = useAuthStore((s) => s.user);

  const {
    depositCollateral, borrow, approveRepay, repay, address,
    isConnected, isSigning, isConfirming, isConfirmed, txHash, error, reset,
  } = useLendingActions();

  // Fetch wallet balances dynamically
  const { data: ethBalance } = useBalance({ address });
  const { data: badmBalance } = useBalance({ address, token: BADASSIUM_ADDRESS });

  const [position, setPosition] = useState<Position | null>(null);
  const [creditScore, setCreditScore] = useState(0);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [meetsCreditRequirement, setMeetsCreditRequirement] = useState<boolean>(true);
  const [minCreditScore, setMinCreditScore] = useState<number>(400);

  const [depositAmt, setDepositAmt] = useState('');
  const [borrowAmt, setBorrowAmt] = useState('');
  const [repayAmt, setRepayAmt] = useState('');
  const [tab, setTab] = useState<'overview' | 'loans' | 'credit'>('overview');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // Available balances
  const availableETH = ethBalance ? parseFloat(formatEther(ethBalance.value)) : 0;
  const availableBADM = badmBalance ? parseFloat(formatEther(badmBalance.value)) : 0;
  
  // Max borrowable amount based on collateral
  const maxBorrowable = position ? (position.collateral_value * 0.75) - position.debt_value : 0;

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    // Use connected wallet address from MetaMask (address) instead of user.id
    const wallet = address || user?.walletAddress || user?.id;
    if (!wallet) {
      console.warn('⚠️ No wallet address available for fetching data');
      return;
    }
    
    console.log('🔄 Fetching borrower data for:', wallet);
    
    try {
      const [posRes, scoreRes, loansRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/lending/borrower/${wallet}`),
        fetch(`${API_URL}/api/credit/score?wallet=${wallet}`),
        fetch(`${API_URL}/api/loans?wallet=${wallet}`),
      ]);
      
      // Position data
      if (posRes.status === 'fulfilled' && posRes.value.ok) {
        const d = await posRes.value.json();
        setPosition(d.data ?? d);
        setLastUpdate(new Date().toLocaleTimeString());
        console.log('📊 Position updated:', d.data ?? d);
      } else if (posRes.status === 'fulfilled') {
        console.error('❌ Position fetch failed:', posRes.value.status, posRes.value.statusText);
      }
      
      // Credit score
      if (scoreRes.status === 'fulfilled' && scoreRes.value.ok) {
        const d = await scoreRes.value.json();
        const score = d.score ?? d.data?.score ?? 0;
        setCreditScore(score);
        setMeetsCreditRequirement(score >= minCreditScore);
      } else if (scoreRes.status === 'fulfilled') {
        console.error('❌ Credit score fetch failed:', scoreRes.value.status);
      }
      
      // Loans
      if (loansRes.status === 'fulfilled' && loansRes.value.ok) {
        const d = await loansRes.value.json();
        setLoans(d.data ?? d ?? []);
      } else if (loansRes.status === 'fulfilled') {
        console.error('❌ Loans fetch failed:', loansRes.value.status);
      }
    } catch (err) { 
      console.error('❌ Error fetching borrower data:', err);
    }
    finally { setLoading(false); }
  }, [address, user?.id, user?.walletAddress]);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 5000); // Poll every 5 seconds
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchData]);

  // Trigger immediate fetch when wallet connects
  useEffect(() => {
    if (address && isConnected) {
      console.log('🔌 Wallet connected, fetching data for:', address);
      fetchData();
    }
  }, [address, isConnected, fetchData]);

  useEffect(() => {
    if (isConfirmed) { 
      console.log('✅ Transaction confirmed! Hash:', txHash);
      console.log('📍 Fetching data for wallet:', address);
      
      // Show success message
      setSuccessMessage('Transaction confirmed! Updating your position...');
      setShowSuccess(true);
      
      // Clear input fields on successful transaction
      setDepositAmt('');
      setBorrowAmt('');
      setRepayAmt('');
      
      // Immediately fetch updated data
      fetchData();
      
      // Fetch again after delays to ensure blockchain state is updated
      setTimeout(() => {
        console.log('🔄 Refetching after 2s...');
        fetchData();
      }, 2000);
      
      setTimeout(() => {
        console.log('🔄 Refetching after 5s...');
        fetchData();
      }, 5000);
      
      // Hide success message after 8 seconds
      setTimeout(() => {
        setShowSuccess(false);
      }, 8000);
      
      // Reset transaction state
      setTimeout(() => {
        reset?.();
      }, 3000);
    }
  }, [isConfirmed, txHash, address, fetchData, reset]);

  const activeLoans = loans.filter((l) => l.status === 'active');
  const totalBorrowed = activeLoans.reduce((s, l) => s + (l.borrowed ?? 0), 0);
  const totalCollateral = activeLoans.reduce((s, l) => s + (l.collateral ?? 0), 0);
  const hf = position?.health_factor ?? 999;
  const scorePct = Math.max(0, Math.min(100, ((creditScore - 300) / 550) * 100));

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Borrower</h1>
          <p className="text-sm text-text-tertiary mt-1">
            Manage your loans, collateral, and credit position
          </p>
          {address && (
            <div className="text-xs text-text-tertiary mt-2 font-mono">
              📍 Tracking wallet: <span className="text-[#00d4ff]">{address.slice(0, 6)}...{address.slice(-4)}</span>
              {!isConnected && <span className="text-[#ff3860] ml-2">⚠️ MetaMask disconnected</span>}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => {
              console.log('🔄 Manual refresh triggered');
              console.log('   - Wallet address:', address);
              console.log('   - User ID:', user?.id);
              console.log('   - Connected:', isConnected);
              fetchData();
            }}
            className="text-xs px-3 py-1.5 rounded border border-[#00d4ff55] text-[#00d4ff] bg-[rgba(0,212,255,0.05)] hover:bg-[rgba(0,212,255,0.1)] transition-colors"
          >
            ↻ Refresh
          </button>
          {lastUpdate && (
            <div className="text-xs text-text-tertiary">
              Updated: {lastUpdate}
            </div>
          )}
        </div>
      </div>

      {/* Credit Score Warning */}
      {!meetsCreditRequirement && creditScore > 0 && (
        <div className="card p-4 border-l-4 border-[#f0a500] bg-[rgba(240,165,0,0.05)]">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1 space-y-1">
              <div className="text-sm font-bold text-[#f0a500]">Credit Score Too Low</div>
              <div className="text-xs text-text-tertiary leading-relaxed">
                Your current credit score is <span className="text-text-primary font-bold">{creditScore}</span>. 
                The minimum credit score required to borrow is <span className="text-text-primary font-bold">{minCreditScore}</span>.
                <span className="block mt-2 text-text-primary">Improve your credit by repaying existing loans on time and maintaining healthy collateral ratios.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info Banner - How it works */}
      <div className="card p-4 border-l-4 border-[#00d4ff]">
        <div className="flex items-start gap-3">
          <div className="text-2xl">ℹ️</div>
          <div className="flex-1 space-y-1">
            <div className="text-sm font-bold text-text-primary">How Borrowing Works</div>
            <div className="text-xs text-text-tertiary leading-relaxed">
              <span className="text-[#00d4ff] font-bold">1. Deposit ETH</span> as collateral → 
              <span className="text-[#b367ff] font-bold"> 2. Borrow BADASSIUM</span> tokens (up to 75% of collateral value) → 
              <span className="text-[#22c55e] font-bold"> 3. Repay BADASSIUM</span> to unlock collateral.
              <span className="block mt-1 text-[#f0a500]">⚠️ Recommended: Start with small amounts like 0.1 ETH for testing.</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Credit Score */}
        <div className="card p-5 space-y-2">
          <div className="text-xs text-text-tertiary uppercase tracking-wider">Credit Score</div>
          {loading ? (
            <div className="h-8 w-20 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />
          ) : (
            <>
              <div className="text-3xl font-bold" style={{ color: scoreColor(creditScore) }}>
                {creditScore || '—'}
              </div>
              <div className="text-xs" style={{ color: scoreColor(creditScore) }}>
                {scoreLabel(creditScore)}
              </div>
              <div className="h-1.5 bg-[color:var(--color-bg-accent)] rounded-full overflow-hidden mt-1">
                <div className="h-full rounded-full" style={{ width: `${scorePct}%`, background: scoreColor(creditScore) }} />
              </div>
            </>
          )}
        </div>

        {/* Health Factor */}
        <div className="card p-5 space-y-2">
          <div className="text-xs text-text-tertiary uppercase tracking-wider">Health Factor</div>
          {loading ? (
            <div className="h-8 w-20 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />
          ) : (
            <>
              <div className="text-3xl font-bold" style={{ color: hfColor(hf) }}>
                {hf >= 100 ? '∞' : hf.toFixed(2)}
              </div>
              <div className="text-xs" style={{ color: hfColor(hf) }}>
                {hf >= 1.5 ? 'Safe' : hf >= 1.2 ? 'At Risk' : 'Danger'}
              </div>
              {position?.at_risk && (
                <div className="text-xs text-[#ff3860] bg-[rgba(255,56,96,0.1)] border border-[rgba(255,56,96,0.3)] rounded px-2 py-0.5 mt-1">
                  ⚠ Position at risk
                </div>
              )}
            </>
          )}
        </div>

        {/* Total Borrowed */}
        <div className="card p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-text-tertiary uppercase tracking-wider">
            <span>Total Borrowed</span>
            {position && position.debt_value > 0 && (
              <span className="text-[#00d4ff] text-[10px] normal-case">⛓ Blockchain</span>
            )}
          </div>
          {loading ? (
            <div className="h-8 w-24 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />
          ) : (
            <>
              <div className="text-3xl font-bold text-text-primary">
                {position && position.debt_value !== undefined
                  ? fmtBADM(position.debt_value)
                  : fmtBADM(totalBorrowed)}
              </div>
              <div className="text-xs text-text-tertiary">
                {position && position.debt_value > 0
                  ? `≈ ${fmtUSD(position.debt_value * 1)}`
                  : position
                    ? 'No active loans'
                    : `${activeLoans.length} active loan${activeLoans.length !== 1 ? 's' : ''}`}
              </div>
            </>
          )}
        </div>

        {/* Collateral */}
        <div className="card p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-text-tertiary uppercase tracking-wider">
            <span>Collateral</span>
            {position && position.collateral_eth > 0 && (
              <span className="text-[#00d4ff] text-[10px] normal-case">⛓ Blockchain</span>
            )}
          </div>
          {loading ? (
            <div className="h-8 w-24 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />
          ) : (
            <>
              <div className="text-3xl font-bold text-text-primary">
                {position && position.collateral_eth !== undefined 
                  ? fmtETH(position.collateral_eth) 
                  : fmtETH(totalCollateral / 2000)}
              </div>
              <div className="text-xs text-text-tertiary">
                {position && position.collateral_eth > 0
                  ? `≈ ${fmtUSD(position.collateral_value)}`
                  : position 
                    ? 'No collateral deposited'
                    : 'connecting...'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div
          className="p-4 rounded-lg border text-sm flex items-center gap-3 animate-pulse"
          style={{
            borderColor: '#22c55e55',
            background: '#22c55e15',
            color: '#22c55e',
          }}
        >
          <span className="text-xl">✓</span>
          <span className="flex-1 font-medium">{successMessage}</span>
          <button
            onClick={() => setShowSuccess(false)}
            className="text-xs opacity-70 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div
          className="p-4 rounded-lg border text-sm flex items-start gap-3"
          style={{
            borderColor: '#ff386055',
            background: '#ff386015',
            color: '#ff3860',
          }}
        >
          <span className="text-xl">✗</span>
          <div className="flex-1">
            <div className="font-bold mb-1">Transaction Failed</div>
            <div className="text-xs opacity-90">
              {error.message.includes('Credit score too low') && 'Your credit score is too low to borrow. Minimum 600 required.'}
              {error.message.includes('Not verified borrower') && 'You need BORROWER role. Contact admin to get verified.'}
              {error.message.includes('Exceeds LTV limit') && 'Borrowing amount exceeds your collateral limit.'}
              {error.message.includes('Not enough liquidity') && 'Pool has insufficient liquidity for this borrow amount.'}
              {error.message.includes('System Paused') && 'System is currently paused. Try again later.'}
              {error.message.includes('gas limit') && 'Transaction may revert. Check: 1) Credit score ≥ 600, 2) Sufficient collateral deposited, 3) BORROWER role assigned'}
              {!error.message.includes('Credit score') && 
               !error.message.includes('Not verified') && 
               !error.message.includes('Exceeds LTV') &&
               !error.message.includes('Not enough liquidity') &&
               !error.message.includes('System Paused') &&
               !error.message.includes('gas limit') &&
               error.message}
            </div>
          </div>
          <button
            onClick={() => reset?.()}
            className="text-xs opacity-70 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tx Status */}
      {(isSigning || isConfirming || isConfirmed || error) && (
        <div
          className="p-3 rounded-lg border text-sm flex items-center justify-between"
          style={{
            borderColor: error ? '#ff386055' : isConfirmed ? '#22c55e55' : '#00d4ff55',
            background: error ? '#ff386010' : isConfirmed ? '#22c55e10' : '#00d4ff10',
            color: error ? '#ff3860' : isConfirmed ? '#22c55e' : '#00d4ff',
          }}
        >
          <span>
            {isSigning && '⏳ Waiting for MetaMask signature…'}
            {isConfirming && !isSigning && '⛓ Broadcasting to Sepolia…'}
            {isConfirmed && '✓ Transaction confirmed'}
            {error && `✗ ${(error as Error)?.message ?? 'Transaction failed'}`}
          </span>
          {isConfirmed && txHash && (
            <a href={`${SEPOLIA}/tx/${txHash}`} target="_blank" rel="noreferrer" className="underline text-xs">
              View tx ↗
            </a>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[color:var(--color-border)]">
        {(['overview', 'loans', 'credit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-[#00d4ff] text-[#00d4ff]'
                : 'border-transparent text-text-tertiary hover:text-text-primary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Deposit */}
            <div className="card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-[#00d4ff] uppercase tracking-wider">Deposit Collateral</div>
                <div className="text-xs text-text-tertiary">
                  {availableETH > 0 ? `${availableETH.toFixed(4)} ETH` : 'Loading...'}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="ETH amount"
                  value={depositAmt}
                  onChange={(e) => setDepositAmt(e.target.value)}
                  className="flex-1 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-[#00d4ff] transition-colors"
                />
                <button
                  onClick={() => setDepositAmt(Math.max(0, availableETH - 0.01).toFixed(4))}
                  disabled={availableETH <= 0.01}
                  className="px-3 py-2 rounded text-xs font-bold border border-[#00d4ff55] text-[#00d4ff] hover:bg-[rgba(0,212,255,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  MAX
                </button>
              </div>
              {parseFloat(depositAmt) > 0 && parseFloat(depositAmt) > availableETH && (
                <div className="text-xs text-[#ff3860]">⚠ Insufficient balance</div>
              )}
              {parseFloat(depositAmt) > availableETH - 0.01 && parseFloat(depositAmt) <= availableETH && (
                <div className="text-xs text-[#f0a500]">⚠ Leave ETH for gas fees</div>
              )}
              <button
                onClick={() => {
                  const amt = parseFloat(depositAmt);
                  if (!depositAmt || amt <= 0) return alert('Enter a valid amount');
                  if (amt > availableETH) return alert(`Insufficient ETH. Available: ${availableETH.toFixed(4)} ETH`);
                  if (amt > availableETH - 0.01) return alert('Leave some ETH for gas fees (min 0.01 ETH)');
                  depositCollateral(depositAmt);
                }}
                disabled={!isConnected || isSigning || isConfirming || !depositAmt || parseFloat(depositAmt) <= 0 || parseFloat(depositAmt) > availableETH}
                className="w-full py-2 rounded text-xs font-bold bg-[#00d4ff] text-[color:var(--color-bg-primary)] hover:bg-[#00b8d9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSigning ? 'Signing…' : isConfirming ? 'Confirming…' : 'Deposit'}
              </button>
            </div>

            {/* Borrow */}
            <div className="card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-[#b367ff] uppercase tracking-wider">Borrow</div>
                <div className="text-xs text-text-tertiary">
                  Max: {maxBorrowable > 0 ? `${maxBorrowable.toFixed(2)} BADM` : '0.00 BADM'}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="BADM amount"
                  value={borrowAmt}
                  onChange={(e) => setBorrowAmt(e.target.value)}
                  className="flex-1 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-[#b367ff] transition-colors"
                />
                <button
                  onClick={() => setBorrowAmt(maxBorrowable.toFixed(2))}
                  disabled={maxBorrowable <= 0}
                  className="px-3 py-2 rounded text-xs font-bold border border-[#b367ff55] text-[#b367ff] hover:bg-[rgba(179,103,255,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  MAX
                </button>
              </div>
              {parseFloat(borrowAmt) > maxBorrowable && (
                <div className="text-xs text-[#ff3860]">⚠ Exceeds borrowing limit</div>
              )}
              {maxBorrowable <= 0 && (
                <div className="text-xs text-[#f0a500]">ℹ Deposit collateral first</div>
              )}
              {!meetsCreditRequirement && (
                <div className="text-xs text-[#ff3860]">⚠ Credit score too low (min {minCreditScore} required, current: {creditScore})</div>
              )}
              {position && position.collateral_eth === 0 && (
                <div className="text-xs text-[#ff3860]">⚠ No collateral deposited</div>
              )}
              <button
                onClick={() => {
                  const amt = parseFloat(borrowAmt);
                  if (!borrowAmt || amt <= 0) return alert('Enter a valid amount');
                  if (!position || position.collateral_eth === 0) return alert('Deposit collateral first');
                  if (amt > maxBorrowable) return alert(`Exceeds borrowing limit. Max: ${maxBorrowable.toFixed(2)} BADM`);
                  if (maxBorrowable <= 0) return alert('Insufficient collateral to borrow');
                  console.log('🔵 Attempting to borrow:', amt, 'BADM');
                  console.log('   - Collateral:', position?.collateral_eth, 'ETH');
                  console.log('   - Credit Score:', creditScore);
                  console.log('   - Max Borrowable:', maxBorrowable, 'BADM');
                  borrow(borrowAmt);
                }}
                disabled={!isConnected || isSigning || isConfirming || !borrowAmt || parseFloat(borrowAmt) <= 0 || parseFloat(borrowAmt) > maxBorrowable}
                className="w-full py-2 rounded text-xs font-bold bg-[#b367ff] text-white hover:bg-[#9b50e0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSigning ? 'Signing…' : isConfirming ? 'Confirming…' : 'Borrow'}
              </button>
            </div>

            {/* Repay */}
            <div className="card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-[#22c55e] uppercase tracking-wider">Repay</div>
                <div className="text-xs text-text-tertiary">
                  {availableBADM > 0 ? `${availableBADM.toFixed(2)} BADM` : '0.00 BADM'}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="BADM amount"
                  value={repayAmt}
                  onChange={(e) => setRepayAmt(e.target.value)}
                  className="flex-1 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-[#22c55e] transition-colors"
                />
                <button
                  onClick={() => setRepayAmt(Math.min(availableBADM, position?.debt_value || 0).toFixed(2))}
                  disabled={(position?.debt_value || 0) <= 0}
                  className="px-3 py-2 rounded text-xs font-bold border border-[#22c55e55] text-[#22c55e] hover:bg-[rgba(34,197,94,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  MAX
                </button>
              </div>
              {parseFloat(repayAmt) > availableBADM && (
                <div className="text-xs text-[#ff3860]">⚠ Insufficient BADM balance</div>
              )}
              {parseFloat(repayAmt) > (position?.debt_value || 0) && (
                <div className="text-xs text-[#f0a500]">⚠ Exceeds total debt</div>
              )}
              {(position?.debt_value || 0) > 0 && (
                <div className="text-xs text-[#00d4ff] bg-[rgba(0,212,255,0.05)] border border-[#00d4ff33] rounded p-2">
                  ℹ️ <span className="font-bold">Two steps:</span> (1) Click "Approve" to allow LendingPool to spend BADM → (2) Click "Repay" to repay loan and unlock collateral
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const amt = parseFloat(repayAmt);
                    if (!repayAmt || amt <= 0) return alert('Enter a valid amount');
                    if (amt > availableBADM) return alert(`Insufficient BADM. Available: ${availableBADM.toFixed(2)} BADM`);
                    approveRepay(repayAmt);
                  }}
                  disabled={!isConnected || isSigning || isConfirming || !repayAmt || parseFloat(repayAmt) <= 0 || parseFloat(repayAmt) > availableBADM}
                  className="flex-1 py-2 rounded text-xs font-bold border border-[#22c55e] text-[#22c55e] hover:bg-[rgba(34,197,94,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isSigning ? 'Signing…' : 'Approve'}
                </button>
                <button
                  onClick={() => {
                    const amt = parseFloat(repayAmt);
                    if (!repayAmt || amt <= 0) return alert('Enter a valid amount');
                    if (amt > availableBADM) return alert(`Insufficient BADM. Available: ${availableBADM.toFixed(2)} BADM`);
                    if (amt > (position?.debt_value || 0)) return alert(`Cannot repay more than debt: ${position?.debt_value.toFixed(2)} BADM`);
                    repay(repayAmt);
                  }}
                  disabled={!isConnected || isSigning || isConfirming || !repayAmt || parseFloat(repayAmt) <= 0 || parseFloat(repayAmt) > availableBADM}
                  className="flex-1 py-2 rounded text-xs font-bold bg-[#22c55e] text-[color:var(--color-bg-primary)] hover:bg-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isSigning ? 'Signing…' : 'Repay'}
                </button>
              </div>
            </div>
          </div>

          {/* Recent loans */}
          <div className="card">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[color:var(--color-border)]">
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Recent Loans</h2>
              <button onClick={() => setTab('loans')} className="text-xs text-[#00d4ff] hover:underline">
                View all →
              </button>
            </div>
            {loading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-8 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />)}
              </div>
            ) : loans.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-tertiary">No loans yet. Deposit collateral to get started.</div>
            ) : (
              <div className="divide-y divide-[color:var(--color-border)]">
                {loans.slice(0, 5).map((loan) => {
                  const s = loanStatusStyle[loan.status] ?? loanStatusStyle.active;
                  return (
                    <div key={loan.id} className="flex items-center justify-between px-6 py-3 hover:bg-[color:var(--color-bg-accent)] transition-colors">
                      <div className="flex items-center gap-3">
                        <span
                          className="px-2 py-0.5 rounded border text-xs font-bold"
                          style={{ color: s.color, borderColor: `${s.color}55`, background: `${s.color}15` }}
                        >
                          {loan.status.toUpperCase()}
                        </span>
                        <span className="text-xs text-text-tertiary">{loan.id?.slice(0, 12) || '—'}</span>
                      </div>
                      <div className="flex gap-6 text-xs text-text-tertiary">
                        <span>Borrowed: <span className="text-text-primary">{fmtUSD(loan.borrowed ?? 0)}</span></span>
                        <span>Collateral: <span className="text-text-primary">{fmtUSD(loan.collateral ?? 0)}</span></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Loans Tab ── */}
      {tab === 'loans' && (
        <div className="card">
          {loading ? (
            <div className="p-6 space-y-3">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />)}
            </div>
          ) : loans.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-tertiary">No loans found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    {['Status', 'Borrowed', 'Collateral', 'Interest Rate', 'Due Date'].map((h) => (
                      <th key={h} className="px-6 py-3 text-left text-text-tertiary uppercase tracking-wider font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)]">
                  {loans.map((loan) => {
                    const s = loanStatusStyle[loan.status] ?? loanStatusStyle.active;
                    return (
                      <tr key={loan.id} className="hover:bg-[color:var(--color-bg-accent)] transition-colors">
                        <td className="px-6 py-3">
                          <span className="px-2 py-0.5 rounded border font-bold" style={{ color: s.color, borderColor: `${s.color}55`, background: `${s.color}15` }}>
                            {loan.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-3 font-bold text-text-primary">{fmtUSD(loan.borrowed ?? 0)}</td>
                        <td className="px-6 py-3 text-text-secondary">{fmtUSD(loan.collateral ?? 0)}</td>
                        <td className="px-6 py-3 text-text-secondary">{((loan.interest_rate ?? 0) * 100).toFixed(2)}%</td>
                        <td className="px-6 py-3 text-text-tertiary">
                          {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Credit Tab ── */}
      {tab === 'credit' && (
        <div className="space-y-4">
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary uppercase tracking-wider">Your Credit Score</span>
              {!loading && (
                <span
                  className="px-2 py-0.5 rounded border text-xs font-bold"
                  style={{ color: scoreColor(creditScore), borderColor: `${scoreColor(creditScore)}55`, background: `${scoreColor(creditScore)}15` }}
                >
                  {scoreLabel(creditScore)}
                </span>
              )}
            </div>
            {loading ? (
              <div className="h-12 w-32 bg-[color:var(--color-bg-accent)] rounded animate-pulse" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold" style={{ color: scoreColor(creditScore) }}>{creditScore || '—'}</span>
                  <span className="text-sm text-text-tertiary">/ 850</span>
                </div>
                <div className="h-2 bg-[color:var(--color-bg-accent)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${scorePct}%`, background: scoreColor(creditScore) }} />
                </div>
                <div className="flex justify-between text-xs text-text-tertiary">
                  <span>300 — Very Poor</span><span>850 — Excellent</span>
                </div>
              </>
            )}
          </div>

          {/* Tips */}
          <div className="card p-5 bg-[rgba(0,212,255,0.03)] border border-[rgba(0,212,255,0.15)]">
            <div className="text-xs font-bold text-[#00d4ff] uppercase tracking-wider mb-3">💡 Improve Your Score</div>
            <ul className="space-y-1.5 text-xs text-text-secondary">
              {['Make loan repayments on time', 'Maintain a healthy collateral-to-debt ratio', 'Avoid defaults and liquidations', 'Build a consistent borrowing history'].map((tip) => (
                <li key={tip} className="flex items-start gap-2">
                  <span className="text-[#00d4ff] shrink-0">✓</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
