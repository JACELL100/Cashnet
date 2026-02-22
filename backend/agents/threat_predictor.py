"""
ThreatPredictionModel — ML-powered future threat predictor for DeFi security.
=============================================================================

Uses historical alert patterns + current system state to predict:
  1. Which threat types are most likely next (multi-label classification)
  2. Probability of each threat type occurring in next window
  3. Estimated severity distribution
  4. Time-window risk forecast (next 1h / 6h / 24h)

Also provides Groq-enhanced suggestions for mitigating existing + predicted threats.

Usage:
    from agents.threat_predictor import get_threat_predictor
    predictor = get_threat_predictor()
    predictions = predictor.predict_future_threats(current_alerts, threat_scores)
"""

from __future__ import annotations

import os
import math
import pickle
import time
import warnings
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any

import numpy as np

warnings.filterwarnings("ignore")

from sklearn.ensemble import (
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    RandomForestClassifier,
)
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# ─── Constants ───────────────────────────────────────────────────────────────

MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "trained_models", "threat_predictor.pkl"
)

THREAT_TYPES = [
    "flash_loan_exploit",
    "sandwich_attack",
    "wash_trading",
    "oracle_manipulation",
    "liquidity_poisoning",
    "pump_dump",
    "cascade_liquidation",
    "whale_manipulation",
    "price_manipulation",
    "rapid_fire_trading",
]

SEVERITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

THREAT_DESCRIPTIONS = {
    "flash_loan_exploit": "Borrow → manipulate price → profit → repay in one tx",
    "sandwich_attack": "Front-run + back-run pending large trades for MEV extraction",
    "wash_trading": "Circular trades between related wallets to inflate volume",
    "oracle_manipulation": "Price feed manipulation via TWAP divergence or spike",
    "liquidity_poisoning": "Add/remove liquidity to skew pool ratios maliciously",
    "pump_dump": "Coordinated buy burst followed by large sell dump",
    "cascade_liquidation": "Chain reaction of under-collateral position seizures",
    "whale_manipulation": "Single large trade impacting >5% of pool reserves",
    "price_manipulation": "Systematic trades to move price in a desired direction",
    "rapid_fire_trading": "High-frequency bot activity to destabilize the pool",
}

# Mitigation suggestions per threat type
MITIGATION_STRATEGIES = {
    "flash_loan_exploit": [
        "Implement flash loan detection circuit breakers on the LiquidityPool contract",
        "Add minimum block delay between large borrows and swaps",
        "Set maximum single-transaction swap size relative to pool reserves",
        "Enable TWAP-based pricing to resist single-block manipulation",
    ],
    "sandwich_attack": [
        "Implement private mempool or commit-reveal swap mechanism",
        "Add minimum slippage protection to all trades (default 0.5%)",
        "Enable MEV-protection relay (e.g., Flashbots Protect) for user transactions",
        "Reduce block-level price impact cap to 2% per single trade",
    ],
    "wash_trading": [
        "Deploy on-chain wash trading detection via cyclic graph analysis",
        "Flag wallets with >80% self-referencing trade patterns",
        "Implement volume-weighted fee tiers to penalize wash patterns",
        "Add cooldown periods between opposite trades from the same wallet",
    ],
    "oracle_manipulation": [
        "Use multiple independent oracle sources (Chainlink + TWAP + Uniswap)",
        "Implement oracle deviation circuit breakers (pause if >5% deviation)",
        "Add time-weighted averaging over 30-minute windows",
        "Deploy an oracle monitoring bot with automated alerting",
    ],
    "liquidity_poisoning": [
        "Implement minimum lock period for LP token deposits (e.g., 10 blocks)",
        "Cap single-provider liquidity additions to <20% of total pool",
        "Add ratio-imbalance detection that pauses deposits",
        "Monitor LP token concentration — alert if single address >40% of LP supply",
    ],
    "pump_dump": [
        "Implement velocity-based trade throttling for price spikes >3% per minute",
        "Add progressive fee scaling during rapid unidirectional price movement",
        "Deploy automated market-making stabilizer that widens spreads during volatility",
        "Enable coordinated-buying detection across related wallets",
    ],
    "cascade_liquidation": [
        "Implement gradual liquidation (partial liquidation of 25% per step)",
        "Add a cascade circuit breaker that pauses liquidations after 3+ in 1 minute",
        "Increase minimum collateral ratio buffer from 150% to 175%",
        "Deploy automated health-factor alerts at 1.3x threshold (before 1.0x)",
    ],
    "whale_manipulation": [
        "Implement trade-size limits relative to pool reserves (<3% per trade)",
        "Add progressive slippage for large orders (quadratic impact curve)",
        "Enable wallet-level daily volume caps at 10% of pool TVL",
        "Deploy whale-activity alerts for trades >1% of total reserves",
    ],
    "price_manipulation": [
        "Enable TWAP-based execution for large orders over multiple blocks",
        "Add price deviation alerts when spot price diverges >5% from oracle",
        "Implement rate limiting on consecutive same-direction trades",
        "Deploy price corridor constraints that reject trades outside ±10% band",
    ],
    "rapid_fire_trading": [
        "Implement per-wallet rate limiting (max 5 trades per block)",
        "Add exponentially increasing gas fees for high-frequency patterns",
        "Deploy bot detection via tx-pattern fingerprinting",
        "Enable cooldown periods after >10 trades per minute from same address",
    ],
}


