"""
DotlocalAgentIntelModel — Combined ML intelligence layer for the agent simulation engine.
ONE class, ONE .pkl file — 8 tightly-coupled sub-estimators:

  1. AgentBehaviorClassifier   — Identifies agent archetype from behaviour (6 classes)
  2. ThreatScoreRegressor      — Continuous threat score 0–100 (GradientBoosting)
  3. MEVAttackDetector         — P(MEV/sandwich pattern) (RandomForest binary)
  4. FlashLoanRiskPredictor    — P(flash-loan attack next tick) (GradientBoosting)
  5. MarketSentimentForecaster — Market sentiment BEARISH/NEUTRAL/BULLISH (MLP)
  6. AgentPnLForecaster        — Expected PnL delta next 10 ticks (GradientBoosting)
  7. WashTradingDetector       — Unsupervised wash-trading anomaly (IsolationForest)
  8. CascadeLiquidationRisk   — P(lending cascade) from pool/lending state (RandomForest)

Usage:
    from agents.ml_model import get_model, AgentFeatures
    model = get_model()
    pred  = model.predict(features)
    matrix = model.predict_batch(all_feature_dicts)
"""

from __future__ import annotations

import os
import math
import pickle
import warnings
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

warnings.filterwarnings("ignore")

from sklearn.ensemble import (
    GradientBoostingRegressor,
    GradientBoostingClassifier,
    RandomForestClassifier,
    IsolationForest,
)
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.pipeline import Pipeline

# ─── Constants ───────────────────────────────────────────────────────────────

MODEL_PATH = os.path.join(os.path.dirname(__file__), "trained_models", "dotlocal_agent_model.pkl")

AGENT_TYPES = ["retail_trader", "whale", "arbitrage_bot", "liquidator_bot", "mev_bot", "attacker"]
SENTIMENT_LABELS = ["BEARISH", "NEUTRAL", "BULLISH"]
THREAT_CATEGORIES = ["SAFE", "SUSPICIOUS", "DANGEROUS", "CRITICAL"]

# ─── Data Classes ────────────────────────────────────────────────────────────

@dataclass
class AgentFeatures:
    """All features the model needs — drawn from live simulation state."""
    # Agent identity & capital
    agent_type_id: int          # 0=retail 1=whale 2=arb 3=liquidator 4=mev 5=attacker
    capital: float
    current_value: float
    pnl: float                  # cumulative

    # Behaviour metrics
    trades_count: float
    total_volume: float
    win_rate: float             # 0–1
    alerts_triggered: float

    # Trade characteristics
    avg_trade_size: float       # total_volume / max(trades_count, 1)
    trade_frequency: float      # trades per tick (simulation step)
    avg_slippage: float         # mean slippage over recent trades
    last_profit: float          # pnl delta of the most recent trade

    # Pool context
    pool_reserve_a: float
    pool_reserve_b: float
    pool_price: float           # price_a_per_b
    pool_volume: float          # total pool volume
    pool_swap_count: float
    price_deviation_pct: float  # |pool_price - reference_price| / reference_price * 100

    # Lending context
    lending_health_avg: float   # mean health factor across positions
    liquidatable_ratio: float   # liquidatable_count / total_positions
    total_debt_ratio: float     # total_debt / total_collateral

    # Market context (from CoinDesk / MarketDataService)
    market_risk_level: float    # 0–1
    market_volatility_id: int   # 0=low 1=medium 2=high


