'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ThreatScore { axis: string; score: number; status: string; }
interface FraudAlert {
  id: string; type: string; severity: string; agent_id?: string;
  agent_type?: string; description: string; timestamp: number | string;
  data?: Record<string, any>; resolved?: boolean;
}
interface GroqReport {
  overall_risk: string; risk_score: number; executive_summary: string;
  active_threats: Array<{ category: string; risk: string; description: string; recommendation: string }>;
  attack_vectors: string[]; recommended_actions: string[];
}
interface EmailConfig { configured: boolean; enabled: boolean; smtp_host?: string; from_email?: string; total_sent: number; }
interface Notification { type: string; alert_type: string; severity: string; recipients: string[]; subject: string; timestamp: number; groq_analysis: boolean; }

// ─── Prediction Types ───────────────────────────────────────────────────────

interface ThreatPrediction {
  threat_type: string; probability: number; predicted_severity: string;
  confidence: number; time_window: string; risk_trend: string;
  description: string; mitigation_suggestions: string[];
}
interface ThreatForecast {
  predictions: ThreatPrediction[]; overall_risk_score: number;
  overall_trend: string; highest_risk_threat: string;
  total_predicted_incidents: number; forecast_window: string;
  generated_at: number; model_confidence: number;
}
interface ExistingMitigation {
  threat_type: string; alert_count: number; worst_severity: string;
  is_active: boolean; suggestions: string[];
}
interface GroqEnhanced {
  threat_narrative?: string;
  attack_chains?: Array<{ sequence: string[]; probability: string; description: string }>;
  priority_actions?: string[];
  risk_trajectory?: string;
  risk_trajectory_reason?: string;
  emerging_patterns?: string[];
  error?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  LOW: '#22c55e', MEDIUM: '#f0a500', HIGH: '#ff3860', CRITICAL: '#ff0033',
  low: '#22c55e', medium: '#f0a500', high: '#ff3860', critical: '#ff0033',
};
const TYPE_ICON: Record<string, string> = {
  sandwich_attack: '🥪', flash_loan_exploit: '⚡', whale_manipulation: '🐋',
  wash_trading: '♻️', rapid_fire_trading: '🔥', cascade_liquidation: '💥',
  price_manipulation: '📉', unusual_slippage: '📊', oracle_manipulation: '🔮',
  liquidity_poisoning: '☠️', pump_dump: '📈', test_alert: '🧪',
};
const ATTACK_PATTERNS = [
  { id: 'flash_loan_exploit', name: 'Flash Loan Attack', icon: '⚡', desc: 'Borrow → manipulate → profit → repay in one tx' },
  { id: 'sandwich_attack', name: 'MEV Sandwich', icon: '🥪', desc: 'Front-run + back-run pending trades' },
  { id: 'wash_trading', name: 'Wash Trading', icon: '♻️', desc: 'Circular trades to inflate volume' },
  { id: 'oracle_manipulation', name: 'Oracle Manipulation', icon: '🔮', desc: 'Price feed spike or TWAP divergence' },
  { id: 'liquidity_poisoning', name: 'Liquidity Poisoning', icon: '☠️', desc: 'Add/remove liquidity to skew ratios' },
  { id: 'pump_dump', name: 'Pump & Dump', icon: '📈', desc: 'Coordinated buy burst + large sell dump' },
  { id: 'cascade_liquidation', name: 'Cascade Liquidation', icon: '💥', desc: 'Chain reaction of under-collateral seizures' },
  { id: 'whale_manipulation', name: 'Whale Manipulation', icon: '🐋', desc: 'Single trade > 5% of pool reserves' },
];

