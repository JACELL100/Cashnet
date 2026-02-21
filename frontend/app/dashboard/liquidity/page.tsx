"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import KPICard from "@/components/KPICard";
import Terminal from "@/components/Terminal";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PoolState {
  pool_id: string;
  name: string;
  token0: string;
  token1: string;
  reserve0: number;
  reserve1: number;
  price_token0_per_token1: number;
  price_token1_per_token0: number;
  k_product: number;
  tvl: number;
  total_lp_tokens: number;
  fee_pct: number;
  volume_24h: number;
  swap_count: number;
  provider_count: number;
}

interface SlippagePoint {
  trade_size_usd: number;
  slippage_pct: number;
}

interface DepthPoint {
  price: number;
  liquidity_usd: number;
}

interface DepthData {
  spot_price: number;
  bids: DepthPoint[];
  asks: DepthPoint[];
}

interface StressResult {
  scenario: string;
  tvl_change_pct: number;
  price_change_pct: number;
  slippage_at_peak: number;
  time_to_drain_estimate: number;
  events: string[];
  risk_score: number;
}

interface ILPoint { price_ratio: number; il_pct: number }
interface ILData {
  entry_price: number;
  current_price: number;
  il_pct_now: number;
  il_curve: ILPoint[];
}

interface RiskPrediction {
  slippage_pct:       number;
  drain_risk_score:   number;
  drain_risk_label:   "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  il_forecast_1h:     number;
  il_forecast_24h:    number;
  anomaly_score:      number;
  is_anomaly:         boolean;
  confidence:         number;
  warnings:           string[];
}
interface MLSlippagePoint { trade_size: number; slippage_pct: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, dec = 2) => n?.toLocaleString(undefined, { maximumFractionDigits: dec }) ?? "—";
const fmtUSD = (n: number) => "$" + fmt(n);
const fmtPct = (n: number) => fmt(n, 4) + "%";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LiquidityPage() {
  const poolId = "default";
  const POOL_BASE = `/liquidity-engine/pools/${poolId}`;

  // ── State ──────────────────────────────────────────────────────────────────
  const [pool, setPool] = useState<PoolState | null>(null);
  const [slippage, setSlippage] = useState<SlippagePoint[]>([]);
  const [depth, setDepth] = useState<DepthData | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Forms
  const [addAmt, setAddAmt] = useState("10000");
  const [addProvider, setAddProvider] = useState("sim_user");
  const [removeLp, setRemoveLp] = useState("");
  const [removeProvider, setRemoveProvider] = useState("sim_user");
  const [swapDir, setSwapDir] = useState<"token0_to_token1" | "token1_to_token0">("token0_to_token1");
  const [swapAmt, setSwapAmt] = useState("1000");

  // Stress test
  const [stressScenario, setStressScenario] = useState<string>("flash_swap");
  const [stressIntensity, setStressIntensity] = useState(1.0);
  const [stressLoading, setStressLoading] = useState(false);
  const [stressResult, setStressResult] = useState<StressResult | null>(null);

  // IL calculator
  const [ilEntryPrice, setIlEntryPrice] = useState("");
  const [ilData, setIlData] = useState<ILData | null>(null);

  // Operation feedback
  const [opLoading, setOpLoading] = useState(false);
  const [opMsg, setOpMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // ML Risk Model
  const [mlPrediction, setMlPrediction] = useState<RiskPrediction | null>(null);
  const [mlSlippageCurve, setMlSlippageCurve] = useState<MLSlippagePoint[]>([]);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlTradeSize, setMlTradeSize] = useState("1000");

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchPool = useCallback(async () => {
    try {
      const res = await apiFetch(`${POOL_BASE}/state`);
      if (res.success) setPool(res.data);
    } catch { /* silent refresh error */ }
  }, [POOL_BASE]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const [slipRes, depthRes, evtRes] = await Promise.all([
        apiFetch(`${POOL_BASE}/slippage-curve?steps=20`),
        apiFetch(`${POOL_BASE}/depth-chart?price_range_pct=10&levels=15`),
        apiFetch(`${POOL_BASE}/events?limit=20`),
      ]);
      if (slipRes.success) setSlippage(slipRes.data);
      if (depthRes.success) setDepth(depthRes.data);
      if (evtRes.success) {
        const lines: string[] = evtRes.data.map(
          (e: { event_type: string; description: string }) =>
            `[${e.event_type}] ${e.description}`
        );
        setEvents(lines);
      }
    } catch { /* silent */ }
  }, [POOL_BASE]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    try {
      await fetchPool();
      await fetchAnalytics();
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load pool");
    } finally {
      setLoading(false);
    }
  }, [fetchPool, fetchAnalytics]);

  const fetchMLRisk = useCallback(async () => {
    setMlLoading(true);
    try {
      const [pred, curve] = await Promise.all([
        apiFetch(`/liquidity-engine/ml/predict/from-pool/${poolId}?trade_size=${parseFloat(mlTradeSize) || 0}`),
        apiFetch(`/liquidity-engine/ml/slippage-curve?pool_id=${poolId}&steps=20`),
      ]);
      setMlPrediction(pred);
      setMlSlippageCurve(Array.isArray(curve) ? curve : []);
    } catch { /* silent */ } finally {
      setMlLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, mlTradeSize]);

  useEffect(() => {
    initialLoad();
    const id = setInterval(fetchPool, 3000);
    const idA = setInterval(fetchAnalytics, 8000);
    return () => { clearInterval(id); clearInterval(idA); };
  }, [initialLoad, fetchPool, fetchAnalytics]);

  useEffect(() => {
    if (pool) fetchMLRisk();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool?.price_token0_per_token1]);

  // ── Operation helpers ──────────────────────────────────────────────────────

  const run = async (label: string, fn: () => Promise<void>) => {
    setOpLoading(true);
    setOpMsg(null);
    try {
      await fn();
      setOpMsg({ text: `${label} successful`, ok: true });
      await fetchPool();
      await fetchAnalytics();
    } catch (e: unknown) {
      setOpMsg({ text: e instanceof Error ? e.message : "Error", ok: false });
    } finally {
      setOpLoading(false);
    }
  };

  const handleAddLiquidity = () =>
    run("Add liquidity", async () => {
      await apiFetch(`${POOL_BASE}/add-liquidity`, {
        method: "POST",
        body: JSON.stringify({ provider: addProvider, amount0: parseFloat(addAmt) }),
      });
    });

  const handleRemoveLiquidity = () =>
    run("Remove liquidity", async () => {
      await apiFetch(`${POOL_BASE}/remove-liquidity`, {
        method: "POST",
        body: JSON.stringify({ provider: removeProvider, lp_tokens: parseFloat(removeLp) }),
      });
    });

  const handleSwap = () =>
    run("Swap", async () => {
      await apiFetch(`${POOL_BASE}/swap`, {
        method: "POST",
        body: JSON.stringify({ direction: swapDir, amount_in: parseFloat(swapAmt) }),
      });
    });

  const handleStressTest = async () => {
    setStressLoading(true);
    setStressResult(null);
    try {
      const res = await apiFetch(`${POOL_BASE}/stress-test`, {
        method: "POST",
        body: JSON.stringify({ scenario: stressScenario, intensity: stressIntensity }),
      });
      if (res.success) setStressResult(res.data);
    } catch (e: unknown) {
      setOpMsg({ text: e instanceof Error ? e.message : "Stress test failed", ok: false });
    } finally {
      setStressLoading(false);
    }
  };

  const handleCalcIL = async () => {
    if (!ilEntryPrice) return;
    try {
      const res = await apiFetch(`${POOL_BASE}/impermanent-loss`, {
        method: "POST",
        body: JSON.stringify({ entry_price: parseFloat(ilEntryPrice) }),
      });
      if (res.success) setIlData(res.data);
    } catch (e: unknown) {
      setOpMsg({ text: e instanceof Error ? e.message : "IL calc failed", ok: false });
    }
  };

  const handleResetPool = () =>
    run("Pool reset", async () => {
      await apiFetch(`/liquidity-engine/pools/reset-default`, { method: "POST" });
    });

  // ── Depth chart merged data ────────────────────────────────────────────────
  const depthChartData = depth
    ? [
        ...depth.bids.slice().reverse().map((b) => ({ price: b.price, bids: b.liquidity_usd, asks: 0 })),
        ...depth.asks.map((a) => ({ price: a.price, bids: 0, asks: a.liquidity_usd })),
      ]
    : [];

  const riskColor = (score: number) =>
    score >= 70 ? "text-danger" : score >= 40 ? "text-warning" : "text-success";

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading && !pool) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-secondary font-mono text-sm animate-pulse">Initialising AMM Engine…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-danger font-mono text-sm">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-mono text-text-primary uppercase tracking-wide">
            Liquidity Pool Engine
          </h1>
          <p className="text-xs text-text-tertiary font-mono mt-1">
            {pool?.name} · Constant Product AMM (x·y=k) · Fee {pool?.fee_pct?.toFixed(2)}%
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-success font-mono">LIVE</span>
          </div>
          <button onClick={handleResetPool} className="btn warn text-xs py-1 px-3 font-mono">
            RESET POOL
          </button>
        </div>
      </div>

      {/* Operation feedback */}
      {opMsg && (
        <div className={`text-xs font-mono px-4 py-2 rounded border ${
          opMsg.ok
            ? "border-success text-success bg-[rgba(0,212,99,0.05)]"
            : "border-danger text-danger bg-[rgba(255,56,96,0.05)]"
        }`}>
          {opMsg.ok ? "✓" : "✗"} {opMsg.text}
        </div>
      )}

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="TVL" value={fmtUSD(pool?.tvl ?? 0)} subtext="Total value locked" />
        <KPICard label={`1 ${pool?.token1 ?? "ETH"}`} value={fmtUSD(pool?.price_token0_per_token1 ?? 0)} subtext="Spot price" />
        <KPICard label={`${pool?.token0 ?? "USDC"} Reserve`} value={fmtUSD(pool?.reserve0 ?? 0)} subtext="In pool" />
        <KPICard label={`${pool?.token1 ?? "ETH"} Reserve`} value={fmt(pool?.reserve1 ?? 0, 4)} subtext="In pool" />
        <KPICard label="Volume 24h" value={fmtUSD(pool?.volume_24h ?? 0)} subtext={`${pool?.swap_count ?? 0} swaps`} />
        <KPICard label="K Invariant" value={((pool?.k_product ?? 0) / 1e9).toFixed(3) + "B"} subtext="x · y = k" />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Slippage Curve */}
        <div className="card">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase mb-4">Slippage Curve</h3>
          {slippage.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={slippage} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="trade_size_usd" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "var(--color-text-tertiary)", fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fill: "var(--color-text-tertiary)", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  formatter={(v: number) => [`${v.toFixed(4)}%`, "Slippage"]}
                  labelFormatter={(v) => `Trade: $${Number(v).toLocaleString()}`}
                />
                <Line type="monotone" dataKey="slippage_pct" stroke="var(--color-accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-text-tertiary text-xs font-mono">Loading…</div>
          )}
        </div>

        {/* Depth Chart */}
        <div className="card">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase mb-4">
            Liquidity Depth
            {depth && <span className="text-text-tertiary font-normal ml-2 text-xs">Spot: {fmtUSD(depth.spot_price)}</span>}
          </h3>
          {depthChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={depthChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="price" tickFormatter={(v) => `$${Number(v).toLocaleString()}`} tick={{ fill: "var(--color-text-tertiary)", fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "var(--color-text-tertiary)", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  formatter={(v: number, name: string) => [fmtUSD(v), name === "bids" ? "Bids" : "Asks"]}
                  labelFormatter={(v) => `Price: $${Number(v).toLocaleString()}`}
                />
                <Area type="monotone" dataKey="bids" stroke="#00d463" fill="rgba(0,212,99,0.2)" strokeWidth={2} />
                <Area type="monotone" dataKey="asks" stroke="#ff3860" fill="rgba(255,56,96,0.2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-text-tertiary text-xs font-mono">Loading…</div>
          )}
        </div>
      </div>

      {/* ── Operations Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Add Liquidity */}
        <div className="card space-y-3">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Add Liquidity</h3>
          <div className="space-y-2">
            <label className="form-label text-xs">Provider address</label>
            <input className="form-input text-xs" value={addProvider} onChange={(e) => setAddProvider(e.target.value)} placeholder="wallet_address" />
          </div>
          <div className="space-y-2">
            <label className="form-label text-xs">Amount in {pool?.token0 ?? "USDC"}</label>
            <input type="number" className="form-input text-xs" value={addAmt} onChange={(e) => setAddAmt(e.target.value)} placeholder="10000" />
          </div>
          {pool && (
            <div className="text-xs text-text-tertiary font-mono">
              Required {pool.token1}: {((parseFloat(addAmt) || 0) * pool.price_token1_per_token0).toFixed(6)}
            </div>
          )}
          <button onClick={handleAddLiquidity} disabled={opLoading || !addAmt} className="btn primary text-xs w-full font-mono">
            {opLoading ? "…" : "ADD LIQUIDITY"}
          </button>
        </div>

        {/* Remove Liquidity */}
        <div className="card space-y-3">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Remove Liquidity</h3>
          <div className="space-y-2">
            <label className="form-label text-xs">Provider address</label>
            <input className="form-input text-xs" value={removeProvider} onChange={(e) => setRemoveProvider(e.target.value)} placeholder="wallet_address" />
          </div>
          <div className="space-y-2">
            <label className="form-label text-xs">LP Tokens to burn</label>
            <input type="number" className="form-input text-xs" value={removeLp} onChange={(e) => setRemoveLp(e.target.value)} placeholder="100.0" />
          </div>
          <div className="text-xs text-text-tertiary font-mono">
            Total LP supply: {fmt(pool?.total_lp_tokens ?? 0, 4)}
          </div>
          <button onClick={handleRemoveLiquidity} disabled={opLoading || !removeLp} className="btn warn text-xs w-full font-mono">
            {opLoading ? "…" : "REMOVE LIQUIDITY"}
          </button>
        </div>

        {/* Swap */}
        <div className="card space-y-3">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Swap</h3>
          <div className="space-y-2">
            <label className="form-label text-xs">Direction</label>
            <select className="form-input text-xs" value={swapDir} onChange={(e) => setSwapDir(e.target.value as "token0_to_token1" | "token1_to_token0")}>
              <option value="token0_to_token1">{pool?.token0 ?? "USDC"} → {pool?.token1 ?? "ETH"}</option>
              <option value="token1_to_token0">{pool?.token1 ?? "ETH"} → {pool?.token0 ?? "USDC"}</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="form-label text-xs">Amount in</label>
            <input type="number" className="form-input text-xs" value={swapAmt} onChange={(e) => setSwapAmt(e.target.value)} placeholder="1000" />
          </div>
          {pool && swapAmt && (
            <div className="text-xs text-text-tertiary font-mono">
              Est. out: {swapDir === "token0_to_token1"
                ? `${((parseFloat(swapAmt) || 0) * pool.price_token1_per_token0 * 0.997).toFixed(6)} ${pool.token1}`
                : fmtUSD((parseFloat(swapAmt) || 0) * pool.price_token0_per_token1 * 0.997)}
            </div>
          )}
          <button onClick={handleSwap} disabled={opLoading || !swapAmt} className="btn primary text-xs w-full font-mono">
            {opLoading ? "…" : "EXECUTE SWAP"}
          </button>
        </div>
      </div>

      {/* ── Stress Test + IL Calculator ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stress Test */}
        <div className="card space-y-4">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Stress Test Engine</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="form-label text-xs">Scenario</label>
              <select className="form-input text-xs" value={stressScenario} onChange={(e) => setStressScenario(e.target.value)}>
                <option value="flash_swap">Flash Swap</option>
                <option value="mass_withdrawal">Mass Withdrawal</option>
                <option value="sustained_drain">Sustained Drain</option>
                <option value="price_crash">Price Crash (40%)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="form-label text-xs">Intensity (0.1–2.0)</label>
              <input type="number" className="form-input text-xs" min={0.1} max={2.0} step={0.1} value={stressIntensity} onChange={(e) => setStressIntensity(parseFloat(e.target.value))} />
            </div>
          </div>

          <button onClick={handleStressTest} disabled={stressLoading} className="btn danger text-xs w-full font-mono">
            {stressLoading ? "SIMULATING…" : "RUN STRESS TEST"}
          </button>

          {stressResult && (
            <div className="space-y-3 border-t border-[color:var(--color-border)] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-text-secondary uppercase">{stressResult.scenario.replace(/_/g, " ")}</span>
                <span className={`text-lg font-bold font-mono ${riskColor(stressResult.risk_score)}`}>Risk: {stressResult.risk_score}/100</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <div className="text-text-tertiary">TVL Change</div>
                  <div className={stressResult.tvl_change_pct < 0 ? "text-danger" : "text-success"}>{stressResult.tvl_change_pct.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-text-tertiary">Price Impact</div>
                  <div className={stressResult.price_change_pct < -5 ? "text-danger" : "text-warning"}>{stressResult.price_change_pct.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-text-tertiary">Peak Slippage</div>
                  <div className="text-accent">{stressResult.slippage_at_peak.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-text-tertiary">Drain Estimate</div>
                  <div className="text-text-primary">{stressResult.time_to_drain_estimate.toFixed(0)}s</div>
                </div>
              </div>
              {stressResult.events.map((ev, i) => (
                <div key={i} className="text-xs font-mono text-text-tertiary">› {ev}</div>
              ))}
              <div className="h-2 bg-[color:var(--color-bg-accent)] rounded overflow-hidden">
                <div
                  className="h-full transition-all duration-700"
                  style={{
                    width: `${stressResult.risk_score}%`,
                    background: stressResult.risk_score >= 70 ? "var(--color-danger)" : stressResult.risk_score >= 40 ? "var(--color-warning)" : "var(--color-success)"
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* IL Calculator */}
        <div className="card space-y-4">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Impermanent Loss Calculator</h3>
          <div className="space-y-2">
            <label className="form-label text-xs">Entry price ({pool?.token0 ?? "USDC"} per {pool?.token1 ?? "ETH"})</label>
            <div className="flex gap-2">
              <input type="number" className="form-input text-xs flex-1" value={ilEntryPrice} onChange={(e) => setIlEntryPrice(e.target.value)} placeholder={pool ? pool.price_token0_per_token1.toFixed(2) : "3200"} />
              <button onClick={handleCalcIL} className="btn primary text-xs px-3 font-mono">CALC</button>
            </div>
            <button onClick={() => pool && setIlEntryPrice(pool.price_token0_per_token1.toFixed(2))} className="text-xs text-accent font-mono hover:underline">
              Use current price ({pool ? fmtUSD(pool.price_token0_per_token1) : "—"})
            </button>
          </div>

          {ilData && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                <div>
                  <div className="text-text-tertiary">Entry</div>
                  <div className="text-text-primary font-bold">{fmtUSD(ilData.entry_price)}</div>
                </div>
                <div>
                  <div className="text-text-tertiary">Current</div>
                  <div className="text-text-primary font-bold">{fmtUSD(ilData.current_price)}</div>
                </div>
                <div>
                  <div className="text-text-tertiary">IL Now</div>
                  <div className={`font-bold ${ilData.il_pct_now > 2 ? "text-danger" : ilData.il_pct_now > 0.5 ? "text-warning" : "text-success"}`}>
                    {fmtPct(ilData.il_pct_now)}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary font-mono mb-2">IL Curve (price ratio vs IL%)</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={ilData.il_curve.filter((_, i) => i % 2 === 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="price_ratio" tickFormatter={(v) => `${v}x`} tick={{ fill: "var(--color-text-tertiary)", fontSize: 9 }} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fill: "var(--color-text-tertiary)", fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number) => [`${v.toFixed(4)}%`, "IL"]}
                      labelFormatter={(v) => `Price ratio: ${v}x`}
                    />
                    <Line type="monotone" dataKey="il_pct" stroke="#ff3860" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ML Risk Engine ── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase tracking-widest">
            🤖 ML Risk Engine
            <span className="ml-2 text-xs text-text-tertiary font-normal normal-case">(DotlocalRiskModel · 5 sub-estimators)</span>
          </h3>
          <div className="flex items-center gap-3">
            <input
              type="number" min="0" step="100"
              className="input text-xs w-32"
              placeholder="Trade size"
              value={mlTradeSize}
              onChange={(e) => setMlTradeSize(e.target.value)}
            />
            <button
              disabled={mlLoading || !pool}
              onClick={fetchMLRisk}
              className="btn-secondary text-xs px-4 py-2"
            >
              {mlLoading ? "Analyzing…" : "Run Analysis"}
            </button>
          </div>
        </div>

        {mlPrediction && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[color:var(--color-bg-accent)] rounded-lg p-3">
                <div className="text-[10px] text-text-tertiary font-mono uppercase mb-1">ML Slippage</div>
                <div className={`text-lg font-bold font-mono ${
                  mlPrediction.slippage_pct > 15 ? "text-red-400" :
                  mlPrediction.slippage_pct > 5  ? "text-yellow-400" : "text-green-400"
                }`}>{mlPrediction.slippage_pct.toFixed(3)}%</div>
              </div>
              <div className="bg-[color:var(--color-bg-accent)] rounded-lg p-3">
                <div className="text-[10px] text-text-tertiary font-mono uppercase mb-1">IL Forecast 1h</div>
                <div className="text-lg font-bold font-mono text-cyan">{mlPrediction.il_forecast_1h.toFixed(3)}%</div>
              </div>
              <div className="bg-[color:var(--color-bg-accent)] rounded-lg p-3">
                <div className="text-[10px] text-text-tertiary font-mono uppercase mb-1">IL Forecast 24h</div>
                <div className="text-lg font-bold font-mono text-cyan">{mlPrediction.il_forecast_24h.toFixed(3)}%</div>
              </div>
              <div className="bg-[color:var(--color-bg-accent)] rounded-lg p-3">
                <div className="text-[10px] text-text-tertiary font-mono uppercase mb-1">Anomaly Score</div>
                <div className={`text-lg font-bold font-mono ${
                  mlPrediction.is_anomaly ? "text-red-400 animate-pulse" : "text-green-400"
                }`}>{mlPrediction.anomaly_score.toFixed(1)}/100</div>
              </div>
            </div>

            {/* Drain risk bar */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-mono text-text-secondary uppercase">Drain Risk — {mlPrediction.drain_risk_label}</span>
                <span className="text-xs font-mono text-text-tertiary">Confidence {mlPrediction.confidence.toFixed(1)}%</span>
              </div>
              <div className="h-4 bg-[color:var(--color-bg-accent)] rounded overflow-hidden">
                <div
                  className={`h-full rounded transition-all duration-700 ${
                    mlPrediction.drain_risk_label === "CRITICAL" ? "bg-red-500" :
                    mlPrediction.drain_risk_label === "HIGH"     ? "bg-orange-400" :
                    mlPrediction.drain_risk_label === "MEDIUM"   ? "bg-yellow-400" : "bg-green-500"
                  }`}
                  style={{ width: `${mlPrediction.drain_risk_score}%` }}
                />
              </div>
            </div>

            {/* ML slippage chart */}
            {mlSlippageCurve.length > 0 && (
              <div>
                <div className="text-xs text-text-tertiary font-mono mb-2">ML Slippage Curve (predicted)</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={mlSlippageCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="trade_size"
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                      tick={{ fill: "var(--color-text-tertiary)", fontSize: 9 }}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                      tick={{ fill: "var(--color-text-tertiary)", fontSize: 9 }}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number) => [`${v.toFixed(4)}%`, "ML Slip"]}
                      labelFormatter={(v: number) => `Trade: $${v.toLocaleString()}`}
                    />
                    <Line type="monotone" dataKey="slippage_pct" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Warnings */}
            {mlPrediction.warnings.length > 0 && (
              <div className="space-y-1">
                {mlPrediction.warnings.map((w, i) => (
                  <div key={i} className="text-xs font-mono text-yellow-300 bg-yellow-900/20 border border-yellow-800/40 rounded px-3 py-1.5">{w}</div>
                ))}
              </div>
            )}

            {/* Anomaly badge */}
            {mlPrediction.is_anomaly && (
              <div className="text-xs font-mono text-red-300 bg-red-900/30 border border-red-700/50 rounded px-3 py-2 animate-pulse">
                🚨 ANOMALY DETECTED — This pool is exhibiting unusual behaviour. Review activity immediately.
              </div>
            )}
          </>
        )}

        {!mlPrediction && !mlLoading && pool && (
          <div className="text-xs text-text-tertiary font-mono text-center py-6">Click &quot;Run Analysis&quot; to generate ML risk predictions</div>
        )}
        {mlLoading && (
          <div className="text-xs text-text-tertiary font-mono text-center py-6 animate-pulse">Running ML inference…</div>
        )}
      </div>

      {/* ── Pool Reserves + Event Log ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card space-y-4">
          <h3 className="text-sm font-mono font-bold text-text-primary uppercase">Pool Reserves</h3>
          {pool && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-text-secondary font-mono">{pool.token0}</span>
                  <span className="text-sm font-mono font-bold text-accent">{fmtUSD(pool.reserve0)}</span>
                </div>
                <div className="h-3 bg-[color:var(--color-bg-accent)] rounded overflow-hidden">
                  <div className="h-full bg-accent transition-all duration-700" style={{ width: `${(pool.reserve0 / (pool.reserve0 + pool.reserve1 * pool.price_token0_per_token1)) * 100}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-text-secondary font-mono">{pool.token1}</span>
                  <span className="text-sm font-mono font-bold text-cyan">{fmt(pool.reserve1, 6)} {pool.token1}</span>
                </div>
                <div className="h-3 bg-[color:var(--color-bg-accent)] rounded overflow-hidden">
                  <div className="h-full bg-cyan transition-all duration-700" style={{ width: `${(pool.reserve1 * pool.price_token0_per_token1 / (pool.reserve0 + pool.reserve1 * pool.price_token0_per_token1)) * 100}%` }} />
                </div>
              </div>
              <div className="pt-4 border-t border-[color:var(--color-border)] grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-text-tertiary font-mono mb-1">K INVARIANT</div>
                  <div className="text-base font-bold font-mono text-text-primary">{((pool.k_product) / 1e9).toFixed(4)}B</div>
                </div>
                <div>
                  <div className="text-xs text-text-tertiary font-mono mb-1">LP PROVIDERS</div>
                  <div className="text-base font-bold font-mono text-text-primary">{pool.provider_count}</div>
                </div>
              </div>
            </>
          )}
        </div>

        <Terminal
          title="Pool Event Log"
          lines={(events.length > 0 ? events : ["Waiting for pool events…"]).map((text) => ({ text, type: "info" as const }))}
          maxLines={12}
        />
      </div>
    </div>
  );
}
