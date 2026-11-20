'use client';

/**
 * Contract addresses and ABIs for Sepolia-deployed smart contracts.
 * Used by wagmi hooks to call contract functions via MetaMask.
 */

// LendingPool v2 (Phase 2): Chainlink-priced, interest-bearing cnPLDM supply shares, partial liquidation
export const LENDING_POOL_ADDRESS = '0x1D549DB252Ff426f921c6b7855E32796d63b939A' as const;
export const COLLATERAL_VAULT_ADDRESS = '0x4dA93A5782aE7eb5a36314CF818604283DA87875' as const;
export const CREDIT_REGISTRY_ADDRESS = '0x9449a34A5Cdeb02480936B605960b22aE049909b' as const;
export const PALLADIUM_ADDRESS = '0x983A613d5f224459D2919e0d9E9e77C72E032042' as const;
export const BADASSIUM_ADDRESS = '0x2960e22Ed3256E2bAfF233F5d03A20f597f14e07' as const;
// LiquidityPool v2: swap(tokenIn, amountIn, minAmountOut) + getAmountOut quote
export const LIQUIDITY_POOL_ADDRESS = '0x6E1359e90a30607F54D8DdBb312E9Cb5dfF0C954' as const;
// Token lent by LendingPool (borrow / repay). MUST equal LendingPool.borrowToken() on-chain — currently Palladium (PLDM).
export const BORROW_TOKEN_ADDRESS = PALLADIUM_ADDRESS;
export const BORROW_TOKEN_SYMBOL = 'PLDM' as const;

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
        inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
        name: 'withdrawCollateral',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { internalType: 'address', name: 'user', type: 'address' },
            { internalType: 'uint256', name: 'repayAmount', type: 'uint256' },
        ],
        name: 'liquidate',
        outputs: [
            { internalType: 'uint256', name: 'repaid', type: 'uint256' },
            { internalType: 'uint256', name: 'seized', type: 'uint256' },
        ],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
        name: 'supply',
        outputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
        name: 'withdraw',
        outputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    // ── Views ──
    {
        inputs: [],
        name: 'totalBorrowed', // current total debt incl. accrued interest
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getCurrentInterestRate', // whole-percent borrow APR (legacy)
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getBorrowRateBps',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getSupplyRateBps',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getAvailableLiquidity',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'getEthPrice', // Chainlink ETH/USD, 1e18 = $1
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
        name: 'getUserDebt',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
        name: 'getAccountData',
        outputs: [
            { internalType: 'uint256', name: 'collateralEth', type: 'uint256' },
            { internalType: 'uint256', name: 'collateralUsd', type: 'uint256' },
            { internalType: 'uint256', name: 'debt', type: 'uint256' },
            { internalType: 'uint256', name: 'maxLtv', type: 'uint256' },
            { internalType: 'uint256', name: 'healthFactor', type: 'uint256' },
            { internalType: 'uint256', name: 'maxBorrowable', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
        name: 'balanceOf', // cnPLDM supply shares
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'address', name: 'lender', type: 'address' }],
        name: 'balanceOfUnderlying', // PLDM value of a lender's shares
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
        name: 'convertToAssets',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
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
            { internalType: 'uint256', name: '_minAmountOut', type: 'uint256' },
        ],
        name: 'swap',
        outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
        stateMutability: 'nonpayable',
        type: 'function',
    },
    {
        inputs: [
            { internalType: 'address', name: '_tokenIn', type: 'address' },
            { internalType: 'uint256', name: '_amountIn', type: 'uint256' },
        ],
        name: 'getAmountOut',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;
