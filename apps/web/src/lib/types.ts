/**
 * Shared API types. These mirror the FastAPI Pydantic schemas in
 * services/api/app/schemas.py so the client stays in sync with the backend.
 */

export type Role =
  | "owner"
  | "data_scientist"
  | "analyst"
  | "executive"
  | "business";

export type ProjectStatus = "active" | "archived" | "draft" | "completed";
export type DatasetStatus =
  | "uploaded"
  | "profiling"
  | "ready"
  | "error";

export interface UserOut {
  id: string;
  email: string;
  name: string;
  image_url?: string | null;
}

export interface WorkspaceOut {
  id: string;
  name: string;
  slug: string;
}

export interface WorkspaceStats {
  projects: number;
  datasets: number;
  models: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserOut;
  workspace: WorkspaceOut;
  role: Role;
}

export interface MemberOut {
  user: UserOut;
  role: Role;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  business_domain: string;
  goals: string;
  status: ProjectStatus;
  tags: string[];
  team_member_ids: string[];
  owner_id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  dataset_count: number;
}

export interface ProjectCreate {
  name: string;
  description?: string;
  business_domain?: string;
  goals?: string;
  tags?: string[];
  status?: ProjectStatus;
}

export interface Dataset {
  id: string;
  project_id: string;
  name: string;
  source_type: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  row_count?: number | null;
  column_count?: number | null;
  quality_score?: number | null;
  status: DatasetStatus;
  created_at: string;
}

// --- Profile ---------------------------------------------------------------
export interface ColumnStats {
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;
  q1?: number;
  q3?: number;
  outliers?: number;
  outlier_pct?: number;
  zeros?: number;
  negatives?: number;
}

export interface ProfileColumn {
  name: string;
  dtype: string;
  semantic_type: "numeric" | "categorical" | "boolean" | "datetime" | "text";
  missing: number;
  missing_pct: number;
  unique: number;
  unique_pct: number;
  is_probable_id: boolean;
  stats?: ColumnStats;
  top_values?: { value: string; count: number; pct: number }[];
}

export interface QualityScore {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  components: Record<string, number>;
}

export interface ProfileReport {
  dataset_summary: {
    rows: number;
    columns: number;
    duplicate_rows: number;
    duplicate_pct: number;
    memory_bytes: number;
    total_missing_cells: number;
    numeric_columns: number;
  };
  columns: ProfileColumn[];
  dtypes: Record<string, number>;
  missing_report: { column: string; missing: number; missing_pct: number }[];
  correlation: {
    columns: string[];
    matrix: (number | null)[][];
    top_pairs: { a: string; b: string; corr: number }[];
  };
  categorical_analysis: {
    column: string;
    unique: number;
    top_values: { value: string; count: number; pct: number }[];
  }[];
  date_columns: string[];
  probable_primary_keys: string[];
  target_suggestions: {
    column: string;
    type: "classification" | "regression";
    confidence: number;
    reason: string;
  }[];
  quality: QualityScore;
  sample: { columns: string[]; rows: Record<string, unknown>[] };
}

export interface ProfileResponse {
  dataset_id: string;
  report: ProfileReport;
}

// --- EDA / Insights / Chat -------------------------------------------------
export type ChartType =
  | "histogram"
  | "boxplot"
  | "box"
  | "scatter"
  | "bubble"
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "violin"
  | "heatmap"
  | "treemap"
  | "sunburst"
  | "density_heatmap"
  | "pairplot"
  | "jointplot"
  | "kde"
  | "regression"
  | "distribution"
  | "clustermap"
  | "scatter_map"
  | "bubble_map"
  | "density_map"
  | "heat_map"
  | "hexbin_map"
  | "cluster_map"
  | "choropleth";

export type ChartGroup =
  | "Distribution"
  | "Relationship"
  | "Composition"
  | "Trend"
  | "Correlation";

export interface ChartImage {
  png: string;
  svg: string;
}

export interface ChartTree {
  ids: string[];
  labels: string[];
  parents: string[];
  values: number[];
}

