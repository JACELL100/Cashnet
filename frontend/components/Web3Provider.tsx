'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, darkTheme, connectorsForWallets } from '@rainbow-me/rainbowkit';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { ReactNode, useState, useEffect } from 'react';
import {
  injectedWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';

// Only include WalletConnect when a real project ID is configured.
// The relay server rejects invalid IDs, which causes an unhandled
// "Connection interrupted while trying to subscribe" rejection.
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const hasValidProjectId = wcProjectId && wcProjectId !== 'demo-project-id' && wcProjectId !== 'YOUR_PROJECT_ID';

// Prioritise the injected (browser-extension) connector so MetaMask opens
// instantly without waiting for the WalletConnect relay handshake.
const walletGroups = [
  {
    groupName: 'Installed',
    wallets: [injectedWallet, metaMaskWallet, coinbaseWallet],
  },
  ...(hasValidProjectId
    ? [{ groupName: 'Others', wallets: [walletConnectWallet] }]
    : []),
];

const connectors = connectorsForWallets(walletGroups, {
  appName: 'Cashnet',
  projectId: wcProjectId || 'unused',
});

// Configure wagmi (wagmi 2.x compatible)
// ssr: true defers hydration state-updates to useEffect, preventing
// "Cannot update a component while rendering a different component"
// Configure wagmi — Sepolia only (all gas fees in Sepolia ETH)
const config = createConfig({
  ssr: true,
  connectors,
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(),
  },
});

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  const [mounted, setMounted] = useState(false);

  // Create query client per component instance with optimized settings
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        retry: false,
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000,   // 10 minutes (renamed from cacheTime in v5)
      },
    },
  }));

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={sepolia}
          theme={darkTheme({
            accentColor: '#10b981',
            accentColorForeground: 'white',
            borderRadius: 'medium',
          })}
        >
          {mounted ? children : null}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
