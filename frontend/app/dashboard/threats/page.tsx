'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Badge from '@/components/Badge';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

interface ThreatAlert {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  agent_id: string;
  agent_type: string;
  description: string;
  timestamp: number;
  data: Record<string, any>;
  resolved: boolean;
}

interface ThreatScore {
  axis: string;
  score: number;
  status: 'safe' | 'warning' | 'critical';
}

interface ThreatStats {
  total_alerts: number;
  total_events: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  unresolved: number;
}

interface ScenarioInfo {
  type: string;
  name: string;
  description: string;
  severity: string;
  estimated_damage: string;
  real_world_date: string;
}

interface ScenarioResult {
  scenario_type: string;
  success: boolean;
  total_damage: number;
  liquidations_triggered: number;
  price_impact_pct: number;
  duration_seconds: number;
  events: ScenarioEvent[];
  lessons_learned: string[];
}

interface ScenarioEvent {
  timestamp: number;
  scenario_type: string;
  phase_name: string;
  event_type: string;
  description: string;
  data: Record<string, any>;
  severity: string;
}

interface AgentIntel {
  agent_id: string;
  agent_name: string;
  agent_type: string;
  threat_score: number;
  threat_category: string;
  mev_attack_probability: number;
  flash_loan_probability: number;
  is_mev_pattern: boolean;
  is_flash_loan_risk: boolean;
  risk_level: string;
  warnings: string[];
}

// ══════════════════════════════════════════════════════════════════════════════
// Helper
// ══════════════════════════════════════════════════════════════════════════════

async function api<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...opts?.headers },
      ...opts,
    });
    const json = await res.json();
    return json?.data ?? json;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Threat Dashboard Page
// ══════════════════════════════════════════════════════════════════════════════

