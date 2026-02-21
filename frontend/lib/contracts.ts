'use client';

/**
 * Contract addresses and ABIs for Sepolia-deployed smart contracts.
 * Used by wagmi hooks to call contract functions via MetaMask.
 */

export const LENDING_POOL_ADDRESS = '0x21ef825C55Ad215cD1BD438A64B59ec5C2028A3f' as const;
export const COLLATERAL_VAULT_ADDRESS = '0x4dA93A5782aE7eb5a36314CF818604283DA87875' as const;
export const CREDIT_REGISTRY_ADDRESS = '0x9449a34A5Cdeb02480936B605960b22aE049909b' as const;
export const PALLADIUM_ADDRESS = '0x983A613d5f224459D2919e0d9E9e77C72E032042' as const;
export const BADASSIUM_ADDRESS = '0x2960e22Ed3256E2bAfF233F5d03A20f597f14e07' as const;
export const LIQUIDITY_POOL_ADDRESS = '0x4dE122297CbB79287f826822F68ce77146956b75' as const;

// Minimal ABIs for frontend interactions (only the functions we call)
export const LENDING_POOL_ABI = [
    {
        inputs: [],
        name: 'depositCollateral',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
        name: 'borrow',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
        name: 'repay',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
        name: 'liquidate',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [],
        name: 'totalBorrowed',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getCurrentInterestRate',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'address', name: '', type: 'address' }],
        name: 'loans',
        outputs: [
            { internalType: 'uint256', name: 'amount', type: 'uint256' },
            { internalType: 'uint256', name: 'interestAccrued', type: 'uint256' },
            { internalType: 'uint256', name: 'lastUpdateTimestamp', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

export const ERC20_ABI = [
    {
        inputs: [
            { internalType: 'address', name: 'spender', type: 'address' },
            { internalType: 'uint256', name: 'amount', type: 'uint256' },
        ],
        name: 'approve',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [
            { internalType: 'address', name: 'owner', type: 'address' },
            { internalType: 'address', name: 'spender', type: 'address' },
        ],
        name: 'allowance',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

export const LIQUIDITY_POOL_ABI = [
    {
        inputs: [
            { internalType: 'uint256', name: 'amountA', type: 'uint256' },
            { internalType: 'uint256', name: 'amountB', type: 'uint256' },
        ],
        name: 'addLiquidity',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
        name: 'removeLiquidity',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { internalType: 'address', name: '_tokenIn', type: 'address' },
            { internalType: 'uint256', name: '_amountIn', type: 'uint256' },
        ],
        name: 'swap',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
] as const;