# ─── Data Classes ────────────────────────────────────────────────────────────


@dataclass
class ThreatPrediction:
    """Prediction for a single threat type."""
    threat_type: str
    probability: float  # 0-100
    predicted_severity: str  # LOW / MEDIUM / HIGH / CRITICAL
    confidence: float  # 0-100
    time_window: str  # "1h" / "6h" / "24h"
    risk_trend: str  # "INCREASING" / "STABLE" / "DECREASING"
    description: str
    mitigation_suggestions: List[str]

    def to_dict(self) -> dict:
        return {
            "threat_type": self.threat_type,
            "probability": round(self.probability, 1),
            "predicted_severity": self.predicted_severity,
            "confidence": round(self.confidence, 1),
            "time_window": self.time_window,
            "risk_trend": self.risk_trend,
            "description": self.description,
            "mitigation_suggestions": self.mitigation_suggestions,
        }


@dataclass
class ThreatForecast:
    """Full prediction output for all threat types."""
    predictions: List[ThreatPrediction]
    overall_risk_score: float  # 0-100
    overall_trend: str  # INCREASING / STABLE / DECREASING
    highest_risk_threat: str
    total_predicted_incidents: int
    forecast_window: str  # "24h"
    generated_at: float  # timestamp
    model_confidence: float  # 0-100

    def to_dict(self) -> dict:
        return {
            "predictions": [p.to_dict() for p in self.predictions],
            "overall_risk_score": round(self.overall_risk_score, 1),
            "overall_trend": self.overall_trend,
            "highest_risk_threat": self.highest_risk_threat,
            "total_predicted_incidents": self.total_predicted_incidents,
            "forecast_window": self.forecast_window,
            "generated_at": self.generated_at,
            "model_confidence": round(self.model_confidence, 1),
        }


# ─── Feature Extraction ─────────────────────────────────────────────────────


