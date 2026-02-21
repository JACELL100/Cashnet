"""
DotlocalRiskModel — Single combined ML model for DeFi liquidity pool risk analysis.
All 5 tasks are encapsulated in ONE class and saved to ONE .pkl file:

  1. Slippage prediction      → GradientBoostingRegressor
  2. Drain risk classification → RandomForestClassifier  (LOW/MEDIUM/HIGH/CRITICAL)
  3. IL 1h forecast           → MLPRegressor
  4. IL 24h forecast          → MLPRegressor
  5. Anomaly detection        → IsolationForest

Usage:
    model = DotlocalRiskModel.load_or_train()
    prediction = model.predict(features)
    model.save()
"""

import os
import math
import pickle
import warnings
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

warnings.filterwarnings("ignore")

from sklearn.ensemble import GradientBoostingRegressor, RandomForestClassifier, IsolationForest
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# ─── Constants ────────────────────────────────────────────────────────────────

MODEL_PATH = os.path.join(os.path.dirname(__file__), "trained_models", "dotlocal_risk_model.pkl")
DRAIN_LABELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class PoolFeatures:
    reserve0: float         # token0 reserve (e.g. USDC)
    reserve1: float         # token1 reserve (e.g. ETH)
    price: float            # token0 per token1 (e.g. USDC/ETH)
    tvl: float              # total value locked in token0 units
    volume_24h: float       # 24h trading volume (token0 units)
    swap_count: float       # number of swaps
    provider_count: float   # number of LP providers
    fee_pct: float          # fee as percentage e.g. 0.30
    trade_size: float = 0.0         # hypothetical trade size (token0)
    price_ratio: float = 1.0        # current_price / entry_price


@dataclass
class RiskPrediction:
    slippage_pct: float             # predicted slippage %
    drain_risk_score: float         # 0–100
    drain_risk_label: str           # LOW / MEDIUM / HIGH / CRITICAL
    il_forecast_1h: float           # IL% in 1 hour
    il_forecast_24h: float          # IL% in 24 hours
    anomaly_score: float            # 0–100 (higher = more anomalous)
    is_anomaly: bool
    confidence: float               # model confidence 0–100
    warnings: list[str] = field(default_factory=list)


# ─── Combined Model ───────────────────────────────────────────────────────────

