'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Badge from '@/components/Badge';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function ThreatsPage() {
  const [threatScores, setThreatScores] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [radarRotation, setRadarRotation] = useState(0);

  const fetchThreatData = useCallback(async () => {
    try {
      const [scoresRes, alertsRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/threats/scores`),
        fetch(`${API_URL}/api/threats/alerts`),
      ]);

      if (scoresRes.status === 'fulfilled' && scoresRes.value.ok) {
        const json = await scoresRes.value.json();
        setThreatScores(json.data ?? json ?? []);
      }
      if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
        const json = await alertsRes.value.json();
        setAlerts(json.data ?? json ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchThreatData();
    const dataInterval = setInterval(fetchThreatData, 5000);
    const radarInterval = setInterval(() => {
      setRadarRotation((prev) => (prev + 2) % 360);
    }, 50);
    return () => {
      clearInterval(dataInterval);
      clearInterval(radarInterval);
    };
  }, [fetchThreatData]);

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
  const highAlerts = alerts.filter((a) => a.severity === 'high');

  return (
    <div className="space-y-8 animate-fadeUp">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold font-mono text-text-primary mb-2">
          Threat Detection
        </h1>
        <p className="text-text-secondary text-sm font-mono">
          MEV, oracle, liquidity, and systemic risk monitoring
        </p>
      </div>

      {/* Radar Chart & Score Badges */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar */}
        <div className="lg:col-span-1 card flex items-center justify-center p-12">
          <div className="relative w-48 h-48">
            <svg
              viewBox="0 0 200 200"
              className="absolute inset-0"
              style={{ transform: `rotate(${radarRotation}deg)` }}
            >
              {/* Concentric Circles */}
              {[1, 2, 3].map((r) => (
                <circle
                  key={r}
                  cx="100"
                  cy="100"
                  r={50 * r}
                  fill="none"
                  stroke="rgba(0, 212, 255, 0.2)"
                  strokeWidth="1"
                />
              ))}

              {/* Axes */}
              {threatScores.map((_, idx) => {
                const angle = (idx / threatScores.length) * Math.PI * 2 - Math.PI / 2;
                const x = 100 + Math.cos(angle) * 80;
                const y = 100 + Math.sin(angle) * 80;
                return (
                  <line
                    key={`axis-${idx}`}
                    x1="100"
                    y1="100"
                    x2={x}
                    y2={y}
                    stroke="rgba(0, 212, 255, 0.3)"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Data Points */}
              {threatScores.map((score, idx) => {
                const angle = (idx / threatScores.length) * Math.PI * 2 - Math.PI / 2;
                const radius = (score.score / 100) * 80;
                const x = 100 + Math.cos(angle) * radius;
                const y = 100 + Math.sin(angle) * radius;
                return (
                  <circle
                    key={`point-${idx}`}
                    cx={x}
                    cy={y}
                    r="4"
                    fill={score.status === 'critical' ? '#ff3860' : score.status === 'warning' ? '#ffb644' : '#00d463'}
                    opacity="0.8"
                  />
                );
              })}

              {/* Center */}
              <circle cx="100" cy="100" r="3" fill="#00d4ff" />
            </svg>
          </div>
        </div>

        {/* Score Badges */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {threatScores.map((score) => (
              <div
                key={score.axis}
                className={`p-4 rounded border ${score.status === 'critical'
                  ? 'bg-[rgba(255,56,96,0.1)] border-danger'
                  : score.status === 'warning'
                    ? 'bg-[rgba(255,182,68,0.1)] border-warn'
                    : 'bg-[rgba(0,212,99,0.1)] border-success'
                  }`}
              >
                <div className="font-mono font-bold text-text-primary text-sm mb-2">
                  {score.axis}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-[color:var(--color-bg-accent)] rounded overflow-hidden">
                    <div
                      className={`h-full ${score.status === 'critical'
                        ? 'bg-danger'
                        : score.status === 'warning'
                          ? 'bg-warn'
                          : 'bg-success'
                        }`}
                      style={{ width: `${score.score}%` }}
                    />
                  </div>
                  <span className="text-lg font-bold font-mono min-w-fit">{score.score}</span>
                </div>
                <Badge variant={score.status === 'critical' ? 'critical' : score.status === 'warning' ? 'high' : 'success'} className="mt-2">
                  {score.status.toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active Alerts */}
      <div className="card space-y-4">
        <h3 className="text-sm font-mono font-bold text-text-primary uppercase">
          Active Alerts ({alerts.length})
        </h3>

        {/* Alert Breakdown */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {criticalAlerts.length > 0 && (
            <div className="p-3 bg-[rgba(255,56,96,0.1)] border border-danger rounded">
              <div className="text-xs text-text-tertiary font-mono">Critical Alerts</div>
              <div className="text-2xl font-bold font-mono text-danger">{criticalAlerts.length}</div>
            </div>
          )}
          {highAlerts.length > 0 && (
            <div className="p-3 bg-[rgba(255,182,68,0.1)] border border-warn rounded">
              <div className="text-xs text-text-tertiary font-mono">High Priority</div>
              <div className="text-2xl font-bold font-mono text-warn">{highAlerts.length}</div>
            </div>
          )}
        </div>

        {/* Alert List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded border ${alert.severity === 'critical'
                ? 'bg-[rgba(255,56,96,0.1)] border-danger'
                : alert.severity === 'high'
                  ? 'bg-[rgba(255,182,68,0.1)] border-warn'
                  : 'bg-[rgba(0,212,255,0.1)] border-accent'
                }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-bold font-mono text-text-primary text-sm">
                    {alert.type}
                  </h4>
                  <p className="text-xs text-text-secondary font-mono mt-1">
                    {alert.description}
                  </p>
                  <div className="text-xs text-text-tertiary font-mono mt-2">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                <Badge
                  variant={
                    alert.severity === 'critical'
                      ? 'critical'
                      : alert.severity === 'high'
                        ? 'high'
                        : 'medium'
                  }
                >
                  {alert.severity.toUpperCase()}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Attack Patterns (Derived from Alerts) */}
      <div className="card space-y-4">
        <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Attack Pattern Library</h3>
        <div className="space-y-3">
          {(() => {
            const patterns = [
              { name: 'Flash Loan Attack', type: 'FLASH_LOAN' },
              { name: 'Wash Trading', type: 'WASH_TRADING' },
              { name: 'Oracle Manipulation', type: 'ORACLE_MANIPULATION' },
              { name: 'Liquidity Poisoning', type: 'LIQUIDITY_POISONING' },
              { name: 'Pump & Dump', type: 'PUMP_DUMP' },
            ];

            return patterns.map((p) => {
              const instances = alerts.filter(a => a.type === p.type || a.type?.includes(p.name)).length;
              const hasCritical = alerts.some(a => (a.type === p.type || a.type?.includes(p.name)) && (a.severity === 'critical' || a.severity === 'CRITICAL'));
              const hasHigh = alerts.some(a => (a.type === p.type || a.type?.includes(p.name)) && (a.severity === 'high' || a.severity === 'HIGH'));

              const riskLevel = hasCritical ? 'critical' : hasHigh ? 'high' : instances > 0 ? 'medium' : 'low';

              return (
                <div key={p.name} className="flex items-center justify-between p-3 bg-[color:var(--color-bg-accent)] rounded">
                  <div>
                    <div className="font-mono font-bold text-text-primary text-sm">{p.name}</div>
                    <div className="text-xs text-text-tertiary font-mono">
                      {instances} instance{instances !== 1 ? 's' : ''} detected
                    </div>
                  </div>
                  <Badge
                    variant={
                      riskLevel === 'critical'
                        ? 'critical'
                        : riskLevel === 'high'
                          ? 'high'
                          : riskLevel === 'medium'
                            ? 'medium'
                            : 'success'
                    }
                  >
                    {riskLevel.toUpperCase()}
                  </Badge>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Contract Status (Derived from Scores) */}
      <div className="card space-y-4">
        <h3 className="text-sm font-mono font-bold text-text-primary uppercase">System Health</h3>
        <div className="grid grid-cols-2 gap-3">
          {threatScores.map((score) => (
            <div
              key={score.axis}
              className={`p-3 rounded border flex items-center justify-between ${score.status === 'normal'
                ? 'bg-[rgba(0,212,99,0.1)] border-success'
                : score.status === 'warning'
                  ? 'bg-[rgba(255,182,68,0.1)] border-warn'
                  : 'bg-[rgba(255,56,96,0.1)] border-danger'
                }`}
            >
              <span className="font-mono font-bold text-text-primary text-sm">
                {score.axis}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-text-tertiary">
                  {score.status === 'normal' ? '✓ NOMINAL' : '⚠ DISTRESS'}
                </span>
                <div className={`w-2 h-2 rounded-full ${score.status === 'normal' ? 'bg-success animate-pulse' : score.status === 'warning' ? 'bg-warn animate-bounce' : 'bg-danger animate-ping'}`} />
              </div>
            </div>
          ))}
          {/* Static check for tokens as they are core infrastructure */}
          {[
            { name: 'Palladium (PAL)', status: 'normal' },
            { name: 'Badassium (BAD)', status: 'normal' },
          ].map(token => (
            <div
              key={token.name}
              className="p-3 rounded border flex items-center justify-between bg-[rgba(0,212,99,0.1)] border-success"
            >
              <span className="font-mono font-bold text-text-primary text-sm">
                {token.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-text-tertiary">✓ NOMINAL</span>
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
