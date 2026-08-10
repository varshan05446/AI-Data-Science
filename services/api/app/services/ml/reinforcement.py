"""Reinforcement learning for the Model Studio.

Two framings share one result contract:

* **Tabular control** (``value_iteration`` / ``policy_iteration`` /
  ``q_learning``): features are discretised into a finite state space; the
  discrete target column is the action space; reward is 1 when the chosen
  action matches the observed label. The empirical reward model is derived from
  the training rows, so the learned policy approximates the Bayes-optimal
  classifier over states - and the Bellman backups still produce real
  convergence traces.
* **Contextual bandits** (``linucb`` / ``epsilon_greedy``): the same
  context/action/reward framing, solved by online exploration-vs-exploitation
  learners over the encoded feature vectors.

Algorithms are ranked on hold-out *policy accuracy*. Deterministic, row-capped,
JSON-safe - no external RL library required.
"""
from __future__ import annotations

import time
from typing import Any

import numpy as np
import pandas as pd

from app.services.data.profiling import _semantic_type
from app.services.ml.automl import (
    AutoMLError,
    _RANDOM_STATE,
    _ROW_CAP,
    _build_preprocessor,
    _select_features,
    infer_task,
    ProgressCallback,
)

_DEFAULT_ALGOS = [
    "value_iteration",
    "policy_iteration",
    "q_learning",
    "linucb",
    "epsilon_greedy",
]
_TABULAR_ALGOS = {"value_iteration", "policy_iteration", "q_learning"}
_BANDIT_ALGOS = {"linucb", "epsilon_greedy"}
_MAX_EPOCHS = 30
_TRACE_CAP = 40
_VALUE_HIST_CAP = 200
_EPSILON = 0.1


def available_reinforcement() -> list[dict[str, Any]]:
    """Algorithms advertised to the Model Studio config endpoint."""
    return [
        {"key": "value_iteration", "label": "Value Iteration", "tags": ["tabular", "model-based"]},
        {"key": "policy_iteration", "label": "Policy Iteration", "tags": ["tabular", "model-based"]},
        {"key": "q_learning", "label": "Q-Learning", "tags": ["tabular", "model-free"]},
        {"key": "linucb", "label": "LinUCB", "tags": ["bandit", "contextual"]},
        {"key": "epsilon_greedy", "label": "Epsilon-Greedy", "tags": ["bandit", "contextual"]},
    ]


def _downsample(values: list[float], cap: int) -> list[float]:
    """Evenly sample a long trace so it stays compact for the UI."""
    values = [round(float(v), 6) for v in values]
    if len(values) <= cap:
        return values
    idx = np.linspace(0, len(values) - 1, cap).astype(int)
    return [values[i] for i in idx]


def _discretize_state(data: pd.DataFrame, features: list[str], n_bins: int) -> tuple[np.ndarray, dict]:
    """Map each row to a finite state id by binning numeric features and coding categoricals."""
    pieces: dict[str, pd.Series] = {}
    for col in features:
        series = data[col]
        sem = _semantic_type(series)
        if sem == "numeric":
            nunique = int(series.dropna().nunique())
            if nunique < 2:
                pieces[col] = pd.Series(0, index=data.index, dtype=int)
                continue
            q = max(2, min(n_bins, nunique))
            try:
                binned = pd.qcut(series, q=q, duplicates="drop")
            except ValueError:  # pragma: no cover - fallback for degenerate splits
                binned = pd.qcut(series, q=2, duplicates="drop")
            pieces[col] = binned.cat.codes.astype(int)
        else:
            pieces[col] = series.astype("category").cat.codes.astype(int)
    codes = pd.DataFrame(pieces, index=data.index).fillna(-1).astype(int)

    state_map: dict = {}
    ids = np.empty(len(codes), dtype=np.int64)
    for i, row in enumerate(codes.itertuples(index=False)):
        key = tuple(row)
        sid = state_map.get(key)
        if sid is None:
            sid = len(state_map)
            state_map[key] = sid
        ids[i] = sid
    return ids, state_map


def _reward_model(train_s: np.ndarray, train_a: np.ndarray, n_states: int, n_actions: int) -> np.ndarray:
    """Empirical P(reward=1 | state, action) = label share per state."""
    counts = np.zeros((n_states, n_actions))
    for s, a in zip(train_s, train_a):
        counts[int(s), int(a)] += 1.0
    rowsum = counts.sum(axis=1, keepdims=True)
    rowsum[rowsum == 0] = 1.0
    return counts / rowsum


