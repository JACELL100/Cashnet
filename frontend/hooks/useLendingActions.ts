'use client';

import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount, usePublicClient } from 'wagmi';
import { parseEther, parseUnits, maxUint256 } from 'viem';
import { sepolia } from 'wagmi/chains';
import { LENDING_POOL_ADDRESS, LENDING_POOL_ABI, BORROW_TOKEN_ADDRESS, ERC20_ABI } from '@/lib/contracts';

/**
 * Hook that exposes lending actions which trigger MetaMask approval popups.
 * Each action sends a real transaction to the Sepolia LendingPool (v2) contract.
 *
 * `txHash` / `isConfirmed` track the main action only. Flows that need a PLDM
 * allowance (supply, liquidate, repayAll) send the approve first through a separate
 * writer, wait for it to be mined, then send the action.
 */
export function useLendingActions() {
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

    // Separate writer for ERC-20 approvals so they don't trigger the page's "confirmed" handling
    const { writeContractAsync: writeApproveAsync, error: approveError } = useWriteContract();
    const [isApproving, setIsApproving] = useState(false);

    const {
        isLoading: isConfirming,
        isSuccess: isConfirmed,
        error: receiptError,
    } = useWaitForTransactionReceipt({ hash: txHash });

    /** Approve PLDM for the LendingPool if the current allowance is below `amount`; waits for the receipt. */
    const ensurePldmAllowance = async (amount: bigint) => {
        if (!address || !publicClient) throw new Error('Wallet not connected');
        const allowance = (await publicClient.readContract({
            address: BORROW_TOKEN_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [address, LENDING_POOL_ADDRESS],
        })) as bigint;
        if (allowance >= amount) return;
        setIsApproving(true);
        try {
            const hash = await writeApproveAsync({
                chainId: sepolia.id,
                address: BORROW_TOKEN_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [LENDING_POOL_ADDRESS, amount],
                gas: BigInt(100000),
            });
            await publicClient.waitForTransactionReceipt({ hash });
        } finally {
            setIsApproving(false);
        }
    };

    const readDebt = async (user: `0x${string}`) => {
        if (!publicClient) throw new Error('No RPC client');
        return (await publicClient.readContract({
            address: LENDING_POOL_ADDRESS,
            abi: LENDING_POOL_ABI,
            functionName: 'getUserDebt',
            args: [user],
        })) as bigint;
    };

    // ── Deposit Collateral (send ETH) ────────────────────────────────
    const depositCollateral = (ethAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            chainId: sepolia.id,
            address: LENDING_POOL_ADDRESS,
            abi: LENDING_POOL_ABI,
            functionName: 'depositCollateral',
            value: parseEther(ethAmount),
            gas: BigInt(200000), // Explicit gas limit
        });
    };

    // ── Withdraw Collateral (must keep debt within max LTV) ──────────
    const withdrawCollateral = (ethAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            chainId: sepolia.id,
            address: LENDING_POOL_ADDRESS,
            abi: LENDING_POOL_ABI,
            functionName: 'withdrawCollateral',
            args: [parseEther(ethAmount)],
            gas: BigInt(250000),
        });
    };

    // ── Borrow Tokens ────────────────────────────────────────────────
    const borrow = (tokenAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            chainId: sepolia.id,
            address: LENDING_POOL_ADDRESS,
            abi: LENDING_POOL_ABI,
            functionName: 'borrow',
            args: [parseUnits(tokenAmount, 18)],
            gas: BigInt(300000), // Explicit gas limit to prevent "gas limit too high" error
        });
    };

    // ── Repay Loan (requires prior ERC-20 approve) ──────────────────
    const approveRepay = (tokenAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            chainId: sepolia.id,
            address: BORROW_TOKEN_ADDRESS, // LendingPool.borrowToken() (Palladium / PLDM)
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [LENDING_POOL_ADDRESS, parseUnits(tokenAmount, 18)],
            gas: BigInt(100000), // Explicit gas limit
        });
    };

    const repay = (tokenAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            chainId: sepolia.id,
            address: LENDING_POOL_ADDRESS,
            abi: LENDING_POOL_ABI,
            functionName: 'repay',
            args: [parseUnits(tokenAmount, 18)],
            gas: BigInt(300000), // Explicit gas limit
        });
    };

    /** Repay the full debt including interest accrued until the tx is mined (approves debt + 0.1%). */
    const repayAll = async () => {
        if (!isConnected || !address) return alert('Connect your wallet first');
        try {
            const debt = await readDebt(address);
            if (debt === BigInt(0)) return alert('No outstanding debt');
            await ensurePldmAllowance(debt + debt / BigInt(1000) + BigInt(1));
            await writeContractAsync({
                chainId: sepolia.id,
                address: LENDING_POOL_ADDRESS,
                abi: LENDING_POOL_ABI,
                functionName: 'repay',
                args: [maxUint256], // contract caps at current debt
                gas: BigInt(300000),
            });
        } catch (e) {
            console.error('repayAll failed', e);
        }
    };

    // ── Lender: Supply PLDM (approve + supply → cnPLDM shares) ──────
    const supply = async (tokenAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        try {
            const amount = parseUnits(tokenAmount, 18);
            await ensurePldmAllowance(amount);
            await writeContractAsync({
                chainId: sepolia.id,
                address: LENDING_POOL_ADDRESS,
                abi: LENDING_POOL_ABI,
                functionName: 'supply',
                args: [amount],
                gas: BigInt(250000),
            });
        } catch (e) {
            console.error('supply failed', e);
        }
    };

    // ── Lender: Withdraw (burn cnPLDM shares → PLDM) ─────────────────
    const withdraw = (shares: string | bigint) => {
        if (!isConnected) return alert('Connect your wallet first');
        writeContract({
            chainId: sepolia.id,
            address: LENDING_POOL_ADDRESS,
            abi: LENDING_POOL_ABI,
            functionName: 'withdraw',
            args: [typeof shares === 'bigint' ? shares : parseUnits(shares, 18)],
            gas: BigInt(250000),
        });
    };

    // ── Liquidate a Borrower (partial: max 50% of debt, +5% ETH bonus) ──
    /** `repayAmount` in PLDM; defaults to 50% of the borrower's current debt (the close factor). */
    const liquidate = async (userAddress: string, repayAmount?: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        try {
            const user = userAddress as `0x${string}`;
            let amount: bigint;
            if (repayAmount && parseFloat(repayAmount) > 0) {
                amount = parseUnits(repayAmount, 18);
            } else {
                amount = (await readDebt(user)) / BigInt(2);
                if (amount === BigInt(0)) return alert('Borrower has no debt');
            }
            await ensurePldmAllowance(amount);
            await writeContractAsync({
                chainId: sepolia.id,
                address: LENDING_POOL_ADDRESS,
                abi: LENDING_POOL_ABI,
                functionName: 'liquidate',
                args: [user, amount],
                gas: BigInt(400000),
            });
        } catch (e) {
            console.error('liquidate failed', e);
        }
    };

    return {
        // Actions
        depositCollateral,
        withdrawCollateral,
        borrow,
        approveRepay,
        repay,
        repayAll,
        supply,
        withdraw,
        liquidate,
        reset,

        // State
        address,
        isConnected,
        isSigning: isSigning || isApproving,
        isApproving,
        isConfirming,
        isConfirmed,
        txHash,
        error: writeError || approveError || receiptError,
    };
}