@dataclass
class AgentIntelPrediction:
    """Full ML prediction for one agent in one simulation state."""
    # ── Behaviour classification
    predicted_agent_type: str
    agent_type_confidence: float

    # ── Threat
    threat_score: float
    threat_category: str        # SAFE / SUSPICIOUS / DANGEROUS / CRITICAL

    # ── Attack probabilities
    mev_attack_probability: float
    flash_loan_probability: float
    is_mev_pattern: bool
    is_flash_loan_risk: bool

    # ── Market forecast
    market_sentiment: str       # BEARISH / NEUTRAL / BULLISH
    sentiment_confidence: float
    predicted_volatility: str   # LOW / MEDIUM / HIGH

    # ── PnL forecast (next ~10 sim ticks)
    pnl_forecast: float
    pnl_direction: str          # PROFIT / LOSS / NEUTRAL

    # ── Wash-trading
    wash_trading_score: float
    is_wash_trading: bool

    # ── Cascade liquidation
    cascade_liquidation_risk: float
    cascade_imminent: bool

    # ── Summary
    risk_level: str             # LOW / MEDIUM / HIGH / CRITICAL
    warnings: list[str] = field(default_factory=list)


# ─── Combined Model ──────────────────────────────────────────────────────────

class DotlocalAgentIntelModel:
    """
    All 8 sub-estimators in one class. Save / load as a single .pkl.
    """

    VERSION = "1.0"

    def __init__(self):
        # Sub-estimators
        self._behavior_clf:   Optional[Pipeline]         = None  # 6-class
        self._threat_reg:     Optional[Pipeline]         = None  # 0-100
        self._mev_clf:        Optional[Pipeline]         = None  # binary
        self._flash_clf:      Optional[Pipeline]         = None  # binary
        self._sentiment_clf:  Optional[Pipeline]         = None  # 3-class
        self._pnl_reg:        Optional[Pipeline]         = None  # regressor
        self._wash_iso:       Optional[IsolationForest]  = None  # unsupervised
        self._wash_scaler:    Optional[StandardScaler]   = None
        self._cascade_clf:    Optional[Pipeline]         = None  # binary

        self.is_trained: bool = False
        self.n_samples:  int  = 0

    # ════════════════════════════════════════════════════════════════════════
    # Synthetic training data generators
    # ════════════════════════════════════════════════════════════════════════

    def _gen_all(self, n: int):
        """
        Generate n rows covering ALL 23 features.
        Returns (X_full, feat_names) where X_full is [n × 23].
        """
        rng = np.random.default_rng(42)

        agent_type_id        = rng.integers(0, 6, n).astype(float)
        capital              = rng.uniform(5_000, 500_000, n)
        value_ratio          = rng.uniform(0.7, 1.5, n)
        current_value        = capital * value_ratio
        pnl                  = current_value - capital

        trades_count         = rng.uniform(0, 1000, n)
        total_volume         = rng.uniform(0, 5_000_000, n)
        win_rate             = rng.uniform(0, 1, n)
        alerts_triggered     = rng.uniform(0, 50, n)

        avg_trade_size       = total_volume / np.maximum(trades_count, 1)
        trade_frequency      = rng.uniform(0, 5, n)
        avg_slippage         = rng.uniform(0, 20, n)
        last_profit          = rng.uniform(-10_000, 50_000, n)

        pool_reserve_a       = rng.uniform(1e5, 5e6, n)
        pool_reserve_b       = rng.uniform(1e5, 5e6, n)
        pool_price           = pool_reserve_b / np.maximum(pool_reserve_a, 1)
        pool_volume          = rng.uniform(0, 2e6, n)
        pool_swap_count      = rng.uniform(0, 2000, n)
        price_deviation_pct  = rng.uniform(0, 15, n)

        lending_health_avg   = rng.uniform(1.0, 3.0, n)
        liquidatable_ratio   = rng.uniform(0, 0.5, n)
        total_debt_ratio     = rng.uniform(0.3, 0.95, n)

        market_risk_level    = rng.uniform(0, 1, n)
        market_volatility_id = rng.integers(0, 3, n).astype(float)

        X = np.stack([
            agent_type_id, capital, current_value, pnl,
            trades_count, total_volume, win_rate, alerts_triggered,
            avg_trade_size, trade_frequency, avg_slippage, last_profit,
            pool_reserve_a, pool_reserve_b, pool_price, pool_volume, pool_swap_count,
            price_deviation_pct,
            lending_health_avg, liquidatable_ratio, total_debt_ratio,
            market_risk_level, market_volatility_id,
        ], axis=1)
        return X

    # ── 1. Behavior labels (agent_type_id is the ground truth) ───────────
    def _behavior_labels(self, X: np.ndarray) -> np.ndarray:
        return X[:, 0].astype(int)

    # ── 2. Threat score ───────────────────────────────────────────────────
    def _threat_labels(self, X: np.ndarray) -> np.ndarray:
        atype   = X[:, 0]
        alerts  = X[:, 7]
        slippage= X[:, 10]
        pricedev= X[:, 17]
        liq_r   = X[:, 19]
        vol_r   = X[:, 5] / np.maximum(X[:, 15], 1)
        rng     = np.random.default_rng(7)

        base = (
            (atype == 5) * 60 +   # attacker
            (atype == 4) * 45 +   # mev_bot
            (atype == 3) * 25 +   # liquidator
            (atype == 2) * 20 +   # arb
            (atype == 1) * 10 +   # whale
            (atype == 0) * 5      # retail
        )
        score = (
            base
            + alerts * 0.8
            + np.clip(slippage * 1.5, 0, 15)
            + np.clip(pricedev * 2.5, 0, 20)
            + np.clip(liq_r * 20, 0, 15)
            + np.clip(vol_r * 5, 0, 10)
            + rng.uniform(-5, 5, len(X))
        )
        return np.clip(score, 0, 100)

    # ── 3. MEV binary ─────────────────────────────────────────────────────
    def _mev_labels(self, X: np.ndarray) -> np.ndarray:
        atype  = X[:, 0]
        alerts = X[:, 7]
        freq   = X[:, 9]
        slip   = X[:, 10]
        score  = (atype == 4).astype(float) * 3 + (alerts > 5) + (freq > 3) + (slip > 5)
        rng = np.random.default_rng(11)
        score += rng.uniform(0, 0.5, len(X))
        return (score >= 2.5).astype(int)

    # ── 4. Flash-loan binary ──────────────────────────────────────────────
    def _flash_labels(self, X: np.ndarray) -> np.ndarray:
        atype      = X[:, 0]
        alerts     = X[:, 7]
        liq_ratio  = X[:, 19]
        price_dev  = X[:, 17]
        risk       = X[:, 21]
        score      = (
            (atype == 5).astype(float) * 3
            + (alerts > 3) * 1
            + (liq_ratio > 0.3) * 2
            + (price_dev > 5) * 1
            + risk * 2
        )
        rng = np.random.default_rng(19)
        score += rng.uniform(0, 0.4, len(X))
        return (score >= 3.5).astype(int)

    # ── 5. Market sentiment (0=BEARISH 1=NEUTRAL 2=BULLISH) ───────────────
    def _sentiment_labels(self, X: np.ndarray) -> np.ndarray:
        risk   = X[:, 21]
        liq_r  = X[:, 19]
        debt_r = X[:, 20]
        dev    = X[:, 17]
        score  = risk * 3 + liq_r * 2 + debt_r * 1 + dev * 0.1
        rng = np.random.default_rng(30)
        score += rng.uniform(-0.3, 0.3, len(X))
        labels = np.where(score < 1.5, 2, np.where(score < 3.0, 1, 0))  # high risk → BEARISH
        return labels

    # ── 6. PnL forecast ───────────────────────────────────────────────────
    def _pnl_labels(self, X: np.ndarray) -> np.ndarray:
        wr     = X[:, 6]
        atype  = X[:, 0]
        risk   = X[:, 21]
        vol    = X[:, 5]
        rng    = np.random.default_rng(55)
        base   = (wr - 0.5) * 5000
        type_adj = np.where(atype == 5, -2000,
                   np.where(atype == 4,  1500,
                   np.where(atype == 2,  1000,
                   np.where(atype == 1,  500, 0))))
        noise  = rng.normal(0, 300, len(X))
        return base + type_adj - risk * 1000 + noise

    # ── 7. Normal wash-trading distribution ───────────────────────────────
    def _gen_wash_normal(self, n: int = 4000) -> np.ndarray:
        """Normal (non-wash) pattern: varied agents, low circularity."""
        rng = np.random.default_rng(77)
        return np.stack([
            rng.uniform(0, 1000, n),     # trades_count
            rng.uniform(0, 0.8, n),      # win_rate
            rng.uniform(0, 500_000, n),  # total_volume
            rng.uniform(0, 5, n),        # trade_frequency
            rng.uniform(0, 1, n),        # alerts_triggered (low)
            rng.integers(0, 6, n).astype(float),  # agent_type_id
            rng.uniform(0, 10, n),       # avg_slippage
            rng.uniform(0, 3, n),        # price_deviation_pct
        ], axis=1)

    # ── 8. Cascade liquidation labels ─────────────────────────────────────
    def _cascade_labels(self, X: np.ndarray) -> np.ndarray:
        liq_r  = X[:, 19]
        debt_r = X[:, 20]
        health = X[:, 18]
        risk   = X[:, 21]
        dev    = X[:, 17]
        score  = liq_r * 4 + (debt_r > 0.8) * 2 + (health < 1.3) * 2 + risk + (dev > 5) * 1
        rng = np.random.default_rng(88)
        score += rng.uniform(0, 0.5, len(X))
        return (score >= 4.0).astype(int)

    # ════════════════════════════════════════════════════════════════════════
    # Training
    # ════════════════════════════════════════════════════════════════════════

    def fit(self, n_samples: int = 6000) -> "DotlocalAgentIntelModel":
        print("🧠  Training DotlocalAgentIntelModel (8 sub-estimators)…")
        X = self._gen_all(n_samples)

        print("  [1/8] AgentBehaviorClassifier — RandomForest (6-class)…")
        y1 = self._behavior_labels(X)
        self._behavior_clf = Pipeline([
            ("sc", StandardScaler()),
            ("m",  RandomForestClassifier(
                n_estimators=150, max_depth=10,
                class_weight="balanced", random_state=42,
            )),
        ])
        self._behavior_clf.fit(X[:, 1:], y1)  # exclude agent_type_id from features (cheating guard)

        print("  [2/8] ThreatScoreRegressor — GradientBoosting…")
        y2 = self._threat_labels(X)
        self._threat_reg = Pipeline([
            ("sc", StandardScaler()),
            ("m",  GradientBoostingRegressor(
                n_estimators=200, max_depth=5, learning_rate=0.05,
                subsample=0.8, random_state=42,
            )),
        ])
        self._threat_reg.fit(X, y2)

        print("  [3/8] MEVAttackDetector — RandomForest (binary)…")
        y3 = self._mev_labels(X)
        self._mev_clf = Pipeline([
            ("sc", StandardScaler()),
            ("m",  RandomForestClassifier(
                n_estimators=100, max_depth=8,
                class_weight="balanced", random_state=42,
            )),
        ])
        self._mev_clf.fit(X, y3)

        print("  [4/8] FlashLoanRiskPredictor — GradientBoosting (binary)…")
        y4 = self._flash_labels(X)
        self._flash_clf = Pipeline([
            ("sc", StandardScaler()),
            ("m",  GradientBoostingClassifier(
                n_estimators=150, max_depth=5, learning_rate=0.08,
                random_state=42,
            )),
        ])
        self._flash_clf.fit(X, y4)

        print("  [5/8] MarketSentimentForecaster — MLP (3-class)…")
        y5 = self._sentiment_labels(X)
        # Use only market + pool + lending features for sentiment
        Xm = X[:, 12:]  # pool + lending + market features
        self._sentiment_clf = Pipeline([
            ("sc", StandardScaler()),
            ("m",  MLPClassifier(
                hidden_layer_sizes=(64, 32), activation="relu",
                max_iter=500, early_stopping=True, random_state=42,
            )),
        ])
        self._sentiment_clf.fit(Xm, y5)

        print("  [6/8] AgentPnLForecaster — GradientBoosting…")
        y6 = self._pnl_labels(X)
        self._pnl_reg = Pipeline([
            ("sc", StandardScaler()),
            ("m",  GradientBoostingRegressor(
                n_estimators=200, max_depth=6, learning_rate=0.05,
                subsample=0.8, random_state=42,
            )),
        ])
        self._pnl_reg.fit(X, y6)

        print("  [7/8] WashTradingDetector — IsolationForest…")
        Xw = self._gen_wash_normal(4000)
        self._wash_scaler = StandardScaler()
        Xw_sc = self._wash_scaler.fit_transform(Xw)
        self._wash_iso = IsolationForest(
            n_estimators=200, contamination=0.05, random_state=42,
        )
        self._wash_iso.fit(Xw_sc)

        print("  [8/8] CascadeLiquidationRisk — RandomForest…")
        y8 = self._cascade_labels(X)
        self._cascade_clf = Pipeline([
            ("sc", StandardScaler()),
            ("m",  RandomForestClassifier(
                n_estimators=120, max_depth=8,
                class_weight="balanced", random_state=42,
            )),
        ])
        # Use pool + lending + market features
        self._cascade_clf.fit(X[:, 12:], y8)

        self.is_trained = True
        self.n_samples  = n_samples
        print("✅  DotlocalAgentIntelModel training complete.")
        return self

    # ════════════════════════════════════════════════════════════════════════
    # Inference
    # ════════════════════════════════════════════════════════════════════════

    def _features_to_row(self, f: AgentFeatures) -> np.ndarray:
        return np.array([[
            f.agent_type_id, f.capital, f.current_value, f.pnl,
            f.trades_count, f.total_volume, f.win_rate, f.alerts_triggered,
            f.avg_trade_size, f.trade_frequency, f.avg_slippage, f.last_profit,
            f.pool_reserve_a, f.pool_reserve_b, f.pool_price, f.pool_volume,
            f.pool_swap_count, f.price_deviation_pct,
            f.lending_health_avg, f.liquidatable_ratio, f.total_debt_ratio,
            f.market_risk_level, f.market_volatility_id,
        ]])

    def predict(self, features: AgentFeatures) -> AgentIntelPrediction:
        if not self.is_trained:
            raise RuntimeError("Model not trained — call fit() or load_or_train() first.")

        row = self._features_to_row(features)
        warns: list[str] = []

        # ── 1. Behavior classification ────────────────────────────────────
        bproba = self._behavior_clf.predict_proba(row[:, 1:])[0]
        bcls   = int(np.argmax(bproba))
        predicted_type = AGENT_TYPES[bcls]
        bconf  = float(bproba[bcls] * 100)

        # ── 2. Threat score ───────────────────────────────────────────────
        threat_raw = float(np.clip(self._threat_reg.predict(row)[0], 0, 100))
        threat_cat = (
            "CRITICAL"   if threat_raw >= 75 else
            "DANGEROUS"  if threat_raw >= 50 else
            "SUSPICIOUS" if threat_raw >= 25 else
            "SAFE"
        )
        if threat_raw >= 50: warns.append(f"🔴 Threat score {threat_raw:.0f}/100 — {threat_cat}")

        # ── 3. MEV detection ──────────────────────────────────────────────
        mev_proba = self._mev_clf.predict_proba(row)[0][1]
        is_mev    = bool(mev_proba >= 0.5)
        if is_mev: warns.append(f"🥪 MEV/Sandwich attack pattern detected ({mev_proba*100:.0f}% confidence)")

        # ── 4. Flash loan risk ────────────────────────────────────────────
        flash_proba = self._flash_clf.predict_proba(row)[0][1]
        is_flash    = bool(flash_proba >= 0.5)
        if is_flash: warns.append(f"⚡ Flash loan risk elevated ({flash_proba*100:.0f}%)")

        # ── 5. Market sentiment ───────────────────────────────────────────
        Xm     = row[:, 12:]
        sproba = self._sentiment_clf.predict_proba(Xm)[0]
        scls   = int(np.argmax(sproba))
        sentiment     = SENTIMENT_LABELS[scls]
        s_conf        = float(sproba[scls] * 100)
        vol_label     = ["LOW", "MEDIUM", "HIGH"][int(features.market_volatility_id)]
        if sentiment == "BEARISH": warns.append("📉 ML market forecast: BEARISH — reduce exposure")

        # ── 6. PnL forecast ───────────────────────────────────────────────
        pnl_delta = float(self._pnl_reg.predict(row)[0])
        pnl_dir   = "PROFIT" if pnl_delta > 50 else "LOSS" if pnl_delta < -50 else "NEUTRAL"
        if pnl_delta < -1000: warns.append(f"📉 PnL forecast: −${abs(pnl_delta):.0f} next 10 ticks")

        # ── 7. Wash trading ───────────────────────────────────────────────
        Xw = np.array([[
            features.trades_count, features.win_rate, features.total_volume,
            features.trade_frequency, features.alerts_triggered,
            float(features.agent_type_id), features.avg_slippage, features.price_deviation_pct,
        ]])
        Xw_sc  = self._wash_scaler.transform(Xw)
        w_raw  = float(self._wash_iso.decision_function(Xw_sc)[0])
        w_score = float(np.clip((-w_raw + 0.2) * 150, 0, 100))
        is_wash = bool(self._wash_iso.predict(Xw_sc)[0] == -1)
        if is_wash: warns.append("🔄 Wash trading anomaly detected — circular trade pattern")

        # ── 8. Cascade liquidation risk ───────────────────────────────────
        cascade_proba = self._cascade_clf.predict_proba(Xm)[0][1]
        cascade_risk  = float(cascade_proba * 100)
        cascade_imm   = bool(cascade_proba >= 0.55)
        if cascade_imm: warns.append(f"🏦 Cascade liquidation IMMINENT ({cascade_risk:.0f}% risk)")

        # ── Overall risk level ────────────────────────────────────────────
        composite = threat_raw * 0.4 + mev_proba * 30 + flash_proba * 20 + cascade_risk * 0.1
        risk_level = (
            "CRITICAL" if composite >= 70 else
            "HIGH"     if composite >= 45 else
            "MEDIUM"   if composite >= 20 else
            "LOW"
        )

        return AgentIntelPrediction(
            predicted_agent_type    = predicted_type,
            agent_type_confidence   = round(bconf, 2),
            threat_score            = round(threat_raw, 2),
            threat_category         = threat_cat,
            mev_attack_probability  = round(mev_proba * 100, 2),
            flash_loan_probability  = round(flash_proba * 100, 2),
            is_mev_pattern          = is_mev,
            is_flash_loan_risk      = is_flash,
            market_sentiment        = sentiment,
            sentiment_confidence    = round(s_conf, 2),
            predicted_volatility    = vol_label,
            pnl_forecast            = round(pnl_delta, 2),
            pnl_direction           = pnl_dir,
            wash_trading_score      = round(w_score, 2),
            is_wash_trading         = is_wash,
            cascade_liquidation_risk= round(cascade_risk, 2),
            cascade_imminent        = cascade_imm,
            risk_level              = risk_level,
            warnings                = warns,
        )

    def predict_from_dict(self, d: dict) -> AgentIntelPrediction:
        """Build AgentFeatures from a dict (agent.to_dict() + pool + lending context)."""
        f = AgentFeatures(
            agent_type_id       = AGENT_TYPES.index(d.get("type", "retail_trader")),
            capital             = d.get("capital", 10_000),
            current_value       = d.get("current_value", 10_000),
            pnl                 = d.get("pnl", 0),
            trades_count        = d.get("stats", {}).get("trades_count", 0),
            total_volume        = d.get("stats", {}).get("total_volume", 0),
            win_rate            = d.get("win_rate", 0.5),
            alerts_triggered    = d.get("stats", {}).get("alerts_triggered", 0),
            avg_trade_size      = d.get("stats", {}).get("total_volume", 0) / max(d.get("stats", {}).get("trades_count", 1), 1),
            trade_frequency     = d.get("trade_frequency", 0.5),
            avg_slippage        = d.get("avg_slippage", 0.5),
            last_profit         = d.get("last_profit", 0.0),
            pool_reserve_a      = d.get("pool", {}).get("reserve_a", 1_000_000),
            pool_reserve_b      = d.get("pool", {}).get("reserve_b", 1_000_000),
            pool_price          = d.get("pool", {}).get("price_a_per_b", 1.0),
            pool_volume         = d.get("pool", {}).get("total_volume", 0),
            pool_swap_count     = d.get("pool", {}).get("swap_count", 0),
            price_deviation_pct = abs(
                d.get("pool", {}).get("price_a_per_b", 1.0)
                - d.get("pool", {}).get("reference_price", 1.0)
            ) / max(d.get("pool", {}).get("reference_price", 1.0), 1e-9) * 100,
            lending_health_avg  = d.get("lending", {}).get("avg_health_factor", 2.0),
            liquidatable_ratio  = (
                d.get("lending", {}).get("liquidatable_count", 0)
                / max(d.get("lending", {}).get("positions_count", 1), 1)
            ),
            total_debt_ratio    = (
                d.get("lending", {}).get("total_debt", 0)
                / max(d.get("lending", {}).get("total_collateral", 1), 1)
            ),
            market_risk_level   = d.get("market", {}).get("condition", {}).get("risk_level", 0.5),
            market_volatility_id= {"low": 0, "medium": 1, "high": 2}.get(
                d.get("market", {}).get("condition", {}).get("volatility", "medium"), 1
            ),
        )
        return self.predict(f)

    def predict_batch(self, agent_dicts: list[dict]) -> list[dict]:
        """Predict for a list of agent context dicts. Returns enriched dicts."""
        results = []
        for d in agent_dicts:
            try:
                pred = self.predict_from_dict(d)
                results.append({
                    "agent_id":   d.get("id"),
                    "agent_name": d.get("name"),
                    "agent_type": d.get("type"),
                    **{k: v for k, v in pred.__dict__.items()},
                })
            except Exception as e:
                results.append({"agent_id": d.get("id"), "error": str(e)})
        return results

    # ════════════════════════════════════════════════════════════════════════
    # Serialization
    # ════════════════════════════════════════════════════════════════════════

    def save(self, path: str = MODEL_PATH):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self, f, protocol=pickle.HIGHEST_PROTOCOL)
        kb = os.path.getsize(path) / 1024
        print(f"💾  Saved → {path}  ({kb:.0f} KB)")

    @classmethod
    def load(cls, path: str = MODEL_PATH) -> "DotlocalAgentIntelModel":
        with open(path, "rb") as f:
            obj = pickle.load(f)
        if not isinstance(obj, cls):
            raise TypeError("Not a DotlocalAgentIntelModel")
        print(f"✅  Loaded from {path}")
        return obj

    @classmethod
    def load_or_train(cls, path: str = MODEL_PATH, n_samples: int = 6000) -> "DotlocalAgentIntelModel":
        if os.path.exists(path):
            try:
                return cls.load(path)
            except Exception as exc:
                print(f"⚠  Load failed ({exc}), retraining…")
        print("🧠  Training DotlocalAgentIntelModel (first run — ~45s)…")
        m = cls().fit(n_samples)
        m.save(path)
        return m


# ─── Module-level singleton ───────────────────────────────────────────────────

agent_intel_model: Optional[DotlocalAgentIntelModel] = None


def get_model() -> DotlocalAgentIntelModel:
    global agent_intel_model
    if agent_intel_model is None or not agent_intel_model.is_trained:
        agent_intel_model = DotlocalAgentIntelModel.load_or_train()
    return agent_intel_model
