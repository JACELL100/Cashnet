'use client';

import React, { useEffect, useState, useCallback } from 'react';
import KPICard from '@/components/KPICard';
import Terminal from '@/components/Terminal';
import DataTable from '@/components/DataTable';
import Badge from '@/components/Badge';
import { useSimulationStore } from '@/store/simulationStore';
import { useUIStore } from '@/store/uiStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface DashboardKPI {
  label: string;
  value: number;
  unit: string;
  color: 'accent' | 'danger' | 'warn' | 'success';
}

interface AgentInfo {
  id: string;
  name: string;
  type: string;
  active: boolean;
  risk: string;
  capital: number;
  pnl: number;
  winRate: number;
}

interface HealthItem {
  name: string;
  health: number;
}

export default function DashboardPage() {
  const isRunning = useSimulationStore((state) => state.isRunning);
  const crashed = useSimulationStore((state) => state.crashed);
  const setCascadeTriggered = useSimulationStore((state) => state.setCascadeTriggered);
  const addToast = useUIStore((state) => state.addToast);

  const [kpis, setKpis] = useState<DashboardKPI[]>([
    { label: 'Total Value Locked', value: 0, unit: '$', color: 'accent' },
    { label: 'Stress Level', value: 0, unit: '%', color: 'warn' },
    { label: 'Liquidation Risk', value: 0, unit: '%', color: 'danger' },
    { label: 'Active Agents', value: 0, unit: '', color: 'success' },
  ]);

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [healthMatrix, setHealthMatrix] = useState<HealthItem[]>([
    { name: 'AMM', health: 0 },
    { name: 'Lending', health: 0 },
    { name: 'Oracle', health: 0 },
    { name: 'Systemic', health: 0 },
  ]);

  const [terminalLines, setTerminalLines] = useState([
    { text: 'System initialized', type: 'success' as const, timestamp: Date.now() },
    { text: 'Waiting for simulation start...', type: 'info' as const, timestamp: Date.now() },
  ]);

  // Fetch simulation data from backend
  const fetchDashboardData = useCallback(async () => {
    try {
      const [simRes, agentsRes, threatsRes, lendingRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/simulation/status`),
        fetch(`${API_URL}/api/agents`),
        fetch(`${API_URL}/api/threats/scores`),
        fetch(`${API_URL}/api/lending/metrics`),
      ]);

      // --- Simulation status → KPIs ---
      if (simRes.status === 'fulfilled' && simRes.value.ok) {
        const sim = await simRes.value.json();
        const d = sim.data ?? {};
        const pool = d.pool ?? {};
        const tvl = (pool.reserve_a ?? 0) + (pool.reserve_b ?? 0);
        const activeCount = d.active_agents ?? d.agents?.length ?? 0;

        setKpis((prev) => [
          { ...prev[0], value: tvl },
          { ...prev[1], value: d.utilization ?? prev[1].value },
          { ...prev[2], value: prev[2].value },
          { ...prev[3], value: activeCount },
        ]);
      }

      // --- Lending metrics → Liquidation risk KPI ---
      if (lendingRes.status === 'fulfilled' && lendingRes.value.ok) {
        const lending = await lendingRes.value.json();
        const ld = lending.data ?? {};
        setKpis((prev) => [
          prev[0],
          { ...prev[1], value: ld.utilization_rate ?? prev[1].value },
          { ...prev[2], value: ld.at_risk_count ?? prev[2].value },
          prev[3],
        ]);
      }

      // --- Agents ---
      if (agentsRes.status === 'fulfilled' && agentsRes.value.ok) {
        const agentsJson = await agentsRes.value.json();
        const agentList = (agentsJson.data ?? []).map((a: any) => ({
          id: a.id ?? a.wallet ?? '',
          name: a.name ?? a.role ?? a.id ?? 'Agent',
          type: a.type ?? a.role ?? 'unknown',
          active: a.active ?? a.status === 'active',
          risk: a.risk_level ?? (a.pnl < 0 ? 'high' : a.pnl > 500 ? 'low' : 'medium'),
          capital: a.capital ?? 0,
          pnl: a.pnl ?? 0,
          winRate: a.win_rate ?? a.winRate ?? 0,
        }));
        setAgents(agentList);
      }

      // --- Threat scores → Health Matrix ---
      if (threatsRes.status === 'fulfilled' && threatsRes.value.ok) {
        const threats = await threatsRes.value.json();
        const scores = threats.data ?? [];
        const map: Record<string, string> = {
          'MEV': 'AMM',
          'Flash Loan': 'Oracle',
          'Liquidity': 'AMM',
          'Cascade': 'Lending',
          'Price': 'Oracle',
          'Systemic': 'Systemic',
        };
        const agg: Record<string, number[]> = {};
        for (const s of scores) {
          const bucket = map[s.axis] ?? s.axis;
          if (!agg[bucket]) agg[bucket] = [];
          agg[bucket].push(100 - (s.score ?? 0) * 10);
        }
        setHealthMatrix([
          { name: 'AMM', health: Math.round(avg(agg['AMM'])) },
          { name: 'Lending', health: Math.round(avg(agg['Lending'])) },
          { name: 'Oracle', health: Math.round(avg(agg['Oracle'])) },
          { name: 'Systemic', health: Math.round(avg(agg['Systemic'])) },
        ]);
      }
    } catch {
      /* silently retry on next tick */
    }
  }, []);

  // Fetch activity feed for terminal
  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/sim/activity-feed?limit=5`);
      if (!res.ok) return;
      const json = await res.json();
      const items = json.data ?? [];
      if (items.length > 0) {
        const newLines = items.map((a: any) => ({
          text: a.description ?? a.message ?? JSON.stringify(a),
          type: (a.type === 'fraud' || a.type === 'alert') ? 'error' as const : 'info' as const,
          timestamp: a.timestamp ? new Date(a.timestamp).getTime() : Date.now(),
        }));
        setTerminalLines((prev) => [...prev, ...newLines].slice(-20));
      }
    } catch { /* ignore */ }
  }, []);

  // Initial load + polling
  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => {
      fetchDashboardData();
      if (isRunning) fetchActivity();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchDashboardData, fetchActivity, isRunning]);

  const handleCrashTest = () => {
    setCascadeTriggered(true);
    addToast({
      message: 'Cascade event triggered! 🚨',
      severity: 'error',
    });
    setKpis((prev) =>
      prev.map((kpi) =>
        kpi.label === 'Liquidation Risk'
          ? { ...kpi, value: 85 }
          : kpi
      )
    );
  };

  return (
    <div className="space-y-8 animate-fadeUp">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono text-text-primary">
            Dashboard Overview
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {crashed
              ? 'System crashed - Critical status'
              : isRunning
                ? 'Simulation running - Real-time monitoring'
                : 'Idle - Ready to start'}
          </p>
        </div>
        <button
          onClick={handleCrashTest}
          className="btn danger"
        >
          CRASH TEST
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <KPICard
            key={idx}
            label={kpi.label}
            value={kpi.value}
            unit={kpi.unit}
            color={kpi.color}
            animateValue={isRunning}
          />
        ))}
      </div>

      {/* Protocol Health Matrix */}
      <div className="card">
        <h2 className="text-lg font-mono font-bold text-text-primary mb-4">
          Protocol Health Matrix
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {healthMatrix.map((item) => (
            <div key={item.name} className="flex flex-col">
              <span className="text-xs font-mono text-text-tertiary uppercase mb-2">
                {item.name}
              </span>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-(--color-bg-accent) rounded overflow-hidden">
                  <div
                    className={`h-full transition-all ${item.health > 80
                      ? 'bg-success'
                      : item.health > 50
                        ? 'bg-warn'
                        : 'bg-danger'
                      }`}
                    style={{ width: `${item.health}%` }}
                  />
                </div>
                <span className="text-sm font-mono font-bold min-w-fit">
                  {item.health}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Event Feed */}
        <div className="lg:col-span-2">
          <Terminal
            title="Event Feed"
            lines={terminalLines}
            maxLines={12}
          />
        </div>

        {/* Active Agents */}
        <div className="card">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase mb-4">
            Active Agents
          </h3>
          <div className="space-y-2">
            {agents.length === 0 && (
              <div className="text-xs font-mono text-text-tertiary text-center py-4">
                [no agents — start simulation]
              </div>
            )}
            {agents
              .filter((a) => a.active)
              .map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between p-3 bg-(--color-bg-accent) rounded"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono font-bold text-text-primary truncate">
                      {agent.name}
                    </div>
                    <div className="text-xs text-text-tertiary font-mono">
                      {agent.type}
                    </div>
                  </div>
                  <Badge variant={agent.risk === 'high' ? 'critical' : agent.risk === 'medium' ? 'high' : 'success'}>
                    {agent.risk.toUpperCase()}
                  </Badge>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Agent Performance Table */}
      <div className="card">
        <h3 className="text-lg font-mono font-bold text-text-primary mb-4">
          Agent Performance
        </h3>
        <DataTable
          columns={[
            { header: 'Agent', accessor: 'name' },
            { header: 'Type', accessor: 'type' },
            { header: 'Capital', accessor: (row: any) => `$${(row.capital / 1000).toFixed(0)}k` },
            {
              header: 'PnL', accessor: (row: any) => (
                <span className={row.pnl >= 0 ? 'text-success' : 'text-danger'}>
                  {row.pnl >= 0 ? '+' : ''}{row.pnl.toFixed(2)}
                </span>
              )
            },
            { header: 'Win Rate', accessor: (row: any) => `${(row.winRate * 100).toFixed(0)}%` },
          ]}
          data={agents}
        />
      </div>
    </div>
  );
}

function avg(arr?: number[]): number {
  if (!arr || arr.length === 0) return 50;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
