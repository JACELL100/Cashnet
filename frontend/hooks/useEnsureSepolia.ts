'use client';

import { useAccount, useSwitchChain } from 'wagmi';
import { sepolia } from 'wagmi/chains';

/**
 * Returns a function that switches the connected wallet to Sepolia when it is on another
 * network, so transactions are paid in SepoliaETH. Resolves false if the user refused.
 */
export function useEnsureSepolia() {
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  return async (): Promise<boolean> => {
    if (chainId === sepolia.id) return true;
    try {
      await switchChainAsync({ chainId: sepolia.id });
      return true;
    } catch {
      alert('Please switch your wallet to the Sepolia test network. CashNet only runs on Sepolia and uses SepoliaETH.');
      return false;
    }
  };
}
