'use client';

import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { parseEther, parseUnits } from 'viem';
import { LENDING_POOL_ADDRESS, LENDING_POOL_ABI, PALLADIUM_ADDRESS, ERC20_ABI } from '@/lib/contracts';

/**
 * Hook that exposes lending actions which trigger MetaMask approval popups.
 * Each action sends a real transaction to the Sepolia LendingPool contract.
 */
export function useLendingActions() {
    const { address, isConnected } = useAccount();

    const {
        writeContract,
        data: txHash,
        isPending: isSigning,
        error: writeError,
        reset,
    } = useWriteContract();

    const {
        isLoading: isConfirming,
        isSuccess: isConfirmed,
        error: receiptError,
    } = useWaitForTransactionReceipt({ hash: txHash });

    // ── Deposit Collateral (send ETH) ────────────────────────────────
    const depositCollateral = (ethAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            address: LENDING_POOL_ADDRESS,
            abi: LENDING_POOL_ABI,
            functionName: 'depositCollateral',
            value: parseEther(ethAmount),
        });
    };

    // ── Borrow Tokens ────────────────────────────────────────────────
    const borrow = (tokenAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            address: LENDING_POOL_ADDRESS,
            abi: LENDING_POOL_ABI,
            functionName: 'borrow',
            args: [parseUnits(tokenAmount, 18)],
        });
    };

    // ── Repay Loan (requires prior ERC-20 approve) ──────────────────
    const approveRepay = (tokenAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            address: PALLADIUM_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [LENDING_POOL_ADDRESS, parseUnits(tokenAmount, 18)],
        });
    };

    const repay = (tokenAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            address: LENDING_POOL_ADDRESS,
            abi: LENDING_POOL_ABI,
            functionName: 'repay',
            args: [parseUnits(tokenAmount, 18)],
        });
    };

    // ── Liquidate a Borrower ─────────────────────────────────────────
    const liquidate = (userAddress: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            address: LENDING_POOL_ADDRESS,
            abi: LENDING_POOL_ABI,
            functionName: 'liquidate',
            args: [userAddress as `0x${string}`],
        });
    };

    return {
        // Actions
        depositCollateral,
        borrow,
        approveRepay,
        repay,
        liquidate,
        reset,

        // State
        address,
        isConnected,
        isSigning,
        isConfirming,
        isConfirmed,
        txHash,
        error: writeError || receiptError,
    };
}
