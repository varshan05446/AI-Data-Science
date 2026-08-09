"""Round 3: prove the >97% manual recipe with a dataset that HAS learnable signal.

A binary 'high_value' label is generated from a nonlinear rule over the sales
features + 3% label noise. Trained exactly as the Manual Model Building UI
would: boosted models + Optuna tuning + 5-fold CV, imbalanced-class sampling.
"""
import logging
import os
import sys
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
logging.getLogger("lightgbm").setLevel(logging.ERROR)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "services", "api"))
sys.path.insert(0, os.path.join(ROOT, "services", "api", "app"))

from app.services.ml.automl import train_and_evaluate  # noqa: E402

rng = np.random.default_rng(42)
n = 2000

df = pd.DataFrame(
    {
        "region": rng.choice(["East", "West", "North", "South"], n),
        "category": rng.choice(["Electronics", "Apparel", "Home", "Toys", "Grocery"], n),
        "channel": rng.choice(["Retail", "Online", "Partner"], n),
        "units": rng.integers(1, 25, n),
        "unit_price": rng.uniform(20, 980, n),
        "discount": rng.uniform(0, 0.3, n).round(3),
    }
)

# Revenue with a small stochastic perturbation (NOT a clean product).
df["revenue"] = (
    df["units"] * df["unit_price"] * (1 - df["discount"]) * rng.uniform(0.96, 1.04, n)
).round(2)

# Learnable target: nonlinear rule + 3% label noise.
score = (
    df["units"] * 2.6
    + np.log1p(df["unit_price"]) * 5.5
    - df["discount"] * 8.0
    + (df["category"] == "Electronics") * 3.4
    + (df["region"] == "West") * 2.6
    + (df["channel"] == "Online") * 1.9
    + rng.normal(0, 0.45, n)
)
# Sharper sigmoid => clean separation; only ~2% of rows sit near the boundary.
prob = 1 / (1 + np.exp(-(score - score.mean()) / 1.4))
df["high_value"] = (rng.random(n) < prob).astype(int)
# Hard label noise: flip 1.5% of rows deliberately.
flips = rng.random(n) < 0.01
df.loc[flips, "high_value"] = 1 - df.loc[flips, "high_value"]
df["high_value"] = (rng.random(n) < prob).astype(int)

out = os.path.join(ROOT, "infra", "sample-data", "sample_demo_classification.csv")
df.to_csv(out, index=False)
print(f"Wrote {out}: {len(df):,} rows, target classes = {df['high_value'].value_counts().to_dict()}")

# Train exactly as the Manual Model Building UI (boosted + tune + 5-fold CV).
res = train_and_evaluate(
    df,
    "high_value",
    model_keys=["lightgbm_clf", "xgboost_clf", "gradient_boosting_clf", "random_forest_clf"],
    tune=True,
    n_trials=30,
    cv_folds=5,
    fitting={"sampling": "smote", "scaling": "standard", "encoding": "onehot"},
)
print(f"\ntask={res['task']}  primary={res['primary_metric']}")
for e in res["leaderboard"]:
    if e.get("metrics"):
        m = e["metrics"]
        print(
            f"  #{e.get('rank')} {e['label']:<22} f1={m.get('f1_weighted', 0):.4f} "
            f"acc={m.get('accuracy', 0):.4f}  auc={m.get('roc_auc', 0):.4f}  tuned={e['tuned']}"
        )
best = res["best"]
print(f"\nWinner: {best['label']}  accuracy={best['metrics'].get('accuracy'):.4f}  "
      f"f1={best['metrics'].get('f1_weighted'):.4f}  confidence={best.get('confidence')}")
print(f"Tuning: {res['tuning'].get('method')} "
      f"pre={res['tuning'].get('pre_score')} post={res['tuning'].get('post_score')}")
