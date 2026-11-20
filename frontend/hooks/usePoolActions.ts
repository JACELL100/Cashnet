'use client';

import { useWriteContract, useWaitForTransactionReceipt, useAccount, usePublicClient } from 'wagmi';
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
    const publicClient = usePublicClient({ chainId: sepolia.id });

    const {
        writeContract,
        writeContractAsync,
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

    /** Quote via LiquidityPool.getAmountOut (0.3% fee included). */
    const quoteSwap = async (tokenIn: 'PAL' | 'BAD', amount: string): Promise<bigint> => {
        if (!publicClient) throw new Error('No RPC client');
        const tokenAddr = tokenIn === 'PAL' ? PALLADIUM_ADDRESS : BADASSIUM_ADDRESS;
        return (await publicClient.readContract({
            address: LIQUIDITY_POOL_ADDRESS,
            abi: LIQUIDITY_POOL_ABI,
            functionName: 'getAmountOut',
            args: [tokenAddr, parseUnits(amount, 18)],
        })) as bigint;
    };

    /** Swap with slippage protection: minAmountOut = on-chain quote - `slippageBps` (default 0.5%). */
    const swap = async (tokenIn: 'PAL' | 'BAD', amount: string, slippageBps = 50) => {
        const tokenAddr = tokenIn === 'PAL' ? PALLADIUM_ADDRESS : BADASSIUM_ADDRESS;
        if (!isConnected) return alert('Connect your wallet first');
        try {
            const quote = await quoteSwap(tokenIn, amount);
            if (quote === BigInt(0)) return alert('Swap amount too small or pool empty');
            const minAmountOut = (quote * BigInt(10000 - slippageBps)) / BigInt(10000);
            await writeContractAsync({
                chainId: sepolia.id,
                address: LIQUIDITY_POOL_ADDRESS,
                abi: LIQUIDITY_POOL_ABI,
                functionName: 'swap',
                args: [tokenAddr, parseUnits(amount, 18), minAmountOut],
                gas: BigInt(500000),
            });
        } catch (e) {
            console.error('swap failed', e);
        }
    };

    return {
        approveTokenA,
        approveTokenB,
        addLiquidity,
        removeLiquidity,
        approveSwapToken,
        quoteSwap,
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