function timeAgo(ts: number | string) {
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime() / 1000;
  const diff = (Date.now() / 1000) - t;
  if (diff < 5) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function SevBadge({ sev }: { sev: string }) {
  const c = SEV_COLOR[sev] ?? '#64748b';
  return (
    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-bold"
      style={{ color: c, border: `1px solid ${c}`, background: `${c}1a` }}>
      {sev}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ThreatsPage() {
  const [threatScores, setThreatScores] = useState<ThreatScore[]>([]);
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [radarRotation, setRadarRotation] = useState(0);
  const [groqReport, setGroqReport] = useState<GroqReport | null>(null);
  const [groqLoading, setGroqLoading] = useState(false);
  const [quickAnalysis, setQuickAnalysis] = useState<any>(null);
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'alerts' | 'groq' | 'notifications' | 'patterns' | 'predictions'>('alerts');
  const [alertFilter, setAlertFilter] = useState<string>('all');
  const [newAlertFlash, setNewAlertFlash] = useState(false);

  // Prediction state
  const [forecast, setForecast] = useState<ThreatForecast | null>(null);
  const [existingMitigations, setExistingMitigations] = useState<ExistingMitigation[]>([]);
  const [groqEnhanced, setGroqEnhanced] = useState<GroqEnhanced | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [enhancedLoading, setEnhancedLoading] = useState(false);

  const fetchThreatData = useCallback(async () => {
    try {
      const [scoresRes, alertsRes, emailRes, notifRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/threats/scores`),
        fetch(`${API_URL}/api/threats/alerts`),
        fetch(`${API_URL}/api/threats/email-config`),
        fetch(`${API_URL}/api/threats/notifications`),
      ]);
      if (scoresRes.status === 'fulfilled' && scoresRes.value.ok) {
        setThreatScores((await scoresRes.value.json()).data ?? []);
      }
      if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
        const newAlerts: FraudAlert[] = (await alertsRes.value.json()).data ?? [];
        setAlerts(prev => {
          if (newAlerts.length > prev.length) {
            const newOnes = newAlerts.slice(prev.length);
            const hasSevere = newOnes.some(a =>
              a.severity === 'HIGH' || a.severity === 'CRITICAL' || a.severity === 'high' || a.severity === 'critical'
            );
            if (hasSevere) { setNewAlertFlash(true); setTimeout(() => setNewAlertFlash(false), 3000); }
          }
          return newAlerts;
        });
      }
      if (emailRes.status === 'fulfilled' && emailRes.value.ok) {
        setEmailConfig((await emailRes.value.json()).data ?? null);
      }
      if (notifRes.status === 'fulfilled' && notifRes.value.ok) {
        setNotifications((await notifRes.value.json()).data ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchThreatData();
    const dataInterval = setInterval(fetchThreatData, 4000);
    const radarInterval = setInterval(() => setRadarRotation(p => (p + 1.5) % 360), 50);
    return () => { clearInterval(dataInterval); clearInterval(radarInterval); };
  }, [fetchThreatData]);

  async function runGroqDeepAnalysis() {
    setGroqLoading(true); setGroqReport(null);
    try {
      const res = await fetch(`${API_URL}/api/threats/groq-deep-analysis`, { method: 'POST' });
      const j = await res.json();
      if (j.success) setGroqReport(j.data);
    } finally { setGroqLoading(false); }
  }

  async function runQuickAnalysis() {
    try {
      const res = await fetch(`${API_URL}/api/threats/groq-analyze`, { method: 'POST' });
      const j = await res.json();
      if (j.success) setQuickAnalysis(j.data);
    } catch { /* ignore */ }
  }

  async function resolveAlert(id: string) {
    await fetch(`${API_URL}/api/threats/alerts/${id}/resolve`, { method: 'POST' });
    fetchThreatData();
  }

  // ─── Prediction Functions ──────────────────────────────────────────────

  async function fetchPredictions() {
    setPredictionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/threats/predictions`);
      const j = await res.json();
      if (j.success) {
        setForecast(j.data.forecast ?? null);
        setExistingMitigations(j.data.existing_mitigations ?? []);
      }
    } catch { /* ignore */ }
    finally { setPredictionLoading(false); }
  }

  async function fetchEnhancedPredictions() {
    setEnhancedLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/threats/predict-enhanced`, { method: 'POST' });
      const j = await res.json();
      if (j.success) {
        setForecast(j.data.forecast ?? null);
        setExistingMitigations(j.data.existing_mitigations ?? []);
        setGroqEnhanced(j.data.groq_analysis ?? null);
      }
    } catch { /* ignore */ }
    finally { setEnhancedLoading(false); }
  }

  async function sendTestEmail() {
    setTestEmailLoading(true); setTestEmailResult(null);
    try {
      const res = await fetch(`${API_URL}/api/threats/test-email`, { method: 'POST' });
      const j = await res.json();
      setTestEmailResult(j.success ? '✅ Test email sent to all admins!' : `❌ ${j.error ?? 'Failed'}`);
    } catch { setTestEmailResult('❌ Request failed'); }
    finally { setTestEmailLoading(false); }
  }

  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'critical').length;
  const highCount = alerts.filter(a => a.severity === 'HIGH' || a.severity === 'high').length;
  const unresolvedCount = alerts.filter(a => !a.resolved).length;
  const overallRisk = criticalCount > 0 ? 'CRITICAL' : highCount > 2 ? 'HIGH' : highCount > 0 ? 'MEDIUM' : 'LOW';
  const filteredAlerts = alertFilter === 'all' ? alerts : alerts.filter(a => a.severity?.toUpperCase() === alertFilter);

  return (
    <div className="space-y-6 animate-fadeUp">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-text-primary">⚠ Threat Detection</h1>
          <p className="text-xs font-mono text-text-tertiary mt-1">Groq AI-powered DeFi threat monitoring with real-time email alerts</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-4 py-2 rounded-lg border font-mono text-sm font-bold ${newAlertFlash ? 'animate-pulse' : ''}`}
            style={{ borderColor: SEV_COLOR[overallRisk], color: SEV_COLOR[overallRisk], background: `${SEV_COLOR[overallRisk]}15` }}>
            {overallRisk === 'CRITICAL' ? '🔴' : overallRisk === 'HIGH' ? '🟠' : overallRisk === 'MEDIUM' ? '🟡' : '🟢'} {overallRisk} RISK
          </div>
          <div className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] font-mono text-xs text-text-secondary">
            {unresolvedCount} unresolved
          </div>
        </div>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Alerts', value: alerts.length, color: '#00d4ff' },
          { label: 'Critical', value: criticalCount, color: '#ff0033' },
          { label: 'High', value: highCount, color: '#ff3860' },
          { label: 'Emails Sent', value: emailConfig?.total_sent ?? 0, color: '#b367ff' },
          { label: 'Email Status', value: emailConfig?.configured ? 'ACTIVE' : 'NOT SET', color: emailConfig?.configured ? '#22c55e' : '#64748b' },
        ].map(c => (
          <div key={c.label} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 text-center">
            <div className="text-xs font-mono text-text-tertiary">{c.label}</div>
            <div className="text-xl font-bold font-mono mt-1" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Radar + Scores ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 flex items-center justify-center">
          <div className="relative w-52 h-52">
            <svg viewBox="0 0 200 200" className="absolute inset-0">
              {[30, 55, 80].map(r => (
                <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="0.5" />
              ))}
              {threatScores.map((_, i) => {
                const angle = (i / (threatScores.length || 1)) * Math.PI * 2 - Math.PI / 2;
                return <line key={i} x1="100" y1="100" x2={100 + Math.cos(angle) * 85} y2={100 + Math.sin(angle) * 85} stroke="rgba(0,212,255,0.2)" strokeWidth="0.5" />;
              })}
              {threatScores.length > 2 && (
                <polygon points={threatScores.map((s, i) => {
                  const angle = (i / threatScores.length) * Math.PI * 2 - Math.PI / 2;
                  const r = (s.score / 100) * 80;
                  return `${100 + Math.cos(angle) * r},${100 + Math.sin(angle) * r}`;
                }).join(' ')} fill="rgba(255,56,96,0.1)" stroke="#ff3860" strokeWidth="1.5" />
              )}
              {threatScores.map((s, i) => {
                const angle = (i / threatScores.length) * Math.PI * 2 - Math.PI / 2;
                const r = (s.score / 100) * 80;
                const c = s.status === 'critical' ? '#ff0033' : s.status === 'warning' ? '#f0a500' : '#22c55e';
                return <circle key={i} cx={100 + Math.cos(angle) * r} cy={100 + Math.sin(angle) * r} r="4" fill={c} />;
              })}
              {threatScores.map((s, i) => {
                const angle = (i / threatScores.length) * Math.PI * 2 - Math.PI / 2;
                return <text key={`l-${i}`} x={100 + Math.cos(angle) * 95} y={100 + Math.sin(angle) * 95} textAnchor="middle" dominantBaseline="middle" fill="#888" fontSize="7" fontFamily="monospace">{s.axis}</text>;
              })}
              <line x1="100" y1="100" x2={100 + Math.cos(radarRotation * Math.PI / 180) * 85} y2={100 + Math.sin(radarRotation * Math.PI / 180) * 85} stroke="rgba(0,212,255,0.4)" strokeWidth="1" />
              <circle cx="100" cy="100" r="2" fill="#00d4ff" />
            </svg>
          </div>
        </div>
        <div className="lg:col-span-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
          <h2 className="text-sm font-mono font-bold text-text-primary mb-3">Threat Radar Scores</h2>
          <div className="grid grid-cols-2 gap-3">
            {threatScores.map(s => {
              const c = s.status === 'critical' ? '#ff0033' : s.status === 'warning' ? '#f0a500' : '#22c55e';
              return (
                <div key={s.axis} className="rounded border p-3" style={{ borderColor: `${c}44`, background: `${c}08` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-text-primary">{s.axis}</span>
                    <span className="text-lg font-bold font-mono" style={{ color: c }}>{s.score}</span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-bg-primary)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.score}%`, background: c }} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] font-mono text-text-tertiary">
                      {s.status === 'critical' ? '⚠ CRITICAL' : s.status === 'warning' ? '⚡ WARNING' : '✓ SAFE'}
                    </span>
                    <div className={`w-2 h-2 rounded-full ${s.status === 'critical' ? 'animate-ping' : s.status === 'warning' ? 'animate-pulse' : ''}`} style={{ background: c }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Groq AI Quick Analysis Bar ───────────────────────────────── */}
      <div className="rounded-lg border border-[#b367ff33] bg-[#b367ff08] p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <span className="text-sm font-mono font-bold text-[#b367ff]">Groq AI Threat Intelligence</span>
            <span className="text-[10px] font-mono text-text-tertiary">llama-3.3-70b-versatile</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runQuickAnalysis}
              className="text-xs font-mono py-1 px-3 rounded border border-[#00d4ff] text-[#00d4ff] bg-[#00d4ff0d] hover:bg-[#00d4ff1a] transition-colors">
              ⚡ Quick Scan
            </button>
            <button onClick={runGroqDeepAnalysis} disabled={groqLoading}
              className="text-xs font-mono py-1 px-3 rounded border border-[#b367ff] text-[#b367ff] bg-[#b367ff0d] hover:bg-[#b367ff1a] transition-colors disabled:opacity-50">
              {groqLoading ? '⏳ Analyzing...' : '🔬 Deep Analysis'}
            </button>
          </div>
        </div>
        {quickAnalysis && (
          <div className="mt-2 text-xs font-mono space-y-1">
            <div className="flex items-center gap-2">
              <span style={{ color: quickAnalysis.is_attack ? '#ff0033' : '#22c55e' }}>
                {quickAnalysis.is_attack ? '🔴 ATTACK DETECTED' : '🟢 No active attack'}
              </span>
              {quickAnalysis.threat_type && <span className="text-text-tertiary">Type: <span className="text-[#f0a500]">{quickAnalysis.threat_type}</span></span>}
              {quickAnalysis.severity && <SevBadge sev={quickAnalysis.severity} />}
            </div>
            {quickAnalysis.recommendation && <p className="text-text-secondary italic">{quickAnalysis.recommendation}</p>}
          </div>
        )}
      </div>

      {/* ── Tab Navigation ───────────────────────────────────────────── */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="flex border-b border-[var(--color-border)]">
          {[
            { id: 'alerts', label: `🚨 Alerts (${alerts.length})` },
            { id: 'predictions', label: '🔮 Predictions' },
            { id: 'groq', label: '🤖 Groq AI Report' },
            { id: 'notifications', label: `📧 Email Alerts (${notifications.length})` },
            { id: 'patterns', label: '📚 Attack Patterns' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as 'alerts' | 'predictions' | 'groq' | 'notifications' | 'patterns')}
              className={`px-4 py-3 text-xs font-mono font-bold transition-colors border-b-2 ${activeTab === t.id ? 'border-[#ff3860] text-[#ff3860]' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── ALERTS TAB ──────────────────────────────────────────────── */}
        {activeTab === 'alerts' && (
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              {['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(f => (
                <button key={f} onClick={() => setAlertFilter(f)}
                  className={`text-xs font-mono py-1 px-2.5 rounded border transition-colors ${alertFilter === f ? 'border-[#ff3860] text-[#ff3860] bg-[#ff38601a]' : 'border-[var(--color-border)] text-text-tertiary hover:text-text-secondary'}`}>
                  {f === 'all' ? `ALL (${alerts.length})` : `${f} (${alerts.filter(a => a.severity?.toUpperCase() === f).length})`}
                </button>
              ))}
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredAlerts.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-3xl mb-2">✓</div>
                  <p className="text-sm font-mono text-text-tertiary">No alerts to show</p>
                </div>
              ) : (
                filteredAlerts.map((alert, i) => {
                  const c = SEV_COLOR[alert.severity?.toUpperCase()] ?? '#64748b';
                  const icon = TYPE_ICON[alert.type] ?? '⚠';
                  const hasGroq = alert.data?.groq_analysis;
                  return (
                    <div key={alert.id ?? i} className="rounded-lg border p-4 transition-all"
                      style={{ borderColor: `${c}44`, background: alert.resolved ? 'var(--color-bg-primary)' : `${c}08` }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 flex-1">
                          <span className="text-lg flex-shrink-0">{icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-xs font-mono font-bold text-text-primary">
                                {alert.type?.replace(/_/g, ' ').toUpperCase()}
                              </span>
                              <SevBadge sev={alert.severity} />
                              {hasGroq && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#b367ff1a] text-[#b367ff] border border-[#b367ff33]">🤖 AI</span>}
                              {alert.resolved && <span className="text-[10px] font-mono text-[#22c55e]">✓ RESOLVED</span>}
                            </div>
                            <p className="text-xs font-mono text-text-secondary">{alert.description}</p>
                            {alert.agent_id && <span className="text-[10px] font-mono text-text-tertiary">Agent: {alert.agent_id}</span>}
                            {hasGroq && (
                              <div className="mt-2 pl-3 border-l-2 border-[#b367ff44]">
                                <div className="text-[10px] font-mono text-[#b367ff] font-bold mb-0.5">🤖 Groq Analysis</div>
                                <div className="text-[11px] font-mono text-text-secondary">
                                  {hasGroq.is_attack && <span className="text-[#ff0033] font-bold">ATTACK CONFIRMED · </span>}
                                  {hasGroq.threat_type && <span>Type: {hasGroq.threat_type} · </span>}
                                  {hasGroq.severity && <span>AI Severity: {hasGroq.severity.toUpperCase()} · </span>}
                                  {hasGroq.recommendation && <span className="italic">{hasGroq.recommendation}</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-[10px] font-mono text-text-tertiary">{timeAgo(alert.timestamp)}</span>
                          {!alert.resolved && (
                            <button onClick={() => resolveAlert(alert.id)}
                              className="text-[10px] font-mono py-0.5 px-2 rounded border border-[#22c55e33] text-[#22c55e] hover:bg-[#22c55e1a] transition-colors">
                              Resolve
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── PREDICTIONS TAB ─────────────────────────────────────────── */}
        {activeTab === 'predictions' && (
          <div className="p-5 space-y-5">
            {/* Controls */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-mono font-bold text-text-primary">🔮 Future Threat Predictions</h3>
                <p className="text-[10px] font-mono text-text-tertiary mt-0.5">ML model + Groq AI predict threats likely to occur in the next 24h</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={fetchPredictions} disabled={predictionLoading}
                  className="text-xs font-mono py-1 px-3 rounded border border-[#00d4ff] text-[#00d4ff] bg-[#00d4ff0d] hover:bg-[#00d4ff1a] transition-colors disabled:opacity-50">
                  {predictionLoading ? '⏳ Predicting...' : '⚡ ML Predict'}
                </button>
                <button onClick={fetchEnhancedPredictions} disabled={enhancedLoading}
                  className="text-xs font-mono py-1 px-3 rounded border border-[#b367ff] text-[#b367ff] bg-[#b367ff0d] hover:bg-[#b367ff1a] transition-colors disabled:opacity-50">
                  {enhancedLoading ? '⏳ AI Analyzing...' : '🤖 Groq Enhanced'}
                </button>
              </div>
            </div>

            {!forecast ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🔮</div>
                <p className="text-sm font-mono text-text-tertiary mb-3">Run ML prediction to forecast future threats and get mitigation suggestions</p>
                <button onClick={fetchPredictions} disabled={predictionLoading}
                  className="py-2 px-5 font-mono text-sm font-bold rounded border border-[#00d4ff] text-[#00d4ff] bg-[#00d4ff0d] hover:bg-[#00d4ff1a] transition-colors disabled:opacity-50">
                  {predictionLoading ? '⏳ Running ML Model...' : '🔮 Generate Predictions'}
                </button>
              </div>
            ) : (
              <>
                {/* Overall Forecast Header */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3 text-center" style={{
                    borderColor: `${forecast.overall_risk_score >= 70 ? '#ff0033' : forecast.overall_risk_score >= 40 ? '#f0a500' : '#22c55e'}44`,
                    background: `${forecast.overall_risk_score >= 70 ? '#ff0033' : forecast.overall_risk_score >= 40 ? '#f0a500' : '#22c55e'}08`
                  }}>
                    <div className="text-[10px] font-mono text-text-tertiary">Risk Score</div>
                    <div className="text-2xl font-bold font-mono" style={{
                      color: forecast.overall_risk_score >= 70 ? '#ff0033' : forecast.overall_risk_score >= 40 ? '#f0a500' : '#22c55e'
                    }}>{forecast.overall_risk_score.toFixed(0)}/100</div>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 text-center">
                    <div className="text-[10px] font-mono text-text-tertiary">Trend</div>
                    <div className={`text-lg font-bold font-mono ${
                      forecast.overall_trend === 'INCREASING' ? 'text-[#ff3860]' : forecast.overall_trend === 'DECREASING' ? 'text-[#22c55e]' : 'text-[#f0a500]'
                    }`}>
                      {forecast.overall_trend === 'INCREASING' ? '📈' : forecast.overall_trend === 'DECREASING' ? '📉' : '➡️'} {forecast.overall_trend}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 text-center">
                    <div className="text-[10px] font-mono text-text-tertiary">Predicted Incidents</div>
                    <div className="text-2xl font-bold font-mono text-[#ff3860]">{forecast.total_predicted_incidents}</div>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 text-center">
                    <div className="text-[10px] font-mono text-text-tertiary">Model Confidence</div>
                    <div className="text-2xl font-bold font-mono text-[#00d4ff]">{forecast.model_confidence.toFixed(0)}%</div>
                  </div>
                </div>

                {/* Groq Enhanced Section */}
                {groqEnhanced && !groqEnhanced.error && (
                  <div className="rounded-lg border border-[#b367ff33] bg-[#b367ff08] p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🤖</span>
                      <span className="text-sm font-mono font-bold text-[#b367ff]">Groq AI Threat Intelligence</span>
                      {groqEnhanced.risk_trajectory && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                          groqEnhanced.risk_trajectory === 'CRITICAL' ? 'text-[#ff0033] border-[#ff0033] bg-[#ff00331a]' :
                          groqEnhanced.risk_trajectory === 'DETERIORATING' ? 'text-[#ff3860] border-[#ff3860] bg-[#ff38601a]' :
                          groqEnhanced.risk_trajectory === 'IMPROVING' ? 'text-[#22c55e] border-[#22c55e] bg-[#22c55e1a]' :
                          'text-[#f0a500] border-[#f0a500] bg-[#f0a5001a]'
                        }`} style={{ border: '1px solid' }}>
                          {groqEnhanced.risk_trajectory}
                        </span>
                      )}
                    </div>
                    {groqEnhanced.threat_narrative && (
                      <p className="text-xs font-mono text-text-primary leading-relaxed">{groqEnhanced.threat_narrative}</p>
                    )}
                    {groqEnhanced.risk_trajectory_reason && (
                      <p className="text-[11px] font-mono text-text-secondary italic">📊 {groqEnhanced.risk_trajectory_reason}</p>
                    )}

                    {/* Attack Chains */}
                    {groqEnhanced.attack_chains && groqEnhanced.attack_chains.length > 0 && (
                      <div>
                        <div className="text-xs font-mono font-bold text-[#ff3860] mb-2">⛓️ Predicted Attack Chains</div>
                        <div className="space-y-2">
                          {groqEnhanced.attack_chains.map((chain, i) => (
                            <div key={i} className="rounded border border-[#ff386033] bg-[#ff386008] p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono text-text-primary font-bold">
                                  {Array.isArray(chain.sequence) ? chain.sequence.join(' → ') : chain.sequence}
                                </span>
                                <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${
                                  chain.probability === 'high' ? 'text-[#ff0033] bg-[#ff00331a]' :
                                  chain.probability === 'medium' ? 'text-[#f0a500] bg-[#f0a5001a]' :
                                  'text-[#22c55e] bg-[#22c55e1a]'
                                }`}>{chain.probability}</span>
                              </div>
                              <p className="text-[11px] font-mono text-text-tertiary">{chain.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Priority Actions */}
                    {groqEnhanced.priority_actions && groqEnhanced.priority_actions.length > 0 && (
                      <div>
                        <div className="text-xs font-mono font-bold text-[#22c55e] mb-2">🎯 Priority Actions</div>
                        <ol className="space-y-1">
                          {groqEnhanced.priority_actions.map((action, i) => (
                            <li key={i} className="text-[11px] font-mono text-text-secondary flex items-start gap-2">
                              <span className="text-[#22c55e] font-bold flex-shrink-0">{i + 1}.</span>{action}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Emerging Patterns */}
                    {groqEnhanced.emerging_patterns && groqEnhanced.emerging_patterns.length > 0 && (
                      <div>
                        <div className="text-xs font-mono font-bold text-[#f0a500] mb-2">👁️ Emerging Patterns to Watch</div>
                        {groqEnhanced.emerging_patterns.map((p, i) => (
                          <div key={i} className="text-[11px] font-mono text-text-secondary flex items-start gap-2 mb-1">
                            <span className="text-[#f0a500]">›</span>{p}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Per-Threat Predictions */}
                <div>
                  <h3 className="text-xs font-mono font-bold text-text-primary mb-3">📊 Per-Threat Probability Forecast ({forecast.forecast_window})</h3>
                  <div className="space-y-2">
                    {forecast.predictions.map((p) => {
                      const c = SEV_COLOR[p.predicted_severity] ?? '#64748b';
                      const icon = TYPE_ICON[p.threat_type] ?? '⚠';
                      return (
                        <div key={p.threat_type} className="rounded-lg border p-4" style={{ borderColor: `${c}33`, background: `${c}06` }}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">{icon}</span>
                                <span className="text-xs font-mono font-bold text-text-primary">
                                  {p.threat_type.replace(/_/g, ' ').toUpperCase()}
                                </span>
                                <SevBadge sev={p.predicted_severity} />
                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                  p.risk_trend === 'INCREASING' ? 'text-[#ff3860] bg-[#ff38601a]' :
                                  p.risk_trend === 'DECREASING' ? 'text-[#22c55e] bg-[#22c55e1a]' :
                                  'text-[#f0a500] bg-[#f0a5001a]'
                                }`}>
                                  {p.risk_trend === 'INCREASING' ? '↑' : p.risk_trend === 'DECREASING' ? '↓' : '→'} {p.risk_trend}
                                </span>
                                <span className="text-[10px] font-mono text-text-tertiary">⏱ {p.time_window}</span>
                              </div>

                              {/* Probability Bar */}
                              <div className="flex items-center gap-3 mb-2">
                                <div className="flex-1 h-2.5 bg-[var(--color-bg-primary)] rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-1000" style={{
                                    width: `${p.probability}%`,
                                    background: `linear-gradient(90deg, ${c}88, ${c})`,
                                  }} />
                                </div>
                                <span className="text-sm font-bold font-mono" style={{ color: c }}>{p.probability.toFixed(1)}%</span>
                              </div>

                              <p className="text-[11px] font-mono text-text-tertiary mb-1">{p.description}</p>
                              <div className="text-[10px] font-mono text-text-tertiary">Confidence: {p.confidence.toFixed(0)}%</div>
                            </div>
                          </div>

                          {/* Mitigation Suggestions */}
                          {p.mitigation_suggestions.length > 0 && p.probability > 20 && (
                            <div className="mt-3 pl-3 border-l-2 border-[#22c55e44]">
                              <div className="text-[10px] font-mono text-[#22c55e] font-bold mb-1">💡 Mitigation Suggestions</div>
                              {p.mitigation_suggestions.map((s, si) => (
                                <div key={si} className="text-[11px] font-mono text-text-secondary flex items-start gap-1.5 mb-0.5">
                                  <span className="text-[#22c55e] flex-shrink-0">•</span>{s}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Existing Threat Mitigations */}
                {existingMitigations.length > 0 && (
                  <div>
                    <h3 className="text-xs font-mono font-bold text-text-primary mb-3">🛡️ Active Threat Mitigations</h3>
                    <p className="text-[10px] font-mono text-text-tertiary mb-3">Targeted suggestions for threats already detected in current alerts</p>
                    <div className="space-y-2">
                      {existingMitigations.map((m) => {
                        const c = SEV_COLOR[m.worst_severity] ?? '#64748b';
                        const icon = TYPE_ICON[m.threat_type] ?? '⚠';
                        return (
                          <div key={m.threat_type} className="rounded-lg border p-4" style={{ borderColor: `${c}33`, background: `${c}06` }}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-lg">{icon}</span>
                              <span className="text-xs font-mono font-bold text-text-primary">
                                {m.threat_type.replace(/_/g, ' ').toUpperCase()}
                              </span>
                              <SevBadge sev={m.worst_severity} />
                              <span className="text-[10px] font-mono text-text-tertiary">{m.alert_count} alert{m.alert_count !== 1 ? 's' : ''}</span>
                              {m.is_active && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-[#ff0033] bg-[#ff00331a] animate-pulse">● ACTIVE</span>
                              )}
                            </div>
                            <div className="pl-3 border-l-2 border-[#22c55e44] space-y-1">
                              {m.suggestions.map((s, si) => (
                                <div key={si} className="text-[11px] font-mono text-text-secondary flex items-start gap-1.5">
                                  <span className="text-[#22c55e] font-bold flex-shrink-0">{si + 1}.</span>{s}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── GROQ AI REPORT TAB ──────────────────────────────────────── */}
        {activeTab === 'groq' && (
          <div className="p-5">
            {!groqReport ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🤖</div>
                <p className="text-sm font-mono text-text-tertiary mb-3">Run a deep analysis to get a comprehensive Groq AI threat report</p>
                <button onClick={runGroqDeepAnalysis} disabled={groqLoading}
                  className="py-2 px-5 font-mono text-sm font-bold rounded border border-[#b367ff] text-[#b367ff] bg-[#b367ff0d] hover:bg-[#b367ff1a] transition-colors disabled:opacity-50">
                  {groqLoading ? '⏳ Analyzing with Groq...' : '🔬 Run Deep Analysis'}
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono text-text-tertiary mb-1">Overall Risk Assessment</div>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-bold font-mono" style={{ color: SEV_COLOR[groqReport.overall_risk?.toUpperCase()] ?? '#64748b' }}>
                        {groqReport.risk_score}/100
                      </span>
                      <SevBadge sev={groqReport.overall_risk} />
                    </div>
                  </div>
                  <button onClick={runGroqDeepAnalysis} disabled={groqLoading}
                    className="text-xs font-mono py-1 px-3 rounded border border-[#b367ff44] text-[#b367ff] hover:bg-[#b367ff1a] transition-colors disabled:opacity-50">
                    {groqLoading ? '⏳...' : '🔄 Refresh'}
                  </button>
                </div>
                <div className="rounded border border-[#b367ff33] bg-[#b367ff08] p-4">
                  <div className="text-xs font-mono text-[#b367ff] font-bold mb-1">📋 Executive Summary</div>
                  <p className="text-sm font-mono text-text-primary">{groqReport.executive_summary}</p>
                </div>
                {groqReport.active_threats?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-mono font-bold text-text-primary mb-2">🎯 Active Threats</h3>
                    <div className="space-y-2">
                      {groqReport.active_threats.map((t, i) => (
                        <div key={i} className="rounded border p-3" style={{ borderColor: `${SEV_COLOR[t.risk?.toUpperCase()] ?? '#64748b'}33`, background: `${SEV_COLOR[t.risk?.toUpperCase()] ?? '#64748b'}08` }}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono font-bold text-text-primary">{t.category}</span>
                            <SevBadge sev={t.risk} />
                          </div>
                          <p className="text-xs font-mono text-text-secondary mb-1">{t.description}</p>
                          <p className="text-[11px] font-mono text-[#22c55e] italic">💡 {t.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {groqReport.attack_vectors?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-mono font-bold text-text-primary mb-2">⚔ Potential Attack Vectors</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {groqReport.attack_vectors.map((v, i) => (
                        <div key={i} className="text-xs font-mono text-text-secondary flex items-start gap-2 p-2 rounded bg-[var(--color-bg-primary)]">
                          <span className="text-[#ff3860]">{'›'}</span>{v}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {groqReport.recommended_actions?.length > 0 && (
                  <div>
                    <h3 className="text-xs font-mono font-bold text-text-primary mb-2">✅ Recommended Actions</h3>
                    <ol className="space-y-1.5">
                      {groqReport.recommended_actions.map((r, i) => (
                        <li key={i} className="text-xs font-mono text-text-secondary flex items-start gap-2">
                          <span className="text-[#22c55e] font-bold flex-shrink-0">{i + 1}.</span>{r}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── EMAIL NOTIFICATIONS TAB ─────────────────────────────────── */}
        {activeTab === 'notifications' && (
          <div className="p-5 space-y-5">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-mono font-bold text-text-primary">📧 Email Alert Configuration</h3>
                <button onClick={sendTestEmail} disabled={testEmailLoading}
                  className="text-xs font-mono py-1 px-3 rounded border border-[#00d4ff] text-[#00d4ff] bg-[#00d4ff0d] hover:bg-[#00d4ff1a] transition-colors disabled:opacity-50">
                  {testEmailLoading ? '⏳ Sending...' : '📨 Send Test Email'}
                </button>
              </div>
              {testEmailResult && <div className="text-xs font-mono mb-3 p-2 rounded bg-[var(--color-bg-secondary)]">{testEmailResult}</div>}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'SMTP Status', value: emailConfig?.configured ? '✅ Configured' : '❌ Not configured', color: emailConfig?.configured ? '#22c55e' : '#ff3860' },
                  { label: 'Alerts Enabled', value: emailConfig?.enabled ? '✅ ON' : '○ OFF', color: emailConfig?.enabled ? '#22c55e' : '#64748b' },
                  { label: 'SMTP Host', value: emailConfig?.smtp_host ?? '—', color: '#00d4ff' },
                  { label: 'Total Sent', value: String(emailConfig?.total_sent ?? 0), color: '#b367ff' },
                ].map(c => (
                  <div key={c.label} className="bg-[var(--color-bg-secondary)] rounded p-2">
                    <div className="text-[10px] font-mono text-text-tertiary">{c.label}</div>
                    <div className="text-xs font-mono font-bold mt-0.5" style={{ color: c.color }}>{c.value}</div>
                  </div>
                ))}
              </div>
              {!emailConfig?.configured && (
                <div className="mt-3 text-xs font-mono text-text-tertiary p-2 rounded bg-[#f0a5000d] border border-[#f0a50033]">
                  💡 To enable email alerts, add to your <span className="text-[#f0a500]">.env.local</span> (backend):
                  <pre className="mt-1 text-[10px] text-[#00d4ff] bg-[var(--color-bg-primary)] p-2 rounded">{`SMTP_HOST=smtp.gmail.com\nSMTP_PORT=587\nSMTP_USER=your-email@gmail.com\nSMTP_PASSWORD=your-app-password\nALERT_EMAIL_ENABLED=true`}</pre>
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-mono font-bold text-text-primary mb-3">📬 Sent Alert Emails</h3>
              {notifications.length === 0 ? (
                <p className="text-xs font-mono text-text-tertiary text-center py-8">No email notifications sent yet. HIGH and CRITICAL alerts trigger automated emails.</p>
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  {notifications.map((n, i) => (
                    <div key={i} className="rounded border border-[var(--color-border)] p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-text-primary">{n.subject}</span>
                          <SevBadge sev={n.severity} />
                          {n.groq_analysis && <span className="text-[10px] font-mono text-[#b367ff]">🤖 +AI</span>}
                        </div>
                        <span className="text-[10px] font-mono text-text-tertiary">{timeAgo(n.timestamp)}</span>
                      </div>
                      <div className="text-[10px] font-mono text-text-tertiary">To: {n.recipients.join(', ')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ATTACK PATTERNS TAB ─────────────────────────────────────── */}
        {activeTab === 'patterns' && (
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ATTACK_PATTERNS.map(p => {
                const instances = alerts.filter(a => a.type === p.id || a.type?.toLowerCase().includes(p.id.replace(/_/g, ''))).length;
                const hasCrit = alerts.some(a => a.type === p.id && (a.severity === 'CRITICAL' || a.severity === 'critical'));
                const hasHigh = alerts.some(a => a.type === p.id && (a.severity === 'HIGH' || a.severity === 'high'));
                const risk = hasCrit ? 'CRITICAL' : hasHigh ? 'HIGH' : instances > 0 ? 'MEDIUM' : 'LOW';
                const c = SEV_COLOR[risk];
                return (
                  <div key={p.id} className="rounded-lg border p-4" style={{ borderColor: `${c}33`, background: `${c}08` }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{p.icon}</span>
                        <span className="text-sm font-mono font-bold text-text-primary">{p.name}</span>
                      </div>
                      <SevBadge sev={risk} />
                    </div>
                    <p className="text-xs font-mono text-text-tertiary mb-2">{p.desc}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-text-secondary">{instances} detected</span>
                      <div className="w-2 h-2 rounded-full" style={{ background: c, animation: instances > 0 ? 'pulse 2s infinite' : 'none' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── System Health ────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
        <h2 className="text-sm font-mono font-bold text-text-primary mb-3">System Health Monitor</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {threatScores.map(s => {
            const c = s.status === 'critical' ? '#ff0033' : s.status === 'warning' ? '#f0a500' : '#22c55e';
            return (
              <div key={s.axis} className="rounded border p-3 flex items-center justify-between" style={{ borderColor: `${c}33`, background: `${c}08` }}>
                <span className="text-xs font-mono font-bold text-text-primary">{s.axis}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-text-tertiary">{s.status === 'critical' ? '⚠ CRITICAL' : s.status === 'warning' ? '⚡ WARNING' : '✓ NOMINAL'}</span>
                  <div className={`w-2 h-2 rounded-full ${s.status === 'critical' ? 'animate-ping' : s.status === 'warning' ? 'animate-pulse' : ''}`} style={{ background: c }} />
                </div>
              </div>
            );
          })}
          {['Palladium (PAL)', 'Badassium (BAD)'].map(t => (
            <div key={t} className="rounded border p-3 flex items-center justify-between border-[#22c55e33] bg-[#22c55e08]">
              <span className="text-xs font-mono font-bold text-text-primary">{t}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-text-tertiary">✓ NOMINAL</span>
                <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

