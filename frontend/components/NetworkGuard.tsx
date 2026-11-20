'use client';

import { useAccount, useSwitchChain } from 'wagmi';
import { sepolia } from 'wagmi/chains';

/** Banner shown when the connected wallet is not on Sepolia; offers a one-click switch. */
export function NetworkGuard() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === undefined || chainId === sepolia.id) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-[#ff3860] text-white text-sm font-mono px-4 py-2 flex flex-wrap items-center justify-center gap-3">
      <span>
        Your wallet is on the wrong network (chain {chainId}). CashNet runs on Sepolia — transactions use SepoliaETH, not real ETH.
      </span>
      <button
        onClick={() => switchChain({ chainId: sepolia.id })}
        disabled={isPending}
        className="bg-white text-[#ff3860] font-bold px-3 py-1 rounded disabled:opacity-60"
      >
        {isPending ? 'Switching…' : 'Switch to Sepolia'}
      </button>
    </div>
  );
}
