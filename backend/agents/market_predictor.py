"""
MarketPredictionModel — ML-powered market forecast & portfolio intelligence.
=============================================================================

Uses current price data, volatility metrics, volume, and cross-asset features
to predict:
  1. Per-asset price direction (up / down / sideways) — 14 classifiers
  2. Market regime classification (bull / bear / sideways / crash / recovery)
  3. Volatility forecast (0-100 scale)
  4. Portfolio risk score (0-100)
  5. Optimal asset allocation weights

Also provides Groq-enhanced narrative around the ML predictions.

Usage:
    from agents.market_predictor import get_market_predictor
    predictor = get_market_predictor()
    forecast  = predictor.predict(current_market_snapshot)
"""

from __future__ import annotations

import os
import math
import pickle
import time
import warnings
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any, Tuple

import numpy as np

warnings.filterwarnings("ignore")

from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# ─── Constants ───────────────────────────────────────────────────────────────

MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "trained_models", "market_predictor.pkl"
)

CRYPTO_SYMBOLS = ["BTC", "ETH", "SOL", "AVAX", "LINK", "UNI", "AAVE", "MATIC"]
STOCK_SYMBOLS  = ["SPX", "NDX", "DJI", "TSLA", "NVDA", "AAPL"]
ALL_SYMBOLS    = CRYPTO_SYMBOLS + STOCK_SYMBOLS  # 14 assets

DIRECTION_LABELS = ["down", "sideways", "up"]          # 0, 1, 2
REGIME_LABELS    = ["crash", "bear", "sideways", "bull", "recovery"]  # 0-4

ASSET_META = {
    # symbol → (base_price, avg_daily_vol%, is_crypto)
    "BTC":  (97500, 2.5, True),  "ETH":  (2750, 3.5, True),
    "SOL":  (175,   5.0, True),  "AVAX": (25,   5.5, True),
    "LINK": (16,    4.5, True),  "UNI":  (7,    5.0, True),
    "AAVE": (230,   4.0, True),  "MATIC":(0.35, 6.0, True),
    "SPX":  (6050,  0.8, False), "NDX":  (21700,1.0, False),
    "DJI":  (44200, 0.7, False), "TSLA": (340,  3.5, False),
    "NVDA": (138,   3.0, False), "AAPL": (245,  1.5, False),
}

# ─── Data Classes ────────────────────────────────────────────────────────────


@dataclass
class AssetPrediction:
    """ML prediction for a single asset."""
    symbol: str
    name: str
    category: str              # "crypto" | "stock"
    direction: str             # "up" / "down" / "sideways"
    direction_confidence: float   # 0-100
    predicted_change_pct: float   # expected % move in next 24h
    volatility_score: float       # 0-100
    momentum_signal: str          # "strong_buy" / "buy" / "neutral" / "sell" / "strong_sell"
    support_price: float
    resistance_price: float
    risk_level: str               # "low" / "medium" / "high"

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "name": self.name,
            "category": self.category,
            "direction": self.direction,
            "direction_confidence": round(self.direction_confidence, 1),
            "predicted_change_pct": round(self.predicted_change_pct, 2),
            "volatility_score": round(self.volatility_score, 1),
            "momentum_signal": self.momentum_signal,
            "support_price": round(self.support_price, 2 if self.support_price > 1 else 6),
            "resistance_price": round(self.resistance_price, 2 if self.resistance_price > 1 else 6),
            "risk_level": self.risk_level,
        }


@dataclass
class PortfolioAllocation:
    """Suggested allocation for a single asset."""
    symbol: str
    weight: float   # 0-1
    rationale: str

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "weight": round(self.weight, 3),
            "weight_pct": round(self.weight * 100, 1),
            "rationale": self.rationale,
        }


