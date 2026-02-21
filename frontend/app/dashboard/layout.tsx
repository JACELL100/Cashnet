'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import CascadeBanner from '@/components/CascadeBanner';
import { ToastContainer } from '@/components/Toast';
import { useAuthStore } from '@/store/authStore';
import { useSimulationStore } from '@/store/simulationStore';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const setUserId = useSimulationStore((state) => state.setUserId);

  useEffect(() => {
    // Wait for store to hydrate before checking authentication
    if (!hasHydrated) {
      return;
    }

    // Check if user is authenticated
    if (!isAuthenticated || !user) {
      console.log('[DASHBOARD] User not authenticated, redirecting to login');
      router.push('/login');
      return;
    }
    // Set the current user ID in simulation store for user-specific data
    console.log('[DASHBOARD] User authenticated, setting user ID:', user.id);
    setUserId(user.id);
  }, [isAuthenticated, user, hasHydrated, router, setUserId]);

  // Show loading state while waiting for hydration
  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[color:var(--color-bg-primary)]">
        <div className="text-center">
          <div className="text-4xl font-bold text-accent font-mono mb-4">RE</div>
          <p className="text-text-secondary font-mono">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[color:var(--color-bg-primary)]">
        <div className="text-center">
          <div className="text-4xl font-bold text-accent font-mono mb-4">RE</div>
          <p className="text-text-secondary font-mono">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--color-bg-primary)]">
      <Sidebar />
      <Header />
      <CascadeBanner />
      
      {/* Main content area */}
      <main className="ml-16 md:ml-60 pt-16 md:pt-16 pb-8">
        <div className="p-6 max-w-7xl">
          {children}
        </div>
      </main>

      <ToastContainer />
    </div>
  );
}
