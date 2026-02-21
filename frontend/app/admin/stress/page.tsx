'use client';

import React, { useState } from 'react';
import { testingApi } from '@/lib/api';
import { useUIStore } from '@/store/uiStore';

interface StressScenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'pool' | 'lending' | 'attack';
  difficulty: 'low' | 'medium' | 'high' | 'critical';
}

const scenarios: StressScenario[] = [
  // Pool Stress Tests
  {
    id: 'withdrawal',
    name: 'Mass Withdrawal',
    description: 'Simulate panic selling and liquidity drain from the AMM pool',
    icon: '💸',
    category: 'pool',
    difficulty: 'medium',
  },
  {
    id: 'flash_swap',
    name: 'Flash Swap Attack',
    description: 'Large instantaneous swap causing extreme price impact',
    icon: '⚡',
    category: 'pool',
    difficulty: 'high',
  },
  {
    id: 'sustained_drain',
    name: 'Sustained Drain',
    description: 'Gradual liquidity extraction over time',
    icon: '🌊',
    category: 'pool',
    difficulty: 'low',
  },
  // Lending Stress Tests
  {
    id: 'price_crash',
    name: 'Collateral Price Crash',
    description: 'Simulate 30-50% price drop triggering cascade liquidations',
    icon: '📉',
    category: 'lending',
    difficulty: 'critical',
  },
  {
    id: 'bank_run',
    name: 'Bank Run',
    description: 'Mass simultaneous withdrawal attempts from lenders',
    icon: '🏃',
    category: 'lending',
    difficulty: 'high',
  },
  // Attack Scenarios
  {
    id: 'flash_loan_exploit',
    name: 'Flash Loan Attack',
    description: 'Euler Finance style - borrow massive amounts, manipulate, liquidate',
    icon: '🎯',
    category: 'attack',
    difficulty: 'critical',
  },
  {
    id: 'sandwich_mega',
    name: 'MEV Sandwich Attack',
    description: 'Front-run and back-run large trades for profit extraction',
    icon: '🥪',
    category: 'attack',
    difficulty: 'high',
  },
  {
    id: 'oracle_manipulation',
    name: 'Oracle Manipulation',
    description: 'Mango Markets style - inflate collateral value artificially',
    icon: '🔮',
    category: 'attack',
    difficulty: 'critical',
  },
  {
    id: 'wash_trading',
    name: 'Wash Trading',
    description: 'Circular trades between wallets to inflate volume metrics',
    icon: '🔄',
    category: 'attack',
    difficulty: 'high',
  },
  {
    id: 'liquidity_poisoning',
    name: 'Liquidity Poisoning',
    description: 'Rapid add/remove liquidity at skewed ratios to distort pricing',
    icon: '☠️',
    category: 'attack',
    difficulty: 'high',
  },
  {
    id: 'pump_dump',
    name: 'Coordinated Pump & Dump',
    description: 'Multiple wallets inflate token price then one wallet dumps',
    icon: '📈',
    category: 'attack',
    difficulty: 'critical',
  },
  {
    id: 'luna_death_spiral',
    name: 'Death Spiral',
    description: 'Algorithmic stablecoin de-peg cascade (Terra/Luna)',
    icon: '🌀',
    category: 'attack',
    difficulty: 'critical',
  },
];

