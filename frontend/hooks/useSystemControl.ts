'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface SystemStatus {
  connected: boolean;
  block_number: number;
  paused: boolean;
  access_control_address: string;
}

export function useSystemControl() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useAuthStore((s) => s.token);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/system/status`);
      if (!res.ok) throw new Error('Failed to fetch system status');
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const pauseSystem = async () => {
    if (!token) {
      setError('Authentication required');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/system/pause`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to pause system');
      }

      const data = await res.json();
      await fetchStatus(); // Refresh status
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const unpauseSystem = async () => {
    if (!token) {
      setError('Authentication required');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/system/unpause`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to unpause system');
      }

      const data = await res.json();
      await fetchStatus(); // Refresh status
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll status every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  return {
    status,
    loading,
    error,
    pauseSystem,
    unpauseSystem,
    refreshStatus: fetchStatus,
  };
}
