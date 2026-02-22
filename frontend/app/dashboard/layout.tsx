'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import CascadeBanner from '@/components/CascadeBanner';
import { ToastContainer } from '@/components/Toast';
import LoadingHex from '@/components/LoadingHex';
import { useAuthStore, UserRole } from '@/store/authStore';
import { useSimulationStore } from '@/store/simulationStore';

// Role-based default dashboard paths
const roleDefaultPaths: Record<UserRole, string> = {
  ADMIN: '/dashboard',
  AUDITOR: '/dashboard/audit',
  LENDER: '/dashboard/lending',
  BORROWER: '/dashboard/credit',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
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
      router.replace('/');
      return;
    }

    // Set the current user ID in simulation store for user-specific data
    setUserId(user.id);

    // Auto-redirect removed to allow all users to access the main dashboard.
  }, [isAuthenticated, user, hasHydrated, router, setUserId, pathname]);

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[color:var(--color-bg-primary)]">
        <LoadingHex />
      </div>
    );
  }

  // If hydrated but not authenticated, Next.js will handle the transition
  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[color:var(--color-bg-primary)]">
        <LoadingHex />
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
