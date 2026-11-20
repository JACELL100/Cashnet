'use client';

import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount, usePublicClient } from 'wagmi';
import { parseUnits } from 'viem';
import { sepolia } from 'wagmi/chains';
import { useEnsureSepolia } from '@/hooks/useEnsureSepolia';
import {
    LIQUIDITY_POOL_ADDRESS, LIQUIDITY_POOL_ABI,
    PALLADIUM_ADDRESS, BADASSIUM_ADDRESS, ERC20_ABI,
} from '@/lib/contracts';

/**
 * Hook for LiquidityPool actions via MetaMask.
 * addLiquidity and swap approve the needed tokens first (through a separate writer, waiting
 * for each approval to be mined), so `txHash` / `isConfirmed` only track the main action.
 */
export function usePoolActions() {
    const { address, isConnected } = useAccount();
    const publicClient = usePublicClient({ chainId: sepolia.id });
    const ensureSepolia = useEnsureSepolia();

    const {
        writeContract,
        writeContractAsync,
        data: txHash,
        isPending: isSigning,
        error: writeError,
        reset,
    } = useWriteContract();

    const { writeContractAsync: writeApproveAsync, error: approveError, reset: resetApprove } = useWriteContract();
    const [isApproving, setIsApproving] = useState(false);
    const [actionError, setActionError] = useState<Error | null>(null);
    const fail = (e: unknown) => {
        console.error(e);
        setActionError(e instanceof Error ? e : new Error(String(e)));
    };

    const {
        isLoading: isConfirming,
        isSuccess: isConfirmed,
        error: receiptError,
    } = useWaitForTransactionReceipt({ hash: txHash });

    const tokenAddress = (t: 'PAL' | 'BAD') => (t === 'PAL' ? PALLADIUM_ADDRESS : BADASSIUM_ADDRESS);

    /** Approve `token` for the LiquidityPool if the allowance is below `amount`; waits for the receipt. */
    const ensureAllowance = async (token: `0x${string}`, amount: bigint) => {
        if (!address || !publicClient) throw new Error('Wallet not connected');
        const allowance = (await publicClient.readContract({
            address: token,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, LIQUIDITY_POOL_ADDRESS],
        })) as bigint;
        if (allowance >= amount) return;
        setIsApproving(true);
        try {
            const hash = await writeApproveAsync({
                chainId: sepolia.id,
                address: token,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [LIQUIDITY_POOL_ADDRESS, amount],
                gas: BigInt(100000),
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== 'success') throw new Error('Token approval transaction reverted');
        } finally {
            setIsApproving(false);
        }
    };

    // ── Manual approvals (kept for pages that still show separate Approve buttons) ──
    const approveToken = async (token: `0x${string}`, amount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
        try {
            await ensureAllowance(token, parseUnits(amount, 18));
        } catch (e) {
            fail(e);
        }
    };
    const approveTokenA = (amount: string) => approveToken(PALLADIUM_ADDRESS, amount);
    const approveTokenB = (amount: string) => approveToken(BADASSIUM_ADDRESS, amount);
    const approveSwapToken = (tokenIn: 'PAL' | 'BAD', amount: string) => approveToken(tokenAddress(tokenIn), amount);

    // ── Add Liquidity (approves PLDM + BADM as needed, then adds) ─────
    const addLiquidity = async (amountA: string, amountB: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
        try {
            const a = parseUnits(amountA, 18);
            const b = parseUnits(amountB, 18);
            await ensureAllowance(PALLADIUM_ADDRESS, a);
            await ensureAllowance(BADASSIUM_ADDRESS, b);
            await writeContractAsync({
                chainId: sepolia.id,
                address: LIQUIDITY_POOL_ADDRESS,
                abi: LIQUIDITY_POOL_ABI,
                functionName: 'addLiquidity',
                args: [a, b],
                gas: BigInt(500000),
            });
        } catch (e) {
            fail(e);
        }
    };

    // ── Remove Liquidity ───────────────────────────────────────────
    const removeLiquidity = async (shares: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
        writeContract({
            chainId: sepolia.id,
            address: LIQUIDITY_POOL_ADDRESS,
            abi: LIQUIDITY_POOL_ABI,
            functionName: 'removeLiquidity',
            args: [parseUnits(shares, 18)],
            gas: BigInt(500000),
        });
    };

    /** Quote via LiquidityPool.getAmountOut (0.3% fee included). */
    const quoteSwap = async (tokenIn: 'PAL' | 'BAD', amount: string): Promise<bigint> => {
        if (!publicClient) throw new Error('No RPC client');
        return (await publicClient.readContract({
            address: LIQUIDITY_POOL_ADDRESS,
            abi: LIQUIDITY_POOL_ABI,
            functionName: 'getAmountOut',
            args: [tokenAddress(tokenIn), parseUnits(amount, 18)],
        })) as bigint;
    };

    /** Approve if needed, then swap with slippage protection: minAmountOut = quote - `slippageBps` (default 0.5%). */
    const swap = async (tokenIn: 'PAL' | 'BAD', amount: string, slippageBps = 50) => {
        if (!isConnected) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
        try {
            const tokenAddr = tokenAddress(tokenIn);
            const amountIn = parseUnits(amount, 18);
            const quote = await quoteSwap(tokenIn, amount);
            if (quote === BigInt(0)) return alert('Swap amount too small or pool empty');
            await ensureAllowance(tokenAddr, amountIn);
            const minAmountOut = (quote * BigInt(10000 - slippageBps)) / BigInt(10000);
            await writeContractAsync({
                chainId: sepolia.id,
                address: LIQUIDITY_POOL_ADDRESS,
                abi: LIQUIDITY_POOL_ABI,
                functionName: 'swap',
                args: [tokenAddr, amountIn, minAmountOut],
                gas: BigInt(500000),
            });
        } catch (e) {
            fail(e);
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
        reset: () => { reset(); resetApprove(); setActionError(null); },

        address,
        isConnected,
        isSigning: isSigning || isApproving,
        isApproving,
        isConfirming,
        isConfirmed,
        txHash,
        error: writeError || approveError || actionError || receiptError,
    };
}