export default function ThreatsPage() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState<ThreatAlert[]>([]);
  const [threatScores, setThreatScores] = useState<ThreatScore[]>([]);
  const [stats, setStats] = useState<ThreatStats | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [threatMatrix, setThreatMatrix] = useState<AgentIntel[]>([]);
  
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [scenarioRunning, setScenarioRunning] = useState(false);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const [scenarioIntensity, setScenarioIntensity] = useState(1.0);
  
  const [activeTab, setActiveTab] = useState<'live' | 'scenarios' | 'analysis'>('live');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch Data ────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [alertsData, scoresData, statsData, matrixData] = await Promise.all([
      api<ThreatAlert[]>('/api/threats/alerts'),
      api<ThreatScore[]>('/api/threats/radar'),
      api<ThreatStats>('/api/threats/stats'),
      api<{ data: AgentIntel[] }>('/agents-sim/ml/threat-matrix'),
    ]);
    if (Array.isArray(alertsData)) setAlerts(alertsData);
    if (Array.isArray(scoresData)) setThreatScores(scoresData);
    if (statsData) setStats(statsData);
    if (matrixData && Array.isArray((matrixData as any).data)) {
      setThreatMatrix((matrixData as any).data);
    }
  }, []);

  const fetchScenarios = useCallback(async () => {
    const data = await api<ScenarioInfo[]>('/api/scenarios/available');
    if (Array.isArray(data)) setScenarios(data);
  }, []);

  useEffect(() => {
    fetchAll();
    fetchScenarios();
    pollRef.current = setInterval(fetchAll, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchAll, fetchScenarios]);

  // ── Run Scenario ──────────────────────────────────────────────────────────
  const runScenario = async (scenarioType: string) => {
    setScenarioRunning(true);
    setScenarioResult(null);
    setSelectedScenario(scenarioType);
    
    const result = await api<ScenarioResult>('/api/scenarios/run', {
      method: 'POST',
      body: JSON.stringify({
        scenario_type: scenarioType,
        intensity: scenarioIntensity,
        tick_delay: 0.3,
      }),
    });
    
    if (result) setScenarioResult(result);
    setScenarioRunning(false);
    await fetchAll();
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL');
  const highAlerts = alerts.filter(a => a.severity === 'HIGH');
  const unresolvedCount = stats?.unresolved ?? 0;
  const highestThreatAgent = threatMatrix.sort((a, b) => b.threat_score - a.threat_score)[0];

  // ══════════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6 animate-fadeUp">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-mono text-text-primary mb-2 flex items-center gap-3">
            <span className="text-4xl">🛡️</span>
            Threat Intelligence Center
          </h1>
          <p className="text-text-secondary text-sm font-mono">
            Real-time threat monitoring, attack simulation, and ML-powered risk analysis
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {criticalAlerts.length > 0 && (
            <div className="px-4 py-2 bg-red-900/30 border border-red-500 rounded-lg animate-pulse">
              <span className="text-red-400 font-mono font-bold text-sm">
                🚨 {criticalAlerts.length} CRITICAL THREAT{criticalAlerts.length > 1 ? 'S' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab Navigation ─────────────────────────────────────────────────── */}
      <div className="flex gap-2 bg-[color:var(--color-bg-accent)] p-1 rounded-lg w-fit">
        {[
          { id: 'live', label: '📡 Live Threats', count: unresolvedCount },
          { id: 'scenarios', label: '🎭 Attack Scenarios', count: scenarios.length },
          { id: 'analysis', label: '🧠 ML Analysis', count: threatMatrix.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'live' | 'scenarios' | 'analysis')}
            className={`px-4 py-2 rounded-md font-mono text-sm transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-[color:var(--color-accent)] text-black font-bold'
                : 'text-text-secondary hover:text-text-primary hover:bg-[color:var(--color-bg-primary)]'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                activeTab === tab.id ? 'bg-black/20' : 'bg-[color:var(--color-bg-primary)]'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* LIVE THREATS TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'live' && (
        <div className="space-y-6">
          {/* ── Stats Grid ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <StatCard
              label="Total Threats"
              value={stats?.total_alerts ?? 0}
              icon="⚠️"
              color="accent"
            />
            <StatCard
              label="Critical"
              value={criticalAlerts.length}
              icon="🔴"
              color="danger"
              pulse={criticalAlerts.length > 0}
            />
            <StatCard
              label="High"
              value={highAlerts.length}
              icon="🟠"
              color="warn"
            />
            <StatCard
              label="Unresolved"
              value={unresolvedCount}
              icon="📋"
              color="cyan"
            />
            <StatCard
              label="Events"
              value={stats?.total_events ?? 0}
              icon="📊"
              color="accent"
            />
            <StatCard
              label="Highest Threat"
              value={highestThreatAgent?.threat_score?.toFixed(0) ?? '—'}
              icon="🎯"
              color={highestThreatAgent?.threat_score > 70 ? 'danger' : 'success'}
            />
          </div>

          {/* ── Threat Radar ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-6 space-y-4">
              <h3 className="font-mono font-bold text-text-primary flex items-center gap-2">
                <span className="text-xl">📊</span> Threat Radar
              </h3>
              <div className="space-y-3">
                {threatScores.map((score) => (
                  <ThreatRadarBar key={score.axis} score={score} />
                ))}
                {threatScores.length === 0 && (
                  <div className="text-center text-text-tertiary font-mono py-8 text-sm">
                    No threat data available. Start a simulation to generate threats.
                  </div>
                )}
              </div>
            </div>

            {/* ── Threat Distribution ──────────────────────────────────────────── */}
            <div className="card p-6 space-y-4">
              <h3 className="font-mono font-bold text-text-primary flex items-center gap-2">
                <span className="text-xl">🎯</span> Threat Distribution
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(stats?.by_type ?? {}).map(([type, count]) => (
                  <ThreatTypeCard key={type} type={type} count={count} />
                ))}
              </div>
            </div>
          </div>

          {/* ── Live Alert Feed ──────────────────────────────────────────────── */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono font-bold text-text-primary flex items-center gap-2">
                <span className="text-xl animate-pulse">🔴</span> Live Alert Feed
              </h3>
              <span className="text-xs font-mono text-text-tertiary">
                Auto-refreshing every 2s
              </span>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {alerts.slice().reverse().map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
              {alerts.length === 0 && (
                <div className="text-center text-text-tertiary font-mono py-12 text-sm">
                  No alerts detected. System is secure.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SCENARIOS TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'scenarios' && (
        <div className="space-y-6">
          {/* ── Intensity Slider ─────────────────────────────────────────────── */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-sm text-text-secondary">Attack Intensity</span>
              <span className="font-mono text-sm font-bold text-accent">{scenarioIntensity.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2"
              step="0.1"
              value={scenarioIntensity}
              onChange={(e) => setScenarioIntensity(parseFloat(e.target.value))}
              className="w-full accent-[color:var(--color-accent)]"
            />
            <div className="flex justify-between text-[10px] font-mono text-text-tertiary mt-1">
              <span>0.1x (Mild)</span>
              <span>1.0x (Normal)</span>
              <span>2.0x (Extreme)</span>
            </div>
          </div>

          {/* ── Scenario Cards ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.type}
                scenario={scenario}
                isRunning={scenarioRunning && selectedScenario === scenario.type}
                onRun={() => runScenario(scenario.type)}
              />
            ))}
          </div>

          {/* ── Scenario Result ──────────────────────────────────────────────── */}
          {scenarioResult && (
            <div className="card p-6 space-y-4 border-l-4 border-l-red-500 bg-gradient-to-r from-red-900/10 to-transparent">
              <div className="flex items-center justify-between">
                <h3 className="font-mono font-bold text-text-primary flex items-center gap-2">
                  <span className="text-xl">📜</span> Scenario Result: {scenarioResult.scenario_type.toUpperCase()}
                </h3>
                <Badge variant={scenarioResult.success ? 'critical' : 'medium'}>
                  {scenarioResult.success ? 'COMPLETED' : 'FAILED'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[color:var(--color-bg-accent)] rounded p-3">
                  <div className="text-[10px] text-text-tertiary font-mono uppercase">Total Damage</div>
                  <div className="text-lg font-bold font-mono text-red-400">
                    ${scenarioResult.total_damage.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="bg-[color:var(--color-bg-accent)] rounded p-3">
                  <div className="text-[10px] text-text-tertiary font-mono uppercase">Liquidations</div>
                  <div className="text-lg font-bold font-mono text-orange-400">
                    {scenarioResult.liquidations_triggered}
                  </div>
                </div>
                <div className="bg-[color:var(--color-bg-accent)] rounded p-3">
                  <div className="text-[10px] text-text-tertiary font-mono uppercase">Price Impact</div>
                  <div className="text-lg font-bold font-mono text-red-400">
                    {scenarioResult.price_impact_pct.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-[color:var(--color-bg-accent)] rounded p-3">
                  <div className="text-[10px] text-text-tertiary font-mono uppercase">Duration</div>
                  <div className="text-lg font-bold font-mono text-text-primary">
                    {scenarioResult.duration_seconds.toFixed(1)}s
                  </div>
                </div>
              </div>

              {/* Event Timeline */}
              <div>
                <h4 className="text-xs font-mono text-text-tertiary uppercase mb-2">Event Timeline</h4>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {scenarioResult.events.map((event, idx) => (
                    <div
                      key={idx}
                      className={`px-3 py-1.5 rounded text-xs font-mono ${
                        event.severity === 'critical'
                          ? 'bg-red-900/30 text-red-300 border-l-2 border-red-500'
                          : event.severity === 'high'
                          ? 'bg-orange-900/30 text-orange-300 border-l-2 border-orange-500'
                          : 'bg-[color:var(--color-bg-accent)] text-text-secondary border-l-2 border-[color:var(--color-border)]'
                      }`}
                    >
                      <span className="text-text-tertiary mr-2">[{event.event_type}]</span>
                      {event.description}
                    </div>
                  ))}
                </div>
              </div>

              {/* Lessons Learned */}
              <div>
                <h4 className="text-xs font-mono text-text-tertiary uppercase mb-2 flex items-center gap-2">
                  <span>📚</span> Lessons Learned
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {scenarioResult.lessons_learned.map((lesson, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2 bg-[color:var(--color-bg-accent)] rounded text-xs font-mono text-text-secondary flex items-start gap-2"
                    >
                      <span className="text-accent">•</span>
                      {lesson}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── FXTC Case Study Banner ───────────────────────────────────────── */}
          <FXTCCaseStudyBanner />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ML ANALYSIS TAB */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          {/* ── Threat Matrix Heatmap ────────────────────────────────────────── */}
          <div className="card p-6 space-y-4">
            <h3 className="font-mono font-bold text-text-primary flex items-center gap-2">
              <span className="text-xl">🔥</span> Agent Threat Heatmap
            </h3>
            
            {threatMatrix.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)]">
                      <th className="py-3 px-3 text-left text-text-tertiary uppercase">Agent</th>
                      <th className="py-3 px-3 text-center text-text-tertiary uppercase">Threat</th>
                      <th className="py-3 px-3 text-center text-text-tertiary uppercase">MEV Risk</th>
                      <th className="py-3 px-3 text-center text-text-tertiary uppercase">Flash Loan</th>
                      <th className="py-3 px-3 text-center text-text-tertiary uppercase">Category</th>
                      <th className="py-3 px-3 text-center text-text-tertiary uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {threatMatrix.map((agent) => (
                      <ThreatMatrixRow key={agent.agent_id} agent={agent} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-text-tertiary font-mono py-12">
                Run ML Analysis from the Agent Simulator to populate threat matrix
              </div>
            )}
          </div>

          {/* ── Attack Pattern Detection ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AttackPatternCard
              title="MEV Sandwich Attacks"
              icon="🥪"
              detected={threatMatrix.filter(a => a.is_mev_pattern).length}
              total={threatMatrix.length}
              description="Front-running + back-running trades to extract value"
            />
            <AttackPatternCard
              title="Flash Loan Exploits"
              icon="⚡"
              detected={threatMatrix.filter(a => a.is_flash_loan_risk).length}
              total={threatMatrix.length}
              description="Atomic exploits using uncollateralized loans"
            />
          </div>

          {/* ── Risk Distribution Visualization ──────────────────────────────── */}
          <div className="card p-6 space-y-4">
            <h3 className="font-mono font-bold text-text-primary flex items-center gap-2">
              <span className="text-xl">📈</span> Risk Level Distribution
            </h3>
            <div className="flex items-end justify-around h-40 gap-4">
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((level) => {
                const count = threatMatrix.filter(a => a.risk_level === level).length;
                const maxCount = Math.max(...['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(l => 
                  threatMatrix.filter(a => a.risk_level === l).length
                ), 1);
                const height = (count / maxCount) * 100;
                
                return (
                  <div key={level} className="flex flex-col items-center gap-2 flex-1">
                    <div
                      className={`w-full rounded-t transition-all duration-500 ${
                        level === 'CRITICAL' ? 'bg-red-500' :
                        level === 'HIGH' ? 'bg-orange-400' :
                        level === 'MEDIUM' ? 'bg-yellow-400' : 'bg-green-400'
                      }`}
                      style={{ height: `${height}%`, minHeight: count > 0 ? '20px' : '4px' }}
                    />
                    <span className="text-xs font-mono text-text-tertiary">{level}</span>
                    <span className="text-sm font-mono font-bold text-text-primary">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Sub-Components
// ══════════════════════════════════════════════════════════════════════════════

function StatCard({
  label,
  value,
  icon,
  color,
  pulse = false,
}: {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div className={`card p-4 ${pulse ? 'animate-pulse border border-red-500' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-[10px] text-text-tertiary font-mono uppercase">{label}</span>
      </div>
      <div className={`text-2xl font-bold font-mono text-${color}`}>{value}</div>
    </div>
  );
}

function ThreatRadarBar({ score }: { score: ThreatScore }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-text-secondary">{score.axis}</span>
        <span className={`text-xs font-mono font-bold ${
          score.status === 'critical' ? 'text-red-400' :
          score.status === 'warning' ? 'text-orange-400' : 'text-green-400'
        }`}>{score.score}%</span>
      </div>
      <div className="h-3 bg-[color:var(--color-bg-accent)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            score.status === 'critical' ? 'bg-gradient-to-r from-red-600 to-red-400' :
            score.status === 'warning' ? 'bg-gradient-to-r from-orange-600 to-orange-400' :
            'bg-gradient-to-r from-green-600 to-green-400'
          }`}
          style={{ width: `${score.score}%` }}
        />
      </div>
    </div>
  );
}

function ThreatTypeCard({ type, count }: { type: string; count: number }) {
  const icons: Record<string, string> = {
    sandwich_attack: '🥪',
    flash_loan_exploit: '⚡',
    whale_manipulation: '🐋',
    wash_trading: '🔄',
    rapid_fire_trading: '🔥',
    cascade_liquidation: '💥',
    price_manipulation: '📈',
    unusual_slippage: '📉',
  };

  return (
    <div className="bg-[color:var(--color-bg-accent)] rounded p-3 flex items-center gap-3">
      <span className="text-2xl">{icons[type] ?? '⚠️'}</span>
      <div>
        <div className="text-xs font-mono text-text-tertiary uppercase">
          {type.replace(/_/g, ' ')}
        </div>
        <div className="text-lg font-mono font-bold text-text-primary">{count}</div>
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: ThreatAlert }) {
  const severityColors = {
    CRITICAL: 'border-l-red-500 bg-red-900/20',
    HIGH: 'border-l-orange-500 bg-orange-900/20',
    MEDIUM: 'border-l-yellow-500 bg-yellow-900/20',
    LOW: 'border-l-green-500 bg-green-900/20',
  };

  const severityBadge = {
    CRITICAL: 'critical' as const,
    HIGH: 'high' as const,
    MEDIUM: 'medium' as const,
    LOW: 'success' as const,
  };

  return (
    <div className={`p-3 rounded border-l-4 ${severityColors[alert.severity]} transition-all hover:translate-x-1`}>
      <div className="flex items-center justify-between mb-1">
        <Badge variant={severityBadge[alert.severity]}>{alert.severity}</Badge>
        <span className="text-[10px] text-text-tertiary font-mono">
          {new Date(alert.timestamp * 1000).toLocaleTimeString()}
        </span>
      </div>
      <div className="text-xs font-mono text-text-primary mb-1">
        {alert.type.replace(/_/g, ' ').toUpperCase()}
      </div>
      <p className="text-xs font-mono text-text-secondary leading-relaxed">
        {alert.description}
      </p>
    </div>
  );
}

function ScenarioCard({
  scenario,
  isRunning,
  onRun,
}: {
  scenario: ScenarioInfo;
  isRunning: boolean;
  onRun: () => void;
}) {
  const severityColors = {
    critical: 'from-red-900/30 to-red-900/10 border-red-500',
    high: 'from-orange-900/30 to-orange-900/10 border-orange-500',
    medium: 'from-yellow-900/30 to-yellow-900/10 border-yellow-500',
    low: 'from-green-900/30 to-green-900/10 border-green-500',
  };

  const icons: Record<string, string> = {
    fxtc_collapse: '🏛️',
    luna_death_spiral: '🌙',
    flash_loan_exploit: '⚡',
    oracle_manipulation: '🔮',
    rug_pull: '🏃',
    cascade_armageddon: '💥',
    bank_run: '🏃‍♂️',
    sandwich_mega: '🥪',
    whale_panic: '🐋',
  };

  return (
    <div className={`card p-5 space-y-3 border-l-4 bg-gradient-to-br ${
      severityColors[scenario.severity as keyof typeof severityColors] ?? severityColors.medium
    } hover:scale-[1.02] transition-transform cursor-pointer`}>
      <div className="flex items-center justify-between">
        <span className="text-3xl">{icons[scenario.type] ?? '⚠️'}</span>
        <Badge variant={scenario.severity === 'critical' ? 'critical' : 'high'}>
          {scenario.severity.toUpperCase()}
        </Badge>
      </div>
      
      <div>
        <h4 className="font-mono font-bold text-text-primary text-sm">{scenario.name}</h4>
        <p className="text-xs font-mono text-text-secondary mt-1 leading-relaxed">
          {scenario.description}
        </p>
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono text-text-tertiary">
        <span>Est. Damage: <span className="text-red-400 font-bold">{scenario.estimated_damage}</span></span>
        <span>{scenario.real_world_date}</span>
      </div>

      <button
        onClick={onRun}
        disabled={isRunning}
        className={`w-full py-2 px-4 rounded font-mono font-bold text-xs transition-all ${
          isRunning
            ? 'bg-[color:var(--color-bg-accent)] text-text-tertiary cursor-not-allowed'
            : 'bg-red-600 hover:bg-red-500 text-white'
        }`}
      >
        {isRunning ? '⏳ Running Simulation...' : '▶ Run Scenario'}
      </button>
    </div>
  );
}

function ThreatMatrixRow({ agent }: { agent: AgentIntel }) {
  const threatColor = agent.threat_score >= 75 ? 'text-red-400' :
                      agent.threat_score >= 50 ? 'text-orange-400' :
                      agent.threat_score >= 25 ? 'text-yellow-400' : 'text-green-400';

  const riskBadge = {
    CRITICAL: 'bg-red-900/40 text-red-300',
    HIGH: 'bg-orange-900/40 text-orange-300',
    MEDIUM: 'bg-yellow-900/40 text-yellow-300',
    LOW: 'bg-green-900/40 text-green-300',
  };

  return (
    <tr className="border-b border-[color:var(--color-border)]/30 hover:bg-[color:var(--color-bg-accent)]/40 transition-colors">
      <td className="py-3 px-3">
        <div className="font-bold">{agent.agent_name ?? agent.agent_id?.slice(0, 12)}</div>
        <div className="text-[10px] text-text-tertiary">{agent.agent_type}</div>
      </td>
      <td className="py-3 px-3 text-center">
        <div className={`text-lg font-bold ${threatColor}`}>{agent.threat_score.toFixed(0)}</div>
      </td>
      <td className="py-3 px-3 text-center">
        <div className={`${agent.mev_attack_probability >= 50 ? 'text-red-400 font-bold' : 'text-text-secondary'}`}>
          {agent.mev_attack_probability.toFixed(0)}%
        </div>
        {agent.is_mev_pattern && <span className="text-red-400">🚨</span>}
      </td>
      <td className="py-3 px-3 text-center">
        <div className={`${agent.flash_loan_probability >= 50 ? 'text-red-400 font-bold' : 'text-text-secondary'}`}>
          {agent.flash_loan_probability.toFixed(0)}%
        </div>
        {agent.is_flash_loan_risk && <span className="text-red-400">⚡</span>}
      </td>
      <td className="py-3 px-3 text-center">
        <span className="text-text-tertiary">{agent.threat_category}</span>
      </td>
      <td className="py-3 px-3 text-center">
        <span className={`px-2 py-1 rounded text-[10px] font-bold ${
          riskBadge[agent.risk_level as keyof typeof riskBadge] ?? riskBadge.MEDIUM
        }`}>
          {agent.risk_level}
        </span>
      </td>
    </tr>
  );
}

function AttackPatternCard({
  title,
  icon,
  detected,
  total,
  description,
}: {
  title: string;
  icon: string;
  detected: number;
  total: number;
  description: string;
}) {
  const percentage = total > 0 ? (detected / total) * 100 : 0;
  const isRisky = percentage > 30;

  return (
    <div className={`card p-5 space-y-3 ${isRisky ? 'border border-red-500/50' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{icon}</span>
          <h4 className="font-mono font-bold text-text-primary text-sm">{title}</h4>
        </div>
        {isRisky && (
          <Badge variant="critical">ACTIVE</Badge>
        )}
      </div>
      
      <p className="text-xs font-mono text-text-secondary">{description}</p>
      
      <div>
        <div className="flex justify-between text-xs font-mono mb-1">
          <span className="text-text-tertiary">Detection Rate</span>
          <span className={isRisky ? 'text-red-400 font-bold' : 'text-text-primary'}>
            {detected}/{total} ({percentage.toFixed(0)}%)
          </span>
        </div>
        <div className="h-2 bg-[color:var(--color-bg-accent)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isRisky ? 'bg-red-500' : 'bg-green-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function FXTCCaseStudyBanner() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card overflow-hidden">
      <div
        className="p-5 bg-gradient-to-r from-red-900/30 via-orange-900/20 to-transparent cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-4xl">🏛️</span>
            <div>
              <h3 className="font-mono font-bold text-text-primary text-lg">
                FTX / FXTC Case Study
              </h3>
              <p className="text-xs font-mono text-text-secondary">
                November 2022 — The $8 Billion Exchange Collapse
              </p>
            </div>
          </div>
          <span className="text-text-tertiary text-xl">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {expanded && (
        <div className="p-5 space-y-4 bg-[color:var(--color-bg-accent)]/30">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-red-900/20 rounded p-4 border border-red-500/30">
              <div className="text-[10px] text-text-tertiary font-mono uppercase mb-1">Customer Losses</div>
              <div className="text-2xl font-bold font-mono text-red-400">$8B+</div>
            </div>
            <div className="bg-orange-900/20 rounded p-4 border border-orange-500/30">
              <div className="text-[10px] text-text-tertiary font-mono uppercase mb-1">Peak Valuation</div>
              <div className="text-2xl font-bold font-mono text-orange-400">$32B</div>
            </div>
            <div className="bg-yellow-900/20 rounded p-4 border border-yellow-500/30">
              <div className="text-[10px] text-text-tertiary font-mono uppercase mb-1">Hidden Debt</div>
              <div className="text-2xl font-bold font-mono text-yellow-400">80%+</div>
            </div>
            <div className="bg-purple-900/20 rounded p-4 border border-purple-500/30">
              <div className="text-[10px] text-text-tertiary font-mono uppercase mb-1">Collapse Time</div>
              <div className="text-2xl font-bold font-mono text-purple-400">72 hrs</div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-mono font-bold text-text-primary text-sm">Key Fraud Mechanisms</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                { name: 'Customer Fund Misappropriation', desc: 'Secret transfers to Alameda Research' },
                { name: 'Hidden Leverage', desc: 'No collateral requirements for related entities' },
                { name: 'Circular Token Collateral', desc: 'FTT token used as collateral at FTX' },
                { name: 'Fake Reserve Proof', desc: 'Published audits hiding liabilities' },
              ].map((item) => (
                <div key={item.name} className="bg-[color:var(--color-bg-primary)] rounded p-3">
                  <div className="text-xs font-mono font-bold text-red-400">{item.name}</div>
                  <div className="text-[10px] font-mono text-text-secondary">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-mono font-bold text-text-primary text-sm">Red Flags That Were Missed</h4>
            <div className="flex flex-wrap gap-2">
              {[
                'No independent board',
                'Related-party transactions',
                'Single founder control',
                'Offshore jurisdiction',
                'Unknown audit firm',
                'Celebrity marketing > audits',
              ].map((flag) => (
                <span key={flag} className="px-2 py-1 bg-red-900/30 rounded text-[10px] font-mono text-red-300">
                  ⚠️ {flag}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-[color:var(--color-bg-primary)] rounded p-4">
            <h4 className="font-mono font-bold text-accent text-sm mb-2">💡 DeFi Protection Lessons</h4>
            <div className="text-xs font-mono text-text-secondary space-y-1">
              <p>• Self-custody eliminates counterparty risk</p>
              <p>• On-chain transparency prevents hidden leverage</p>
              <p>• Multi-sig prevents unilateral fund transfers</p>
              <p>• Smart contract audits provide verifiable security</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
