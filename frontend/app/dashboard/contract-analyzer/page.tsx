'use client';

import React, { useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';

const ContractFlowDiagram = dynamic(() => import('@/components/ContractFlowDiagram'), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Vulnerability {
  id: string;
  name: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  line: number | null;
  description: string;
  impact: string;
  cwe: string;
}

interface SimulationResult {
  scenario: string;
  attack_type: string;
  outcome: 'VULNERABLE' | 'SAFE' | 'PARTIAL';
  description: string;
  funds_at_risk: string;
  steps: string[];
}

interface AnalysisResult {
  filename: string;
  summary: string;
  severity_score: number;
  vulnerabilities: Vulnerability[];
  simulation_results: SimulationResult[];
  mermaid_diagram: string;
  improved_code: string;
  recommendations: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SEVERITY_CONFIG = {
  CRITICAL: { color: '#ff3860', bg: 'rgba(255,56,96,0.10)', badge: 'bg-[rgba(255,56,96,0.15)] text-[#ff3860] border-[#ff3860]' },
  HIGH:     { color: '#ff922b', bg: 'rgba(255,146,43,0.10)', badge: 'bg-[rgba(255,146,43,0.15)] text-[#ff922b] border-[#ff922b]' },
  MEDIUM:   { color: '#f1c40f', bg: 'rgba(241,196,15,0.10)', badge: 'bg-[rgba(241,196,15,0.12)] text-[#f1c40f] border-[#f1c40f]' },
  LOW:      { color: '#00d4ff', bg: 'rgba(0,212,255,0.08)', badge: 'bg-[rgba(0,212,255,0.10)] text-[#00d4ff] border-[#00d4ff]' },
  INFO:     { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', badge: 'bg-[rgba(148,163,184,0.10)] text-[#94a3b8] border-[#94a3b8]' },
};

const OUTCOME_CONFIG = {
  VULNERABLE: { color: '#ff3860', icon: '✗', label: 'VULNERABLE' },
  SAFE:       { color: '#20c997', icon: '✓', label: 'SAFE' },
  PARTIAL:    { color: '#f1c40f', icon: '⚠', label: 'PARTIAL' },
};

const EXAMPLE_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableBank {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    // ⚠ Classic reentrancy vulnerability
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        balances[msg.sender] -= amount; // state updated AFTER external call
    }

    // ⚠ tx.origin authentication — phishing risk
    function adminWithdrawAll(address payable to) external {
        require(tx.origin == owner, "Not owner");
        to.transfer(address(this).balance);
    }

    address public owner;

    constructor() {
        owner = msg.sender;
    }

    receive() external payable {}
}`;

function ScoreRing({ score }: { score: number }) {
  const radius = 40;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? '#ff3860' : score >= 40 ? '#ff922b' : score >= 20 ? '#f1c40f' : '#20c997';
  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
      <circle
        cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
      <text x="50" y="46" textAnchor="middle" fill={color} fontSize="16" fontWeight="bold" fontFamily="monospace">{score}</text>
      <text x="50" y="60" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">RISK</text>
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ContractAnalyzerPage() {
  const [code, setCode] = useState(EXAMPLE_CONTRACT);
  const [filename, setFilename] = useState('contract.sol');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<'vulnerabilities' | 'simulations' | 'diagram' | 'improved'>('vulnerabilities');
  const [copied, setCopied] = useState(false);
  const [expandedSim, setExpandedSim] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File upload handler
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCode(ev.target?.result as string);
    reader.readAsText(file);
  }, []);

  // ── Drag & Drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCode(ev.target?.result as string);
    reader.readAsText(file);
  }, []);

  // ── Analyze
  const analyze = async () => {
    if (!code.trim()) { setError('Please enter or upload a smart contract.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveTab('vulnerabilities');

    try {
      const res = await fetch(`${API_URL}/api/contract/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, filename }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data: AnalysisResult = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Copy code
  const copyCode = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const criticalCount = result?.vulnerabilities.filter(v => v.severity === 'CRITICAL').length ?? 0;
  const highCount = result?.vulnerabilities.filter(v => v.severity === 'HIGH').length ?? 0;
  const vulnerableCount = result?.simulation_results.filter(s => s.outcome === 'VULNERABLE').length ?? 0;
  const safeCount = result?.simulation_results.filter(s => s.outcome === 'SAFE').length ?? 0;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[color:var(--color-bg-primary)] text-text-primary p-6 space-y-6">

      {/* ── Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-mono text-[#00d4ff] tracking-tight">
            ⬡ Smart Contract Analyzer
          </h1>
          <p className="text-sm text-text-secondary mt-1 font-mono">
            Upload or paste your Solidity contract · AI-powered threat simulation · Groq LLM
          </p>
        </div>
        <div className="flex gap-2 text-xs font-mono text-text-tertiary">
          <span className="px-2 py-1 rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">Solidity</span>
          <span className="px-2 py-1 rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">Vyper</span>
          <span className="px-2 py-1 rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">EVM</span>
        </div>
      </div>

      {/* ── Upload + Editor Panel */}
      <div
        className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] overflow-hidden"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg-accent)]">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="text-xs font-mono text-text-tertiary">{filename}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".sol,.txt,.vy"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-mono px-3 py-1 rounded border border-[color:var(--color-border)] hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors"
            >
              ↑ Upload File
            </button>
            <button
              onClick={() => { setCode(EXAMPLE_CONTRACT); setFilename('contract.sol'); }}
              className="text-xs font-mono px-3 py-1 rounded border border-[color:var(--color-border)] hover:border-[#f1c40f] hover:text-[#f1c40f] transition-colors"
            >
              Load Example
            </button>
          </div>
        </div>

        {/* Code Editor */}
        <div className="relative">
          {/* Line numbers */}
          <div className="absolute left-0 top-0 w-12 h-full bg-[rgba(0,0,0,0.2)] border-r border-[color:var(--color-border)] pointer-events-none z-10 overflow-hidden">
            {code.split('\n').map((_, i) => (
              <div key={i} className="text-right pr-2 text-xs font-mono text-text-tertiary leading-6 select-none">
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
            className="
              w-full h-80 pl-14 pr-4 py-3
              bg-transparent text-sm font-mono text-text-primary
              resize-none outline-none leading-6
              placeholder:text-text-tertiary
            "
            placeholder="// Paste or drag & drop your Solidity contract here…"
          />
        </div>

        {/* Drop hint */}
        <div className="px-4 py-2 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-accent)] flex items-center justify-between">
          <span className="text-xs font-mono text-text-tertiary">
            Drag & drop a .sol file anywhere on this panel · Max 50 KB
          </span>
          <span className="text-xs font-mono text-text-tertiary">
            {code.length.toLocaleString()} chars · {code.split('\n').length} lines
          </span>
        </div>
      </div>

      {/* ── Analyze Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={analyze}
          disabled={loading}
          className="
            flex items-center gap-2 px-6 py-3 rounded font-mono font-bold text-sm
            bg-[#00d4ff] text-[color:var(--color-bg-primary)]
            hover:bg-[#00b8d9] active:scale-95
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-150
          "
        >
          {loading ? (
            <>
              <span className="animate-spin">⟳</span> Analyzing…
            </>
          ) : (
            <>⬡ Analyze Contract</>
          )}
        </button>
        {loading && (
          <span className="text-xs font-mono text-text-secondary animate-pulse">
            Running 10 attack simulations · Generating diagram · Building improved contract…
          </span>
        )}
      </div>

      {/* ── Error */}
      {error && (
        <div className="rounded border border-[#ff3860] bg-[rgba(255,56,96,0.08)] p-4 font-mono text-sm text-[#ff3860]">
          ✗ {error}
        </div>
      )}

      {/* ── Results */}
      {result && (
        <div className="space-y-6">

          {/* ── Summary Bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Score */}
            <div className="col-span-2 md:col-span-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-4 flex items-center justify-center">
              <ScoreRing score={result.severity_score} />
            </div>

            {/* Stats */}
            {[
              { label: 'Critical', value: criticalCount, color: '#ff3860' },
              { label: 'High', value: highCount, color: '#ff922b' },
              { label: 'Vulnerable Scenarios', value: vulnerableCount, color: '#ff3860' },
              { label: 'Safe Scenarios', value: safeCount, color: '#20c997' },
            ].map(stat => (
              <div key={stat.label} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-4">
                <p className="text-3xl font-bold font-mono" style={{ color: stat.color }}>{stat.value}</p>
                <p className="text-xs font-mono text-text-secondary mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* ── Summary Text */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-4">
            <h2 className="text-xs font-mono font-bold text-[#00d4ff] uppercase tracking-widest mb-2">Contract Summary</h2>
            <p className="text-sm text-text-secondary font-mono leading-relaxed">{result.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.recommendations.slice(0, 3).map((rec, i) => (
                <span key={i} className="text-xs font-mono px-2 py-1 rounded bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.2)] text-[#00d4ff]">
                  ⬡ {rec}
                </span>
              ))}
            </div>
          </div>

          {/* ── Tabs */}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-[color:var(--color-border)] bg-[color:var(--color-bg-accent)]">
              {([
                { id: 'vulnerabilities', label: `Vulnerabilities (${result.vulnerabilities.length})`, icon: '⚠' },
                { id: 'simulations',     label: `Simulations (${result.simulation_results.length})`,  icon: '◈' },
                { id: 'diagram',         label: 'Flow Diagram',                                        icon: '⬡' },
                { id: 'improved',        label: 'Improved Contract',                                   icon: '✓' },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 text-xs font-mono font-bold transition-colors border-b-2
                    ${activeTab === tab.id
                      ? 'border-[#00d4ff] text-[#00d4ff] bg-[rgba(0,212,255,0.05)]'
                      : 'border-transparent text-text-secondary hover:text-text-primary'}
                  `}
                >
                  <span>{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* ── Tab: Vulnerabilities */}
            {activeTab === 'vulnerabilities' && (
              <div className="p-4 space-y-3">
                {result.vulnerabilities.length === 0 ? (
                  <p className="text-sm font-mono text-[#20c997] p-4">✓ No vulnerabilities detected</p>
                ) : result.vulnerabilities.map((vuln) => {
                  const cfg = SEVERITY_CONFIG[vuln.severity] ?? SEVERITY_CONFIG.INFO;
                  return (
                    <div
                      key={vuln.id}
                      className="rounded-lg border p-4 space-y-2"
                      style={{ borderColor: cfg.color, background: cfg.bg }}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${cfg.badge}`}>
                            {vuln.severity}
                          </span>
                          <span className="text-sm font-mono font-bold text-text-primary">{vuln.name}</span>
                          <span className="text-xs font-mono text-text-tertiary">{vuln.id}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono text-text-tertiary">
                          {vuln.line && <span>Line {vuln.line}</span>}
                          {vuln.cwe && <span className="px-2 py-0.5 rounded bg-[rgba(148,163,184,0.1)]">{vuln.cwe}</span>}
                        </div>
                      </div>
                      <p className="text-xs font-mono text-text-secondary leading-relaxed">{vuln.description}</p>
                      {vuln.impact && (
                        <p className="text-xs font-mono leading-relaxed" style={{ color: cfg.color }}>
                          ⚡ Impact: {vuln.impact}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Tab: Simulations */}
            {activeTab === 'simulations' && (
              <div className="p-4 space-y-3">
                {result.simulation_results.map((sim, i) => {
                  const cfg = OUTCOME_CONFIG[sim.outcome] ?? OUTCOME_CONFIG.PARTIAL;
                  const isOpen = expandedSim === i;
                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] overflow-hidden"
                    >
                      <button
                        className="w-full flex items-center justify-between p-4 hover:bg-[color:var(--color-bg-accent)] transition-colors"
                        onClick={() => setExpandedSim(isOpen ? null : i)}
                      >
                        <div className="flex items-center gap-3 text-left">
                          <span className="text-lg font-bold" style={{ color: cfg.color }}>{cfg.icon}</span>
                          <div>
                            <p className="text-sm font-mono font-bold text-text-primary">{sim.scenario}</p>
                            <p className="text-xs font-mono text-text-tertiary">{sim.attack_type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {sim.funds_at_risk && sim.funds_at_risk !== 'N/A' && (
                            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[rgba(255,56,96,0.1)] text-[#ff3860]">
                              💰 {sim.funds_at_risk} at risk
                            </span>
                          )}
                          <span
                            className="text-xs font-mono font-bold px-2 py-0.5 rounded border"
                            style={{ color: cfg.color, borderColor: cfg.color, background: `${cfg.color}15` }}
                          >
                            {cfg.label}
                          </span>
                          <span className="text-xs font-mono text-text-tertiary">{isOpen ? '▲' : '▼'}</span>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 border-t border-[color:var(--color-border)] pt-3 space-y-3">
                          <p className="text-xs font-mono text-text-secondary leading-relaxed">{sim.description}</p>
                          {sim.steps && sim.steps.length > 0 && (
                            <div>
                              <p className="text-xs font-mono font-bold text-text-tertiary uppercase tracking-widest mb-2">Attack Steps</p>
                              <ol className="space-y-1">
                                {sim.steps.map((step, si) => (
                                  <li key={si} className="flex items-start gap-2 text-xs font-mono text-text-secondary">
                                    <span className="text-[#00d4ff] font-bold flex-shrink-0">{si + 1}.</span>
                                    <span>{step}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Tab: Diagram (Interactive UML-style) */}
            {activeTab === 'diagram' && (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-mono font-bold text-[#00d4ff] uppercase tracking-widest">
                    Contract Flow & Vulnerability Diagram
                  </h3>
                  <button
                    onClick={() => copyCode(result.mermaid_diagram)}
                    className="text-xs font-mono px-3 py-1 rounded border border-[color:var(--color-border)] hover:border-[#00d4ff] hover:text-[#00d4ff] transition-colors"
                  >
                    {copied ? '✓ Copied' : 'Copy Mermaid'}
                  </button>
                </div>
                <p className="text-xs font-mono text-text-tertiary">
                  Drag nodes to rearrange · Scroll to zoom · Red paths = attack vectors
                </p>
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[#0a0a14] overflow-hidden">
                  <ContractFlowDiagram mermaidChart={result.mermaid_diagram} />
                </div>
                {/* Raw mermaid source toggle */}
                <details className="group">
                  <summary className="text-xs font-mono text-text-tertiary cursor-pointer hover:text-text-primary transition-colors">
                    View raw Mermaid source ▼
                  </summary>
                  <pre className="mt-2 text-xs font-mono text-text-secondary bg-[color:var(--color-bg-primary)] rounded border border-[color:var(--color-border)] p-3 overflow-auto max-h-60">
                    {result.mermaid_diagram}
                  </pre>
                </details>
              </div>
            )}

            {/* ── Tab: Improved Contract */}
            {activeTab === 'improved' && (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-mono font-bold text-[#20c997] uppercase tracking-widest">
                      ✓ AI-Generated Improved Contract
                    </h3>
                    <p className="text-xs font-mono text-text-tertiary mt-0.5">
                      All detected vulnerabilities patched · OpenZeppelin standards · Production-ready
                    </p>
                  </div>
                  <button
                    onClick={() => copyCode(result.improved_code)}
                    className="text-xs font-mono px-3 py-1.5 rounded border border-[#20c997] text-[#20c997] hover:bg-[rgba(32,201,151,0.1)] transition-colors"
                  >
                    {copied ? '✓ Copied!' : '⎘ Copy Code'}
                  </button>
                </div>

                {/* Recommendations */}
                {result.recommendations.length > 0 && (
                  <div className="rounded-lg border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.04)] p-3 space-y-1.5">
                    <p className="text-xs font-mono font-bold text-[#00d4ff] uppercase tracking-widest mb-2">Improvement Notes</p>
                    {result.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs font-mono text-text-secondary">
                        <span className="text-[#00d4ff] flex-shrink-0">→</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Code Block */}
                <div className="relative rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-primary)] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-[color:var(--color-border)] bg-[color:var(--color-bg-accent)]">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                      <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                      <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                    </div>
                    <span className="text-xs font-mono text-text-tertiary">improved_{filename}</span>
                  </div>
                  <pre className="p-4 text-xs font-mono text-text-secondary overflow-auto max-h-[600px] leading-5 whitespace-pre">
                    {result.improved_code}
                  </pre>
                </div>

                {/* Download button */}
                <button
                  onClick={() => {
                    const blob = new Blob([result.improved_code], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `improved_${filename}`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="w-full py-2 rounded border border-[#20c997] text-[#20c997] text-xs font-mono font-bold hover:bg-[rgba(32,201,151,0.08)] transition-colors"
                >
                  ↓ Download Improved Contract
                </button>
              </div>
            )}
          </div>

          {/* ── All Recommendations */}
          {result.recommendations.length > 3 && (
            <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-4">
              <h2 className="text-xs font-mono font-bold text-[#00d4ff] uppercase tracking-widest mb-3">All Recommendations</h2>
              <div className="grid md:grid-cols-2 gap-2">
                {result.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs font-mono text-text-secondary">
                    <span className="text-[#00d4ff] font-bold flex-shrink-0">{i + 1}.</span>
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