def _run_tabular(
    key: str,
    train_s: np.ndarray,
    train_a: np.ndarray,
    n_states: int,
    n_actions: int,
    gamma: float,
    alpha: float,
    max_iterations: int,
    threshold: float,
    rs: int,
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    """Return (policy per state, state values, block)."""
    reward = _reward_model(train_s, train_a, n_states, n_actions)
    rng = np.random.default_rng(rs)

    if key == "value_iteration":
        V = np.zeros(n_states)
        trace: list[float] = []
        for _ in range(max_iterations):
            new_V = reward.max(axis=1) + gamma * V
            delta = float(np.max(np.abs(new_V - V))) if n_states else 0.0
            V = new_V
            trace.append(delta)
            if delta < threshold:
                break
        policy = np.argmax(reward, axis=1)
        return policy, V, {"iterations": len(trace), "final_delta": trace[-1], "trace": _downsample(trace, _TRACE_CAP)}

    if key == "policy_iteration":
        policy = rng.integers(0, n_actions, size=n_states)
        trace: list[float] = []
        for _ in range(max_iterations):
            r_pi = reward[np.arange(n_states), policy]
            V = r_pi / (1.0 - gamma)  # self-loop evaluation: V = r_pi + gamma*V
            greedy = np.argmax(reward, axis=1)
            changed = int(np.sum(greedy != policy))
            trace.append(float(changed))
            policy = greedy
            if changed == 0:
                break
        return policy, V, {"iterations": len(trace), "final_delta": trace[-1], "trace": _downsample(trace, _TRACE_CAP)}

    # q_learning: model-free, epsilon-greedy Q-table over shuffled row episodes.
    Q = np.zeros((n_states, n_actions))
    epsilon = _EPSILON
    trace: list[float] = []
    for _ in range(min(max_iterations, _MAX_EPOCHS)):
        order = rng.permutation(len(train_s))
        max_change = 0.0
        for i in order:
            s = int(train_s[i])
            a_true = int(train_a[i])
            a = int(rng.integers(n_actions)) if rng.random() < epsilon else int(np.argmax(Q[s]))
            r = 1.0 if a == a_true else 0.0
            target = r + gamma * float(np.max(Q[s]))
            change = abs(float(Q[s, a]) - target)
            Q[s, a] += alpha * (target - float(Q[s, a]))
            if change > max_change:
                max_change = change
        epsilon = max(0.01, epsilon * 0.9)
        trace.append(max_change)
        if max_change < threshold:
            break
    return np.argmax(Q, axis=1), np.max(Q, axis=1), {
        "iterations": len(trace),
        "final_delta": trace[-1],
        "trace": _downsample(trace, _TRACE_CAP),
    }


def _run_bandit(
    key: str,
    X_train: np.ndarray,
    train_a: np.ndarray,
    n_actions: int,
    alpha: float,
    rs: int,
) -> tuple[list[dict[str, Any]], dict[str, Any], np.ndarray]:
    """Contextual bandit: per-arm ridge weights updated online. Returns (arms, block, chosen)."""
    lam = 1.0
    n, d = X_train.shape
    arms: list[dict[str, Any]] = [
        {"A_inv": np.eye(d) / lam, "b": np.zeros(d)} for _ in range(n_actions)
    ]
    rng = np.random.default_rng(rs)
    cum: list[float] = []
    total = 0.0
    chosen_all = np.empty(n, dtype=int)

    def thetas() -> list[np.ndarray]:
        return [arm["A_inv"] @ arm["b"] for arm in arms]

    for i in range(n):
        x = X_train[i]
        if key == "linucb":
            scores = []
            for a in range(n_actions):
                arm = arms[a]
                mean = float(x @ (arm["A_inv"] @ arm["b"]))
                conf = alpha * float(np.sqrt(max(0.0, float(x @ arm["A_inv"] @ x))))
                scores.append(mean + conf)
            chosen = int(np.argmax(scores))
        else:  # epsilon_greedy
            t = thetas()
            if rng.random() < _EPSILON:
                chosen = int(rng.integers(n_actions))
            else:
                chosen = int(np.argmax([float(x @ th) for th in t]))
        chosen_all[i] = chosen
        r = 1.0 if chosen == int(train_a[i]) else 0.0
        total += r
        cum.append(total / (i + 1))

        arm = arms[chosen]
        denom = 1.0 + float(x @ arm["A_inv"] @ x)
        ax = arm["A_inv"] @ x
        arm["A_inv"] = arm["A_inv"] - np.outer(ax, ax) / denom
        arm["b"] = arm["b"] + r * x

    return arms, {
        "iterations": n,
        "final_delta": round(float(cum[-1]), 6) if cum else 0.0,
        "trace": _downsample(cum, _TRACE_CAP),
    }, chosen_all


def train_reinforcement(
    df: pd.DataFrame,
    *,
    target: str,
    model_keys: list[str] | None = None,
    random_state: int | None = None,
    features: list[str] | None = None,
    gamma: float = 0.9,
    alpha: float = 0.1,
    max_iterations: int = 100,
    threshold: float = 1e-4,
    n_bins: int = 5,
    progress_cb: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Train RL policies over a data-derived environment and rank by hold-out accuracy."""
    from sklearn.preprocessing import LabelEncoder

    def notify(frac: float, stage: str, message: str | None = None) -> None:
        if progress_cb is not None:
            try:
                progress_cb(frac, stage, message)
            except Exception:  # noqa: BLE001 - progress is best-effort
                pass

    data = df.copy()
    if target not in data.columns:
        raise AutoMLError(f"Target column '{target}' not found.")
    if len(data) > _ROW_CAP:
        data = data.sample(_ROW_CAP, random_state=_RANDOM_STATE).reset_index(drop=True)

    if infer_task(data, target) != "classification":
        raise AutoMLError(
            "Reinforcement learning needs a discrete target column to act as the "
            "action space (a categorical or low-cardinality column)."
        )

    numeric, categorical = _select_features(data, target)
    if features:
        numeric = [c for c in numeric if c in features]
        categorical = [c for c in categorical if c in features]
    all_features = numeric + categorical
    if not all_features:
        raise AutoMLError("No usable feature columns found for this target.")

    # The discrete target values are the action space.
    y = data[target].astype(str)
    classes = sorted(y.dropna().unique().tolist())
    if len(classes) < 2:
        raise AutoMLError("Reinforcement learning needs at least two distinct target actions.")
    n_actions = len(classes)
    enc = LabelEncoder()
    action_ids = enc.fit_transform(y)

    rs = random_state if random_state is not None else _RANDOM_STATE
    gamma = float(min(max(gamma, 0.0), 0.99))
    alpha = float(min(max(alpha, 0.01), 1.0))

    # Split into training / holdout (policy evaluation is on never-seen rows).
    from sklearn.model_selection import train_test_split

    stratify = action_ids if (np.bincount(action_ids).min() >= 2) else None
    train_idx, hold_idx = train_test_split(
        np.arange(len(data)), test_size=0.2, random_state=rs, stratify=stratify
    )

    state_ids, state_map = _discretize_state(data, all_features, n_bins=n_bins)
    n_states = len(state_map)
    if n_states < 2:
        raise AutoMLError("Feature binning produced fewer than two distinct states; "
                          "reduce the number of features or adjust the bin count.")

    train_s = state_ids[train_idx]
    hold_s = state_ids[hold_idx]
    train_a = action_ids[train_idx]
    hold_a = action_ids[hold_idx]

    # Dense encodings for the contextual bandits (fit on train only).
    pre = _build_preprocessor(numeric, categorical, scaling="standard", encoding="onehot")
    pre.fit(data.iloc[train_idx][all_features])
    X_train = np.asarray(pre.transform(data.iloc[train_idx][all_features]), dtype=float)
    X_hold = np.asarray(pre.transform(data.iloc[hold_idx][all_features]), dtype=float)

    notify(0.1, "preprocess", f"Built {n_states} states / {n_actions} actions from {len(train_idx):,} training rows.")

    leaderboard: list[dict[str, Any]] = []
    blocks: dict[str, dict[str, Any]] = {}
    for key in (model_keys or _DEFAULT_ALGOS):
        if key not in _TABULAR_ALGOS and key not in _BANDIT_ALGOS:
            continue
        label = next(
            (a["label"] for a in available_reinforcement() if a["key"] == key), key
        )
        started = time.perf_counter()
        try:
            if key in _TABULAR_ALGOS:
                policy, V, block = _run_tabular(
                    key, train_s, train_a, n_states, n_actions,
                    gamma=gamma, alpha=alpha,
                    max_iterations=int(max_iterations), threshold=float(threshold), rs=rs,
                )
                pred = policy[hold_s]
                chosen = policy[train_s]
                acc = float(np.mean(pred == hold_a))
                # State-value histogram + action counts for the winner.
                sample_idx = _downsample(list(range(n_states)), _VALUE_HIST_CAP)
                values = [float(V[int(i)]) for i in sample_idx]
                counts = np.bincount(train_s, minlength=n_states)
                action_counts = [
                    {"action": classes[a], "count": int(counts[policy == a].sum())}
                    for a in range(n_actions)
                ]
                state_samples = sorted(
                    range(n_states), key=lambda s: -int(counts[s])
                )[:6]
                state_rows = [
                    {"state": int(s), "action": classes[int(policy[s])], "value": round(float(V[s]), 4)}
                    for s in state_samples
                ]
                block["value_histogram"] = values
                block["action_counts"] = action_counts
                block["state_samples"] = state_rows
            else:
                arms, block, chosen = _run_bandit(
                    key, X_train, train_a, n_actions, alpha=alpha, rs=rs
                )
                thetas = [arm["A_inv"] @ arm["b"] for arm in arms]
                pred = np.argmax(np.asarray([X_hold @ th for th in thetas]), axis=0)
                acc = float(np.mean(pred == hold_a))
                chosen_counts = np.bincount(chosen, minlength=n_actions)
                block["action_counts"] = [
                    {"action": classes[a], "count": int(chosen_counts[a])} for a in range(n_actions)
                ]
                block["value_histogram"] = []
                block["state_samples"] = []

            elapsed = round(time.perf_counter() - started, 3)
            metrics = {
                "policy_accuracy": round(acc, 4),
                "avg_reward": round(acc, 4),
                "iterations": block.get("iterations", 0),
            }
            leaderboard.append({"key": key, "label": label, "metrics": metrics, "train_seconds": elapsed})
            blocks[key] = {**block, "metrics": metrics}
        except Exception as exc:  # noqa: BLE001 - keep the leaderboard on failure
            leaderboard.append({"key": key, "label": label, "error": str(exc), "metrics": {}})
        notify(
            0.15 + 0.7 * (len(leaderboard) / max(1, len(model_keys or _DEFAULT_ALGOS))),
            "train",
            f"{label} finished (policy accuracy on hold-out).",
        )

    scored = [e for e in leaderboard if e.get("metrics")]
    if not scored:
        raise AutoMLError("Reinforcement learning did not produce a usable policy.")
    scored.sort(
        key=lambda e: e["metrics"].get("policy_accuracy", float("-inf")), reverse=True
    )
    for i, entry in enumerate(scored, start=1):
        entry["rank"] = i
    failed = [e for e in leaderboard if not e.get("metrics")]

    best = scored[0]
    block = blocks[best["key"]]
    notify(0.9, "explain", f"Best: {best['label']} (policy accuracy={best['metrics']['policy_accuracy']:.4f}).")

    return {
        "task": "reinforcement",
        "target": target,
        "primary_metric": "policy_accuracy",
        "features": all_features,
        "n_rows_used": int(len(data)),
        "n_features": len(all_features),
        "test_size": 0.2,
        "leaderboard": scored + failed,
        "tuning": {"enabled": False},
        "leakage": {"removed": []},
        "input_schema": [],
        "classes": classes,
        "best": {
            "key": best["key"],
            "label": best["label"],
            "metrics": best["metrics"],
            "feature_importance": [],
            "policy_accuracy": round(float(best["metrics"]["policy_accuracy"]), 4),
            "avg_reward": round(float(best["metrics"]["avg_reward"]), 4),
            "params": {
                "gamma": round(gamma, 4),
                "alpha": round(alpha, 4),
                "n_bins": int(n_bins),
                "n_states": n_states,
                "n_actions": n_actions,
            },
            "convergence": {
                "final_delta": block.get("final_delta", 0.0),
                "iterations": block.get("iterations", 0),
                "trace": block.get("trace", []),
            },
            "value_histogram": block.get("value_histogram", []),
            "action_counts": block.get("action_counts", []),
            "state_samples": block.get("state_samples", []),
            "confidence": round(float(best["metrics"]["policy_accuracy"]), 4),
        },
    }
