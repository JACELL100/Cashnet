import { create } from 'zustand';

export interface BorrowerPosition {
  id: string;
  wallet: string;
  collateral: number;
  borrowed: number;
  healthFactor: number;
  liquidationPrice: number;
  status: 'healthy' | 'warning' | 'danger';
  creditScore?: number;
}

interface LendingState {
  borrowers: BorrowerPosition[];
  totalDeposits: number;
  totalBorrows: number;
  utilizationRate: number;
  borrowApr: number;
  totalSupplied: number;
  collateralRatio: number;
  liquidationThreshold: number;
  cascadeEvents: Array<{ timestamp: number; borrower: string; event: string }>;
  setBorrowers: (borrowers: BorrowerPosition[]) => void;
  updateBorrower: (id: string, updates: Partial<BorrowerPosition>) => void;
  setMetrics: (metrics: {
    totalDeposits: number;
    totalBorrows: number;
    utilizationRate: number;
    borrowApr?: number;
    totalSupplied?: number;
  }) => void;
  addCascadeEvent: (event: { timestamp: number; borrower: string; event: string }) => void;
}

export const useLendingStore = create<LendingState>((set) => ({
  borrowers: [],
  totalDeposits: 10000000,
  totalBorrows: 7500000,
  utilizationRate: 0.75,
  borrowApr: 0.02,
  totalSupplied: 2000000,
  collateralRatio: 1.5,
  liquidationThreshold: 0.8,
  cascadeEvents: [],

  setBorrowers: (borrowers: BorrowerPosition[]) => set({ borrowers }),

  updateBorrower: (id: string, updates: Partial<BorrowerPosition>) =>
    set((state) => ({
      borrowers: state.borrowers.map((b) =>
        b.id === id ? { ...b, ...updates } : b
      ),
    })),

  setMetrics: (metrics: {
    totalDeposits: number;
    totalBorrows: number;
    utilizationRate: number;
    borrowApr?: number;
    totalSupplied?: number;
  }) => set((state) => ({
    ...metrics,
    borrowApr: metrics.borrowApr ?? state.borrowApr,
    totalSupplied: metrics.totalSupplied ?? state.totalSupplied
  })),

  addCascadeEvent: (event: { timestamp: number; borrower: string; event: string }) =>
    set((state) => ({
      cascadeEvents: [event, ...state.cascadeEvents].slice(0, 50),
    })),
}));
