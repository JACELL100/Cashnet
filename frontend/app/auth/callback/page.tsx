'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginWithSupabaseSession = useAuthStore((state) => state.loginWithSupabaseSession);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const finishLogin = async () => {
      const next = searchParams.get('next') === '/auditor' ? '/auditor' : '/admin';
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        if (!cancelled) setError(sessionError?.message ?? 'No Supabase session was created');
        return;
      }
      try {
        const { role } = await loginWithSupabaseSession(data.session.access_token);
        if (!cancelled) {
          if (next === '/auditor' && role !== 'AUDITOR' && role !== 'ADMIN') {
            setError('Your account is not provisioned as an auditor.');
          } else {
            router.replace(next);
          }
        }
      } catch (loginError) {
        if (!cancelled) setError(loginError instanceof Error ? loginError.message : 'Authentication failed');
      }
    };
    void finishLogin();
    return () => { cancelled = true; };
  }, [loginWithSupabaseSession, router, searchParams]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#060a18] text-white">
      <p className="text-sm text-[#8b95a5]">{error ?? 'Completing Google sign in...'}</p>
    </main>
  );
}