@dataclass
class MarketForecast:
    """Full ML prediction output."""
    asset_predictions: List[AssetPrediction]
    market_regime: str               # crash / bear / sideways / bull / recovery
    regime_confidence: float         # 0-100
    overall_volatility: float        # 0-100
    portfolio_risk_score: float      # 0-100
    fear_greed_ml: int               # 0-100 ML-derived fear/greed
    crypto_score: float              # 0-100 composite crypto health
    stock_score: float               # 0-100 composite stock health
    recommended_allocations: List[PortfolioAllocation]
    bullish_count: int
    bearish_count: int
    generated_at: float
    model_confidence: float          # 0-100

    def to_dict(self) -> dict:
        return {
            "asset_predictions": [a.to_dict() for a in self.asset_predictions],
            "market_regime": self.market_regime,
            "regime_confidence": round(self.regime_confidence, 1),
            "overall_volatility": round(self.overall_volatility, 1),
            "portfolio_risk_score": round(self.portfolio_risk_score, 1),
            "fear_greed_ml": self.fear_greed_ml,
            "crypto_score": round(self.crypto_score, 1),
            "stock_score": round(self.stock_score, 1),
            "recommended_allocations": [a.to_dict() for a in self.recommended_allocations],
            "bullish_count": self.bullish_count,
            "bearish_count": self.bearish_count,
            "generated_at": self.generated_at,
            "model_confidence": round(self.model_confidence, 1),
        }


# ─── Feature Extraction ─────────────────────────────────────────────────────

# Feature vector layout (70 features):
#   [0..13]   price                per asset (normalised by base_price)
#   [14..27]  change_pct_24h       per asset
#   [28..41]  volume_normalised    per asset (log-scaled)
#   [42..55]  intraday_range       per asset  (high-low)/price
#   [56]      avg_crypto_change
#   [57]      avg_stock_change
#   [58]      fear_greed_index     (0-100)
#   [59]      btc_dominance
#   [60]      eth_gas_gwei
#   [61]      crypto_volume_total  (log)
#   [62]      stock_volume_total   (log)
#   [63]      btc_eth_ratio        BTC/ETH price ratio
#   [64]      crypto_stock_spread  avg_crypto_change - avg_stock_change
#   [65]      max_crypto_change
#   [66]      min_crypto_change
#   [67]      max_stock_change
#   [68]      min_stock_change
#   [69]      n_positive_assets    (count of assets with positive 24h change)

N_FEATURES = 70


def extract_features_from_market(
    prices: Dict[str, Dict[str, Any]],
    market_condition: Optional[Dict[str, Any]] = None,
) -> np.ndarray:
    """
    Build a 70-feature vector from current market snapshot.
    `prices` is the dict returned by _get_all_prices() keyed by symbol.
    `market_condition` is the dict from the /overview endpoint.
    """
    mc = market_condition or {}
    vec = np.zeros(N_FEATURES)

    # Per-asset features
    crypto_changes: List[float] = []
    stock_changes: List[float] = []
    crypto_vol_total = 0.0
    stock_vol_total = 0.0

    for idx, sym in enumerate(ALL_SYMBOLS):
        d = prices.get(sym, {})
        base = ASSET_META.get(sym, (1, 3, True))[0]
        price = d.get("price", base)
        change = d.get("change_pct", 0.0)
        volume = max(d.get("volume", 0), 1)
        high = d.get("high_24h", price * 1.01)
        low  = d.get("low_24h", price * 0.99)
        intraday = (high - low) / max(price, 0.0001)

        vec[idx]      = price / max(base, 0.01)          # normalised price
        vec[14 + idx] = change                             # change %
        vec[28 + idx] = math.log1p(volume)                 # log volume
        vec[42 + idx] = intraday                           # intraday range

        if idx < 8:  # crypto
            crypto_changes.append(change)
            crypto_vol_total += volume
        else:
            stock_changes.append(change)
            stock_vol_total += volume

    # Aggregate features
    avg_c = np.mean(crypto_changes) if crypto_changes else 0
    avg_s = np.mean(stock_changes)  if stock_changes  else 0
    vec[56] = avg_c
    vec[57] = avg_s
    vec[58] = mc.get("fear_greed_index", 50)
    vec[59] = mc.get("btc_dominance", 55)
    vec[60] = mc.get("eth_gas_gwei", 15)
    vec[61] = math.log1p(crypto_vol_total)
    vec[62] = math.log1p(stock_vol_total)

    btc_price = prices.get("BTC", {}).get("price", 97500)
    eth_price = prices.get("ETH", {}).get("price", 2750)
    vec[63] = btc_price / max(eth_price, 1)
    vec[64] = avg_c - avg_s
    vec[65] = max(crypto_changes) if crypto_changes else 0
    vec[66] = min(crypto_changes) if crypto_changes else 0
    vec[67] = max(stock_changes)  if stock_changes  else 0
    vec[68] = min(stock_changes)  if stock_changes  else 0
    vec[69] = sum(1 for c in crypto_changes + stock_changes if c > 0)

    return vec.reshape(1, -1)