export interface ChartTrendline {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ChartMap {
  style: string;
  center: { lat: number; lon: number };
  zoom: number;
  locationmode?: string;
}

export interface Chart {
  id: string;
  type: ChartType;
  group?: ChartGroup | string;
  engine?: "plotly" | "image" | "map";
  title: string;
  column?: string;
  columns?: string[];
  encoding: Record<string, string | string[]>;
  data: Record<string, unknown>[];
  options?: Record<string, unknown>;
  image?: ChartImage;
  tree?: ChartTree;
  trendline?: ChartTrendline;
  map?: ChartMap;
  locationmode?: string;
  summary: string;
  ai_explanation?: string;
}

// --- Exploration (interactive viz builder) ---------------------------------
export interface EncodingSpec {
  role: string;
  label: string;
  required: boolean;
  types: string[];
  multiple: boolean;
}

export interface ChartCatalogEntry {
  id: string;
  label: string;
  category: string;
  engine: "plotly" | "image";
  icon: string;
  featured: boolean;
  description: string;
    encodings: EncodingSpec[];
  options: string[];
  enabled: boolean;
  segment?: "chart" | "map" | string;
}

export interface ColumnMeta {
  name: string;
  semantic_type: string;
  unique: number;
  missing_pct: number;
}

export interface Palette {
  id: string;
  label: string;
  colors: string[];
}

export interface ColorScale {
  id: string;
  label: string;
}

export interface MapTheme {
  id: string;
  label: string;
  style: string;
}

export interface LocationMode {
  id: string;
  label: string;
}

export interface ExplorationCatalog {
  dataset_id: string;
  columns: ColumnMeta[];
  charts: ChartCatalogEntry[];
  categories: string[];
  map_categories: string[];
  palettes: Palette[];
  color_scales: ColorScale[];
  themes: MapTheme[];
  location_modes: LocationMode[];
  aggregations: string[];
}

export interface ChartBuildSpec {
  chart_type: string;
  encodings: Record<string, string | string[]>;
  options: Record<string, unknown>;
}

export interface ChartResult {
  dataset_id: string;
  chart: Chart;
}

export interface EdaResponse {
  dataset_id: string;
  charts: Chart[];
}

export interface Insight {
  title: string;
  what_we_found: string;
  why_it_happens: string;
  recommendation: string;
  business_impact: string;
  confidence: number;
  severity: "info" | "low" | "medium" | "high";
  tags: string[];
}

export interface InsightsSummary {
  executive_summary: string;
  next_steps: string[];
  quality_grade?: string;
  quality_score?: number | string;
}

export interface InsightsResponse {
  dataset_id: string;
  insights: Insight[];
  summary?: InsightsSummary | null;
}

export interface CleaningSuggestion {
  column?: string;
  action: string;
  reason: string;
  [key: string]: unknown;
}

export interface CleaningResponse {
  dataset_id: string;
  suggestions: CleaningSuggestion[];
}

// --- Cleaning workspace ----------------------------------------------------
export interface CleaningOpParam {
  name: string;
  type: "select" | "text" | "number" | "columns";
  options?: string[];
  when?: Record<string, string>;
}

export interface CleaningOperation {
  op: string;
  label: string;
  group: string;
  scope: "column" | "dataset";
  params: CleaningOpParam[];
}

export interface CleaningOperationGroup {
  group: string;
  operations: CleaningOperation[];
}

export interface CleaningCatalog {
  catalog: CleaningOperationGroup[];
}

export interface CleaningColumn extends ProfileColumn {
  memory_bytes: number;
}

export interface CleaningPreview {
  shape: { rows: number; columns: number };
  columns: CleaningColumn[];
  column_order: string[];
  rows: Record<string, unknown>[];
  memory_bytes: number;
  duplicate_rows: number;
}

export interface CleaningStep {
  id: string;
  op: string;
  column?: string | null;
  params: Record<string, unknown>;
  label: string;
}

export interface CleaningVersion {
  id: string;
  label: string;
  step_count: number;
  created_at: string;
}

export interface CleaningState {
  dataset_id: string;
  preview: CleaningPreview;
  steps: CleaningStep[];
  versions: CleaningVersion[];
  can_undo: boolean;
  can_redo: boolean;
  error?: string | null;
}

export interface CleaningApplyBody {
  op: string;
  column?: string | null;
  params?: Record<string, unknown>;
}

export interface ChatCorrection {
  from: string;
  to: string;
}

export interface ChatTable {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface ChatCode {
  language: "python" | "sql" | string;
  content: string;
}

/** Structured artefacts the assistant can attach to a message. */
export interface ChatPayload {
  intent?: string;
  corrections?: ChatCorrection[];
  understanding?: Record<string, unknown>;
  table?: ChatTable;
  chart?: Chart;
  code?: ChatCode;
  checklist?: string[];
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  payload: ChatPayload;
  created_at: string;
}

export interface ChatResponse {
  session_id: string;
  message: ChatMessage;
}

export interface ReportResponse {
  dataset_id: string;
  report_type: "executive" | "business" | "technical";
  format: string;
  content: string;
}

// --- AutoML / Model prediction ---------------------------------------------
export type MlTask = "classification" | "regression" | "clustering" | "timeseries";

export interface ModelColumnInfo {
  name: string;
  semantic_type: string;
  unique: number;
  missing_pct: number;
}

export interface TargetSuggestion {
  column: string;
  type: "classification" | "regression";
  confidence: number;
  reason: string;
}

export interface ModelInfo {
  key: string;
  label: string;
  tags: string[];
}

export interface ModelConfig {
  dataset_id: string;
  columns: ModelColumnInfo[];
  target_suggestions: TargetSuggestion[];
  models: Record<string, ModelInfo[]>;
  capabilities: Record<string, boolean>;
  objectives: PredictionObjective[];
  summary: DatasetMlSummary;
}

export interface PredictionObjective {
  id: string;
  title: string;
  target: string;
  task: MlTask;
  why: string;
  difficulty: "easy" | "medium" | "hard";
  data_quality: number;
  business_value: "high" | "medium" | "low";
  recommended: boolean;
}

export interface DatasetMlSummary {
  rows: number;
  columns: number;
  missing_pct: number;
  duplicate_pct: number;
  quality_score: number;
  quality_grade: string;
  issues: string[];
}

export interface InputSchemaField {
  name: string;
  kind: "numeric" | "categorical";
  min?: number;
  max?: number;
  median?: number;
  choices?: string[];
  mode?: string | null;
}

export interface LeakageInfo {
  removed: { feature: string; reason: string }[];
}

export interface LeaderboardEntry {
  key: string;
  label: string;
  metrics: Record<string, number>;
  train_seconds?: number;
  predict_seconds?: number;
  tuned?: boolean;
  cv_score?: number | null;
  cv_mean?: number;
  cv_std?: number;
  /** Per-fold cross-validation scores (best effort, top models only). */
  cv_folds?: number[];
  /** Tested hyperparameter combinations with their CV scores (tuned models). */
  tuning_history?: { params: Record<string, unknown>; score: number }[];
  best_params?: Record<string, unknown>;
  rank?: number;
  error?: string;
}

export interface RocCurve {
  fpr: number[];
  tpr: number[];
  auc: number | null;
}

export interface LearningCurve {
  sizes: number[];
  train: number[];
  test: number[];
  scoring: string;
}

export interface PredictionDistribution {
  kind: "class_support" | "actual_vs_predicted";
  labels?: string[];
  actual: number[];
  predicted: number[];
}

export interface OverfitInfo {
  primary_train: number;
  primary_test: number;
  gap: number;
  verdict: "low" | "moderate" | "high";
}

export interface ShapImportance {
  method: string;
  values: FeatureImportance[];
}

export interface ClusterPlot {
  x: number[];
  y: number[];
  cluster: string[];
}

export interface Forecast {
  index: number[];
  actual: number[];
  predicted_index: number[];
  predicted: number[];
}

export interface TuningInfo {
  enabled: boolean;
  method?: string;
  n_trials?: number;
  models_tuned?: string[];
  pre_score?: number;
  post_score?: number;
  delta?: number;
  improved?: boolean;
  /** Tested parameter combinations across all tuned models, best first. */
  history?: { params: Record<string, unknown>; score: number }[];
}

export interface ModelAdvice {
  summary: string;
  winner_reason: string;
  overfitting: { verdict: string; message: string };
  tuning: string;
  suggestions: string[];
  business_summary?: string;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
}

export interface ConfusionMatrix {
  labels: string[];
  matrix: number[][];
}

export interface ClassificationReportRow {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface ModelBest {
  key: string;
  label: string;
  metrics: Record<string, number>;
  feature_importance: FeatureImportance[];
  params?: Record<string, unknown>;
  tuned?: boolean;
  best_params?: Record<string, unknown>;
  learning_curve?: LearningCurve | null;
  prediction_distribution?: PredictionDistribution | null;
  overfit?: OverfitInfo | null;
  shap?: ShapImportance | null;
  confusion_matrix?: ConfusionMatrix;
  classification_report?: ClassificationReportRow[];
  roc_curve?: RocCurve | null;
  residuals?: { mean: number; std: number };
  residual_series?: number[];
  cluster_plot?: ClusterPlot;
  n_clusters?: number;
  forecast?: Forecast;
  confidence?: number;
}

export interface ModelResult {
  task: MlTask;
  target: string;
  primary_metric: string;
  features: string[];
  n_rows_used: number;
  n_features: number;
  test_size: number;
  leaderboard: LeaderboardEntry[];
  best: ModelBest;
  classes?: string[];
  tuning?: TuningInfo;
  advisor?: ModelAdvice;
  leakage?: LeakageInfo;
  input_schema?: InputSchemaField[];
  artifact_key?: string;
  objective_id?: string;
}

export interface ModelRun {
  id: string;
  dataset_id: string;
  target: string;
  task: MlTask;
  best_model_key: string;
  best_model_label: string;
  primary_metric: string;
  primary_score: number;
  result: ModelResult;
  created_at: string;
}

export interface ModelRunSummary {
  id: string;
  target: string;
  task: MlTask;
  best_model_label: string;
  primary_metric: string;
  primary_score: number;
  created_at: string;
}

export interface ModelTrainBody {
  target: string;
  task?: string | null;
  model_keys?: string[] | null;
  test_size?: number;
  tune?: boolean;
  optimize?: boolean;
  n_trials?: number;
  include_models?: string[] | null;
  features?: string[] | null;
  cv_folds?: number;
  random_state?: number | null;
  objective_id?: string | null;
  /** Manual building: explicit estimator hyperparameters (plain or model__-prefixed). */
  hyperparameters?: Record<string, unknown> | null;
  /** Manual building: ensemble config (type, baseModels, weights, …). */
  ensemble?: Record<string, unknown> | null;
  /** Manual building: fitting knobs (scaling, encoding, sampling, …). */
  fitting?: Record<string, unknown> | null;
  /** Async jobs only: retrain even when a cached run matches this config. */
  force?: boolean;
}

// --- Background training jobs ------------------------------------------------
export type TrainingJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface TrainingJobLogEntry {
  ts: string;
  stage: string;
  message: string;
}

export interface TrainingJob {
  id: string;
  dataset_id: string;
  status: TrainingJobStatus;
  progress: number;
  stage: string;
  logs: TrainingJobLogEntry[];
  config: Record<string, unknown>;
  config_hash: string;
  error: string;
  model_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelPredictBody {
  inputs: Record<string, string | number | null>;
}

export interface ModelPredictOut {
  prediction: string | number | null;
  probabilities?: Record<string, number> | null;
  confidence?: number | null;
  explanation: string;
  top_drivers: { feature: string; importance: number }[];
}

// --- Reports & exports -----------------------------------------------------
export type ReportType = "executive" | "business" | "technical";

// --- Professional reporting center ------------------------------------------
export type ProReportType = "executive" | "data_analysis" | "model" | "ai_insight";

export interface ReportTypeMeta {
  type: ProReportType;
  title: string;
  description: string;
}

export interface ReportCenterMeta {
  dataset_id: string;
  types: ReportTypeMeta[];
  /** Export format -> available (pdf/docx/pptx depend on backend libraries). */
  formats: Record<string, boolean>;
}

export interface ReportBlock {
  type: "p" | "kv" | "table" | "list" | "callout";
  text?: string;
  /** list -> string[]; kv -> [label, value][] */
  items?: (string | [string, string])[];
  ordered?: boolean;
  columns?: string[];
  rows?: string[][];
}

export interface ReportSection {
  heading: string;
  blocks: ReportBlock[];
}

export interface ReportDocument {
  brand: string;
  report_type: ProReportType;
  title: string;
  subtitle: string;
  dataset_id: string;
  generated_at: string;
  sections: ReportSection[];
}

export interface ExportFormat {
  id: string;
  status: "ready" | "planned";
}

export interface ExportFormatsResponse {
  dataset_id: string;
  formats: ExportFormat[];
}

// --- Notebook --------------------------------------------------------------
export interface NotebookExecutorInfo {
  name: string;
  available: boolean;
  description: string;
}

export interface NotebookInfo {
  dataset_id: string;
  executor: NotebookExecutorInfo;
  starter_cells: string[];
  columns: string[];
}

export interface NotebookOutput {
  type: "text" | "table" | "error" | "html" | "image";
  text: string;
  columns: string[];
  rows: Record<string, unknown>[];
  /** base64-encoded PNG (no data-URI prefix) for image outputs. */
  image?: string;
}

export interface NotebookVariable {
  name: string;
  type: string;
  preview: string;
  shape: string;
}

export interface NotebookExecuteResult {
  ok: boolean;
  outputs: NotebookOutput[];
  stdout: string;
  execution_ms: number;
  error: string | null;
  variables?: NotebookVariable[];
}

// --- API Keys ----------------------------------------------------------------
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  is_active: boolean;
  created_at: string;
}

export interface ApiKeyCreateResponse {
  id: string;
  name: string;
  prefix: string;
  key: string;
  created_at: string;
}

export interface ApiKeyCreate {
  name: string;
}

// --- SQL Editor ---------------------------------------------------------------
export interface SqlExecuteRequest {
  query: string;
  limit?: number;
}

export interface SqlExecuteResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  execution_ms: number;
  error: string | null;
}

export interface SqlDataset {
  id: string;
  name: string;
  rows: number | null;
  columns: number | null;
}

// --- Team Invites -------------------------------------------------------------
export interface TeamInviteRequest {
  email: string;
  role?: string;
}

export interface TeamInviteResponse {
  message: string;
  email: string;
  role: string;
}
