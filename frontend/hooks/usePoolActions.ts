'use client';

import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { parseUnits } from 'viem';
import { sepolia } from 'wagmi/chains';
import {
    LIQUIDITY_POOL_ADDRESS, LIQUIDITY_POOL_ABI,
    PALLADIUM_ADDRESS, BADASSIUM_ADDRESS, ERC20_ABI,
} from '@/lib/contracts';

/**
 * Hook for LiquidityPool actions via MetaMask.
 * All writes trigger a MetaMask popup for user approval.
 */
export function usePoolActions() {
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

    // ── Approve Token A (Palladium) for LiquidityPool ──────────────
    const approveTokenA = (amount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            chainId: sepolia.id,
            address: PALLADIUM_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [LIQUIDITY_POOL_ADDRESS, parseUnits(amount, 18)],
        });
    };

    // ── Approve Token B (Badassium) for LiquidityPool ──────────────
    const approveTokenB = (amount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            chainId: sepolia.id,
            address: BADASSIUM_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [LIQUIDITY_POOL_ADDRESS, parseUnits(amount, 18)],
        });
    };

    // ── Add Liquidity ──────────────────────────────────────────────
    const addLiquidity = (amountA: string, amountB: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            chainId: sepolia.id,
            address: LIQUIDITY_POOL_ADDRESS,
            abi: LIQUIDITY_POOL_ABI,
            functionName: 'addLiquidity',
            args: [parseUnits(amountA, 18), parseUnits(amountB, 18)],
            gas: BigInt(500000),
        });
    };

    // ── Remove Liquidity ───────────────────────────────────────────
    const removeLiquidity = (shares: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            chainId: sepolia.id,
            address: LIQUIDITY_POOL_ADDRESS,
            abi: LIQUIDITY_POOL_ABI,
            functionName: 'removeLiquidity',
            args: [parseUnits(shares, 18)],
            gas: BigInt(500000),
        });
    };

    // ── Approve + Swap (user picks direction) ──────────────────────
    const approveSwapToken = (tokenIn: 'PAL' | 'BAD', amount: string) => {
        const addr = tokenIn === 'PAL' ? PALLADIUM_ADDRESS : BADASSIUM_ADDRESS;
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            chainId: sepolia.id,
            address: addr,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [LIQUIDITY_POOL_ADDRESS, parseUnits(amount, 18)],
        });
    };

    const swap = (tokenIn: 'PAL' | 'BAD', amount: string) => {
        const tokenAddr = tokenIn === 'PAL' ? PALLADIUM_ADDRESS : BADASSIUM_ADDRESS;
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            chainId: sepolia.id,
            address: LIQUIDITY_POOL_ADDRESS,
            abi: LIQUIDITY_POOL_ABI,
            functionName: 'swap',
            args: [tokenAddr, parseUnits(amount, 18)],
            gas: BigInt(500000),
        });
    };

    return {
        approveTokenA,
        approveTokenB,
        addLiquidity,
        removeLiquidity,
        approveSwapToken,
        swap,
        reset,

        address,
        isConnected,
        isSigning,
        isConfirming,
        isConfirmed,
        txHash,
        error: writeError || receiptError,
    };
}
