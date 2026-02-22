'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Types ──────────────────────────────────────────────────────────
interface PriceData {
  symbol: string;
  name: string;
  category: string;
  price: number;
  change_24h: number;
  change_pct: number;
  high_24h: number;
  low_24h: number;
  volume: number;
  source: string;
}

interface MarketCondition {
  crypto_sentiment: string;
  crypto_avg_change: number;
  stock_sentiment: string;
  stock_avg_change: number;
  fear_greed_index: number;
  total_crypto_mcap: number;
  btc_dominance: number;
  eth_gas_gwei: number;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Vulnerability {
  id: string;
  title: string;
  severity: string;
  category: string;
  description: string;
  affected: string[];
  mitigation: string;
  trend: string;
  incidents_30d?: number;
}

interface AiPick {
  symbol: string;
  action: string;
  reasoning: string;
  target_price: number;
  risk_level: string;
}

interface AiStrategy {
  name: string;
  description: string;
  risk_level: string;
  expected_return: string;
  assets: string[];
}

interface ThreatMitigation {
  threat: string;
  action: string;
  urgency: string;
}

interface AiAnalysis {
  market_narrative?: string;
  crypto_outlook?: {
    sentiment: string;
    confidence: number;
    key_drivers: string[];
    top_picks: AiPick[];
  };
  stock_outlook?: {
    sentiment: string;
    confidence: number;
    key_drivers: string[];
    top_picks: AiPick[];
  };
  risk_warnings?: string[];
  investment_strategies?: AiStrategy[];
  threat_mitigations?: ThreatMitigation[];
  defi_specific_advice?: string;
  correlation_insight?: string;
}

// ── Helpers ────────────────────────────────────────────────────────
function fmt(v: number, compact = false) {
  if (compact) return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  if (v >= 1) return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  return v.toFixed(6);
}

function fmtUsd(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

const sentimentColor: Record<string, string> = {
  bullish: '#22c55e', extreme_greed: '#00ff88', neutral: '#94a3b8',
  bearish: '#ef4444', extreme_fear: '#ff0033',
};

const sentimentIcon: Record<string, string> = {
  bullish: '📈', extreme_greed: '🚀', neutral: '➡️', bearish: '📉', extreme_fear: '🔻',
};

const severityColor: Record<string, string> = {
  critical: '#ff0033', high: '#ff6b35', medium: '#f0a500', low: '#22c55e',
};

const actionColor: Record<string, string> = {
  buy: '#22c55e', hold: '#f0a500', sell: '#ef4444',
};

const riskBadge: Record<string, { bg: string; text: string }> = {
  conservative: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
  moderate: { bg: 'rgba(240,165,0,0.15)', text: '#f0a500' },
  aggressive: { bg: 'rgba(255,56,96,0.15)', text: '#ff3860' },
  low: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
  medium: { bg: 'rgba(240,165,0,0.15)', text: '#f0a500' },
  high: { bg: 'rgba(255,56,96,0.15)', text: '#ff3860' },
};

const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL', 'AVAX', 'LINK', 'UNI', 'AAVE', 'MATIC'];
const STOCK_SYMBOLS = ['SPX', 'NDX', 'DJI', 'TSLA', 'NVDA', 'AAPL'];

type TabType = 'overview' | 'charts' | 'vulnerabilities' | 'ai-analysis';

// ── Candlestick Chart Component (lightweight-charts) ───────────────
function CandlestickChart({ symbol, name, category }: { symbol: string; name: string; category: string }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<string>('1d');
  const [days, setDays] = useState(90);

  const fetchCandles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/market-intel/candles/${symbol}?days=${days}&interval=${interval}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.candles) {
          setCandles(json.data.candles);
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [symbol, days, interval]);

  useEffect(() => { fetchCandles(); }, [fetchCandles]);

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    let disposed = false;

    (async () => {
      const { createChart, CandlestickSeries, HistogramSeries, ColorType } = await import('lightweight-charts');
      if (disposed) return;

      // Clear previous chart
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }

      const chart = createChart(chartRef.current!, {
        width: chartRef.current!.clientWidth,
        height: 400,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#94a3b8',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'rgba(148,163,184,0.08)' },
          horzLines: { color: 'rgba(148,163,184,0.08)' },
        },
        crosshair: {
          vertLine: { color: 'rgba(0,212,255,0.3)', labelBackgroundColor: '#0d1117' },
          horzLine: { color: 'rgba(0,212,255,0.3)', labelBackgroundColor: '#0d1117' },
        },
        timeScale: {
          borderColor: 'rgba(148,163,184,0.15)',
          timeVisible: interval !== '1d',
        },
        rightPriceScale: {
          borderColor: 'rgba(148,163,184,0.15)',
        },
      });

      chartInstanceRef.current = chart;

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });

      candleSeries.setData(candles.map(c => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })));

      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      });

      chart.priceScale('vol').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });

      volumeSeries.setData(candles.map(c => ({
        time: c.time as any,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)',
      })));

      chart.timeScale().fitContent();

      const resizeObserver = new ResizeObserver(() => {
        if (chartRef.current && !disposed) {
          chart.applyOptions({ width: chartRef.current.clientWidth });
        }
      });
      resizeObserver.observe(chartRef.current!);

      return () => {
        resizeObserver.disconnect();
      };
    })();

    return () => {
      disposed = true;
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [candles, interval]);

  return (
    <div className="border border-[color:var(--color-border)] rounded-lg overflow-hidden bg-[color:var(--color-bg-secondary)]">
      <div className="p-3 border-b border-[color:var(--color-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-bold">{symbol}</span>
          <span className="text-xs text-text-tertiary">{name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{
            background: category === 'crypto' ? 'rgba(0,212,255,0.15)' : 'rgba(179,103,255,0.15)',
            color: category === 'crypto' ? '#00d4ff' : '#b367ff',
          }}>{category}</span>
        </div>
        <div className="flex items-center gap-1">
          {['1h', '4h', '1d'].map(iv => (
            <button key={iv} onClick={() => { setInterval(iv); setDays(iv === '1h' ? 7 : iv === '4h' ? 30 : 90); }}
              className="px-2 py-0.5 text-xs font-mono rounded transition-colors"
              style={{ background: interval === iv ? '#00d4ff' : 'transparent', color: interval === iv ? '#0d1117' : '#94a3b8' }}>
              {iv}
            </button>
          ))}
          {[30, 90, 180].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className="px-2 py-0.5 text-xs font-mono rounded transition-colors"
              style={{ background: days === d && interval === '1d' ? '#00d4ff' : 'transparent', color: days === d && interval === '1d' ? '#0d1117' : '#94a3b8' }}>
              {d}D
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="h-[400px] flex items-center justify-center"><span className="text-text-tertiary text-xs font-mono animate-pulse">Loading chart data…</span></div>
      ) : (
        <div ref={chartRef} className="w-full" />
      )}
    </div>
  );
}