class DotlocalRiskModel:
    """
    Single combined ML model — all 5 sub-estimators, one .pkl file.
    """

    VERSION = "1.0"

    def __init__(self):
        self._slippage: Optional[Pipeline] = None
        self._drain: Optional[Pipeline] = None
        self._il_1h: Optional[Pipeline] = None
        self._il_24h: Optional[Pipeline] = None
        self._anomaly: Optional[IsolationForest] = None
        self._anomaly_scaler: Optional[StandardScaler] = None
        self.is_trained: bool = False
        self.n_samples: int = 0

    # ── Synthetic training data ──────────────────────────────────────────────

    def _gen_slippage_data(self, n: int):
        """AMM-accurate labelled data using true constant-product math."""
        rng = np.random.default_rng(42)
        r0   = rng.uniform(1e4, 1e7, n)
        r1   = rng.uniform(1, 1e4, n)
        fee  = rng.uniform(0.001, 0.01, n)
        trade = rng.uniform(10, r0 * 0.45)
        price = r0 / np.maximum(r1, 1e-9)
        tvl   = r0 * 2
        vol   = rng.uniform(0, tvl * 0.3)
        prov  = rng.integers(1, 200, n).astype(float)

        # true AMM output
        amt_after_fee = trade * (1 - fee)
        new_r0 = r0 + amt_after_fee
        new_r1 = (r0 * r1) / new_r0
        amount_out = r1 - new_r1
        expected_at_mid = trade / np.maximum(price, 1e-9)
        slip = np.abs(expected_at_mid - amount_out) / np.maximum(expected_at_mid, 1e-9) * 100
        slip = np.clip(slip, 0, 50)

        X = np.stack([r0, r1, price, tvl, vol, prov, fee * 100, trade,
                      trade / np.maximum(tvl, 1)], axis=1)
        return X, slip

    def _gen_drain_data(self, n: int):
        rng = np.random.default_rng(7)
        r0   = rng.uniform(1e3, 1e7, n)
        r1   = rng.uniform(0.1, 5e3, n)
        price = r0 / np.maximum(r1, 1e-9)
        tvl  = r0 * 2
        vol_ratio = rng.uniform(0, 3.0, n)
        prov = rng.integers(1, 500, n).astype(float)
        fee  = rng.uniform(0.001, 0.03, n)
        swaps = rng.uniform(0, 1000, n)
        price_vol = rng.uniform(0, 0.5, n)
        wp   = rng.uniform(0, 1.0, n)

        risk = (
            (vol_ratio > 1.5).astype(int)  * 2 +
            (vol_ratio > 2.5).astype(int)  * 2 +
            (prov < 5).astype(int)         * 2 +
            (tvl < 5e4).astype(int)        * 2 +
            (price_vol > 0.3).astype(int)  * 2 +
            (wp > 0.7).astype(int)         * 3 +
            (swaps > 500).astype(int)          +
            rng.integers(0, 2, n)
        )
        labels = np.where(risk <= 2, 0, np.where(risk <= 4, 1, np.where(risk <= 7, 2, 3)))

        X = np.stack([r0, r1, price, tvl, vol_ratio, prov,
                      fee * 100, swaps, price_vol, wp], axis=1)
        return X, labels

    def _gen_il_data(self, n: int):
        rng = np.random.default_rng(99)
        ratio = rng.uniform(0.5, 3.0, n)
        vol   = rng.uniform(0.01, 0.5, n)
        vr    = rng.uniform(0, 2.0, n)
        tvl   = rng.uniform(1e4, 1e7, n)
        prov  = rng.integers(1, 500, n).astype(float)

        il_now  = np.abs(2 * np.sqrt(ratio) / (1 + ratio) - 1) * 100
        y_1h    = np.clip(il_now + np.abs(rng.normal(0, vol * 0.1, n)) * 10, 0, 50)
        y_24h   = np.clip(il_now + np.abs(rng.normal(0, vol * 0.5, n)) * 10, 0, 50)

        X = np.stack([ratio, vol, vr, tvl, prov], axis=1)
        return X, y_1h, y_24h

    def _gen_anomaly_data(self, n: int = 4000):
        """Normal pool activity distribution for the unsupervised detector."""
        rng = np.random.default_rng(13)
        return np.stack([
            rng.uniform(1e5, 5e6, n),       # reserve0
            rng.uniform(10, 2e3, n),         # reserve1
            rng.uniform(100, 5000, n),       # price
            rng.uniform(0, 0.3, n),          # vol/tvl ratio
            rng.uniform(0, 200, n),          # swap count
            rng.uniform(0.001, 0.005, n),    # fee
            rng.uniform(10, 500, n),         # providers
            rng.uniform(0, 0.1, n),          # price change
        ], axis=1)

    # ── Training ─────────────────────────────────────────────────────────────

    def fit(self, n_samples: int = 5000) -> "DotlocalRiskModel":
        """Train all 5 sub-models on synthetic AMM data."""

        print("  [1/5] Slippage predictor — GradientBoosting …")
        Xs, ys = self._gen_slippage_data(n_samples)
        self._slippage = Pipeline([
            ("sc", StandardScaler()),
            ("m",  GradientBoostingRegressor(
                n_estimators=200, max_depth=6,
                learning_rate=0.05, subsample=0.8, random_state=42
            )),
        ])
        self._slippage.fit(Xs, ys)

        print("  [2/5] Drain risk classifier — RandomForest …")
        Xd, yd = self._gen_drain_data(n_samples)
        self._drain = Pipeline([
            ("sc", StandardScaler()),
            ("m",  RandomForestClassifier(
                n_estimators=150, max_depth=8,
                class_weight="balanced", random_state=42
            )),
        ])
        self._drain.fit(Xd, yd)

        print("  [3/5] IL-1h forecaster — MLP Neural Network …")
        Xi, y_1h, y_24h = self._gen_il_data(n_samples)
        self._il_1h = Pipeline([
            ("sc", StandardScaler()),
            ("m",  MLPRegressor(
                hidden_layer_sizes=(64, 32, 16), activation="relu",
                max_iter=500, early_stopping=True, random_state=42
            )),
        ])
        self._il_1h.fit(Xi, y_1h)

        print("  [4/5] IL-24h forecaster — MLP Neural Network …")
        self._il_24h = Pipeline([
            ("sc", StandardScaler()),
            ("m",  MLPRegressor(
                hidden_layer_sizes=(64, 32, 16), activation="relu",
                max_iter=500, early_stopping=True, random_state=42
            )),
        ])
        self._il_24h.fit(Xi, y_24h)

        print("  [5/5] Anomaly detector — IsolationForest …")
        Xa = self._gen_anomaly_data(4000)
        self._anomaly_scaler = StandardScaler()
        Xa_sc = self._anomaly_scaler.fit_transform(Xa)
        self._anomaly = IsolationForest(
            n_estimators=200, contamination=0.05, random_state=42
        )
        self._anomaly.fit(Xa_sc)

        self.is_trained = True
        self.n_samples = n_samples
        print("✅  DotlocalRiskModel training complete.")
        return self

    # ── Inference ────────────────────────────────────────────────────────────

    def predict(self, features: PoolFeatures) -> RiskPrediction:
        if not self.is_trained:
            raise RuntimeError("Model not trained — call fit() or load_or_train().")

        vol_ratio = features.volume_24h / max(features.tvl, 1)
        price_vol = abs(features.price_ratio - 1.0)
        warns: list[str] = []

        # ── 1. Slippage ──────────────────────────────────────────────────────
        Xs = np.array([[
            features.reserve0, features.reserve1, features.price,
            features.tvl, features.volume_24h, features.provider_count,
            features.fee_pct, features.trade_size,
            features.trade_size / max(features.tvl, 1),
        ]])
        slip = float(np.clip(self._slippage.predict(Xs)[0], 0, 50))
        if slip > 5:  warns.append(f"⚠ High slippage predicted: {slip:.2f}%")
        if slip > 15: warns.append("🚨 Critical slippage — pool too shallow for this trade")

        # ── 2. Drain risk ────────────────────────────────────────────────────
        Xd = np.array([[
            features.reserve0, features.reserve1, features.price,
            features.tvl, vol_ratio, features.provider_count,
            features.fee_pct, features.swap_count,
            price_vol, min(vol_ratio, 1.0),
        ]])
        drain_cls   = int(self._drain.predict(Xd)[0])
        drain_proba = self._drain.predict_proba(Xd)[0]
        drain_label = DRAIN_LABELS[drain_cls]
        drain_score = float(drain_cls / 3 * 100 + drain_proba[drain_cls] * 10)
        confidence  = float(np.max(drain_proba) * 100)

        if drain_cls >= 2:                warns.append(f"🔴 Drain risk level: {drain_label}")
        if features.provider_count < 5:   warns.append("⚠ Very few LP providers — high concentration risk")

        # ── 3 & 4. IL forecast ───────────────────────────────────────────────
        Xi = np.array([[
            features.price_ratio, price_vol, vol_ratio,
            features.tvl, features.provider_count,
        ]])
        il_1h  = float(np.clip(self._il_1h.predict(Xi)[0],  0, 50))
        il_24h = float(np.clip(self._il_24h.predict(Xi)[0], 0, 50))
        if il_24h > 5: warns.append(f"📉 IL forecast 24h: {il_24h:.2f}% — consider hedging position")

        # ── 5. Anomaly ───────────────────────────────────────────────────────
        Xa = np.array([[
            features.reserve0, features.reserve1, features.price,
            vol_ratio, features.swap_count, features.fee_pct,
            features.provider_count, price_vol,
        ]])
        Xa_sc = self._anomaly_scaler.transform(Xa)
        raw   = float(self._anomaly.decision_function(Xa_sc)[0])
        anom_score = float(np.clip((-raw + 0.2) * 150, 0, 100))
        is_anomaly = bool(self._anomaly.predict(Xa_sc)[0] == -1)

        if is_anomaly:      warns.append("🚨 ANOMALY DETECTED — suspicious trading pattern")
        if vol_ratio > 2.0: warns.append("⚠ Extreme volume/TVL ratio — possible wash trading or flash loan attack")

        return RiskPrediction(
            slippage_pct       = round(slip, 4),
            drain_risk_score   = round(min(drain_score, 100), 2),
            drain_risk_label   = drain_label,
            il_forecast_1h     = round(il_1h, 4),
            il_forecast_24h    = round(il_24h, 4),
            anomaly_score      = round(anom_score, 2),
            is_anomaly         = is_anomaly,
            confidence         = round(confidence, 2),
            warnings           = warns,
        )

    # ── Serialization ─────────────────────────────────────────────────────────

    def save(self, path: str = MODEL_PATH):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self, f, protocol=pickle.HIGHEST_PROTOCOL)
        size_kb = os.path.getsize(path) / 1024
        print(f"💾  Saved → {path}  ({size_kb:.0f} KB)")

    @classmethod
    def load(cls, path: str = MODEL_PATH) -> "DotlocalRiskModel":
        with open(path, "rb") as f:
            obj = pickle.load(f)
        if not isinstance(obj, cls):
            raise TypeError("Loaded file is not a DotlocalRiskModel")
        print(f"✅  Loaded model from {path}")
        return obj

    @classmethod
    def load_or_train(cls, path: str = MODEL_PATH, n_samples: int = 5000) -> "DotlocalRiskModel":
        """Load from disk if exists, otherwise train fresh and save."""
        if os.path.exists(path):
            try:
                return cls.load(path)
            except Exception as exc:
                print(f"⚠  Could not load saved model ({exc}), retraining…")
        print("🧠  Training DotlocalRiskModel (first run — this takes ~30s)…")
        model = cls().fit(n_samples)
        model.save(path)
        return model


# ─── Module-level singleton ───────────────────────────────────────────────────

risk_model: Optional[DotlocalRiskModel] = None


def get_model() -> DotlocalRiskModel:
    """Return the loaded (or lazily trained) singleton model."""
    global risk_model
    if risk_model is None or not risk_model.is_trained:
        risk_model = DotlocalRiskModel.load_or_train()
    return risk_model
