'use client';

import React, { useState } from 'react';
import { testingApi } from '@/lib/api';
import { useUIStore } from '@/store/uiStore';

interface TestResult {
  name: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
  data?: any;
  timestamp?: string;
}

export default function TestingPage() {
  const addToast = useUIStore((state) => state.addToast);
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const updateResult = (name: string, status: TestResult['status'], message?: string, data?: any) => {
    setResults((prev) => {
      const existing = prev.findIndex((r) => r.name === name);
      const newResult: TestResult = {
        name,
        status,
        message,
        data,
        timestamp: new Date().toISOString(),
      };
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newResult;
        return updated;
      }
      return [...prev, newResult];
    });
  };

  // Liquidity Pool Tests
  const runPoolTests = async () => {
    addToast({ message: 'Running Pool Tests...', severity: 'info' });
    
    // Test 1: Get Pool State
    updateResult('Pool State', 'pending');
    const poolState = await testingApi.liquidity.getPoolState();
    updateResult(
      'Pool State',
      poolState.success ? 'success' : 'error',
      poolState.success ? 'Pool data retrieved' : poolState.error,
      poolState.data
    );

    // Test 2: Slippage Curve
    updateResult('Slippage Curve', 'pending');
    const slippage = await testingApi.liquidity.getSlippageCurve();
    updateResult(
      'Slippage Curve',
      slippage.success ? 'success' : 'error',
      slippage.success ? 'Slippage curve generated' : slippage.error,
      slippage.data
    );

    // Test 3: Depth Chart
    updateResult('Depth Chart', 'pending');
    const depth = await testingApi.liquidity.getDepthChart();
    updateResult(
      'Depth Chart',
      depth.success ? 'success' : 'error',
      depth.success ? 'Depth chart generated' : depth.error,
      depth.data
    );

    // Test 4: Stress Test - Mass Withdrawal
    updateResult('Stress: Mass Withdrawal', 'pending');
    const withdrawal = await testingApi.liquidity.stressTest('withdrawal', 50);
    updateResult(
      'Stress: Mass Withdrawal',
      withdrawal.success ? 'success' : 'error',
      withdrawal.success ? `TVL dropped ${(withdrawal.data as any)?.tvl_change_pct}%` : withdrawal.error,
      withdrawal.data
    );

    // Test 5: Stress Test - Flash Swap
    updateResult('Stress: Flash Swap', 'pending');
    const flashSwap = await testingApi.liquidity.stressTest('flash_swap', 70);
    updateResult(
      'Stress: Flash Swap',
      flashSwap.success ? 'success' : 'error',
      flashSwap.success ? `Max slippage: ${(flashSwap.data as any)?.slippage_at_peak}%` : flashSwap.error,
      flashSwap.data
    );

    addToast({ message: 'Pool tests completed', severity: 'success' });
  };

  // Lending Protocol Tests
  const runLendingTests = async () => {
    addToast({ message: 'Running Lending Tests...', severity: 'info' });

    // Test 1: Get Borrowers
    updateResult('Borrowers List', 'pending');
    const borrowers = await testingApi.lending.getBorrowers();
    updateResult(
      'Borrowers List',
      borrowers.success ? 'success' : 'error',
      borrowers.success ? `Found ${(borrowers.data as any)?.length || 0} borrowers` : borrowers.error,
      borrowers.data
    );

    // Test 2: Health Factor Check
    updateResult('Health Factor Check', 'pending');
    const health = await testingApi.lending.getHealthFactor('0xBorrower_A1');
    updateResult(
      'Health Factor Check',
      health.success ? 'success' : 'error',
      health.success ? `HF: ${(health.data as any)?.health_factor}` : health.error,
      health.data
    );

    // Test 3: Lending Metrics
    updateResult('Lending Metrics', 'pending');
    const metrics = await testingApi.lending.getMetrics();
    updateResult(
      'Lending Metrics',
      metrics.success ? 'success' : 'error',
      metrics.success ? `Utilization: ${(metrics.data as any)?.utilization_ratio}%` : metrics.error,
      metrics.data
    );

    // Test 4: Test Liquidation (simulation)
    updateResult('Liquidation Test', 'pending');
    const liquidation = await testingApi.lending.liquidate('0xBorrower_C3');
    updateResult(
      'Liquidation Test',
      liquidation.success ? 'success' : 'error',
      liquidation.success ? `Liquidated: ${(liquidation.data as any)?.status}` : liquidation.error,
      liquidation.data
    );

    // Test 5: Cascade Simulation
    updateResult('Cascade Simulation', 'pending');
    const cascade = await testingApi.lending.cascadeSimulation(30);
    updateResult(
      'Cascade Simulation',
      cascade.success ? 'success' : 'error',
      cascade.success ? `${(cascade.data as any)?.positions_at_risk} positions at risk` : cascade.error,
      cascade.data
    );

    addToast({ message: 'Lending tests completed', severity: 'success' });
  };

  // Agent Simulation Tests
  const runAgentTests = async () => {
    addToast({ message: 'Running Agent Tests...', severity: 'info' });

    // Test 1: List Agents
    updateResult('List Agents', 'pending');
    const agents = await testingApi.agents.listAgents();
    updateResult(
      'List Agents',
      agents.success ? 'success' : 'error',
      agents.success ? `Found ${(agents.data as any)?.length || 0} agents` : agents.error,
      agents.data
    );

    // Test 2: Agent Activity Feed
    updateResult('Activity Feed', 'pending');
    const activity = await testingApi.agents.getActivityFeed();
    updateResult(
      'Activity Feed',
      activity.success ? 'success' : 'error',
      activity.success ? `${(activity.data as any)?.length || 0} recent activities` : activity.error,
      activity.data
    );

    // Test 3: Start Simulation
    updateResult('Start Simulation', 'pending');
    const sim = await testingApi.simulation.start({ max_steps: 100, tick_delay: 0.3 });
    updateResult(
      'Start Simulation',
      sim.success ? 'success' : 'error',
      sim.success ? 'Simulation started' : sim.error,
      sim.data
    );

    // Wait a bit for simulation to run
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Test 4: Get Simulation Status
    updateResult('Simulation Status', 'pending');
    const status = await testingApi.simulation.getStatus();
    updateResult(
      'Simulation Status',
      status.success ? 'success' : 'error',
      status.success ? `Step ${(status.data as any)?.current_step}/${(status.data as any)?.max_steps}` : status.error,
      status.data
    );

    addToast({ message: 'Agent tests completed', severity: 'success' });
  };

  // Fraud Detection Tests
  const runFraudTests = async () => {
    addToast({ message: 'Running Fraud Detection Tests...', severity: 'info' });

    // Test 1: Get Alerts
    updateResult('Fraud Alerts', 'pending');
    const alerts = await testingApi.threats.getAlerts();
    updateResult(
      'Fraud Alerts',
      alerts.success ? 'success' : 'error',
      alerts.success ? `Found ${(alerts.data as any)?.length || 0} alerts` : alerts.error,
      alerts.data
    );

    // Test 2: Threat Scores
    updateResult('Threat Scores', 'pending');
    const scores = await testingApi.threats.getThreatScores();
    updateResult(
      'Threat Scores',
      scores.success ? 'success' : 'error',
      scores.success ? `${(scores.data as any)?.length || 0} wallets scored` : scores.error,
      scores.data
    );

    // Test 3: Simulate Flash Loan Attack
    updateResult('Simulate Flash Loan Attack', 'pending');
    const flashLoan = await testingApi.threats.simulateScenario('flash_loan_exploit');
    updateResult(
      'Simulate Flash Loan Attack',
      flashLoan.success ? 'success' : 'error',
      flashLoan.success ? 'Attack scenario executed' : flashLoan.error,
      flashLoan.data
    );

    // Test 4: Simulate Sandwich Attack
    updateResult('Simulate Sandwich Attack', 'pending');
    const sandwich = await testingApi.threats.simulateScenario('sandwich_mega');
    updateResult(
      'Simulate Sandwich Attack',
      sandwich.success ? 'success' : 'error',
      sandwich.success ? 'MEV attack simulated' : sandwich.error,
      sandwich.data
    );

    addToast({ message: 'Fraud detection tests completed', severity: 'success' });
  };

  // Credit Scoring Tests
  const runCreditTests = async () => {
    addToast({ message: 'Running Credit Scoring Tests...', severity: 'info' });

    // Test 1: Credit Leaderboard
    updateResult('Credit Leaderboard', 'pending');
    const leaderboard = await testingApi.credit.getLeaderboard();
    updateResult(
      'Credit Leaderboard',
      leaderboard.success ? 'success' : 'error',
      leaderboard.success ? `${(leaderboard.data as any)?.length || 0} borrowers ranked` : leaderboard.error,
      leaderboard.data
    );

    // Test 2: Individual Credit Score
    updateResult('Credit Score Check', 'pending');
    const score = await testingApi.credit.getScore('0xBorrower_A1');
    updateResult(
      'Credit Score Check',
      score.success ? 'success' : 'error',
      score.success ? `Score: ${(score.data as any)?.current_score}/850` : score.error,
      score.data
    );

    // Test 3: Credit History
    updateResult('Credit History', 'pending');
    const history = await testingApi.credit.getHistory('0xBorrower_A1');
    updateResult(
      'Credit History',
      history.success ? 'success' : 'error',
      history.success ? `${(history.data as any)?.length || 0} history entries` : history.error,
      history.data
    );

    // Test 4: Dynamic Interest Rates
    updateResult('Dynamic Interest Rates', 'pending');
    const rates = await testingApi.credit.getDynamicRates();
    updateResult(
      'Dynamic Interest Rates',
      rates.success ? 'success' : 'error',
      rates.success ? 'Rates calculated based on credit scores' : rates.error,
      rates.data
    );

    addToast({ message: 'Credit scoring tests completed', severity: 'success' });
  };

  // Market Data Tests
  const runMarketTests = async () => {
    addToast({ message: 'Running Market Data Tests...', severity: 'info' });

    // Test 1: Get All Market Prices
    updateResult('Market Prices', 'pending');
    const prices = await testingApi.market.getAllPrices();
    updateResult(
      'Market Prices',
      prices.success ? 'success' : 'error',
      prices.success ? 'Live prices from CoinDesk' : prices.error,
      prices.data
    );

    // Test 2: Bitcoin Price
    updateResult('Bitcoin Price', 'pending');
    const btc = await testingApi.market.getPrice('BTC');
    updateResult(
      'Bitcoin Price',
      btc.success ? 'success' : 'error',
      btc.success ? `$${(btc.data as any)?.price}` : btc.error,
      btc.data
    );

    // Test 3: Market Condition
    updateResult('Market Condition', 'pending');
    const condition = await testingApi.market.getCondition();
    updateResult(
      'Market Condition',
      condition.success ? 'success' : 'error',
      condition.success ? `${(condition.data as any)?.condition}` : condition.error,
      condition.data
    );

    addToast({ message: 'Market data tests completed', severity: 'success' });
  };

  // Run All Tests
  const runAllTests = async () => {
    setIsRunning(true);
    setResults([]);
    
    try {
      await runPoolTests();
      await runLendingTests();
      await runAgentTests();
      await runFraudTests();
      await runCreditTests();
      await runMarketTests();
      
      addToast({ message: 'All tests completed successfully!', severity: 'success' });
    } catch (error) {
      addToast({ message: 'Some tests failed', severity: 'error' });
    } finally {
      setIsRunning(false);
    }
  };

  const categories = [
    { id: 'all', label: 'All Tests', count: results.length },
    { id: 'pool', label: 'Liquidity Pool', icon: '≈' },
    { id: 'lending', label: 'Lending', icon: '⎇' },
    { id: 'agents', label: 'Agents', icon: '◈' },
    { id: 'fraud', label: 'Fraud Detection', icon: '⚠' },
    { id: 'credit', label: 'Credit Scoring', icon: '✓' },
    { id: 'market', label: 'Market Data', icon: '⊡' },
  ];

  const filteredResults =
    selectedCategory === 'all'
      ? results
      : results.filter((r) => r.name.toLowerCase().includes(selectedCategory));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[color:var(--color-text-primary)]">
            🧪 System Testing Lab
          </h1>
          <p className="text-[color:var(--color-text-secondary)] mt-1">
            Comprehensive testing suite for all platform features
          </p>
        </div>
        <button
          onClick={runAllTests}
          disabled={isRunning}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            isRunning
              ? 'bg-gray-500 cursor-not-allowed'
              : 'bg-[color:var(--color-accent)] hover:bg-[color:var(--color-accent-hover)] text-black'
          }`}
        >
          {isRunning ? 'Running Tests...' : 'Run All Tests'}
        </button>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <button
          onClick={runPoolTests}
          disabled={isRunning}
          className="p-4 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
        >
          <div className="text-2xl mb-2">≈</div>
          <div className="text-sm font-medium">Pool Tests</div>
        </button>
        <button
          onClick={runLendingTests}
          disabled={isRunning}
          className="p-4 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
        >
          <div className="text-2xl mb-2">⎇</div>
          <div className="text-sm font-medium">Lending Tests</div>
        </button>
        <button
          onClick={runAgentTests}
          disabled={isRunning}
          className="p-4 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
        >
          <div className="text-2xl mb-2">◈</div>
          <div className="text-sm font-medium">Agent Tests</div>
        </button>
        <button
          onClick={runFraudTests}
          disabled={isRunning}
          className="p-4 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
        >
          <div className="text-2xl mb-2">⚠</div>
          <div className="text-sm font-medium">Fraud Tests</div>
        </button>
        <button
          onClick={runCreditTests}
          disabled={isRunning}
          className="p-4 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
        >
          <div className="text-2xl mb-2">✓</div>
          <div className="text-sm font-medium">Credit Tests</div>
        </button>
        <button
          onClick={runMarketTests}
          disabled={isRunning}
          className="p-4 bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
        >
          <div className="text-2xl mb-2">⊡</div>
          <div className="text-sm font-medium">Market Tests</div>
        </button>
      </div>

      {/* Test Results */}
      <div className="bg-[color:var(--color-bg-secondary)] border border-[color:var(--color-border)] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Test Results</h2>
          <div className="flex gap-2 text-sm">
            <span className="text-green-500">
              ✓ {results.filter((r) => r.status === 'success').length}
            </span>
            <span className="text-red-500">
              ✗ {results.filter((r) => r.status === 'error').length}
            </span>
            <span className="text-yellow-500">
              ⟳ {results.filter((r) => r.status === 'pending').length}
            </span>
          </div>
        </div>

        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="text-center py-12 text-[color:var(--color-text-secondary)]">
              No tests run yet. Click "Run All Tests" or select a specific category above.
            </div>
          ) : (
            results.map((result, idx) => (
              <div
                key={idx}
                className="flex items-start gap-4 p-4 bg-[color:var(--color-bg-primary)] border border-[color:var(--color-border)] rounded-lg"
              >
                <div className="mt-1">
                  {result.status === 'success' && (
                    <span className="text-green-500 text-xl">✓</span>
                  )}
                  {result.status === 'error' && (
                    <span className="text-red-500 text-xl">✗</span>
                  )}
                  {result.status === 'pending' && (
                    <span className="text-yellow-500 text-xl animate-spin">⟳</span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{result.name}</div>
                  {result.message && (
                    <div className="text-sm text-[color:var(--color-text-secondary)] mt-1">
                      {result.message}
                    </div>
                  )}
                  {result.data && (
                    <details className="mt-2">
                      <summary className="text-xs text-[color:var(--color-accent)] cursor-pointer">
                        View Data
                      </summary>
                      <pre className="text-xs bg-black/20 p-2 rounded mt-1 overflow-x-auto">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
                {result.timestamp && (
                  <div className="text-xs text-[color:var(--color-text-secondary)]">
                    {new Date(result.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Info Panel */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <h3 className="font-bold text-blue-400 mb-2">ℹ️ Testing Information</h3>
        <ul className="text-sm text-[color:var(--color-text-secondary)] space-y-1">
          <li>• All tests use real simulation data, no mocks</li>
          <li>• Pool tests measure slippage, depth, and stress scenarios</li>
          <li>• Lending tests verify health factors, liquidations, and cascades</li>
          <li>• Agent tests run multi-agent simulations with real market data</li>
          <li>• Fraud tests detect sandwich attacks, flash loans, and manipulation</li>
          <li>• Credit tests validate dynamic scoring and interest rate adjustments</li>
          <li>
            • ⚠️ <strong>Note:</strong> Write operations to blockchain are simulated only
          </li>
        </ul>
      </div>
    </div>
  );
}