// ── Main Page Component ────────────────────────────────────────────
export default function MarketIntelligencePage() {
  const [tab, setTab] = useState<TabType>('overview');
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, PriceData>>({});
  const [stockPrices, setStockPrices] = useState<Record<string, PriceData>>({});
  const [condition, setCondition] = useState<MarketCondition | null>(null);
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [stockVulnerabilities, setStockVulnerabilities] = useState<Vulnerability[]>([]);
  const [vulnMeta, setVulnMeta] = useState<any>({});
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [aiSource, setAiSource] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedChart, setSelectedChart] = useState('BTC');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch market overview
  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/market-intel/overview`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setCryptoPrices(json.data.crypto || {});
          setStockPrices(json.data.stocks || {});
          setCondition(json.data.market_condition || null);
          setLastUpdated(new Date());
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // Fetch vulnerabilities
  const fetchVulns = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/market-intel/vulnerabilities`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setVulnerabilities(json.data.crypto_vulnerabilities || []);
          setStockVulnerabilities(json.data.stock_vulnerabilities || []);
          setVulnMeta(json.data);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch AI analysis
  const fetchAi = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/market-intel/ai-analysis`, { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setAiAnalysis(json.data.analysis || null);
          setAiSource(json.data.source || 'unknown');
        }
      }
    } catch { /* ignore */ }
    setAiLoading(false);
  }, []);

  useEffect(() => {
    fetchOverview();
    fetchVulns();
  }, [fetchOverview, fetchVulns]);

  useEffect(() => {
    if (!autoRefresh) return;
    const iv = window.setInterval(fetchOverview, 30000);
    return () => clearInterval(iv);
  }, [autoRefresh, fetchOverview]);

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'overview', label: 'Market Overview', icon: '📊' },
    { key: 'charts', label: 'Candle Charts', icon: '🕯️' },
    { key: 'vulnerabilities', label: 'Threats & Risks', icon: '🛡️' },
    { key: 'ai-analysis', label: 'AI Investment Intel', icon: '🤖' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono flex items-center gap-2">
            <span className="text-[#00d4ff]">◈</span> Market Intelligence
          </h1>
          <p className="text-xs text-text-tertiary mt-1 font-mono">
            Live crypto & stock data • CoinDesk API • Groq AI Analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-text-tertiary font-mono">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className="px-3 py-1.5 text-xs font-mono rounded border transition-colors"
            style={{
              borderColor: autoRefresh ? '#22c55e' : '#64748b',
              color: autoRefresh ? '#22c55e' : '#64748b',
              background: autoRefresh ? 'rgba(34,197,94,0.1)' : 'transparent',
            }}>
            {autoRefresh ? '● AUTO' : '○ PAUSED'}
          </button>
          <button onClick={fetchOverview}
            className="px-3 py-1.5 text-xs font-mono rounded border border-[#00d4ff] text-[#00d4ff] hover:bg-[rgba(0,212,255,0.1)] transition-colors">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[color:var(--color-border)] pb-0">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); if (t.key === 'ai-analysis' && !aiAnalysis) fetchAi(); }}
            className="px-4 py-2.5 text-xs font-mono transition-colors relative"
            style={{
              color: tab === t.key ? '#00d4ff' : '#94a3b8',
              borderBottom: tab === t.key ? '2px solid #00d4ff' : '2px solid transparent',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ OVERVIEW TAB ═══════════════════ */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Market Condition Cards */}
          {condition && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
                <div className="text-xs text-text-tertiary font-mono mb-1">Fear & Greed</div>
                <div className="text-2xl font-bold font-mono" style={{ color: condition.fear_greed_index > 60 ? '#22c55e' : condition.fear_greed_index < 40 ? '#ef4444' : '#f0a500' }}>
                  {condition.fear_greed_index}
                </div>
                <div className="w-full h-1.5 rounded bg-[color:var(--color-bg-accent)] mt-2">
                  <div className="h-full rounded transition-all" style={{ width: `${condition.fear_greed_index}%`, background: condition.fear_greed_index > 60 ? '#22c55e' : condition.fear_greed_index < 40 ? '#ef4444' : '#f0a500' }} />
                </div>
              </div>
              <div className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
                <div className="text-xs text-text-tertiary font-mono mb-1">Crypto Sentiment</div>
                <div className="text-lg font-bold font-mono flex items-center gap-1" style={{ color: sentimentColor[condition.crypto_sentiment] || '#94a3b8' }}>
                  {sentimentIcon[condition.crypto_sentiment] || '•'} {condition.crypto_sentiment}
                </div>
                <div className="text-xs font-mono mt-1" style={{ color: condition.crypto_avg_change >= 0 ? '#22c55e' : '#ef4444' }}>
                  {condition.crypto_avg_change >= 0 ? '+' : ''}{condition.crypto_avg_change}% avg
                </div>
              </div>
              <div className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
                <div className="text-xs text-text-tertiary font-mono mb-1">BTC Dominance</div>
                <div className="text-2xl font-bold font-mono text-[#f7931a]">{condition.btc_dominance}%</div>
                <div className="text-xs text-text-tertiary font-mono mt-1">ETH Gas: {condition.eth_gas_gwei} gwei</div>
              </div>
              <div className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
                <div className="text-xs text-text-tertiary font-mono mb-1">Stock Sentiment</div>
                <div className="text-lg font-bold font-mono flex items-center gap-1" style={{ color: sentimentColor[condition.stock_sentiment] || '#94a3b8' }}>
                  {sentimentIcon[condition.stock_sentiment] || '•'} {condition.stock_sentiment}
                </div>
                <div className="text-xs font-mono mt-1" style={{ color: condition.stock_avg_change >= 0 ? '#22c55e' : '#ef4444' }}>
                  {condition.stock_avg_change >= 0 ? '+' : ''}{condition.stock_avg_change}% avg
                </div>
              </div>
            </div>
          )}

          {/* Crypto Prices */}
          <div>
            <h2 className="text-sm font-mono font-bold mb-3 flex items-center gap-2">
              <span className="text-[#00d4ff]">₿</span> Cryptocurrency Markets
              <span className="text-xs text-text-tertiary font-normal">Live from CoinDesk</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {CRYPTO_SYMBOLS.map(sym => {
                const d = cryptoPrices[sym];
                if (!d) return null;
                const up = d.change_pct >= 0;
                return (
                  <button key={sym} onClick={() => { setSelectedChart(sym); setTab('charts'); }}
                    className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] hover:border-[#00d4ff] transition-all text-left group cursor-pointer">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold">{sym}</span>
                        <span className="text-xs text-text-tertiary">{d.name}</span>
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,212,255,0.15)', color: '#00d4ff' }}>
                        📈 Chart
                      </span>
                    </div>
                    <div className="text-xl font-bold font-mono">${fmt(d.price)}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs font-mono" style={{ color: up ? '#22c55e' : '#ef4444' }}>
                        {up ? '▲' : '▼'} {up ? '+' : ''}{d.change_pct?.toFixed(2)}%
                      </span>
                      <span className="text-xs text-text-tertiary font-mono">
                        Vol {fmtUsd(d.volume || 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-xs text-text-tertiary font-mono">
                      <span>H ${fmt(d.high_24h)}</span>
                      <span>L ${fmt(d.low_24h)}</span>
                    </div>
                    {d.source && (
                      <div className="mt-1.5">
                        <span className="text-xs px-1 py-0.5 rounded" style={{
                          background: d.source === 'coindesk' ? 'rgba(0,212,255,0.1)' : d.source === 'coingecko' ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.1)',
                          color: d.source === 'coindesk' ? '#00d4ff' : d.source === 'coingecko' ? '#22c55e' : '#94a3b8',
                        }}>
                          {d.source === 'coindesk' ? '● CoinDesk' : d.source === 'coingecko' ? '● CoinGecko' : '○ Simulated'}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stock Prices */}
          <div>
            <h2 className="text-sm font-mono font-bold mb-3 flex items-center gap-2">
              <span className="text-[#b367ff]">📈</span> Stock Market Indices
              <span className="text-xs text-text-tertiary font-normal">Simulated real-time</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {STOCK_SYMBOLS.map(sym => {
                const d = stockPrices[sym];
                if (!d) return null;
                const up = d.change_pct >= 0;
                return (
                  <button key={sym} onClick={() => { setSelectedChart(sym); setTab('charts'); }}
                    className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] hover:border-[#b367ff] transition-all text-left cursor-pointer group">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold">{sym}</span>
                        <span className="text-xs text-text-tertiary">{d.name}</span>
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(179,103,255,0.15)', color: '#b367ff' }}>
                        📈 Chart
                      </span>
                    </div>
                    <div className="text-xl font-bold font-mono">${fmt(d.price)}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs font-mono" style={{ color: up ? '#22c55e' : '#ef4444' }}>
                        {up ? '▲' : '▼'} {up ? '+' : ''}{d.change_pct?.toFixed(2)}%
                      </span>
                      <span className="text-xs text-text-tertiary font-mono">
                        H ${fmt(d.high_24h)} / L ${fmt(d.low_24h)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ CHARTS TAB ═══════════════════ */}
      {tab === 'charts' && (
        <div className="space-y-4">
          {/* Symbol Selector */}
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-text-tertiary font-mono self-center mr-2">Crypto:</span>
            {CRYPTO_SYMBOLS.map(sym => (
              <button key={sym} onClick={() => setSelectedChart(sym)}
                className="px-3 py-1.5 text-xs font-mono rounded border transition-colors"
                style={{
                  borderColor: selectedChart === sym ? '#00d4ff' : 'var(--color-border)',
                  background: selectedChart === sym ? 'rgba(0,212,255,0.15)' : 'transparent',
                  color: selectedChart === sym ? '#00d4ff' : '#94a3b8',
                }}>
                {sym}
              </button>
            ))}
            <span className="text-xs text-text-tertiary font-mono self-center mx-2">Stocks:</span>
            {STOCK_SYMBOLS.map(sym => (
              <button key={sym} onClick={() => setSelectedChart(sym)}
                className="px-3 py-1.5 text-xs font-mono rounded border transition-colors"
                style={{
                  borderColor: selectedChart === sym ? '#b367ff' : 'var(--color-border)',
                  background: selectedChart === sym ? 'rgba(179,103,255,0.15)' : 'transparent',
                  color: selectedChart === sym ? '#b367ff' : '#94a3b8',
                }}>
                {sym}
              </button>
            ))}
          </div>

          {/* Current Price Bar */}
          {(() => {
            const d = cryptoPrices[selectedChart] || stockPrices[selectedChart];
            if (!d) return null;
            const up = d.change_pct >= 0;
            return (
              <div className="flex items-center gap-6 p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
                <div>
                  <span className="text-sm font-mono text-text-tertiary">{d.name}</span>
                  <div className="text-3xl font-bold font-mono">${fmt(d.price)}</div>
                </div>
                <div className="text-lg font-mono font-bold" style={{ color: up ? '#22c55e' : '#ef4444' }}>
                  {up ? '▲' : '▼'} {up ? '+' : ''}{d.change_pct?.toFixed(2)}%
                </div>
                <div className="text-xs text-text-tertiary font-mono space-y-1">
                  <div>24h High: <span className="text-text-primary">${fmt(d.high_24h)}</span></div>
                  <div>24h Low: <span className="text-text-primary">${fmt(d.low_24h)}</span></div>
                </div>
                <div className="text-xs text-text-tertiary font-mono">
                  <div>Volume: <span className="text-text-primary">{fmtUsd(d.volume || 0)}</span></div>
                  <div>Source: <span style={{ color: d.source === 'coindesk' ? '#00d4ff' : '#94a3b8' }}>{d.source}</span></div>
                </div>
              </div>
            );
          })()}

          {/* Candlestick Chart */}
          <CandlestickChart
            key={selectedChart}
            symbol={selectedChart}
            name={(cryptoPrices[selectedChart] || stockPrices[selectedChart])?.name || selectedChart}
            category={(cryptoPrices[selectedChart] || stockPrices[selectedChart])?.category || 'crypto'}
          />

          {/* Mini charts grid */}
          <h3 className="text-sm font-mono font-bold mt-4">Quick View — All Assets</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...CRYPTO_SYMBOLS.slice(0, 4), ...STOCK_SYMBOLS.slice(0, 2)].filter(s => s !== selectedChart).map(sym => {
              const d = cryptoPrices[sym] || stockPrices[sym];
              if (!d) return null;
              return (
                <div key={sym} className="cursor-pointer" onClick={() => setSelectedChart(sym)}>
                  <CandlestickChart symbol={sym} name={d.name} category={d.category} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════ VULNERABILITIES TAB ═══════════════════ */}
      {tab === 'vulnerabilities' && (
        <div className="space-y-6">
          {/* Risk Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-lg border border-[#ff0033]/30 bg-[rgba(255,0,51,0.05)]">
              <div className="text-xs text-text-tertiary font-mono mb-1">Critical Threats</div>
              <div className="text-3xl font-bold font-mono text-[#ff0033]">{vulnMeta.critical_count || 0}</div>
            </div>
            <div className="p-4 rounded-lg border border-[#ff6b35]/30 bg-[rgba(255,107,53,0.05)]">
              <div className="text-xs text-text-tertiary font-mono mb-1">High Severity</div>
              <div className="text-3xl font-bold font-mono text-[#ff6b35]">{vulnMeta.high_count || 0}</div>
            </div>
            <div className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
              <div className="text-xs text-text-tertiary font-mono mb-1">Total Tracked</div>
              <div className="text-3xl font-bold font-mono">{(vulnMeta.total_crypto || 0) + (vulnMeta.total_stock || 0)}</div>
            </div>
            <div className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
              <div className="text-xs text-text-tertiary font-mono mb-1">Risk Score</div>
              <div className="text-3xl font-bold font-mono" style={{ color: (vulnMeta.risk_score || 0) > 70 ? '#ff0033' : (vulnMeta.risk_score || 0) > 50 ? '#f0a500' : '#22c55e' }}>
                {vulnMeta.risk_score || 0}
              </div>
            </div>
          </div>

          {/* Crypto Vulnerabilities */}
          <div>
            <h3 className="text-sm font-mono font-bold mb-3 flex items-center gap-2">
              <span className="text-[#ff0033]">⚠</span> Crypto & DeFi Vulnerabilities
            </h3>
            <div className="space-y-3">
              {vulnerabilities.map(v => (
                <div key={v.id} className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded font-bold" style={{
                        background: `${severityColor[v.severity]}22`,
                        color: severityColor[v.severity],
                        border: `1px solid ${severityColor[v.severity]}44`,
                      }}>{v.severity.toUpperCase()}</span>
                      <span className="text-sm font-mono font-bold">{v.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.trend && (
                        <span className="text-xs font-mono" style={{
                          color: v.trend === 'increasing' ? '#ff0033' : v.trend === 'decreasing' ? '#22c55e' : '#f0a500',
                        }}>
                          {v.trend === 'increasing' ? '↑ Rising' : v.trend === 'decreasing' ? '↓ Falling' : '→ Stable'}
                        </span>
                      )}
                      {v.incidents_30d !== undefined && (
                        <span className="text-xs text-text-tertiary font-mono">{v.incidents_30d} incidents/30d</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary mb-2">{v.description}</p>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <span className="text-xs text-text-tertiary font-mono">Affected: </span>
                      <span className="text-xs text-text-secondary">{v.affected.join(', ')}</span>
                    </div>
                    <div className="flex-1">
                      <span className="text-xs font-mono text-[#22c55e]">✦ Mitigation: </span>
                      <span className="text-xs text-text-secondary">{v.mitigation}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stock Vulnerabilities */}
          <div>
            <h3 className="text-sm font-mono font-bold mb-3 flex items-center gap-2">
              <span className="text-[#b367ff]">📉</span> Stock Market Risks
            </h3>
            <div className="space-y-3">
              {stockVulnerabilities.map(v => (
                <div key={v.id} className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded font-bold" style={{
                      background: `${severityColor[v.severity]}22`,
                      color: severityColor[v.severity],
                      border: `1px solid ${severityColor[v.severity]}44`,
                    }}>{v.severity.toUpperCase()}</span>
                    <span className="text-sm font-mono font-bold">{v.title}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[rgba(179,103,255,0.1)] text-[#b367ff]">{v.category}</span>
                  </div>
                  <p className="text-xs text-text-secondary mb-2">{v.description}</p>
                  <div>
                    <span className="text-xs font-mono text-[#22c55e]">✦ Mitigation: </span>
                    <span className="text-xs text-text-secondary">{v.mitigation}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ AI ANALYSIS TAB ═══════════════════ */}
      {tab === 'ai-analysis' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <span className="text-sm font-mono font-bold">Groq AI Market Intelligence</span>
              {aiSource && (
                <span className="text-xs px-2 py-0.5 rounded" style={{
                  background: aiSource === 'groq' ? 'rgba(0,212,255,0.15)' : 'rgba(240,165,0,0.15)',
                  color: aiSource === 'groq' ? '#00d4ff' : '#f0a500',
                }}>
                  {aiSource === 'groq' ? '● Groq LLM' : '○ Fallback'}
                </span>
              )}
            </div>
            <button onClick={fetchAi} disabled={aiLoading}
              className="px-4 py-2 text-xs font-mono rounded border border-[#00d4ff] text-[#00d4ff] hover:bg-[rgba(0,212,255,0.1)] transition-colors disabled:opacity-50">
              {aiLoading ? '⏳ Analyzing…' : '🔄 Generate Analysis'}
            </button>
          </div>

          {aiLoading && (
            <div className="p-12 text-center">
              <div className="text-2xl animate-pulse mb-3">🧠</div>
              <div className="text-sm text-text-tertiary font-mono">Groq AI is analyzing markets…</div>
              <div className="text-xs text-text-tertiary font-mono mt-1">Processing live data from CoinDesk + vulnerability landscape</div>
            </div>
          )}

          {!aiLoading && aiAnalysis && (
            <>
              {/* Market Narrative */}
              {aiAnalysis.market_narrative && (
                <div className="p-4 rounded-lg border border-[#00d4ff]/30 bg-[rgba(0,212,255,0.03)]">
                  <div className="text-xs text-[#00d4ff] font-mono mb-2">MARKET NARRATIVE</div>
                  <p className="text-sm text-text-primary leading-relaxed">{aiAnalysis.market_narrative}</p>
                </div>
              )}

              {/* Outlook Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Crypto Outlook */}
                {aiAnalysis.crypto_outlook && (
                  <div className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-mono font-bold">₿ Crypto Outlook</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded" style={{
                        background: `${sentimentColor[aiAnalysis.crypto_outlook.sentiment] || '#94a3b8'}22`,
                        color: sentimentColor[aiAnalysis.crypto_outlook.sentiment] || '#94a3b8',
                      }}>
                        {aiAnalysis.crypto_outlook.sentiment?.toUpperCase()} ({aiAnalysis.crypto_outlook.confidence}% conf)
                      </span>
                    </div>
                    <div className="text-xs text-text-tertiary font-mono mb-2">Key Drivers:</div>
                    <ul className="space-y-1 mb-3">
                      {aiAnalysis.crypto_outlook.key_drivers?.map((d, i) => (
                        <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                          <span className="text-[#00d4ff] mt-0.5">▸</span> {d}
                        </li>
                      ))}
                    </ul>
                    <div className="text-xs text-text-tertiary font-mono mb-2">Top Picks:</div>
                    <div className="space-y-2">
                      {aiAnalysis.crypto_outlook.top_picks?.map((pick, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-[color:var(--color-bg-accent)]">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold">{pick.symbol}</span>
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded font-bold" style={{
                              background: `${actionColor[pick.action] || '#94a3b8'}22`,
                              color: actionColor[pick.action] || '#94a3b8',
                            }}>{pick.action?.toUpperCase()}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-mono text-text-primary">Target: ${fmt(pick.target_price)}</div>
                            <div className="text-xs font-mono" style={{ color: riskBadge[pick.risk_level]?.text || '#94a3b8' }}>
                              {pick.risk_level} risk
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stock Outlook */}
                {aiAnalysis.stock_outlook && (
                  <div className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-mono font-bold">📈 Stock Outlook</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded" style={{
                        background: `${sentimentColor[aiAnalysis.stock_outlook.sentiment] || '#94a3b8'}22`,
                        color: sentimentColor[aiAnalysis.stock_outlook.sentiment] || '#94a3b8',
                      }}>
                        {aiAnalysis.stock_outlook.sentiment?.toUpperCase()} ({aiAnalysis.stock_outlook.confidence}% conf)
                      </span>
                    </div>
                    <div className="text-xs text-text-tertiary font-mono mb-2">Key Drivers:</div>
                    <ul className="space-y-1 mb-3">
                      {aiAnalysis.stock_outlook.key_drivers?.map((d, i) => (
                        <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                          <span className="text-[#b367ff] mt-0.5">▸</span> {d}
                        </li>
                      ))}
                    </ul>
                    <div className="text-xs text-text-tertiary font-mono mb-2">Top Picks:</div>
                    <div className="space-y-2">
                      {aiAnalysis.stock_outlook.top_picks?.map((pick, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-[color:var(--color-bg-accent)]">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold">{pick.symbol}</span>
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded font-bold" style={{
                              background: `${actionColor[pick.action] || '#94a3b8'}22`,
                              color: actionColor[pick.action] || '#94a3b8',
                            }}>{pick.action?.toUpperCase()}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-mono text-text-primary">Target: ${fmt(pick.target_price)}</div>
                            <div className="text-xs font-mono" style={{ color: riskBadge[pick.risk_level]?.text || '#94a3b8' }}>
                              {pick.risk_level} risk
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Investment Strategies */}
              {aiAnalysis.investment_strategies && aiAnalysis.investment_strategies.length > 0 && (
                <div>
                  <h3 className="text-sm font-mono font-bold mb-3 flex items-center gap-2">
                    <span className="text-[#22c55e]">💰</span> Investment Strategies
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {aiAnalysis.investment_strategies.map((s, i) => (
                      <div key={i} className="p-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-mono font-bold">{s.name}</span>
                          <span className="text-xs font-mono px-2 py-0.5 rounded" style={{
                            background: riskBadge[s.risk_level]?.bg || 'transparent',
                            color: riskBadge[s.risk_level]?.text || '#94a3b8',
                          }}>{s.risk_level}</span>
                        </div>
                        <p className="text-xs text-text-secondary mb-3">{s.description}</p>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs text-text-tertiary font-mono">Expected Return</div>
                            <div className="text-sm font-mono font-bold text-[#22c55e]">{s.expected_return}</div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {s.assets?.map(a => (
                              <span key={a} className="text-xs px-1.5 py-0.5 rounded bg-[color:var(--color-bg-accent)] text-text-secondary font-mono">{a}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Warnings */}
              {aiAnalysis.risk_warnings && aiAnalysis.risk_warnings.length > 0 && (
                <div className="p-4 rounded-lg border border-[#ff3860]/30 bg-[rgba(255,56,96,0.03)]">
                  <div className="text-xs text-[#ff3860] font-mono font-bold mb-2">⚠ RISK WARNINGS</div>
                  <ul className="space-y-1.5">
                    {aiAnalysis.risk_warnings.map((w, i) => (
                      <li key={i} className="text-xs text-text-secondary flex items-start gap-2">
                        <span className="text-[#ff3860] mt-0.5">●</span> {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Threat Mitigations */}
              {aiAnalysis.threat_mitigations && aiAnalysis.threat_mitigations.length > 0 && (
                <div>
                  <h3 className="text-sm font-mono font-bold mb-3">🛡️ Threat Mitigations</h3>
                  <div className="space-y-2">
                    {aiAnalysis.threat_mitigations.map((m, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)]">
                        <span className="text-xs font-mono px-2 py-0.5 rounded font-bold" style={{
                          background: m.urgency === 'immediate' ? 'rgba(255,0,51,0.15)' : m.urgency === 'short-term' ? 'rgba(240,165,0,0.15)' : 'rgba(34,197,94,0.15)',
                          color: m.urgency === 'immediate' ? '#ff0033' : m.urgency === 'short-term' ? '#f0a500' : '#22c55e',
                        }}>{m.urgency}</span>
                        <div className="flex-1">
                          <div className="text-xs font-mono font-bold">{m.threat}</div>
                          <div className="text-xs text-text-secondary mt-0.5">{m.action}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DeFi & Correlation Insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {aiAnalysis.defi_specific_advice && (
                  <div className="p-4 rounded-lg border border-[#00d4ff]/20 bg-[rgba(0,212,255,0.03)]">
                    <div className="text-xs text-[#00d4ff] font-mono font-bold mb-2">🔗 DeFi-Specific Advice</div>
                    <p className="text-xs text-text-secondary leading-relaxed">{aiAnalysis.defi_specific_advice}</p>
                  </div>
                )}
                {aiAnalysis.correlation_insight && (
                  <div className="p-4 rounded-lg border border-[#b367ff]/20 bg-[rgba(179,103,255,0.03)]">
                    <div className="text-xs text-[#b367ff] font-mono font-bold mb-2">📊 Crypto-Stock Correlation</div>
                    <p className="text-xs text-text-secondary leading-relaxed">{aiAnalysis.correlation_insight}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {!aiLoading && !aiAnalysis && (
            <div className="p-16 text-center border border-[color:var(--color-border)] rounded-lg bg-[color:var(--color-bg-secondary)]">
              <div className="text-4xl mb-3">🤖</div>
              <div className="text-sm font-mono text-text-secondary mb-1">AI Analysis Not Generated Yet</div>
              <div className="text-xs text-text-tertiary font-mono mb-4">Click "Generate Analysis" to get Groq AI-powered market intelligence</div>
              <button onClick={fetchAi}
                className="px-6 py-2.5 text-xs font-mono rounded bg-[#00d4ff] text-[#0d1117] font-bold hover:brightness-110 transition-all">
                🧠 Generate AI Analysis
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
