'use client';

import React from 'react';

const kpis = [
  { label: 'Open Alerts', value: '7', sub: '3 critical', color: '#ff3860' },
  { label: 'Events Today', value: '142', sub: '+23 last hour', color: '#f0a500' },
  { label: 'Wallets Flagged', value: '12', sub: 'Pending review', color: '#b367ff' },
  { label: 'Avg Credit Score', value: '680', sub: 'Network-wide', color: '#22c55e' },
];

const alerts = [
  { id: 'ALT-001', severity: 'critical', type: 'Wash Trading', wallet: '0xabc1...ef23', time: '4m ago', desc: 'Circular loan pattern detected across 3 wallets' },
  { id: 'ALT-002', severity: 'critical', type: 'Flash Loan', wallet: '0xdef4...gh56', time: '11m ago', desc: 'Same-block borrow/repay with anomalous yield extraction' },
  { id: 'ALT-003', severity: 'high', type: 'Credit Fraud', wallet: '0x789a...bc01', time: '38m ago', desc: 'Credit score manipulation via synthetic collateral' },
  { id: 'ALT-004', severity: 'high', type: 'Identity Spoof', wallet: '0x456d...ef78', time: '1h ago', desc: 'Multiple registrations from common IP cluster' },
  { id: 'ALT-005', severity: 'medium', type: 'Overleverage', wallet: '0x123g...hi90', time: '2h ago', desc: 'Collateral ratio below threshold for 3 consecutive blocks' },
  { id: 'ALT-006', severity: 'low', type: 'Late Payment', wallet: '0xbcd2...fg34', time: '5h ago', desc: 'Payment 48h past due, no response to notification' },
];

const events = [
  { step: 1201, time: '14:22:01', type: 'Loan Issued', actor: '0xabc1...ef23', desc: 'Borrowed $24,000 at 8.2% APR' },
  { step: 1200, time: '14:21:44', type: 'Collateral Posted', actor: '0xdef4...gh56', desc: '1.8 SepoliaETH collateral deposited' },
  { step: 1199, time: '14:19:33', type: 'Repayment', actor: '0x789a...bc01', desc: 'Partial repayment $5,000 of $35,000' },
  { step: 1198, time: '14:15:02', type: 'Identity Verified', actor: '0x456d...ef78', desc: 'KYC passed via IdentityRegistry' },
  { step: 1197, time: '14:10:55', type: 'Liquidation', actor: '0x123g...hi90', desc: 'Position liquidated at HF 0.92' },
  { step: 1196, time: '14:05:11', type: 'Pool Deposit', actor: '0xbcd2...fg34', desc: 'Lender deposited $50,000' },
];

const creditSummary = [
  { wallet: '0x9fe1...ab45', score: 810, tier: 'AAA', delta: '+12' },
  { wallet: '0x8dc2...bc56', score: 764, tier: 'AA', delta: '+3' },
  { wallet: '0x7cb3...cd67', score: 720, tier: 'A', delta: '-5' },
  { wallet: '0xabc1...ef23', score: 612, tier: 'BB', delta: '-18' },
  { wallet: '0xdef4...gh56', score: 490, tier: 'C', delta: '-32' },
];

const severityColor: Record<string, string> = {
  critical: '#ff3860', high: '#f0a500', medium: '#b367ff', low: '#22c55e',
};

const tierColor: Record<string, string> = {
  AAA: '#22c55e', AA: '#22c55e', A: '#00d4ff', BBB: '#00d4ff',
  BB: '#f0a500', B: '#f0a500', C: '#ff3860', D: '#ff3860',
};

export default function AuditorPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-mono text-text-primary">Auditor Overview</h1>
        <p className="text-sm text-text-tertiary font-mono mt-1">Read-only · Event monitoring · Fraud detection · Reports</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-4">
            <div className="text-xs font-mono text-text-tertiary mb-2">{k.label}</div>
            <div className="text-3xl font-bold font-mono" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs font-mono text-text-tertiary mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fraud Alert Feed */}
        <div className="lg:col-span-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono font-bold text-text-primary">Fraud Alert Feed</h2>
            <span className="text-xs font-mono text-[#ff3860] animate-pulse">● LIVE</span>
          </div>
          <div className="space-y-3">
            {alerts.map((a) => (
              <div key={a.id} className="p-3 rounded border border-[color:var(--color-border)] hover:border-[#f0a500] transition-colors">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-text-tertiary">{a.id}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ color: severityColor[a.severity], border: `1px solid ${severityColor[a.severity]}`, background: `${severityColor[a.severity]}1a` }}>
                      {a.severity.toUpperCase()}
                    </span>
                    <span className="text-xs font-mono text-text-primary font-bold">{a.type}</span>
                  </div>
                  <span className="text-xs font-mono text-text-tertiary shrink-0">{a.time}</span>
                </div>
                <div className="text-xs font-mono text-[#f0a500]">{a.wallet}</div>
                <div className="text-xs font-mono text-text-secondary mt-1">{a.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Credit Score Summary */}
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
          <h2 className="text-sm font-mono font-bold text-text-primary mb-4">Credit Leaderboard</h2>
          <div className="space-y-3">
            {creditSummary.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-text-primary">{c.wallet}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono font-bold" style={{ color: tierColor[c.tier] }}>{c.score}</span>
                    <span className="text-xs font-mono px-1.5 py-0 rounded" style={{ color: tierColor[c.tier], border: `1px solid ${tierColor[c.tier]}` }}>{c.tier}</span>
                  </div>
                </div>
                <span className="text-xs font-mono" style={{ color: c.delta.startsWith('+') ? '#22c55e' : '#ff3860' }}>{c.delta}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[color:var(--color-border)]">
            <div className="text-xs font-mono text-text-tertiary">Network Score Distribution</div>
            <div className="flex gap-1 mt-2 h-8 items-end">
              {[3, 8, 15, 22, 28, 18, 6].map((v, i) => (
                <div key={i} className="flex-1 rounded-t" style={{ height: `${(v / 28) * 100}%`, background: ['#ff3860','#ff3860','#f0a500','#f0a500','#22c55e','#22c55e','#22c55e'][i] + '80' }} />
              ))}
            </div>
            <div className="flex justify-between text-xs font-mono text-text-tertiary mt-1">
              <span>D</span><span>C</span><span>B</span><span>BB</span><span>A</span><span>AA</span><span>AAA</span>
            </div>
          </div>
        </div>
      </div>

      {/* Event Log */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono font-bold text-text-primary">Simulation Event Log</h2>
          <button className="text-xs font-mono text-[#f0a500] border border-[#f0a500] px-3 py-1.5 rounded hover:bg-[rgba(240,165,0,0.1)] transition-colors">
            ⬇ Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-text-tertiary border-b border-[color:var(--color-border)]">
                <th className="text-left py-2 pr-6">Step</th>
                <th className="text-left py-2 pr-6">Time</th>
                <th className="text-left py-2 pr-6">Event Type</th>
                <th className="text-left py-2 pr-6">Actor</th>
                <th className="text-left py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i} className="border-b border-[color:var(--color-border)] last:border-0 hover:bg-[color:var(--color-bg-primary)] transition-colors">
                  <td className="py-3 pr-6 text-text-tertiary">#{e.step}</td>
                  <td className="py-3 pr-6 text-text-secondary">{e.time}</td>
                  <td className="py-3 pr-6 text-[#f0a500] font-bold">{e.type}</td>
                  <td className="py-3 pr-6 text-[#00d4ff]">{e.actor}</td>
                  <td className="py-3 text-text-secondary">{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
