/**
 * Pure helpers that turn the enriched AutoML `best` block into tidy Plotly
 * `Chart` specs (rendered through the shared PlotlyChart). Keeping the shaping
 * here keeps the detail drawer declarative and easy to test by eye.
 */
import type {
  ActionCount,
  Chart,
  ClusterPlot,
  ConvergenceTrace,
  ElbowCurve,
  Forecast,
  LearningCurve,
  ModelBest,
  PredictionDistribution,
  RocCurve,
} from "@/lib/types";

/** ROC curve line (binary classification) with a diagonal chance reference. */
export function rocChart(roc: RocCurve, id: string): Chart {
  const data = roc.fpr.map((fpr, i) => ({ fpr, tpr: roc.tpr[i] ?? 0 }));
  return {
    id: `roc_${id}`,
    type: "line",
    engine: "plotly",
    title: "ROC curve",
    encoding: { x: "fpr", y: "tpr" },
    data,
    options: { smoothing: 0, line_width: 3, palette: "vivid" },
    summary: "",
  };
}

/** Learning curve: two lines (train vs. cross-validation) over training size. */
export function learningCurveChart(lc: LearningCurve, id: string): Chart {
  const data = [
    ...lc.sizes.map((size, i) => ({ size, score: lc.train[i] ?? 0, split: "Train" })),
    ...lc.sizes.map((size, i) => ({ size, score: lc.test[i] ?? 0, split: "Validation" })),
  ];
  return {
    id: `lc_${id}`,
    type: "line",
    engine: "plotly",
    title: "Learning curve",
    encoding: { x: "size", y: "score", color: "split" },
    data,
    options: { smoothing: 1, line_width: 2 },
    summary: "",
  };
}

/** Prediction distribution: grouped bars (class support) or actual-vs-predicted scatter. */
export function predictionDistChart(pd: PredictionDistribution, id: string): Chart {
  if (pd.kind === "class_support") {
    const labels = pd.labels ?? [];
    const data = [
      ...labels.map((l, i) => ({ label: l, count: pd.actual[i] ?? 0, split: "Actual" })),
      ...labels.map((l, i) => ({ label: l, count: pd.predicted[i] ?? 0, split: "Predicted" })),
    ];
    return {
      id: `pd_${id}`,
      type: "bar",
      engine: "plotly",
      title: "Actual vs. predicted class support",
      encoding: { x: "label", y: "count", color: "split" },
      data,
      options: { barmode: "group", opacity: 0.9 },
      summary: "",
    };
  }
  const data = pd.actual.map((actual, i) => ({ actual, predicted: pd.predicted[i] ?? 0 }));
  return {
    id: `pd_${id}`,
    type: "scatter",
    engine: "plotly",
    title: "Actual vs. predicted",
    encoding: { x: "actual", y: "predicted" },
    data,
    options: { opacity: 0.6, marker_size: 7 },
    summary: "",
  };
}

/** Residual scatter (regression) indexed by sample order. */
export function residualChart(residuals: number[], id: string): Chart {
  const data = residuals.map((r, i) => ({ index: i, residual: r }));
  return {
    id: `resid_${id}`,
    type: "scatter",
    engine: "plotly",
    title: "Residuals",
    encoding: { x: "index", y: "residual" },
    data,
    options: { opacity: 0.55, marker_size: 6, palette: "sunset" },
    summary: "",
  };
}

/** Cluster scatter over the 2-D PCA projection, coloured by assigned cluster. */
export function clusterChart(plot: ClusterPlot, id: string): Chart {
  const data = plot.x.map((x, i) => ({
    x,
    y: plot.y[i] ?? 0,
    cluster: plot.cluster[i] ?? "0",
  }));
  return {
    id: `cluster_${id}`,
    type: "scatter",
    engine: "plotly",
    title: "Cluster projection (PCA)",
    encoding: { x: "x", y: "y", color: "cluster" },
    data,
    options: { opacity: 0.7, marker_size: 8 },
    summary: "",
  };
}

