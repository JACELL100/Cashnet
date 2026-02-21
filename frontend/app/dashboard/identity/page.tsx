'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import { useUIStore } from '@/store/uiStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Participant {
  id: string;
  wallet: string;
  role: string;
  label: string;
  registered: boolean;
  status: 'active' | 'inactive' | 'suspended';
  joinedDate: string;
}

const ROLES = [
  'Admin',
  'Liquidator',
  'Market Maker',
  'Trader',
  'Oracle',
  'Governor',
];

export default function IdentityPage() {
  const addToast = useUIStore((state) => state.addToast);

  const [participants, setParticipants] = useState<Participant[]>([]);

  const fetchParticipants = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/participants`);
      if (res.ok) {
        const json = await res.json();
        // Assuming the backend returns { data: [...] } or an array directly
        setParticipants(json.data ?? json ?? []);
      }
    } catch {
      // silently retry or ignore
    }
  }, []);

  useEffect(() => {
    fetchParticipants();
    const interval = setInterval(fetchParticipants, 5000);
    return () => clearInterval(interval);
  }, [fetchParticipants]);

  const [formData, setFormData] = useState({
    wallet: '',
    label: '',
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const handleRegisterParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.wallet || !formData.label) {
      addToast({
        message: 'Please fill in all fields',
        severity: 'warning',
      });
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: formData.wallet,
          label: formData.label,
          role: 'Trader',
        }),
      });

      if (res.ok) {
        addToast({
          message: `${formData.label} registered successfully`,
          severity: 'success',
        });
        setFormData({ wallet: '', label: '' });
        fetchParticipants(); // Refresh list after successful registration
      } else {
        addToast({
          message: 'Failed to register participant',
          severity: 'error',
        });
      }
    } catch {
      addToast({
        message: 'Error communicating with server',
        severity: 'error',
      });
    }
  };

  const filteredParticipants = participants.filter((p) => {
    const matchesSearch =
      p.wallet.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.label.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = !roleFilter || p.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-8 animate-fadeUp">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold font-mono text-text-primary mb-2">
          Identity Layer
        </h1>
        <p className="text-text-secondary text-sm font-mono">
          Manage participants and permissions
        </p>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-xs font-mono text-text-tertiary uppercase mb-2">
            Contract Address
          </div>
          <div className="text-sm font-mono text-accent break-all">
            0xabc123...def456
          </div>
          <button className="text-xs text-accent hover:text-accent-light mt-2 font-mono">
            Copy →
          </button>
        </div>

        <div className="card">
          <div className="text-xs font-mono text-text-tertiary uppercase mb-2">
            Oracle Contract
          </div>
          <div className="text-sm font-mono text-accent break-all">
            0xfed789...ghi012
          </div>
          <button className="text-xs text-accent hover:text-accent-light mt-2 font-mono">
            Copy →
          </button>
        </div>

        <div className="card">
          <div className="text-xs font-mono text-text-tertiary uppercase mb-2">
            Emergency Action
          </div>
          <button className="btn danger w-full text-xs py-2 mt-1">
            PAUSE SYSTEM
          </button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Registration Form */}
        <div className="lg:col-span-1">
          <div className="card space-y-4">
            <h3 className="font-mono font-bold text-text-primary uppercase text-sm">
              Register Participant
            </h3>
            <form onSubmit={handleRegisterParticipant} className="space-y-3">
              <div className="space-y-2">
                <label className="form-label text-xs">Wallet Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={formData.wallet}
                  onChange={(e) =>
                    setFormData({ ...formData, wallet: e.target.value })
                  }
                  className="form-input text-xs"
                />
              </div>
              <div className="space-y-2">
                <label className="form-label text-xs">Label</label>
                <input
                  type="text"
                  placeholder="Name or ID"
                  value={formData.label}
                  onChange={(e) =>
                    setFormData({ ...formData, label: e.target.value })
                  }
                  className="form-input text-xs"
                />
              </div>
              <button type="submit" className="btn accent w-full text-xs py-2">
                Register
              </button>
            </form>

            {/* Connect Wallet */}
            <div className="pt-4 border-t border-[color:var(--color-border)]">
              <button className="btn outline w-full text-xs py-2 flex items-center justify-center gap-2">
                <span>🦊</span>
                <span>Connect MetaMask</span>
              </button>
            </div>
          </div>

          {/* Role Matrix */}
          <div className="card mt-6 space-y-4">
            <h3 className="font-mono font-bold text-text-primary uppercase text-sm">
              Role Permissions
            </h3>
            <div className="space-y-2 text-xs">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center justify-between p-2 bg-[color:var(--color-bg-accent)] rounded">
                  <span className="font-mono text-text-primary">{role}</span>
                  <div className="flex gap-1">
                    <span className="text-success">✓</span>
                    <span className="text-success">✓</span>
                    <span className="text-danger">✗</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Participants Table */}
        <div className="lg:col-span-2 space-y-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search wallet or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-input flex-1 text-xs"
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="form-input text-xs"
              >
                <option value="">All Roles</option>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card overflow-hidden">
            <DataTable
              columns={[
                { header: 'Wallet', accessor: 'wallet', className: 'font-mono text-xs' },
                { header: 'Name', accessor: 'label', className: 'font-mono text-xs' },
                { header: 'Role', accessor: 'role', className: 'font-mono text-xs' },
                {
                  header: 'Status',
                  accessor: (row) => (
                    <Badge
                      variant={
                        row.status === 'active'
                          ? 'success'
                          : row.status === 'suspended'
                            ? 'critical'
                            : 'medium'
                      }
                    >
                      {row.status.toUpperCase()}
                    </Badge>
                  ),
                },
                {
                  header: 'Registered',
                  accessor: (row) => (
                    <Badge variant={row.registered ? 'success' : 'high'}>
                      {row.registered ? 'YES' : 'NO'}
                    </Badge>
                  ),
                },
                {
                  header: 'Actions',
                  accessor: (row) => (
                    <button
                      onClick={() =>
                        addToast({
                          message: `Viewing ${row.label} details`,
                          severity: 'info',
                        })
                      }
                      className="text-accent hover:text-accent-light text-xs font-mono"
                    >
                      View
                    </button>
                  ),
                  className: 'text-center',
                },
              ]}
              data={filteredParticipants}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center">
              <div className="text-2xl font-bold font-mono text-accent">
                {participants.length}
              </div>
              <div className="text-xs text-text-tertiary font-mono mt-1">
                Total Participants
              </div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold font-mono text-success">
                {participants.filter((p) => p.registered).length}
              </div>
              <div className="text-xs text-text-tertiary font-mono mt-1">
                Registered
              </div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold font-mono text-accent">
                {participants.filter((p) => p.status === 'active').length}
              </div>
              <div className="text-xs text-text-tertiary font-mono mt-1">
                Active
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
