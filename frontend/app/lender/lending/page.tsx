'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import { useLendingStore, BorrowerPosition } from '@/store/lendingStore';
import { useSimulationStore } from '@/store/simulationStore';
import { useUIStore } from '@/store/uiStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function LendingPage() {
  const borrowers = useLendingStore((state) => state.borrowers);
  const totalDeposits = useLendingStore((state) => state.totalDeposits);
  const totalBorrows = useLendingStore((state) => state.totalBorrows);
  const utilizationRate = useLendingStore((state) => state.utilizationRate);
  const cascadeEvents = useLendingStore((state) => state.cascadeEvents);
  const addCascadeEvent = useLendingStore((state) => state.addCascadeEvent);
  const updateBorrower = useLendingStore((state) => state.updateBorrower);
  const setBorrowers = useLendingStore((state) => state.setBorrowers);
  const setMetrics = useLendingStore((state) => state.setMetrics);

  const isRunning = useSimulationStore((state) => state.isRunning);
  const setCascadeTriggered = useSimulationStore((state) => state.setCascadeTriggered);
  const addToast = useUIStore((state) => state.addToast);

  const [configOpen, setConfigOpen] = useState(false);

  // Fetch borrowers + metrics from API
  const fetchLendingData = useCallback(async () => {
    try {
      const [borrowersRes, metricsRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/lending/borrowers`),
        fetch(`${API_URL}/api/lending/metrics`),
      ]);

      if (borrowersRes.status === 'fulfilled' && borrowersRes.value.ok) {
        const json = await borrowersRes.value.json();
        const items = (json.data ?? []).map((b: any) => ({
          id: b.id ?? b.wallet,
          wallet: b.wallet,
          collateral: b.collateral_value ?? 0,
          borrowed: b.debt_value ?? 0,
          healthFactor: b.health_factor ?? 999,
          liquidationPrice: b.collateral_value && b.debt_value
            ? Math.round(b.debt_value * 1.5 / (b.collateral_value / 2000))
            : 0,
          status: b.at_risk
            ? 'danger' as const
            : b.health_factor < 1.8
              ? 'warning' as const
              : 'healthy' as const,
        }));
        setBorrowers(items);
      }

      if (metricsRes.status === 'fulfilled' && metricsRes.value.ok) {
        const json = await metricsRes.value.json();
        const m = json.data ?? {};
        setMetrics({
          totalDeposits: m.total_collateral ?? 0,
          totalBorrows: m.total_debt ?? 0,
          utilizationRate: (m.utilization_rate ?? 0) / 100, // API returns %, store uses 0-1
        });
      }
    } catch { /* retry on next tick */ }
  }, [setBorrowers, setMetrics]);

  // Initial load + polling
  useEffect(() => {
    fetchLendingData();
    const interval = setInterval(fetchLendingData, 4000);
    return () => clearInterval(interval);
  }, [fetchLendingData]);

  const handleLiquidate = async (borrowerId: string) => {
    try {
      await fetch(`${API_URL}/api/lending/liquidate?borrower_id=${borrowerId}`, {
        method: 'POST',
      });
    } catch { /* ignore */ }
    updateBorrower(borrowerId, { status: 'danger', healthFactor: 0.8 });
    addCascadeEvent({
      timestamp: Date.now(),
      borrower: borrowerId,
      event: 'Liquidation executed',
    });
    addToast({
      message: 'Liquidation event triggered',
      severity: 'warning',
    });
  };

  const handleCascadeTest = () => {
    setCascadeTriggered(true);
    borrowers.forEach((b, idx) => {
      setTimeout(() => {
        addCascadeEvent({
          timestamp: Date.now() + idx * 500,
          borrower: b.id,
          event: 'Cascade liquidation',
        });
      }, idx * 500);
    });
    addToast({
      message: 'Cascade event initiated',
      severity: 'error',
    });
  };

  const sortedBorrowers = [...borrowers].sort((a, b) => a.healthFactor - b.healthFactor);

  return (
    <div className="space-y-8 animate-fadeUp">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono text-text-primary mb-2">
            Lending Markets
          </h1>
          <p className="text-text-secondary text-sm font-mono">
            Borrower positions, health factors, liquidations
          </p>
        </div>
        <button
          onClick={() => setConfigOpen(!configOpen)}
          className="btn ghost text-sm"
        >
          {configOpen ? '▼' : '▶'} CONFIG
        </button>
      </div>

      {/* Configuration Panel */}
      {configOpen && (
        <div className="card space-y-4 border-accent/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="form-label text-xs">Collateral Ratio</label>
              <input type="range" min="1" max="3" step="0.1" className="w-full" defaultValue="1.5" />
            </div>
            <div className="space-y-2">
              <label className="form-label text-xs">Liquidation Threshold</label>
              <input type="range" min="0.5" max="1" step="0.05" className="w-full" defaultValue="0.8" />
            </div>
            <div className="space-y-2">
              <label className="form-label text-xs">Interest Model</label>
              <select className="form-input text-xs">
                <option>Jump Rate</option>
                <option>Linear</option>
                <option>Sigmoid</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="form-label text-xs">Borrowing Cap</label>
              <input type="number" className="form-input text-xs" defaultValue="10000000" />
            </div>
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <div className="text-xs text-text-tertiary font-mono uppercase mb-2">Total Deposits</div>
          <div className="text-2xl font-bold font-mono text-accent">
            ${totalDeposits >= 1000000 ? (totalDeposits / 1000000).toFixed(1) + 'M' : (totalDeposits / 1000).toFixed(0) + 'k'}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-text-tertiary font-mono uppercase mb-2">Total Borrows</div>
          <div className="text-2xl font-bold font-mono text-warn">
            ${totalBorrows >= 1000000 ? (totalBorrows / 1000000).toFixed(1) + 'M' : (totalBorrows / 1000).toFixed(0) + 'k'}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-text-tertiary font-mono uppercase mb-2">Utilization</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-[color:var(--color-bg-accent)] rounded overflow-hidden">
              <div
                className={`h-full ${utilizationRate > 0.8 ? 'bg-danger' : 'bg-success'}`}
                style={{ width: `${utilizationRate * 100}%` }}
              />
            </div>
            <span className="text-lg font-bold font-mono text-text-primary min-w-fit">
              {(utilizationRate * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Interest Rate Chart & Health Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 card space-y-4">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Interest Rate Model</h3>
          <div className="space-y-2">
            {[
              { utilization: '0%', rate: '2.0%' },
              { utilization: '25%', rate: '2.5%' },
              { utilization: '50%', rate: '3.2%' },
              { utilization: '75%', rate: '6.5%' },
              { utilization: '90%', rate: '15.0%' },
            ].map((point) => (
              <div key={point.utilization} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary font-mono">{point.utilization}</span>
                  <span className="text-accent font-mono font-bold">{point.rate}</span>
                </div>
                <div className="h-1.5 bg-[color:var(--color-bg-accent)] rounded">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${parseFloat(point.utilization)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 card space-y-4">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Borrower Health Heatmap</h3>
          <div className="grid grid-cols-3 gap-2">
            {sortedBorrowers.length === 0 && (
              <div className="col-span-3 text-center py-8 text-text-tertiary text-sm font-mono">
                [no borrower positions — start simulation]
              </div>
            )}
            {sortedBorrowers.map((b) => (
              <div
                key={b.id}
                className={`p-3 rounded text-center border ${b.status === 'healthy'
                    ? 'bg-[rgba(0,212,99,0.1)] border-success'
                    : b.status === 'warning'
                      ? 'bg-[rgba(255,182,68,0.1)] border-warn'
                      : 'bg-[rgba(255,56,96,0.1)] border-danger'
                  }`}
              >
                <div className="text-xs font-mono font-bold text-text-primary mb-1">
                  {b.wallet.slice(0, 8)}...
                </div>
                <div className="text-lg font-bold font-mono mb-2">
                  {b.healthFactor.toFixed(2)}
                </div>
                <Badge
                  variant={
                    b.status === 'healthy' ? 'success' : b.status === 'warning' ? 'high' : 'critical'
                  }
                >
                  {b.status.toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Liquidation Risk Table */}
      <div className="card space-y-4">
        <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Liquidation Risk (Sorted by HF)</h3>
        <DataTable
          columns={[
            { header: 'Wallet', accessor: 'wallet', className: 'font-mono text-xs' },
            { header: 'Collateral', accessor: (row: any) => `$${(row.collateral / 1000).toFixed(0)}k`, className: 'text-xs' },
            { header: 'Borrowed', accessor: (row: any) => `$${(row.borrowed / 1000).toFixed(0)}k`, className: 'text-xs' },
            {
              header: 'Health Factor',
              accessor: (row: any) => (
                <span className={
                  row.healthFactor > 1.5
                    ? 'text-success'
                    : row.healthFactor > 1
                      ? 'text-warn'
                      : 'text-danger'
                }>
                  {row.healthFactor.toFixed(2)}
                </span>
              ),
              className: 'font-mono text-xs font-bold',
            },
            {
              header: 'Liquidation Price',
              accessor: (row: any) => `$${row.liquidationPrice.toFixed(0)}`,
              className: 'font-mono text-xs',
            },
            {
              header: 'Action',
              accessor: (row: any) => (
                <button
                  onClick={() => handleLiquidate(row.id)}
                  className={`text-xs font-mono ${row.status === 'danger' ? 'text-danger hover:underline' : 'text-text-tertiary'}`}
                  disabled={row.status !== 'danger' && !isRunning}
                >
                  {row.status === 'danger' ? 'Liquidate' : '—'}
                </button>
              ),
              className: 'text-center',
            },
          ]}
          data={sortedBorrowers}
        />
      </div>

      {/* Cascade Flow */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Liquidation Cascade</h3>
          <button
            onClick={handleCascadeTest}
            className="btn danger text-xs py-2 px-4"
            disabled={!isRunning}
          >
            TRIGGER CASCADE
          </button>
        </div>

        <div className="space-y-3">
          {cascadeEvents.length === 0 ? (
            <div className="text-center py-8 text-text-tertiary text-sm font-mono">
              [awaiting cascade events...]
            </div>
          ) : (
            cascadeEvents.slice(0, 10).map((event, idx) => (
              <div key={idx} className="flex items-center gap-4 p-3 bg-[color:var(--color-bg-accent)] rounded">
                <div className="text-xs font-mono text-text-tertiary min-w-fit">
                  Step {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-text-primary">
                    {event.borrower.slice(0, 10)}... → {event.event}
                  </div>
                  <div className="text-xs text-text-tertiary font-mono mt-1">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                {idx < cascadeEvents.length - 1 && (
                  <div className="text-danger text-lg animate-arrowPulse">↓</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
