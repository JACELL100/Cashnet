'use client';

import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount, usePublicClient } from 'wagmi';
import { parseEther, parseUnits, maxUint256 } from 'viem';
import { sepolia } from 'wagmi/chains';
import { useEnsureSepolia } from '@/hooks/useEnsureSepolia';
import { LENDING_POOL_ADDRESS, LENDING_POOL_ABI, BORROW_TOKEN_ADDRESS, ERC20_ABI } from '@/lib/contracts';

const IS_LIQUIDATABLE_ABI = [{
    type: 'function', name: 'isLiquidatable', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: '', type: 'bool' }],
}] as const;

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
    const ensureSepolia = useEnsureSepolia();

    const {
        writeContract,
        writeContractAsync,
        data: txHash,
        isPending: isSigning,
        error: writeError,
        reset,
    } = useWriteContract();

    // Separate writer for ERC-20 approvals so they don't trigger the page's "confirmed" handling
    const { writeContractAsync: writeApproveAsync, error: approveError, reset: resetApprove } = useWriteContract();
    const [isApproving, setIsApproving] = useState(false);
    // Errors raised before the wallet popup (RPC reads, reverted approvals) so pages can show them
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
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== 'success') throw new Error('PLDM approval transaction reverted');
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
    const depositCollateral = async (ethAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
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
    const withdrawCollateral = async (ethAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
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
    const borrow = async (tokenAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
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
    const approveRepay = async (tokenAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
        writeContract({
            chainId: sepolia.id,
            address: BORROW_TOKEN_ADDRESS, // LendingPool.borrowToken() (Palladium / PLDM)
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [LENDING_POOL_ADDRESS, parseUnits(tokenAmount, 18)],
            gas: BigInt(100000), // Explicit gas limit
        });
    };

    const repay = async (tokenAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
        writeContract({
            chainId: sepolia.id,
            address: LENDING_POOL_ADDRESS,
            abi: LENDING_POOL_ABI,
            functionName: 'repay',
            args: [parseUnits(tokenAmount, 18)],
            gas: BigInt(300000), // Explicit gas limit
        });
    };

    /** Approve PLDM if needed (waits for it to be mined), then repay `tokenAmount`, in one click. */
    const approveAndRepay = async (tokenAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
        try {
            const amount = parseUnits(tokenAmount, 18);
            await ensurePldmAllowance(amount);
            await writeContractAsync({
                chainId: sepolia.id,
                address: LENDING_POOL_ADDRESS,
                abi: LENDING_POOL_ABI,
                functionName: 'repay',
                args: [amount],
                gas: BigInt(300000),
            });
        } catch (e) {
            fail(e);
        }
    };

    /** Repay the full debt including interest accrued until the tx is mined (approves debt + 0.1%). */
    const repayAll = async () => {
        if (!isConnected || !address) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
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
            fail(e);
        }
    };

    // ── Lender: Supply PLDM (approve + supply → cnPLDM shares) ──────
    const supply = async (tokenAmount: string) => {
        if (!isConnected) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
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
            fail(e);
        }
    };

    // ── Lender: Withdraw (burn cnPLDM shares → PLDM) ─────────────────
    const withdraw = async (shares: string | bigint) => {
        if (!isConnected) return alert('Connect your wallet first');
        if (!(await ensureSepolia())) return;
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
    // Returns the tx hash once signed, or undefined if nothing was sent.
    const liquidate = async (userAddress: string, repayAmount?: string): Promise<`0x${string}` | undefined> => {
        if (!isConnected) { alert('Connect your wallet first'); return; }
        if (!(await ensureSepolia())) return;
        try {
            const user = userAddress as `0x${string}`;
            if (!publicClient) throw new Error('No RPC client');
            const liquidatable = (await publicClient.readContract({
                address: LENDING_POOL_ADDRESS,
                abi: IS_LIQUIDATABLE_ABI,
                functionName: 'isLiquidatable',
                args: [user],
            })) as boolean;
            if (!liquidatable) { alert('This position is healthy (health factor ≥ 1), so it cannot be liquidated yet.'); return; }
            let amount: bigint;
            if (repayAmount && parseFloat(repayAmount) > 0) {
                amount = parseUnits(repayAmount, 18);
            } else {
                amount = (await readDebt(user)) / BigInt(2);
                if (amount === BigInt(0)) { alert('Borrower has no debt'); return; }
            }
            await ensurePldmAllowance(amount);
            return await writeContractAsync({
                chainId: sepolia.id,
                address: LENDING_POOL_ADDRESS,
                abi: LENDING_POOL_ABI,
                functionName: 'liquidate',
                args: [user, amount],
                gas: BigInt(400000),
            });
        } catch (e) {
            fail(e);
        }
    };

    return {
        // Actions
        depositCollateral,
        withdrawCollateral,
        borrow,
        approveRepay,
        repay,
        approveAndRepay,
        repayAll,
        supply,
        withdraw,
        liquidate,
        reset: () => { reset(); resetApprove(); setActionError(null); },

        // State
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