def extract_features_from_alerts(
    alerts: List[Dict[str, Any]],
    threat_scores: List[Dict[str, Any]],
) -> np.ndarray:
    """
    Extract a 30-feature vector from current alert/score state.
    Features encode alert distribution, severity counts, recency, and score state.
    """
    # Count alerts by type
    type_counts = {t: 0 for t in THREAT_TYPES}
    sev_counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    total_alerts = len(alerts)
    resolved_count = 0
    newest_age = 999999.0
    now = time.time()

    for a in alerts:
        atype = a.get("type", "")
        if atype in type_counts:
            type_counts[atype] += 1
        sev = (a.get("severity") or "LOW").upper()
        if sev in sev_counts:
            sev_counts[sev] += 1
        if a.get("resolved"):
            resolved_count += 1
        # Age of newest alert
        ts = a.get("timestamp", 0)
        if isinstance(ts, str):
            try:
                from datetime import datetime
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
            except Exception:
                ts = 0
        age = now - float(ts)
        if 0 < age < newest_age:
            newest_age = age

    if newest_age == 999999.0:
        newest_age = 3600.0  # default 1h

    # Score features
    score_values = {s.get("axis", ""): s.get("score", 0) for s in threat_scores}

    # Build feature vector (30 features)
    features = [
        # Alert type counts (10)
        *[type_counts.get(t, 0) for t in THREAT_TYPES],
        # Severity counts (4)
        sev_counts["LOW"],
        sev_counts["MEDIUM"],
        sev_counts["HIGH"],
        sev_counts["CRITICAL"],
        # Aggregate stats (6)
        total_alerts,
        resolved_count,
        total_alerts - resolved_count,  # unresolved
        min(newest_age / 3600, 24),  # newest alert age in hours (capped at 24)
        sev_counts["CRITICAL"] + sev_counts["HIGH"],  # severe count
        (sev_counts["CRITICAL"] * 4 + sev_counts["HIGH"] * 3 + sev_counts["MEDIUM"] * 2 + sev_counts["LOW"]) / max(total_alerts, 1),  # weighted severity
        # Threat radar scores (10 — fill with defaults)
        score_values.get("Flash Loan", 20),
        score_values.get("Sandwich", 15),
        score_values.get("Wash Trading", 10),
        score_values.get("Oracle", 10),
        score_values.get("Whale", 15),
        score_values.get("Cascade", 10),
        score_values.get("MEV", 15),
        score_values.get("Rug Pull", 5),
        score_values.get("Price Manip", 10),
        score_values.get("Overall", 20),
    ]

    return np.array([features], dtype=float)


# ─── ML Model ───────────────────────────────────────────────────────────────