export default function StressTestingPage() {
  const addToast = useUIStore((state) => state.addToast);
  const [runningTests, setRunningTests] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Map<string, any>>(new Map());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const runStressTest = async (scenario: StressScenario) => {
    if (runningTests.has(scenario.id)) return;

    setRunningTests((prev) => new Set([...prev, scenario.id]));
    addToast({ message: `Running: ${scenario.name}`, severity: 'info' });

    try {
      let result;

      if (scenario.category === 'pool') {
        // Pool stress tests
        const magnitude = scenario.difficulty === 'low' ? 30 : scenario.difficulty === 'medium' ? 50 : 70;
        result = await testingApi.liquidity.stressTest(scenario.id, magnitude);
      } else if (scenario.category === 'lending') {
        // Lending stress tests
        if (scenario.id === 'price_crash') {
          const priceDrop = scenario.difficulty === 'critical' ? 50 : 30;
          result = await testingApi.lending.cascadeSimulation(priceDrop);
        } else {
          // Other lending tests
          result = await testingApi.lending.getMetrics();
        }
      } else {
        // Attack scenarios
        result = await testingApi.threats.simulateScenario(scenario.id);
      }

      if (result.success) {
        setResults((prev) => new Map(prev).set(scenario.id, result.data));
        addToast({ message: `✓ ${scenario.name} completed`, severity: 'success' });
      } else {
        addToast({ message: `✗ ${scenario.name} failed: ${result.error}`, severity: 'error' });
      }
    } catch (error) {
      addToast({ message: `Error: ${error}`, severity: 'error' });
    } finally {
      setRunningTests((prev) => {
        const newSet = new Set(prev);
        newSet.delete(scenario.id);
        return newSet;
      });
    }
  };

  const filteredScenarios =
    selectedCategory === 'all'
      ? scenarios
      : scenarios.filter((s) => s.category === selectedCategory);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'low':
        return 'text-green-500';
      case 'medium':
        return 'text-yellow-500';
      case 'high':
        return 'text-orange-500';
      case 'critical':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[color:var(--color-text-primary)]">
          ⚔️ Stress Testing & Attack Scenarios
        </h1>
        <p className="text-[color:var(--color-text-secondary)] mt-1">
          Simulate real-world DeFi exploits and stress conditions
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2">
        {[
          { id: 'all', label: 'All Scenarios' },
          { id: 'pool', label: '≈ Pool Tests' },
          { id: 'lending', label: '⎇ Lending Tests' },
          { id: 'attack', label: '⚠ Attack Scenarios' },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${selectedCategory === cat.id
                ? 'bg-[color:var(--color-accent)] text-black'
                : 'bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)]'
              }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Scenarios Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredScenarios.map((scenario) => {
          const isRunning = runningTests.has(scenario.id);
          const result = results.get(scenario.id);

          return (
            <div
              key={scenario.id}
              className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6 hover:border-[color:var(--color-accent)] transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="text-4xl">{scenario.icon}</div>
                <span
                  className={`text-xs font-bold uppercase ${getDifficultyColor(
                    scenario.difficulty
                  )}`}
                >
                  {scenario.difficulty}
                </span>
              </div>

              {/* Info */}
              <h3 className="text-lg font-bold mb-2">{scenario.name}</h3>
              <p className="text-sm text-[color:var(--color-text-secondary)] mb-4">
                {scenario.description}
              </p>

              {/* Action Button */}
              <button
                onClick={() => runStressTest(scenario)}
                disabled={isRunning}
                className={`w-full py-2 rounded-lg font-medium transition-colors ${isRunning
                    ? 'bg-gray-500 cursor-not-allowed'
                    : 'bg-[color:var(--color-accent)] hover:bg-[color:var(--color-accent-hover)] text-black'
                  }`}
              >
                {isRunning ? 'Running...' : 'Run Test'}
              </button>

              {/* Results */}
              {result && (
                <div className="mt-4 pt-4 border-t border-[color:var(--color-border)]">
                  <div className="text-xs font-bold text-[color:var(--color-accent)] mb-2">
                    RESULTS:
                  </div>
                  <div className="space-y-1 text-xs">
                    {scenario.category === 'pool' && (
                      <>
                        {result.tvl_change_pct && (
                          <div>
                            TVL Change:{' '}
                            <span className="text-red-500">
                              {result.tvl_change_pct}%
                            </span>
                          </div>
                        )}
                        {result.slippage_at_peak && (
                          <div>
                            Peak Slippage:{' '}
                            <span className="text-orange-500">
                              {result.slippage_at_peak}%
                            </span>
                          </div>
                        )}
                        {result.risk_score && (
                          <div>
                            Risk Score:{' '}
                            <span className="text-yellow-500">
                              {result.risk_score}/100
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {scenario.category === 'lending' && (
                      <>
                        {result.positions_at_risk !== undefined && (
                          <div>
                            At-Risk Positions:{' '}
                            <span className="text-red-500">
                              {result.positions_at_risk}
                            </span>
                          </div>
                        )}
                        {result.total_debt_at_risk && (
                          <div>
                            Debt at Risk:{' '}
                            <span className="text-red-500">
                              ${result.total_debt_at_risk.toLocaleString()}
                            </span>
                          </div>
                        )}
                        {result.utilization_ratio && (
                          <div>
                            Utilization:{' '}
                            <span className="text-yellow-500">
                              {result.utilization_ratio}%
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {scenario.category === 'attack' && (
                      <>
                        {result.status && (
                          <div>
                            Status:{' '}
                            <span className={result.status === 'detected' ? 'text-green-500' : 'text-red-500'}>
                              {result.status === 'detected' ? '✓ DETECTED' : '✗ UNDETECTED'}
                            </span>
                          </div>
                        )}
                        {result.events_generated && (
                          <div>
                            Events Generated:{' '}
                            <span className="text-blue-500">{result.events_generated}</span>
                          </div>
                        )}
                        {result.alerts_triggered && (
                          <div>
                            Alerts Triggered:{' '}
                            <span className="text-orange-500">{result.alerts_triggered.length}</span>
                          </div>
                        )}
                        {result.impact && (
                          <div className="mt-2 pt-2 border-t border-[color:var(--color-border)]">
                            <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-accent)] mb-1">Impact</div>
                            {Object.entries(result.impact).map(([k, v]) => (
                              <div key={k} className="flex justify-between">
                                <span className="text-[color:var(--color-text-secondary)]">{k.replace(/_/g, ' ')}</span>
                                <span className="text-white font-mono">{typeof v === 'number' ? v.toLocaleString() : String(v)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {result.timeline && result.timeline.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-[color:var(--color-border)]">
                            <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-accent)] mb-1">Timeline</div>
                            {result.timeline.slice(0, 6).map((step: any, i: number) => (
                              <div key={i} className="flex gap-2">
                                <span className="text-[color:var(--color-text-secondary)] w-10 text-right">{step.t}s</span>
                                <span>{step.action}</span>
                              </div>
                            ))}
                            {result.timeline.length > 6 && (
                              <div className="text-[color:var(--color-text-secondary)]">+{result.timeline.length - 6} more…</div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <details className="mt-2">
                    <summary className="text-xs text-[color:var(--color-accent)] cursor-pointer">
                      View Full Data
                    </summary>
                    <pre className="text-xs bg-black/20 p-2 rounded mt-1 overflow-x-auto">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info Panel */}
      <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6">
        <h3 className="font-bold text-lg mb-3">📚 Stress Test Guide</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-bold text-sm text-[color:var(--color-accent)] mb-2">
              Pool Stress Tests
            </h4>
            <ul className="text-sm text-[color:var(--color-text-secondary)] space-y-1">
              <li>• Test AMM resilience under extreme conditions</li>
              <li>• Measure slippage and price impact</li>
              <li>• Calculate time-to-drain metrics</li>
              <li>• Identify liquidity vulnerabilities</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-sm text-[color:var(--color-accent)] mb-2">
              Lending Stress Tests
            </h4>
            <ul className="text-sm text-[color:var(--color-text-secondary)] space-y-1">
              <li>• Simulate collateral price crashes</li>
              <li>• Test liquidation mechanisms</li>
              <li>• Analyze cascade effects</li>
              <li>• Measure protocol solvency</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-sm text-[color:var(--color-accent)] mb-2">
              Attack Scenarios
            </h4>
            <ul className="text-sm text-[color:var(--color-text-secondary)] space-y-1">
              <li>• Based on real DeFi exploits</li>
              <li>• Flash loan manipulation</li>
              <li>• Oracle attacks and MEV</li>
              <li>• Detect vulnerabilities before hackers</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-sm text-[color:var(--color-accent)] mb-2">
              Difficulty Levels
            </h4>
            <ul className="text-sm text-[color:var(--color-text-secondary)] space-y-1">
              <li className="text-green-500">• LOW: Minor stress conditions</li>
              <li className="text-yellow-500">• MEDIUM: Moderate pressure</li>
              <li className="text-orange-500">• HIGH: Severe stress</li>
              <li className="text-red-500">• CRITICAL: Catastrophic scenarios</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
        <h3 className="font-bold text-red-400 mb-2">⚠️ Important Notes</h3>
        <ul className="text-sm text-[color:var(--color-text-secondary)] space-y-1">
          <li>
            • All tests run in simulation mode - no real funds are at risk
          </li>
          <li>
            • Scenarios are based on actual DeFi exploits from 2022-2024
          </li>
          <li>• Results show potential vulnerabilities in protocol design</li>
          <li>
            • Use these tests to validate security before mainnet deployment
          </li>
          <li>
            • Critical scenarios may cause significant simulated losses
          </li>
        </ul>
      </div>
    </div>
  );
}