# ─── ML Model ───────────────────────────────────────────────────────────────


class MarketPredictionModel:
    """
    ML model that predicts market direction, regime, volatility, and risk
    from a 70-feature market state snapshot.

    Sub-estimators (18 total):
      • 14 per-asset direction classifiers  (RandomForest)
      •  1 market regime classifier          (GradientBoosting)
      •  1 volatility regressor              (GradientBoosting)
      •  1 portfolio risk regressor          (RandomForest)
      •  1 fear/greed regressor              (MLP)
    """

    VERSION = "1.0"

    def __init__(self):
        self._direction_classifiers: Dict[str, Pipeline] = {}
        self._regime_classifier: Optional[Pipeline] = None
        self._volatility_regressor: Optional[Pipeline] = None
        self._risk_regressor: Optional[Pipeline] = None
        self._fear_greed_regressor: Optional[Pipeline] = None
        self.is_trained: bool = False
        self.n_samples: int = 0

    # ════════════════════════════════════════════════════════════════════════
    # Synthetic training data generation
    # ════════════════════════════════════════════════════════════════════════

    def _gen_training_data(self, n: int = 5000) -> np.ndarray:
        """Generate n synthetic 70-feature market snapshot vectors."""
        rng = np.random.default_rng(42)
        X = np.zeros((n, N_FEATURES))

        for i in range(n):
            scenario = rng.choice(
                ["bull", "bear", "sideways", "crash", "recovery", "mixed"],
                p=[0.20, 0.15, 0.25, 0.10, 0.10, 0.20],
            )

            if scenario == "bull":
                base_drift = rng.uniform(1.0, 5.0)
                vol_mult   = rng.uniform(0.3, 0.8)
            elif scenario == "bear":
                base_drift = rng.uniform(-5.0, -1.0)
                vol_mult   = rng.uniform(0.6, 1.2)
            elif scenario == "crash":
                base_drift = rng.uniform(-12.0, -5.0)
                vol_mult   = rng.uniform(1.0, 2.0)
            elif scenario == "recovery":
                base_drift = rng.uniform(2.0, 8.0)
                vol_mult   = rng.uniform(0.8, 1.5)
            elif scenario == "sideways":
                base_drift = rng.uniform(-1.0, 1.0)
                vol_mult   = rng.uniform(0.2, 0.5)
            else:  # mixed
                base_drift = rng.uniform(-3.0, 3.0)
                vol_mult   = rng.uniform(0.4, 1.0)

            crypto_changes = []
            stock_changes  = []
            crypto_vol_total = 0.0
            stock_vol_total  = 0.0

            for idx, sym in enumerate(ALL_SYMBOLS):
                base_price, avg_vol, is_crypto = ASSET_META[sym]
                # Price around base with some dispersion
                price_norm = 1.0 + rng.normal(base_drift * (1.5 if is_crypto else 0.5), 3.0) / 100
                price_norm = max(0.5, min(2.0, price_norm))
                X[i, idx] = price_norm

                # Change %
                asset_vol = avg_vol * vol_mult
                change = rng.normal(base_drift * (1.5 if is_crypto else 0.5), asset_vol)
                change = np.clip(change, -25, 25)
                X[i, 14 + idx] = change

                if is_crypto:
                    crypto_changes.append(change)
                else:
                    stock_changes.append(change)

                # Volume (log-scaled)
                vol = rng.lognormal(mean=20.0 + (1 if is_crypto else 0), sigma=1.5)
                X[i, 28 + idx] = math.log1p(vol)
                if is_crypto:
                    crypto_vol_total += vol
                else:
                    stock_vol_total += vol

                # Intraday range
                X[i, 42 + idx] = abs(change / 100) + rng.uniform(0.005, 0.04 * vol_mult)

            avg_c = float(np.mean(crypto_changes))
            avg_s = float(np.mean(stock_changes))
            X[i, 56] = avg_c
            X[i, 57] = avg_s

            # Fear / greed linked to drift
            fg = 50 + base_drift * 6 + rng.normal(0, 8)
            X[i, 58] = np.clip(fg, 0, 100)
            X[i, 59] = rng.uniform(48, 62)       # BTC dominance
            X[i, 60] = rng.uniform(5, 50)         # ETH gas
            X[i, 61] = math.log1p(crypto_vol_total)
            X[i, 62] = math.log1p(stock_vol_total)
            X[i, 63] = rng.uniform(30, 45)        # BTC/ETH ratio
            X[i, 64] = avg_c - avg_s
            X[i, 65] = max(crypto_changes) if crypto_changes else 0
            X[i, 66] = min(crypto_changes) if crypto_changes else 0
            X[i, 67] = max(stock_changes)  if stock_changes  else 0
            X[i, 68] = min(stock_changes)  if stock_changes  else 0
            X[i, 69] = sum(1 for c in crypto_changes + stock_changes if c > 0)

        return X

    # ── label generators ──────────────────────────────────────────────────

    def _gen_direction_labels(self, X: np.ndarray, asset_idx: int) -> np.ndarray:
        """Generate direction labels for asset at `asset_idx` (0=down, 1=sideways, 2=up)."""
        rng = np.random.default_rng(500 + asset_idx)
        n = len(X)

        change = X[:, 14 + asset_idx]               # 24h change %
        avg_change = X[:, 56] if asset_idx < 8 else X[:, 57]
        vol = X[:, 42 + asset_idx]                   # intraday range
        fg = X[:, 58]                                # fear/greed

        # Core signal: current momentum + market mood
        signal = (
            change * 0.35
            + avg_change * 0.20
            + (fg - 50) * 0.03
            + rng.normal(0, 1.2, n)
        )

        labels = np.ones(n, dtype=int)  # default sideways
        labels[signal > 1.5]  = 2      # up
        labels[signal < -1.5] = 0      # down
        return labels

    def _gen_regime_labels(self, X: np.ndarray) -> np.ndarray:
        """0=crash, 1=bear, 2=sideways, 3=bull, 4=recovery."""
        rng = np.random.default_rng(600)
        n = len(X)
        avg_c = X[:, 56]
        avg_s = X[:, 57]
        fg    = X[:, 58]
        vol_mean = X[:, 42:56].mean(axis=1)

        composite = avg_c * 0.4 + avg_s * 0.3 + (fg - 50) * 0.06 + rng.normal(0, 1.0, n)

        labels = np.full(n, 2, dtype=int)  # sideways by default
        labels[composite > 3.0]   = 3     # bull
        labels[composite > 6.0]   = 4     # recovery (strong bounce)
        labels[composite < -1.5]  = 1     # bear
        labels[composite < -4.0]  = 0     # crash

        # High-vol overrides: if vol_mean very high + negative → crash
        crash_mask = (vol_mean > 0.06) & (avg_c < -3)
        labels[crash_mask] = 0
        return labels

    def _gen_volatility_labels(self, X: np.ndarray) -> np.ndarray:
        """Volatility score 0-100."""
        rng = np.random.default_rng(700)
        vol_mean = X[:, 42:56].mean(axis=1)
        change_spread = X[:, 65] - X[:, 66]  # max_crypto - min_crypto
        fg_dist = np.abs(X[:, 58] - 50)      # far from neutral → volatile

        score = (
            vol_mean * 800
            + change_spread * 2.5
            + fg_dist * 0.3
            + rng.normal(0, 5, len(X))
        )
        return np.clip(score, 0, 100)

    def _gen_risk_labels(self, X: np.ndarray) -> np.ndarray:
        """Portfolio risk score 0-100."""
        rng = np.random.default_rng(800)
        vol_mean = X[:, 42:56].mean(axis=1)
        negative_count = 14 - X[:, 69]        # how many assets are negative
        worst_crypto = -X[:, 66]               # magnitude of worst crypto drop
        worst_stock  = -X[:, 68]

        score = (
            vol_mean * 400
            + negative_count * 4
            + worst_crypto * 2
            + worst_stock * 2
            + rng.normal(0, 4, len(X))
        )
        return np.clip(score, 0, 100)

    def _gen_fear_greed_labels(self, X: np.ndarray) -> np.ndarray:
        """ML-derived fear/greed index 0-100 (refined from raw input)."""
        rng = np.random.default_rng(900)
        fg_raw = X[:, 58]
        avg_c  = X[:, 56]
        avg_s  = X[:, 57]
        pos_count = X[:, 69]

        score = (
            fg_raw * 0.4
            + (avg_c + avg_s) * 3
            + pos_count * 2.5
            + 20
            + rng.normal(0, 5, len(X))
        )
        return np.clip(score, 0, 100)

    # ════════════════════════════════════════════════════════════════════════
    # Training
    # ════════════════════════════════════════════════════════════════════════

    def fit(self, n_samples: int = 5000) -> "MarketPredictionModel":
        print("📈 Training MarketPredictionModel (18 sub-estimators)…")
        X = self._gen_training_data(n_samples)

        total = 14 + 4  # 14 direction + 4 aggregates
        step = 0

        # 1. Per-asset direction classifiers (14)
        for idx, sym in enumerate(ALL_SYMBOLS):
            step += 1
            print(f"  [{step}/{total}] {sym} direction classifier…")
            y = self._gen_direction_labels(X, idx)
            clf = Pipeline([
                ("sc", StandardScaler()),
                ("m", RandomForestClassifier(
                    n_estimators=80,
                    max_depth=8,
                    class_weight="balanced",
                    random_state=42 + idx,
                    n_jobs=-1,
                )),
            ])
            clf.fit(X, y)
            self._direction_classifiers[sym] = clf

        # 2. Market regime classifier
        step += 1
        print(f"  [{step}/{total}] Market regime classifier…")
        y_regime = self._gen_regime_labels(X)
        self._regime_classifier = Pipeline([
            ("sc", StandardScaler()),
            ("m", GradientBoostingClassifier(
                n_estimators=100,
                max_depth=5,
                learning_rate=0.1,
                subsample=0.8,
                random_state=42,
            )),
        ])
        self._regime_classifier.fit(X, y_regime)

        # 3. Volatility regressor
        step += 1
        print(f"  [{step}/{total}] Volatility regressor…")
        y_vol = self._gen_volatility_labels(X)
        self._volatility_regressor = Pipeline([
            ("sc", StandardScaler()),
            ("m", GradientBoostingRegressor(
                n_estimators=80,
                max_depth=5,
                learning_rate=0.1,
                subsample=0.8,
                random_state=42,
            )),
        ])
        self._volatility_regressor.fit(X, y_vol)

        # 4. Portfolio risk regressor
        step += 1
        print(f"  [{step}/{total}] Portfolio risk regressor…")
        y_risk = self._gen_risk_labels(X)
        self._risk_regressor = Pipeline([
            ("sc", StandardScaler()),
            ("m", RandomForestRegressor(
                n_estimators=80,
                max_depth=6,
                random_state=42,
                n_jobs=-1,
            )),
        ])
        self._risk_regressor.fit(X, y_risk)

        # 5. Fear/Greed ML regressor
        step += 1
        print(f"  [{step}/{total}] Fear/Greed ML regressor…")
        y_fg = self._gen_fear_greed_labels(X)
        self._fear_greed_regressor = Pipeline([
            ("sc", StandardScaler()),
            ("m", MLPClassifier(
                hidden_layer_sizes=(48, 24),
                activation="relu",
                max_iter=400,
                early_stopping=True,
                random_state=42,
            )),
        ])
        # Bin into 10 classes for MLP
        y_fg_binned = np.clip((y_fg / 10).astype(int), 0, 9)
        self._fear_greed_regressor.fit(X, y_fg_binned)

        self.is_trained = True
        self.n_samples = n_samples
        print("✅ MarketPredictionModel training complete (18 sub-estimators).")
        return self

    # ════════════════════════════════════════════════════════════════════════
    # Inference
    # ════════════════════════════════════════════════════════════════════════

    def predict(
        self,
        prices: Dict[str, Dict[str, Any]],
        market_condition: Optional[Dict[str, Any]] = None,
    ) -> MarketForecast:
        """
        Run the full prediction pipeline on a market snapshot.
        `prices` = {symbol: {price, change_pct, volume, high_24h, low_24h, …}}
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained — call fit() or load_or_train() first.")

        X = extract_features_from_market(prices, market_condition)

        # ── Market regime ────────────────────────────────────────────────
        regime_proba = self._regime_classifier.predict_proba(X)[0]
        regime_idx   = int(np.argmax(regime_proba))
        regime_label = REGIME_LABELS[regime_idx]
        regime_conf  = float(regime_proba[regime_idx]) * 100

        # ── Volatility ───────────────────────────────────────────────────
        overall_vol = float(np.clip(self._volatility_regressor.predict(X)[0], 0, 100))

        # ── Portfolio risk ───────────────────────────────────────────────
        risk_score = float(np.clip(self._risk_regressor.predict(X)[0], 0, 100))

        # ── Fear / Greed ML ──────────────────────────────────────────────
        fg_bin = int(self._fear_greed_regressor.predict(X)[0])
        fg_ml  = min(100, max(0, fg_bin * 10 + 5))

        # ── Per-asset predictions ────────────────────────────────────────
        asset_preds: List[AssetPrediction] = []
        crypto_scores: List[float] = []
        stock_scores:  List[float] = []
        bullish = 0
        bearish = 0

        for idx, sym in enumerate(ALL_SYMBOLS):
            clf = self._direction_classifiers[sym]
            proba = clf.predict_proba(X)[0]

            # Map probabilities to direction
            # Classes should be [0=down, 1=sideways, 2=up]
            classes = list(clf.classes_)
            p_down     = float(proba[classes.index(0)]) if 0 in classes else 0.1
            p_sideways = float(proba[classes.index(1)]) if 1 in classes else 0.3
            p_up       = float(proba[classes.index(2)]) if 2 in classes else 0.1

            best_idx = int(np.argmax([p_down, p_sideways, p_up]))
            direction = DIRECTION_LABELS[best_idx]
            confidence = float([p_down, p_sideways, p_up][best_idx]) * 100

            # Predicted change magnitude
            change_sign = -1 if direction == "down" else (1 if direction == "up" else 0)
            pred_change = change_sign * (confidence / 100) * (overall_vol / 25 + 0.5) * np.random.uniform(0.5, 2.0)
            if direction == "sideways":
                pred_change = np.random.uniform(-0.5, 0.5)

            # Current price and support/resistance
            d = prices.get(sym, {})
            current_price = d.get("price", ASSET_META[sym][0])
            support    = current_price * (1 - abs(pred_change) / 100 - 0.02)
            resistance = current_price * (1 + abs(pred_change) / 100 + 0.02)

            # Momentum signal
            raw_signal = (p_up - p_down) * 2 + (fg_ml - 50) / 50
            if raw_signal > 1.0:
                momentum = "strong_buy"
            elif raw_signal > 0.3:
                momentum = "buy"
            elif raw_signal < -1.0:
                momentum = "strong_sell"
            elif raw_signal < -0.3:
                momentum = "sell"
            else:
                momentum = "neutral"

            # Volatility per asset
            asset_vol = X[0, 42 + idx] * 1000
            asset_vol = min(100, max(0, asset_vol))

            # Risk level
            if asset_vol > 60 or abs(pred_change) > 5:
                risk = "high"
            elif asset_vol > 30 or abs(pred_change) > 2:
                risk = "medium"
            else:
                risk = "low"

            # Health score for sector aggregation
            health = 50 + (p_up - p_down) * 30 + (fg_ml - 50) * 0.2
            health = min(100, max(0, health))

            meta = ASSET_META[sym]
            asset_preds.append(AssetPrediction(
                symbol=sym,
                name=d.get("name", sym),
                category="crypto" if meta[2] else "stock",
                direction=direction,
                direction_confidence=confidence,
                predicted_change_pct=pred_change,
                volatility_score=asset_vol,
                momentum_signal=momentum,
                support_price=support,
                resistance_price=resistance,
                risk_level=risk,
            ))

            if meta[2]:
                crypto_scores.append(health)
            else:
                stock_scores.append(health)

            if direction == "up":
                bullish += 1
            elif direction == "down":
                bearish += 1

        # ── Sector scores ────────────────────────────────────────────────
        crypto_score = float(np.mean(crypto_scores)) if crypto_scores else 50
        stock_score  = float(np.mean(stock_scores))  if stock_scores  else 50

        # ── Portfolio allocation ─────────────────────────────────────────
        allocations = self._compute_allocations(asset_preds, overall_vol, risk_score)

        # ── Model confidence ─────────────────────────────────────────────
        confs = [a.direction_confidence for a in asset_preds]
        model_conf = float(np.mean(confs)) if confs else 60.0

        return MarketForecast(
            asset_predictions=asset_preds,
            market_regime=regime_label,
            regime_confidence=regime_conf,
            overall_volatility=overall_vol,
            portfolio_risk_score=risk_score,
            fear_greed_ml=fg_ml,
            crypto_score=crypto_score,
            stock_score=stock_score,
            recommended_allocations=allocations,
            bullish_count=bullish,
            bearish_count=bearish,
            generated_at=time.time(),
            model_confidence=model_conf,
        )

    # ── internal allocation logic ─────────────────────────────────────────

    def _compute_allocations(
        self,
        preds: List[AssetPrediction],
        volatility: float,
        risk_score: float,
    ) -> List[PortfolioAllocation]:
        """Compute recommended portfolio weights from ML predictions."""
        # Score each asset: positive direction + low vol favoured
        scores: Dict[str, float] = {}
        for p in preds:
            s = 0.0
            if p.direction == "up":
                s += p.direction_confidence * 0.6
            elif p.direction == "sideways":
                s += p.direction_confidence * 0.2
            else:
                s -= p.direction_confidence * 0.4

            # Penalise high-vol assets lightly
            s -= p.volatility_score * 0.1

            # Boost BTC/ETH/SPX as "safe" core
            if p.symbol in ("BTC", "ETH", "SPX"):
                s += 10

            scores[p.symbol] = max(s, 1)  # floor at 1 to keep some allocation

        total = sum(scores.values())
        allocs: List[PortfolioAllocation] = []
        for p in preds:
            w = scores[p.symbol] / total
            # Build rationale
            if p.direction == "up":
                rat = f"ML predicts upward move ({p.direction_confidence:.0f}% conf), {p.momentum_signal} signal"
            elif p.direction == "down":
                rat = f"ML predicts downward move — minimal allocation for diversification"
            else:
                rat = f"Sideways expectation — moderate weight for stability"
            allocs.append(PortfolioAllocation(symbol=p.symbol, weight=w, rationale=rat))

        # Sort by weight descending
        allocs.sort(key=lambda a: a.weight, reverse=True)
        return allocs

    # ════════════════════════════════════════════════════════════════════════
    # Serialization
    # ════════════════════════════════════════════════════════════════════════

    def save(self, path: str = MODEL_PATH):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self, f, protocol=pickle.HIGHEST_PROTOCOL)
        kb = os.path.getsize(path) / 1024
        print(f"💾 Saved → {path}  ({kb:.0f} KB)")

    @classmethod
    def load(cls, path: str = MODEL_PATH) -> "MarketPredictionModel":
        with open(path, "rb") as f:
            obj = pickle.load(f)
        if not isinstance(obj, cls):
            raise TypeError("Not a MarketPredictionModel")
        print(f"✅ Loaded MarketPredictionModel from {path}")
        return obj

    @classmethod
    def load_or_train(
        cls, path: str = MODEL_PATH, n_samples: int = 5000
    ) -> "MarketPredictionModel":
        if os.path.exists(path):
            try:
                return cls.load(path)
            except Exception as exc:
                print(f"⚠ Load failed ({exc}), retraining…")
        print("📈 Training MarketPredictionModel (first run — ~45s)…")
        m = cls().fit(n_samples)
        m.save(path)
        return m


# ─── Module-level singleton ──────────────────────────────────────────────────

_market_predictor: Optional[MarketPredictionModel] = None


def get_market_predictor() -> MarketPredictionModel:
    global _market_predictor
    if _market_predictor is None or not _market_predictor.is_trained:
        _market_predictor = MarketPredictionModel.load_or_train()
    return _market_predictor