/** Forecast line: full actual series plus the held-out prediction segment. */
export function forecastChart(fc: Forecast, id: string): Chart {
  const predByIndex = new Map<number, number>();
  fc.predicted_index.forEach((idx, i) => predByIndex.set(idx, fc.predicted[i] ?? 0));
  const data = [
    ...fc.index.map((idx, i) => ({ t: idx, value: fc.actual[i] ?? 0, split: "Actual" })),
    ...fc.predicted_index.map((idx) => ({ t: idx, value: predByIndex.get(idx) ?? 0, split: "Forecast" })),
  ];
  return {
    id: `forecast_${id}`,
    type: "line",
    engine: "plotly",
    title: "Forecast vs. actual",
    encoding: { x: "t", y: "value", color: "split" },
    data,
    options: { smoothing: 0, line_width: 2 },
    summary: "",
  };
}

/** SHAP / permutation importance bar (reversed so the top driver sits on top). */
export function importanceChart(
  values: ModelBest["feature_importance"],
  id: string,
  title: string,
): Chart {
  return {
    id: `imp_${id}`,
    type: "bar",
    engine: "plotly",
    title,
    encoding: { x: "feature", y: "importance" },
    data: [...values].reverse().map((f) => ({ feature: f.feature, importance: f.importance })),
    options: { orientation: "h" },
    summary: "",
  };
}

/** Silhouette-vs-k elbow curve: auto-ranks the best KMeans cluster count. */
export function elbowChart(elbow: ElbowCurve, id: string): Chart {
  const data = elbow.ks
    .map((k, i) => ({ k, score: elbow.scores[i] ?? null }))
    .filter((d) => d.score != null)
    .map((d) => ({ k: d.k, score: d.score as number }));
  return {
    id: `elbow_${id}`,
    type: "line",
    engine: "plotly",
    title:
      elbow.best_k != null
        ? `Silhouette vs. cluster count · auto k = ${elbow.best_k}`
        : "Silhouette vs. cluster count",
    encoding: { x: "k", y: "score" },
    data,
    options: { smoothing: 1, line_width: 3, marker_size: 8 },
    summary: "",
  };
}

/** Policy convergence: value/policy delta (or cumulative reward) per iteration. */
export function convergenceChart(trace: ConvergenceTrace, id: string): Chart {
  const data = trace.trace.map((delta, i) => ({ iteration: i + 1, delta }));
  return {
    id: `conv_${id}`,
    type: "line",
    engine: "plotly",
    title: "Policy convergence",
    encoding: { x: "iteration", y: "delta" },
    data,
    options: { smoothing: 0, line_width: 3 },
    summary: "",
  };
}

/** Distribution of actions chosen by the learned policy. */
export function actionCountChart(actionCounts: ActionCount[], id: string): Chart {
  return {
    id: `actions_${id}`,
    type: "bar",
    engine: "plotly",
    title: "Action selection counts",
    encoding: { x: "action", y: "count" },
    data: actionCounts.map((a) => ({ action: a.action, count: a.count })),
    options: { opacity: 0.85 },
    summary: "",
  };
}

/** Distribution of learned state-values across the discretised state space. */
export function valueHistogramChart(values: number[], id: string): Chart {
  const data = values.map((v, i) => ({ index: i, value: v }));
  return {
    id: `values_${id}`,
    type: "scatter",
    engine: "plotly",
    title: "Learned state-values",
    encoding: { x: "index", y: "value" },
    data,
    options: { opacity: 0.6, marker_size: 6, line_shape: "hv" },
    summary: "",
  };
}

/** Semi-supervised: class distribution of the pseudo-labels on unlabelled rows. */
export function pseudoLabelChart(
  pseudo: NonNullable<ModelBest["pseudo_labels"]>,
  id: string,
): Chart {
  return {
    id: `pseudo_${id}`,
    type: "bar",
    engine: "plotly",
    title: "Pseudo-labelled rows by class",
    encoding: { x: "label", y: "count" },
    data: (pseudo.labels ?? []).map((l) => ({ label: l.label, count: l.count })),
    options: { opacity: 0.85 },
    summary: "",
  };
}
