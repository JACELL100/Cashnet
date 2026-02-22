import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'BORROWER' | 'LENDER' | 'ADMIN' | 'AUDITOR';

export interface User {
  id: string;
  walletAddress?: string;
  name?: string;
  email?: string;
  role: UserRole;
  plan: 'starter' | 'pro' | 'enterprise';
  createdAt: number;
  avatar?: string;
  token?: string; // JWT from backend (for Admin/Auditor)
}

// Use deployed backend by default, can override with env var
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://cash-net.onrender.com';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  token: string | null;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  loginWithWallet: (walletAddress: string, signature: string, name?: string, email?: string, role?: UserRole) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (role: UserRole) => Promise<void>;
  loginWithGoogleCredential: (credential: string) => Promise<{ role: UserRole }>;
  refreshSession: (getFirebaseIdToken: () => Promise<string>) => Promise<boolean>;
  signup: (email: string, password: string, name: string, role?: UserRole) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,
      token: null,
      _hasHydrated: false,

      setHasHydrated: (state: boolean) => {
        set({ _hasHydrated: state });
      },

      loginWithWallet: async (walletAddress: string, signature: string, name?: string, email?: string, role?: UserRole) => {
        set({ loading: true, error: null });
        try {
          const verifyResponse = await fetch(`${API_BASE_URL}/api/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wallet_address: walletAddress,
              signature,
              name,
              email,
              role: role || 'BORROWER',
            }),
          });

          if (!verifyResponse.ok) {
            const errorText = await verifyResponse.text();
            console.error('[STORE] Verify error:', errorText);
            throw new Error('Signature verification failed');
          }

          const authData = await verifyResponse.json();

          const userRole: UserRole = authData.role || role || 'BORROWER';
          const user: User = {
            id: walletAddress,
            walletAddress: authData.wallet_address,
            name: authData.name || undefined,
            email: authData.email || undefined,
            role: userRole,
            plan: userRole === 'ADMIN' ? 'enterprise' : userRole === 'LENDER' ? 'pro' : 'starter',
            createdAt: new Date(authData.created_at).getTime(),
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${walletAddress}`,
          };

          set({
            user,
            token: authData.token,
            isAuthenticated: true,
            loading: false,
          });
        } catch (error) {
          console.error('[STORE] Login error:', error);
          set({
            error: error instanceof Error ? error.message : 'Wallet authentication failed',
            loading: false,
          });
          throw error;
        }
      },

      login: async (email: string, password: string) => {
        set({ loading: true, error: null });
        try {
          await new Promise((resolve) => setTimeout(resolve, 800));
          const mockUser: User = {
            id: `user_${Math.random().toString(36).substr(2, 9)}`,
            email,
            name: email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1),
            role: 'BORROWER',
            plan: 'starter',
            createdAt: Date.now(),
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
          };
          set({ user: mockUser, isAuthenticated: true, loading: false });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Login failed', loading: false });
          throw error;
        }
      },

      loginWithGoogleCredential: async (credential: string) => {
        set({ loading: true, error: null });
        try {
          const res = await fetch(`${API_BASE_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential }),
          });

          if (res.status === 403) {
            const body = await res.json();
            set({ loading: false });
            const err = new Error(body?.detail?.message ?? 'Access denied');
            (err as any).code = 'access_denied';
            throw err;
          }

          if (!res.ok) {
            set({ loading: false });
            throw new Error('Authentication failed');
          }

          const data = await res.json();
          const role = data.role as UserRole;

          const user: User = {
            id: data.uid,
            email: data.email,
            name: data.name,
            role,
            plan: role === 'ADMIN' ? 'enterprise' : 'starter',
            createdAt: Date.now(),
            avatar: data.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.email}`,
            token: data.token,
          };

          set({ user, token: data.token, isAuthenticated: true, loading: false });
          return { role };
        } catch (error) {
          set({ loading: false });
          throw error;
        }
      },

      refreshSession: async (getFirebaseIdToken: () => Promise<string>) => {
        try {
          const idToken = await getFirebaseIdToken();
          const res = await fetch(`${API_BASE_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: idToken }),
          });
          if (!res.ok) throw new Error('Refresh failed');
          const data = await res.json();
          const role = data.role as UserRole;
          set((state) => ({
            user: state.user ? { ...state.user, token: data.token } : null,
            token: data.token,
          }));
          return true;
        } catch {
          return false;
        }
      },

      loginWithGoogle: async (role: UserRole) => {
        set({ loading: true, error: null });
        try {
          await new Promise((resolve) => setTimeout(resolve, 900));
          const googleNames: Record<UserRole, string> = {
            ADMIN: 'System Admin', AUDITOR: 'Lead Auditor', LENDER: 'Lender', BORROWER: 'Borrower',
          };
          const mockUser: User = {
            id: `${role.toLowerCase()}_${Math.random().toString(36).substr(2, 9)}`,
            email: `${role.toLowerCase()}@cashnet.io`,
            name: googleNames[role],
            role,
            plan: role === 'ADMIN' ? 'enterprise' : role === 'LENDER' ? 'pro' : 'starter',
            createdAt: Date.now(),
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${role}`,
          };
          set({ user: mockUser, isAuthenticated: true, loading: false });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Google auth failed', loading: false });
          throw error;
        }
      },

      signup: async (email: string, password: string, name: string, role: UserRole = 'BORROWER') => {
        set({ loading: true, error: null });
        try {
          await new Promise((resolve) => setTimeout(resolve, 800));
          const mockUser: User = {
            id: `user_${Math.random().toString(36).substr(2, 9)}`,
            email,
            name,
            role,
            plan: role === 'LENDER' ? 'pro' : 'starter',
            createdAt: Date.now(),
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
          };
          set({ user: mockUser, isAuthenticated: true, loading: false });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Signup failed', loading: false });
          throw error;
        }
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false, error: null });
      },

      setUser: (user: User | null) => {
        set({ user, isAuthenticated: !!user });
      },

      setError: (error: string | null) => {
        set({ error });
      },
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
