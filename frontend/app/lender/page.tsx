'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { useLendingStore } from '@/store/lendingStore';
import { useLendingActions } from '@/hooks/useLendingActions';
import { useReadContract } from 'wagmi';
import { PALLADIUM_ADDRESS, BADASSIUM_ADDRESS, ERC20_ABI, LENDING_POOL_ADDRESS, LENDING_POOL_ABI } from '@/lib/contracts';
import { formatUnits } from 'viem';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://cashnet-hee7.onrender.com';

const healthColor = (h: number) => {
  if (h >= 1.5) return '#22c55e';
  if (h >= 1.2) return '#f0a500';
  return '#ff3860';
};

const statusColor: Record<string, string> = {
  healthy: '#22c55e', warning: '#f0a500', danger: '#ff3860',
};

export default function LenderPage() {
  const borrowers = useLendingStore((state) => state.borrowers);
  const totalDeposits = useLendingStore((state) => state.totalDeposits);
  const totalBorrows = useLendingStore((state) => state.totalBorrows);
  const utilizationRate = useLendingStore((state) => state.utilizationRate);
  const borrowApr = useLendingStore((state) => state.borrowApr);

  const setBorrowers = useLendingStore((state) => state.setBorrowers);
  const setMetrics = useLendingStore((state) => state.setMetrics);

  // MetaMask contract actions
  const {
    liquidate, reset,
    isConnected, isSigning, isConfirming, isConfirmed, txHash, error,
  } = useLendingActions();

  // Form state for action inputs
  const [depositAmt, setDepositAmt] = useState('0.01');
  const [borrowAmt, setBorrowAmt] = useState('100');
  const [repayAmt, setRepayAmt] = useState('50');
  const [supplyApr, setSupplyApr] = useState(0); // fraction, from /api/lending/metrics

  // Read user's on-chain token balances
  const { address } = useLendingActions();
  const { data: pldmBalanceRaw } = useReadContract({
    address: PALLADIUM_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  });
  const { data: badmBalanceRaw } = useReadContract({
    address: BADASSIUM_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  });

  const pldmBalance = pldmBalanceRaw ? Number(formatUnits(pldmBalanceRaw as bigint, 18)) : 0;
  const badmBalance = badmBalanceRaw ? Number(formatUnits(badmBalanceRaw as bigint, 18)) : 0;

  // Fetch borrowers + metrics from API
  const fetchLendingData = useCallback(async () => {
    try {
      const [borrowersRes, metricsRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/lending/borrowers`),
        fetch(`${API_URL}/api/lending/metrics`),
      ]);

      if (borrowersRes.status === 'fulfilled' && borrowersRes.value.ok) {
        const json = await borrowersRes.value.json();
        const items = (json.data ?? []).map((b: any) => ({
          id: b.id ?? b.wallet,
          wallet: b.wallet,
          collateral: b.collateral_usd ?? 0, // USD (Chainlink-priced)
          borrowed: b.debt_value ?? 0,
          healthFactor: b.health_factor ?? 999,
          creditScore: b.credit_score ?? 500,
          // ETH price at which the position becomes liquidatable (debt > collateral * (maxLTV + 5%))
          liquidationPrice: b.collateral_value && b.debt_value && b.max_ltv
            ? Math.round((b.debt_value * 100) / (b.collateral_value * (b.max_ltv + 5)))
            : 0,
          status: b.at_risk
            ? 'danger' as const
            : b.health_factor < 1.8
              ? 'warning' as const
              : 'healthy' as const,
        }));
        setBorrowers(items);
      }

      if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
        const json = await metricsRes.value.json();
        const m = json.data ?? {};
        setMetrics({
          totalDeposits: m.total_collateral ?? 0,
          totalBorrows: m.total_debt ?? 0,
          utilizationRate: (m.utilization_rate ?? 0) / 100,
          borrowApr: m.borrow_apr ?? 0,
          totalSupplied: m.total_supplied ?? 0,
        });
        setSupplyApr(m.supply_apr ?? 0);
      }
    } catch { /* retry on next tick */ }
  }, [setBorrowers, setMetrics]);

  // Initial load + polling
  useEffect(() => {
    fetchLendingData();
    const interval = setInterval(fetchLendingData, 4000);
    return () => clearInterval(interval);
  }, [fetchLendingData]);

  // Clear forms after successful transaction
  useEffect(() => {
    if (isConfirmed) {
      setDepositAmt(''); setBorrowAmt(''); setRepayAmt('');
      fetchLendingData();
    }
  }, [isConfirmed, fetchLendingData]);

  // Derived KPIs — the connected lender's real position in the LendingPool (cnPLDM shares → PLDM)
  const { data: mySuppliedRaw } = useReadContract({
    address: LENDING_POOL_ADDRESS,
    abi: LENDING_POOL_ABI,
    functionName: 'balanceOfUnderlying',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  });
  const mySupplied = mySuppliedRaw ? Number(formatUnits(mySuppliedRaw as bigint, 18)) : 0;
  const monthlyInterest = (mySupplied * supplyApr) / 12;

  const atRiskCount = borrowers.filter((b) => b.status === 'danger' || b.status === 'warning').length;

  const kpis = [
    { label: 'Pool Liquidity (PLDM)', value: `${totalDeposits >= 1000000 ? (totalDeposits / 1000000).toFixed(2) + 'M' : totalDeposits >= 1000 ? (totalDeposits / 1000).toFixed(1) + 'K' : totalDeposits.toFixed(0)}`, sub: 'Palladium in pool', color: '#b367ff' },
    { label: 'My PLDM Balance', value: `${pldmBalance >= 1000 ? (pldmBalance / 1000).toFixed(1) + 'K' : pldmBalance.toFixed(1)}`, sub: isConnected ? 'On-chain balance' : 'Connect wallet', color: '#22c55e' },
    { label: 'Active Loans', value: `${borrowers.length}`, sub: `${atRiskCount} at-risk`, color: '#00d4ff' },
    { label: 'My BADM Balance', value: `${badmBalance >= 1000 ? (badmBalance / 1000).toFixed(1) + 'K' : badmBalance.toFixed(1)}`, sub: isConnected ? 'Badassium tokens' : 'Connect wallet', color: '#f0a500' },
  ];

  // total_collateral from /api/lending/metrics is already idle pool cash (supplied − borrowed)
  const availableLiquidity = totalDeposits;
  const avgLoanSize = borrowers.length > 0 ? totalBorrows / borrowers.length : 0;

  const poolStats = [
    { label: 'Total Pool Reserves (PLDM)', value: `${totalDeposits >= 1000000 ? (totalDeposits / 1000000).toFixed(2) + 'M' : totalDeposits >= 1000 ? (totalDeposits / 1000).toFixed(1) + 'K' : totalDeposits.toFixed(0)}`, color: '#b367ff' },
    { label: 'Available Liquidity (PLDM)', value: `${availableLiquidity >= 1000000 ? (availableLiquidity / 1000000).toFixed(2) + 'M' : availableLiquidity >= 1000 ? (availableLiquidity / 1000).toFixed(1) + 'K' : availableLiquidity.toFixed(0)}`, color: '#22c55e' },
    { label: 'Utilization Rate', value: `${(utilizationRate * 100).toFixed(1)}%`, color: '#00d4ff' },
    { label: 'Borrow APR', value: `${(borrowApr * 100).toFixed(1)}%`, color: '#f0a500' },
  ];

  const sortedBorrowers = [...borrowers].sort((a, b) => a.healthFactor - b.healthFactor);

  return (
    <div className="space-y-8 animate-fadeUp">
      <div>
        <h1 className="text-2xl font-bold font-mono text-text-primary">Lender Dashboard</h1>
        <p className="text-sm text-text-tertiary font-mono mt-1">Liquidity overview · Loan portfolio · Borrower health · <span className="text-[#22c55e]">Live on Sepolia</span></p>
      </div>

      {/* ── Transaction Status Bar ── */}
      {(isSigning || isConfirming || isConfirmed || error) && (
        <div className={`rounded-lg border p-3 font-mono text-xs flex items-center gap-2 ${error ? 'border-red-500/40 bg-red-500/10 text-red-400'
          : isConfirmed ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
            : 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300'
          }`}>
          {isSigning && '⏳ Waiting for MetaMask approval...'}
          {isConfirming && '⛏️ Transaction submitted, confirming on Sepolia...'}
          {isConfirmed && (
            <>
              ✅ Transaction confirmed!{' '}
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline text-[#b367ff]"
              >
                View on Etherscan ↗
              </a>
            </>
          )}
          {error && `❌ ${(error as any)?.shortMessage || error.message}`}
          <button onClick={reset} className="ml-auto text-text-tertiary hover:text-text-primary">✕</button>
        </div>
      )}



      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-4 transition-all hover:border-[color:var(--color-border-hover)]">
            <div className="text-xs font-mono text-text-tertiary mb-2">{k.label}</div>
            <div className="text-3xl font-bold font-mono transition-colors" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs font-mono text-text-tertiary mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pool Stats */}
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
          <h2 className="text-sm font-mono font-bold text-text-primary mb-4">Pool Reserves</h2>
          <div className="space-y-4">
            {poolStats.map((s) => (
              <div key={s.label}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-mono text-text-tertiary">{s.label}</span>
                  <span className="text-xs font-mono font-bold transition-colors" style={{ color: s.color }}>{s.value}</span>
                </div>
                <div className="h-1.5 bg-[color:var(--color-bg-primary)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: '100%', background: `${s.color}40` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[color:var(--color-border)]">
            <div className="text-xs font-mono text-text-tertiary mb-2">Utilization</div>
            <div className="h-2 bg-[color:var(--color-bg-primary)] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${utilizationRate > 0.8 ? 'bg-[#ff3860]' : 'bg-[#b367ff]'}`} style={{ width: `${utilizationRate * 100}%` }} />
            </div>
            <div className="text-xs font-mono text-text-tertiary mt-1">
              <span className="text-[#b367ff]">{(utilizationRate * 100).toFixed(1)}%</span> utilized
            </div>
          </div>
        </div>

        {/* My supply position (on-chain) */}
        <div className="lg:col-span-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
          <h2 className="text-sm font-mono font-bold text-text-primary mb-4">My Supply Position</h2>
          {!isConnected ? (
            <p className="text-xs font-mono text-text-tertiary">Connect your wallet to see the PLDM you have supplied.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
              <div>
                <div className="text-xs text-text-tertiary">Supplied (incl. interest)</div>
                <div className="text-xl font-bold text-[#b367ff]">{mySupplied.toLocaleString(undefined, { maximumFractionDigits: 2 })} PLDM</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Supply APR</div>
                <div className="text-xl font-bold text-[#00d4ff]">{(supplyApr * 100).toFixed(2)}%</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">Est. interest / month</div>
                <div className="text-xl font-bold text-[#22c55e]">+{monthlyInterest.toLocaleString(undefined, { maximumFractionDigits: 4 })} PLDM</div>
              </div>
            </div>
          )}
          <p className="text-[10px] font-mono text-text-tertiary mt-4">
            Read live from LendingPool.balanceOfUnderlying. Supply APR rises as more of the pool is borrowed; it is 0% while nothing is borrowed.
          </p>
        </div>
      </div>

      {/* Loan Portfolio Table */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono font-bold text-text-primary">Active Loan Portfolio</h2>
          <div className="text-xs font-mono text-text-tertiary">
            Sorted by Risk
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-text-tertiary border-b border-[color:var(--color-border)]">
                <th className="text-left py-2 pr-6">Borrower</th>
                <th className="text-left py-2 pr-6">Borrowed amount</th>
                <th className="text-left py-2 pr-6">Collateral amount</th>
                <th className="text-left py-2 pr-6">Health Factor</th>
                <th className="text-left py-2 pr-6">Status</th>
                <th className="text-left py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedBorrowers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-text-tertiary italic">
                    [No active borrowers — Start the simulation engine]
                  </td>
                </tr>
              )}
              {sortedBorrowers.slice(0, 10).map((l, i) => (
                <tr key={l.id || i} className="border-b border-[color:var(--color-border)] last:border-0 hover:bg-[color:var(--color-bg-primary)] transition-colors">
                  <td className="py-3 pr-6 text-text-primary">{l.wallet}</td>
                  <td className="py-3 pr-6 text-[#b367ff] font-bold">${(l.borrowed / 1000).toFixed(1)}K</td>
                  <td className="py-3 pr-6 text-[#22c55e]">
                    ${(l.collateral / 1000).toFixed(1)}K
                  </td>
                  <td className="py-3 pr-6">
                    <div className="flex items-center gap-2">
                      <span className="transition-colors w-10" style={{ color: healthColor(l.healthFactor) }}>
                        {l.healthFactor.toFixed(2)}
                      </span>
                      <div className="w-16 h-1.5 bg-[color:var(--color-bg-primary)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((l.healthFactor / 3) * 100, 100)}%`, background: healthColor(l.healthFactor) }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-6">
                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold transition-colors" style={{ color: statusColor[l.status] || '#22c55e', border: `1px solid ${statusColor[l.status] || '#22c55e'}`, background: `${statusColor[l.status] || '#22c55e'}1a` }}>
                      {l.status}
                    </span>
                  </td>
                  <td className="py-3">
                    {l.status === 'danger' && (
                      <button
                        onClick={() => liquidate(l.wallet)}
                        disabled={!isConnected || isSigning}
                        className="px-2 py-1 rounded text-[10px] font-mono font-bold bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 disabled:opacity-40 transition-all"
                      >
                        Liquidate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedBorrowers.length > 10 && (
            <div className="mt-4 text-center">
              <button className="text-xs font-mono text-text-tertiary hover:text-text-primary transition-colors">
                View {sortedBorrowers.length - 10} more...
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
