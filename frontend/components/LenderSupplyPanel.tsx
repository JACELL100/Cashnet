'use client';

import React, { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { formatUnits, parseUnits } from 'viem';
import { useLendingActions } from '@/hooks/useLendingActions';
import { LENDING_POOL_ADDRESS, LENDING_POOL_ABI, BORROW_TOKEN_ADDRESS, ERC20_ABI } from '@/lib/contracts';

const SEPOLIA = 'https://sepolia.etherscan.io';
const fmt = (v: bigint | undefined, dp = 4) =>
  v === undefined ? '—' : Number(formatUnits(v, 18)).toLocaleString(undefined, { maximumFractionDigits: dp });

/**
 * Lender Supply / Withdraw panel for LendingPool v2.
 * Supplying PLDM mints interest-bearing cnPLDM shares; withdrawing burns shares for
 * shares * totalAssets / totalSupply PLDM (limited by idle pool cash).
 */
export default function LenderSupplyPanel() {
  const { supply, withdraw, address, isConnected, isSigning, isApproving, isConfirming, isConfirmed, txHash, error, reset } =
    useLendingActions();
  const [supplyAmt, setSupplyAmt] = useState('');
  const [withdrawShares, setWithdrawShares] = useState('');

  const pool = { chainId: sepolia.id, address: LENDING_POOL_ADDRESS, abi: LENDING_POOL_ABI } as const;
  const userQuery = { enabled: !!address, refetchInterval: 10000 };
  const shares = useReadContract({
    ...pool, functionName: 'balanceOf', args: address ? [address] : undefined, query: userQuery,
  });
  const underlying = useReadContract({
    ...pool, functionName: 'balanceOfUnderlying', args: address ? [address] : undefined, query: userQuery,
  });
  const supplyApr = useReadContract({ ...pool, functionName: 'getSupplyRateBps', query: { refetchInterval: 10000 } });
  const liquidity = useReadContract({ ...pool, functionName: 'getAvailableLiquidity', query: { refetchInterval: 10000 } });
  const pldm = useReadContract({
    chainId: sepolia.id,
    address: BORROW_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  const sharesVal = shares.data as bigint | undefined;
  const underlyingVal = underlying.data as bigint | undefined;
  const pldmVal = pldm.data as bigint | undefined;

  useEffect(() => {
    if (!isConfirmed) return;
    setSupplyAmt('');
    setWithdrawShares('');
    shares.refetch(); underlying.refetch(); pldm.refetch(); liquidity.refetch();
    const t = setTimeout(() => reset(), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed]);

  const busy = !isConnected || isSigning || isConfirming;
  let withdrawPreview = '';
  try {
    if (withdrawShares && sharesVal && sharesVal > BigInt(0) && underlyingVal !== undefined) {
      const s = parseUnits(withdrawShares, 18);
      withdrawPreview = `≈ ${fmt((s * underlyingVal) / sharesVal)} PLDM`;
    }
  } catch { /* invalid input */ }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Supply PLDM (Earn Interest)</h3>
        <span className="text-xs font-mono text-text-tertiary">
          Supply APR{' '}
          <span className="text-[#22c55e] font-bold">
            {supplyApr.data !== undefined ? (Number(supplyApr.data as bigint) / 100).toFixed(2) : '—'}%
          </span>
          {' · '}Pool liquidity {fmt(liquidity.data as bigint | undefined, 0)} PLDM
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs font-mono">
        <div className="p-3 rounded bg-[color:var(--color-bg-accent)]">
          <div className="text-text-tertiary uppercase mb-1">Wallet PLDM</div>
          <div className="text-text-primary font-bold">{fmt(pldmVal, 2)}</div>
        </div>
        <div className="p-3 rounded bg-[color:var(--color-bg-accent)]">
          <div className="text-text-tertiary uppercase mb-1">Your cnPLDM shares</div>
          <div className="text-text-primary font-bold">{fmt(sharesVal)}</div>
        </div>
        <div className="p-3 rounded bg-[color:var(--color-bg-accent)]">
          <div className="text-text-tertiary uppercase mb-1">Current value</div>
          <div className="text-[#22c55e] font-bold">{fmt(underlyingVal)} PLDM</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="form-label text-xs">Supply amount (PLDM)</label>
          <div className="flex gap-2">
            <input
              type="number" min="0" placeholder="e.g. 1000" value={supplyAmt}
              onChange={(e) => setSupplyAmt(e.target.value)}
              className="form-input flex-1 min-w-0 text-xs font-mono"
            />
            <button
              onClick={() => pldmVal !== undefined && setSupplyAmt(formatUnits(pldmVal, 18))}
              disabled={!pldmVal}
              className="btn ghost text-xs px-3"
            >MAX</button>
          </div>
          <button
            onClick={() => supply(supplyAmt)}
            disabled={busy || !supplyAmt || parseFloat(supplyAmt) <= 0}
            className="btn accent w-full text-xs py-2"
          >
            {isApproving ? 'Approving PLDM…' : isSigning ? 'Signing…' : isConfirming ? 'Confirming…' : 'Approve & Supply'}
          </button>
        </div>
        <div className="space-y-2">
          <label className="form-label text-xs">Withdraw shares (cnPLDM) {withdrawPreview && <span className="text-text-tertiary">{withdrawPreview}</span>}</label>
          <div className="flex gap-2">
            <input
              type="number" min="0" placeholder="shares" value={withdrawShares}
              onChange={(e) => setWithdrawShares(e.target.value)}
              className="form-input flex-1 min-w-0 text-xs font-mono"
            />
            <button
              onClick={() => sharesVal !== undefined && setWithdrawShares(formatUnits(sharesVal, 18))}
              disabled={!sharesVal}
              className="btn ghost text-xs px-3"
            >MAX</button>
          </div>
          <button
            onClick={() => {
              // Use the exact on-chain balance for MAX so no dust shares remain
              const exact = sharesVal !== undefined && withdrawShares === formatUnits(sharesVal, 18);
              withdraw(exact ? sharesVal! : withdrawShares);
            }}
            disabled={busy || !withdrawShares || parseFloat(withdrawShares) <= 0}
            className="btn outline w-full text-xs py-2"
          >
            {isSigning ? 'Signing…' : isConfirming ? 'Confirming…' : 'Withdraw'}
          </button>
        </div>
      </div>

      {(error || (isConfirmed && txHash)) && (
        <div className={`text-xs font-mono ${error ? 'text-danger' : 'text-success'}`}>
          {error
            ? `✗ ${(error as Error).message.split('\n')[0]}`
            : <>✓ Confirmed — <a href={`${SEPOLIA}/tx/${txHash}`} target="_blank" rel="noreferrer" className="underline">view tx ↗</a></>}
        </div>
      )}
      {!isConnected && <div className="text-xs font-mono text-warn">⚠ Connect wallet to supply or withdraw</div>}
    </div>
  );
}
