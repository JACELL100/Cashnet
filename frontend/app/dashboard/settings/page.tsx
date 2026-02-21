'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useAccount, useDisconnect } from 'wagmi';

type ThemeOption = 'dark' | 'midnight' | 'hacker';
type CurrencyOption = 'USD' | 'ETH' | 'EUR';

interface AppSettings {
  theme: ThemeOption;
  currency: CurrencyOption;
  pollInterval: number;
  notifications: boolean;
  emailAlerts: boolean;
  liquidationAlerts: boolean;
  healthWarningThreshold: number;
  showTestnetBanner: boolean;
  compactTables: boolean;
  confirmTxPopup: boolean;
  autoRefreshData: boolean;
}

const STORAGE_KEY = 'cashnet-settings';

const defaults: AppSettings = {
  theme: 'dark',
  currency: 'USD',
  pollInterval: 6,
  notifications: true,
  emailAlerts: false,
  liquidationAlerts: true,
  healthWarningThreshold: 1.5,
  showTestnetBanner: true,
  compactTables: false,
  confirmTxPopup: true,
  autoRefreshData: true,
};

function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch { return defaults; }
}

function saveSettings(s: AppSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

/* role → accent */
const roleAccent: Record<string, string> = {
  BORROWER: '#00d4ff',
  LENDER: '#b367ff',
  ADMIN: '#ff3860',
  AUDITOR: '#f0a500',
};

/* ── Reusable pieces ── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold font-mono text-text-primary mb-4">{children}</h2>;
}

function Toggle({ checked, onChange, label, description, accent }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; accent: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[color:var(--color-border)] last:border-0">
      <div>
        <div className="text-sm font-mono text-text-primary">{label}</div>
        {description && <div className="text-xs font-mono text-text-tertiary mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative w-11 h-6 rounded-full transition-colors"
        style={{ backgroundColor: checked ? accent : 'var(--color-border)' }}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function Select<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[color:var(--color-border)] last:border-0">
      <div className="text-sm font-mono text-text-primary">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded px-3 py-1.5 text-sm font-mono text-text-primary focus:outline-none transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ── Main Page ── */

export default function DashboardSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();

  const accent = roleAccent[user?.role || 'BORROWER'] || '#00d4ff';

  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [saved, setSaved] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => { setSettings(loadSettings()); }, []);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleReset = () => {
    setSettings(defaults);
    saveSettings(defaults);
    setResetConfirm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ settings, user }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashnet-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-text-primary">Settings</h1>
          <p className="text-sm text-text-secondary font-mono mt-1">Configure your dashboard preferences</p>
        </div>
        {saved && (
          <span className="px-3 py-1 bg-[rgba(34,197,94,0.15)] border border-[#22c55e] text-[#22c55e] rounded text-xs font-mono">
            ✓ Saved
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Appearance ── */}
        <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6">
          <SectionTitle>Appearance</SectionTitle>
          <div className="space-y-0">
            <Select
              label="Theme"
              value={settings.theme}
              onChange={(v) => update('theme', v)}
              options={[
                { value: 'dark', label: 'Dark (Default)' },
                { value: 'midnight', label: 'Midnight' },
                { value: 'hacker', label: 'Hacker Green' },
              ]}
            />
            <Select
              label="Display Currency"
              value={settings.currency}
              onChange={(v) => update('currency', v)}
              options={[
                { value: 'USD', label: 'USD ($)' },
                { value: 'ETH', label: 'ETH (Ξ)' },
                { value: 'EUR', label: 'EUR (€)' },
              ]}
            />
            <Toggle label="Compact Tables" description="Reduce row height in data tables" checked={settings.compactTables} onChange={(v) => update('compactTables', v)} accent={accent} />
            <Toggle label="Testnet Banner" description="Show Sepolia testnet indicator" checked={settings.showTestnetBanner} onChange={(v) => update('showTestnetBanner', v)} accent={accent} />
          </div>
        </div>

        {/* ── Notifications ── */}
        <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6">
          <SectionTitle>Notifications</SectionTitle>
          <div className="space-y-0">
            <Toggle label="Push Notifications" description="Browser push for events" checked={settings.notifications} onChange={(v) => update('notifications', v)} accent={accent} />
            <Toggle label="Email Alerts" description="Send critical alerts to email" checked={settings.emailAlerts} onChange={(v) => update('emailAlerts', v)} accent={accent} />
            <Toggle label="Liquidation Alerts" description="Alert near liquidation threshold" checked={settings.liquidationAlerts} onChange={(v) => update('liquidationAlerts', v)} accent={accent} />

            {/* Health threshold slider */}
            <div className="py-3">
              <div className="flex justify-between text-sm font-mono mb-2">
                <span className="text-text-primary">Health Warning Threshold</span>
                <span className="text-[#f0a500] font-bold">{settings.healthWarningThreshold.toFixed(1)}</span>
              </div>
              <input
                type="range" min={1.0} max={3.0} step={0.1}
                value={settings.healthWarningThreshold}
                onChange={(e) => update('healthWarningThreshold', parseFloat(e.target.value))}
                className="w-full h-1.5"
                style={{ accentColor: accent }}
              />
              <div className="flex justify-between text-xs font-mono text-text-tertiary mt-1">
                <span>1.0 (risky)</span>
                <span>3.0 (conservative)</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Data & Performance ── */}
        <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6">
          <SectionTitle>Data &amp; Performance</SectionTitle>
          <div className="space-y-0">
            <Toggle label="Auto-Refresh Data" description="Automatically poll live data" checked={settings.autoRefreshData} onChange={(v) => update('autoRefreshData', v)} accent={accent} />

            <div className="py-3 border-b border-[color:var(--color-border)]">
              <div className="flex justify-between text-sm font-mono mb-2">
                <span className="text-text-primary">Poll Interval</span>
                <span className="font-bold" style={{ color: accent }}>{settings.pollInterval}s</span>
              </div>
              <input
                type="range" min={2} max={30} step={1}
                value={settings.pollInterval}
                onChange={(e) => update('pollInterval', parseInt(e.target.value))}
                className="w-full h-1.5"
                style={{ accentColor: accent }}
              />
              <div className="flex justify-between text-xs font-mono text-text-tertiary mt-1">
                <span>2s (real-time)</span>
                <span>30s (battery saver)</span>
              </div>
            </div>

            <Toggle label="Confirm Transactions" description="Popup before wallet signing" checked={settings.confirmTxPopup} onChange={(v) => update('confirmTxPopup', v)} accent={accent} />
          </div>
        </div>

        {/* ── Wallet & Network ── */}
        <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6">
          <SectionTitle>Wallet &amp; Network</SectionTitle>
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded p-4">
              <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-[#22c55e]' : 'bg-[#ff3860]'}`} />
              <div className="flex-1">
                <div className="text-sm font-mono text-text-primary">{isConnected ? 'Wallet Connected' : 'No Wallet'}</div>
                <div className="text-xs font-mono text-text-tertiary">
                  {isConnected ? `${chain?.name || 'Sepolia'} · Chain ${chain?.id || '11155111'}` : 'Connect via MetaMask'}
                </div>
              </div>
              {isConnected && (
                <button onClick={() => disconnect()} className="px-3 py-1.5 border border-[#ff3860] text-[#ff3860] rounded text-xs font-mono hover:bg-[rgba(255,56,96,0.1)] transition-colors">
                  Disconnect
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Network', value: chain?.name || 'Sepolia' },
                { label: 'Chain ID', value: String(chain?.id || '11155111') },
                { label: 'RPC', value: 'Alchemy / Infura' },
              ].map((item) => (
                <div key={item.label} className="bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded p-3">
                  <div className="text-xs font-mono text-text-tertiary">{item.label}</div>
                  <div className="text-sm font-mono text-text-primary mt-1 truncate">{item.value}</div>
                </div>
              ))}
              <div className="bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded p-3">
                <div className="text-xs font-mono text-text-tertiary">Explorer</div>
                <a href="https://sepolia.etherscan.io" target="_blank" rel="noopener noreferrer" className="text-sm font-mono text-accent mt-1 block hover:underline truncate">
                  sepolia.etherscan.io
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── Data Management (full width) ── */}
        <div className="lg:col-span-2 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6">
          <SectionTitle>Data Management</SectionTitle>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExport}
              className="px-4 py-2.5 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded text-sm font-mono text-text-primary hover:border-accent transition-colors"
            >
              ↓ Export Settings
            </button>
            <button
              onClick={() => setResetConfirm(true)}
              className="px-4 py-2.5 border border-[#f0a500] text-[#f0a500] rounded text-sm font-mono hover:bg-[rgba(240,165,0,0.1)] transition-colors"
            >
              ↺ Reset to Defaults
            </button>
            <button
              onClick={() => { logout(); window.location.href = '/'; }}
              className="px-4 py-2.5 border border-[#ff3860] text-[#ff3860] rounded text-sm font-mono hover:bg-[rgba(255,56,96,0.1)] transition-colors"
            >
              ⏻ Sign Out
            </button>
          </div>

          {resetConfirm && (
            <div className="mt-4 p-4 bg-[rgba(240,165,0,0.08)] border border-[rgba(240,165,0,0.3)] rounded-lg">
              <p className="text-sm font-mono text-text-primary mb-3">Are you sure? This will reset all settings to defaults.</p>
              <div className="flex gap-2">
                <button onClick={handleReset} className="px-4 py-2 bg-[#f0a500] text-black rounded text-sm font-mono font-semibold hover:bg-[#d49400] transition-colors">
                  Yes, Reset
                </button>
                <button onClick={() => setResetConfirm(false)} className="px-4 py-2 border border-[color:var(--color-border)] text-text-secondary rounded text-sm font-mono hover:text-text-primary transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── About (full width) ── */}
        <div className="lg:col-span-2 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6">
          <SectionTitle>About</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-mono">
            <div>
              <div className="text-text-tertiary text-xs">Platform</div>
              <div className="text-text-primary mt-1">cashnet</div>
            </div>
            <div>
              <div className="text-text-tertiary text-xs">Version</div>
              <div className="text-text-primary mt-1">0.1.0-beta</div>
            </div>
            <div>
              <div className="text-text-tertiary text-xs">Network</div>
              <div className="text-text-primary mt-1">Sepolia Testnet</div>
            </div>
            <div>
              <div className="text-text-tertiary text-xs">License</div>
              <div className="text-text-primary mt-1">MIT</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