class ThreatPredictionModel:
    """
    ML model that predicts future threat probabilities from current alert state.
    10 binary classifiers (one per threat type) + 1 severity regressor + 1 trend classifier.
    """

    VERSION = "1.0"

    def __init__(self):
        self._threat_classifiers: Dict[str, Pipeline] = {}  # threat_type → binary Pipeline
        self._severity_regressor: Optional[Pipeline] = None  # predicts weighted severity 0-100
        self._trend_classifier: Optional[Pipeline] = None  # predicts trend: 0=decreasing 1=stable 2=increasing
        self.is_trained: bool = False
        self.n_samples: int = 0

    # ════════════════════════════════════════════════════════════════════════
    # Synthetic training data
    # ════════════════════════════════════════════════════════════════════════

    def _gen_training_data(self, n: int = 5000):
        """Generate synthetic alert-state feature vectors + labels."""
        rng = np.random.default_rng(42)

        # 30 features
        X = np.zeros((n, 30))

        for i in range(n):
            # Simulate different alert scenarios
            scenario = rng.choice(["calm", "attack", "escalating", "post_attack", "mixed"], p=[0.25, 0.2, 0.2, 0.15, 0.2])

            if scenario == "calm":
                # Low activity
                type_counts = rng.poisson(0.5, 10).astype(float)
                sev_low, sev_med, sev_high, sev_crit = rng.integers(0, 5), rng.integers(0, 2), rng.integers(0, 1), 0
                scores = rng.uniform(5, 30, 10)
            elif scenario == "attack":
                # Active attack — concentrated alerts
                type_counts = rng.poisson(1.0, 10).astype(float)
                attack_idx = rng.integers(0, 10)
                type_counts[attack_idx] += rng.integers(3, 10)
                sev_low, sev_med, sev_high, sev_crit = rng.integers(0, 3), rng.integers(1, 5), rng.integers(2, 8), rng.integers(1, 4)
                scores = rng.uniform(30, 80, 10)
                scores[attack_idx] = rng.uniform(60, 95)
            elif scenario == "escalating":
                type_counts = rng.poisson(2.0, 10).astype(float)
                sev_low, sev_med, sev_high, sev_crit = rng.integers(1, 5), rng.integers(2, 7), rng.integers(1, 5), rng.integers(0, 2)
                scores = rng.uniform(20, 60, 10)
            elif scenario == "post_attack":
                type_counts = rng.poisson(1.5, 10).astype(float)
                sev_low, sev_med, sev_high, sev_crit = rng.integers(2, 8), rng.integers(1, 4), rng.integers(0, 2), 0
                scores = rng.uniform(15, 40, 10)
            else:  # mixed
                type_counts = rng.poisson(1.0, 10).astype(float)
                sev_low, sev_med, sev_high, sev_crit = rng.integers(0, 5), rng.integers(0, 4), rng.integers(0, 3), rng.integers(0, 2)
                scores = rng.uniform(10, 50, 10)

            total = int(type_counts.sum()) + sev_low + sev_med + sev_high + sev_crit
            resolved = int(total * rng.uniform(0.3, 0.8))
            newest_age = rng.uniform(0.01, 12)  # hours
            severe = sev_high + sev_crit
            weighted_sev = (sev_crit * 4 + sev_high * 3 + sev_med * 2 + sev_low) / max(total, 1)

            X[i] = np.concatenate([
                type_counts,
                [sev_low, sev_med, sev_high, sev_crit],
                [total, resolved, total - resolved, newest_age, severe, weighted_sev],
                scores,
            ])

        return X

    def _gen_threat_labels(self, X: np.ndarray, threat_idx: int) -> np.ndarray:
        """Generate binary labels for whether threat_type[threat_idx] will occur."""
        rng = np.random.default_rng(100 + threat_idx)
        n = len(X)

        # Base probability from current count of that threat type
        current_count = X[:, threat_idx]
        # Higher current count → higher future probability
        base_prob = np.clip(current_count / 10, 0, 0.7)

        # Boost from high severity
        sev_boost = (X[:, 12] * 0.01 + X[:, 13] * 0.05 + X[:, 14] * 0.1 + X[:, 15] * 0.15)

        # Boost from radar score for this threat
        score_boost = np.clip(X[:, 20 + min(threat_idx, 9)] / 200, 0, 0.2)

        # Cross-threat correlations
        cross = np.zeros(n)
        if threat_idx == 0:  # flash_loan correlates with cascade
            cross += X[:, 6] * 0.05  # cascade count
        elif threat_idx == 1:  # sandwich correlates with rapid_fire
            cross += X[:, 9] * 0.04
        elif threat_idx == 2:  # wash correlates with pump_dump
            cross += X[:, 5] * 0.04
        elif threat_idx == 6:  # cascade correlates with flash_loan + whale
            cross += (X[:, 0] + X[:, 7]) * 0.03

        prob = base_prob + sev_boost + score_boost + cross + rng.uniform(-0.1, 0.1, n)
        return (prob > 0.35).astype(int)

    def _gen_severity_labels(self, X: np.ndarray) -> np.ndarray:
        """Generate overall severity score 0-100 for the forecast window."""
        rng = np.random.default_rng(200)
        weighted = X[:, 19]  # weighted severity
        critical = X[:, 13]
        high = X[:, 12]
        unresolved = X[:, 16]
        scores_mean = X[:, 20:30].mean(axis=1)

        score = (
            weighted * 15
            + critical * 8
            + high * 4
            + unresolved * 1.5
            + scores_mean * 0.5
            + rng.uniform(-5, 5, len(X))
        )
        return np.clip(score, 0, 100)

    def _gen_trend_labels(self, X: np.ndarray) -> np.ndarray:
        """Generate trend labels: 0=decreasing, 1=stable, 2=increasing."""
        rng = np.random.default_rng(300)
        newest_age = X[:, 17]  # hours
        unresolved = X[:, 16]
        critical = X[:, 13]
        scores_mean = X[:, 20:30].mean(axis=1)

        # Recent alerts + high severity + high scores → increasing
        escalation = (
            (newest_age < 0.5).astype(float) * 2  # very recent alerts
            + (unresolved > 5).astype(float)
            + (critical > 1).astype(float) * 2
            + (scores_mean > 50).astype(float)
            + rng.uniform(-0.5, 0.5, len(X))
        )
        return np.where(escalation > 3, 2, np.where(escalation > 1, 1, 0))

    # ════════════════════════════════════════════════════════════════════════
    # Training
    # ════════════════════════════════════════════════════════════════════════

    def fit(self, n_samples: int = 2000) -> "ThreatPredictionModel":
        print("🔮 Training ThreatPredictionModel (12 sub-estimators)…")
        X = self._gen_training_data(n_samples)

        # Train one RandomForest classifier per threat type (fast)
        for idx, threat_type in enumerate(THREAT_TYPES):
            print(f"  [{idx + 1}/12] {threat_type} classifier…")
            y = self._gen_threat_labels(X, idx)
            clf = Pipeline([
                ("sc", StandardScaler()),
                ("m", RandomForestClassifier(
                    n_estimators=60,
                    max_depth=6,
                    class_weight="balanced",
                    random_state=42 + idx,
                    n_jobs=-1,
                )),
            ])
            clf.fit(X, y)
            self._threat_classifiers[threat_type] = clf

        # Severity regressor
        print("  [11/12] Severity regressor…")
        y_sev = self._gen_severity_labels(X)
        self._severity_regressor = Pipeline([
            ("sc", StandardScaler()),
            ("m", GradientBoostingRegressor(
                n_estimators=60,
                max_depth=4,
                learning_rate=0.1,
                subsample=0.8,
                random_state=42,
            )),
        ])
        self._severity_regressor.fit(X, y_sev)

        # Trend classifier
        print("  [12/12] Trend classifier…")
        y_trend = self._gen_trend_labels(X)
        self._trend_classifier = Pipeline([
            ("sc", StandardScaler()),
            ("m", MLPClassifier(
                hidden_layer_sizes=(32, 16),
                activation="relu",
                max_iter=300,
                early_stopping=True,
                random_state=42,
            )),
        ])
        self._trend_classifier.fit(X, y_trend)

        self.is_trained = True
        self.n_samples = n_samples
        print("✅ ThreatPredictionModel training complete.")
        return self

    # ════════════════════════════════════════════════════════════════════════
    # Inference
    # ════════════════════════════════════════════════════════════════════════

    def predict_threats(
        self,
        alerts: List[Dict[str, Any]],
        threat_scores: List[Dict[str, Any]],
    ) -> ThreatForecast:
        """
        Predict future threats from current system state.
        Returns a ThreatForecast with per-type predictions sorted by probability.
        """
        if not self.is_trained:
            raise RuntimeError("Model not trained — call fit() or load_or_train() first.")

        X = extract_features_from_alerts(alerts, threat_scores)

        # Overall severity
        overall_score = float(np.clip(self._severity_regressor.predict(X)[0], 0, 100))

        # Overall trend
        trend_pred = int(self._trend_classifier.predict(X)[0])
        trend_label = ["DECREASING", "STABLE", "INCREASING"][trend_pred]

        # Per-threat predictions
        predictions: List[ThreatPrediction] = []
        for threat_type, clf in self._threat_classifiers.items():
            proba = clf.predict_proba(X)[0]
            # proba[1] = probability of threat occurring
            prob_pct = float(proba[1] * 100) if len(proba) > 1 else float(proba[0] * 50)

            # Determine severity from probability + overall state
            if prob_pct >= 70:
                sev = "CRITICAL"
            elif prob_pct >= 45:
                sev = "HIGH"
            elif prob_pct >= 25:
                sev = "MEDIUM"
            else:
                sev = "LOW"

            # Confidence based on class separation
            confidence = float(max(proba) * 100)

            # Risk trend from per-type alert count trend
            type_count = sum(1 for a in alerts if a.get("type") == threat_type)
            if type_count > 3:
                risk_trend = "INCREASING"
            elif type_count > 0:
                risk_trend = "STABLE"
            else:
                risk_trend = "DECREASING" if trend_label == "DECREASING" else "STABLE"

            # Determine time window (higher prob → sooner)
            if prob_pct >= 60:
                time_window = "1h"
            elif prob_pct >= 35:
                time_window = "6h"
            else:
                time_window = "24h"

            predictions.append(ThreatPrediction(
                threat_type=threat_type,
                probability=prob_pct,
                predicted_severity=sev,
                confidence=confidence,
                time_window=time_window,
                risk_trend=risk_trend,
                description=THREAT_DESCRIPTIONS.get(threat_type, ""),
                mitigation_suggestions=MITIGATION_STRATEGIES.get(threat_type, [])[:3],
            ))

        # Sort by probability descending
        predictions.sort(key=lambda p: p.probability, reverse=True)

        # Find highest risk
        highest = predictions[0].threat_type if predictions else "none"
        total_incidents = sum(1 for p in predictions if p.probability > 40)

        # Model confidence = average confidence across high-prob threats
        high_conf = [p.confidence for p in predictions if p.probability > 30]
        model_conf = float(np.mean(high_conf)) if high_conf else 75.0

        return ThreatForecast(
            predictions=predictions,
            overall_risk_score=overall_score,
            overall_trend=trend_label,
            highest_risk_threat=highest,
            total_predicted_incidents=total_incidents,
            forecast_window="24h",
            generated_at=time.time(),
            model_confidence=model_conf,
        )

    # ════════════════════════════════════════════════════════════════════════
    # Existing threat analysis with suggestions
    # ════════════════════════════════════════════════════════════════════════

    def get_mitigation_for_existing(
        self, alerts: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Analyze existing alerts and generate targeted suggestions per threat type.
        Returns a list of {threat_type, count, severity, suggestions} dicts.
        """
        # Group alerts by type
        by_type: Dict[str, List[Dict]] = {}
        for a in alerts:
            t = a.get("type", "unknown")
            if t not in by_type:
                by_type[t] = []
            by_type[t].append(a)

        suggestions = []
        for threat_type, type_alerts in by_type.items():
            if threat_type not in MITIGATION_STRATEGIES:
                continue

            sevs = [a.get("severity", "LOW").upper() for a in type_alerts]
            worst = "CRITICAL" if "CRITICAL" in sevs else "HIGH" if "HIGH" in sevs else "MEDIUM" if "MEDIUM" in sevs else "LOW"

            # Pick suggestions based on severity
            all_strats = MITIGATION_STRATEGIES.get(threat_type, [])
            if worst in ("CRITICAL", "HIGH"):
                strats = all_strats  # all suggestions for severe threats
            else:
                strats = all_strats[:2]  # top 2 for lower severity

            suggestions.append({
                "threat_type": threat_type,
                "alert_count": len(type_alerts),
                "worst_severity": worst,
                "is_active": any(not a.get("resolved") for a in type_alerts),
                "suggestions": strats,
            })

        # Sort by severity then count
        sev_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        suggestions.sort(key=lambda s: (sev_order.get(s["worst_severity"], 4), -s["alert_count"]))

        return suggestions

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
    def load(cls, path: str = MODEL_PATH) -> "ThreatPredictionModel":
        with open(path, "rb") as f:
            obj = pickle.load(f)
        if not isinstance(obj, cls):
            raise TypeError("Not a ThreatPredictionModel")
        print(f"✅ Loaded ThreatPredictionModel from {path}")
        return obj

    @classmethod
    def load_or_train(
        cls, path: str = MODEL_PATH, n_samples: int = 2000
    ) -> "ThreatPredictionModel":
        if os.path.exists(path):
            try:
                return cls.load(path)
            except Exception as exc:
                print(f"⚠ Load failed ({exc}), retraining…")
        print("🔮 Training ThreatPredictionModel (first run — ~30s)…")
        m = cls().fit(n_samples)
        m.save(path)
        return m


# ─── Groq-Enhanced Predictions ──────────────────────────────────────────────


async def groq_threat_predictions(
    ml_predictions: Dict[str, Any],
    current_alerts: List[Dict[str, Any]],
    existing_suggestions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Use Groq LLM to enhance ML predictions with:
    - Richer threat narratives
    - Attack chain analysis (which threats lead to which)
    - Priority-ranked mitigation roadmap
    - Future risk trajectory assessment
    """
    import json
    import aiohttp

    try:
        from agents.groq_advisor import _get_groq_key, _get_groq_model, GROQ_API_URL
    except ImportError:
        return {"error": "Groq advisor not available"}

    groq_key = _get_groq_key()
    if not groq_key:
        return {"error": "Groq API key not configured"}

    # Build context for Groq
    top_predictions = ml_predictions.get("predictions", [])[:5]
    alerts_summary = []
    for a in current_alerts[:15]:
        alerts_summary.append({
            "type": a.get("type"),
            "severity": a.get("severity"),
            "resolved": a.get("resolved", False),
        })

    user_msg = (
        f"You are analyzing a DeFi protocol's security state. Based on ML predictions and current alerts, "
        f"provide an enhanced threat forecast.\n\n"
        f"ML PREDICTED THREATS (next 24h):\n{json.dumps(top_predictions, indent=2)}\n\n"
        f"CURRENT ACTIVE ALERTS:\n{json.dumps(alerts_summary, indent=2)}\n\n"
        f"EXISTING MITIGATIONS SUGGESTED:\n{json.dumps(existing_suggestions[:3], indent=2)}\n\n"
        f"Overall ML risk score: {ml_predictions.get('overall_risk_score', 0)}/100\n"
        f"Trend: {ml_predictions.get('overall_trend', 'STABLE')}\n\n"
        f"Reply with valid JSON containing:\n"
        f'{{"threat_narrative": "2-3 sentence assessment of the current threat landscape and what to expect",\n'
        f'"attack_chains": [{{"sequence": ["threat1 → threat2 → threat3"], "probability": "high/medium/low", "description": "how they connect"}}],\n'
        f'"priority_actions": ["ranked list of 5 most important actions to take RIGHT NOW"],\n'
        f'"risk_trajectory": "IMPROVING/STABLE/DETERIORATING/CRITICAL",\n'
        f'"risk_trajectory_reason": "1 sentence why",\n'
        f'"emerging_patterns": ["list of 2-3 emerging patterns to watch for"]}}'
    )

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                GROQ_API_URL,
                headers={
                    "Authorization": f"Bearer {groq_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": _get_groq_model(),
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are a senior DeFi security analyst and threat intelligence expert. "
                                "You analyze ML threat predictions alongside real-time alerts to provide "
                                "actionable security intelligence. Be specific, technical, and concise. "
                                "Reply only with valid JSON."
                            ),
                        },
                        {"role": "user", "content": user_msg},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 700,
                    "response_format": {"type": "json_object"},
                },
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    return {"error": f"Groq API returned {resp.status}"}
                data = await resp.json()
                content = data["choices"][0]["message"]["content"]
                return json.loads(content)

    except Exception as e:
        return {"error": str(e)}


# ─── Module-level singleton ──────────────────────────────────────────────────

_threat_predictor: Optional[ThreatPredictionModel] = None


def get_threat_predictor() -> ThreatPredictionModel:
    global _threat_predictor
    if _threat_predictor is None or not _threat_predictor.is_trained:
        _threat_predictor = ThreatPredictionModel.load_or_train()
    return _threat_predictor
