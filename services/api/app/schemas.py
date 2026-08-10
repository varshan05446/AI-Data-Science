"""Pydantic request/response schemas."""
from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.base import DatasetStatus, ProjectStatus, Role


# --- Auth ---------------------------------------------------------------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(default="", max_length=200)
    workspace_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"
    workspace: "WorkspaceOut"
    role: Role


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    name: str
    image_url: Optional[str] = None


# --- Workspace ----------------------------------------------------------------
class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    slug: str


class WorkspaceStatsOut(BaseModel):
    """Live workspace-wide counts for dashboard stat tiles."""

    projects: int = 0
    datasets: int = 0
    models: int = 0


class MemberOut(BaseModel):
    user: UserOut
    role: Role


# --- Project ------------------------------------------------------------------
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    business_domain: str = ""
    goals: str = ""
    tags: list[str] = Field(default_factory=list)
    status: ProjectStatus = ProjectStatus.ACTIVE


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    business_domain: Optional[str] = None
    goals: Optional[str] = None
    tags: Optional[list[str]] = None
    status: Optional[ProjectStatus] = None
    team_member_ids: Optional[list[str]] = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str
    business_domain: str
    goals: str
    status: ProjectStatus
    tags: list[str]
    team_member_ids: list[str]
    owner_id: str
    workspace_id: str
    created_at: dt.datetime
    updated_at: dt.datetime
    dataset_count: int = 0


# --- Dataset ------------------------------------------------------------------
class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    name: str
    source_type: str
    original_filename: str
    content_type: str
    size_bytes: int
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    quality_score: Optional[float] = None
    status: DatasetStatus
    created_at: dt.datetime


class ProfileOut(BaseModel):
    dataset_id: str
    report: dict[str, Any]


# --- Chat ---------------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: Optional[str] = None


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    role: str
    content: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: dt.datetime


class ChatResponse(BaseModel):
    session_id: str
    message: ChatMessageOut


# --- Insights / EDA -----------------------------------------------------------
class InsightsOut(BaseModel):
    dataset_id: str
    insights: list[dict[str, Any]]
    summary: Optional[dict[str, Any]] = None


class EdaOut(BaseModel):
    dataset_id: str
    charts: list[dict[str, Any]]


# --- Exploration (interactive viz builder) ------------------------------------
class ExplorationCatalogOut(BaseModel):
    dataset_id: str
    columns: list[dict[str, Any]]
    charts: list[dict[str, Any]]
    categories: list[str]
    map_categories: list[str] = Field(default_factory=list)
    palettes: list[dict[str, Any]]
    color_scales: list[dict[str, Any]]
    themes: list[dict[str, Any]]
    location_modes: list[dict[str, Any]] = Field(default_factory=list)
    aggregations: list[str]


class ChartBuildSpec(BaseModel):
    chart_type: str = Field(min_length=1, max_length=48)
    encodings: dict[str, Any] = Field(default_factory=dict)
    options: dict[str, Any] = Field(default_factory=dict)


class ChartResultOut(BaseModel):
    dataset_id: str
    chart: dict[str, Any]


class CleaningOut(BaseModel):
    dataset_id: str
    suggestions: list[dict[str, Any]]


# --- Cleaning workspace -------------------------------------------------------
class CleaningApplyRequest(BaseModel):
    op: str = Field(min_length=1, max_length=64)
    column: Optional[str] = None
    params: dict[str, Any] = Field(default_factory=dict)


class CleaningVersionRequest(BaseModel):
    label: str = Field(default="Snapshot", max_length=120)


class CleaningCommitRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)


class CleaningStateOut(BaseModel):
    dataset_id: str
    preview: dict[str, Any]
    steps: list[dict[str, Any]]
    versions: list[dict[str, Any]]
    can_undo: bool = False
    can_redo: bool = False
    error: Optional[str] = None


# --- AutoML / Model prediction ------------------------------------------------
class ModelTrainRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    target: str = Field(min_length=1, max_length=200)
    task: Optional[str] = Field(default=None, max_length=20)
    model_keys: Optional[list[str]] = None
    test_size: float = Field(default=0.2, ge=0.05, le=0.5)
    tune: bool = False
    optimize: bool = False
    n_trials: int = Field(default=20, ge=5, le=100)
    include_models: Optional[list[str]] = None
    features: Optional[list[str]] = None
    cv_folds: int = Field(default=3, ge=2, le=10)
    random_state: Optional[int] = None
    objective_id: Optional[str] = Field(default=None, max_length=200)
    # Manual Model Building: explicit estimator hyperparameters (plain or
    # ``model__``-prefixed keys, applied via ``Pipeline.set_params``).
    hyperparameters: Optional[dict[str, Any]] = None
    # Manual Model Building: ensemble configuration (type, baseModels, weights,
    # votingStrategy, metaLearner). Trained as a single candidate pipeline.
    ensemble: Optional[dict[str, Any]] = None
    # Manual Model Building: fitting knobs (scaling, encoding, sampling,
    # feature_selection, leakage_detection, class_imbalance).
    fitting: Optional[dict[str, Any]] = None
    # Async jobs only: retrain even when a cached run matches this exact config.
    force: bool = False
    # Unsupervised clustering (task="clustering"): cluster count + linkage.
    n_clusters: Optional[int] = Field(default=None, ge=2, le=50)
    linkage: Optional[str] = Field(default=None, max_length=20)
    # Semi-supervised (task="semi_supervised"): confidence threshold + base learner.
    threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    base_estimator: Optional[str] = Field(default=None, max_length=60)
    # Reinforcement (task="reinforcement"): environment / learner hyperparameters.
    gamma: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    alpha: Optional[float] = Field(default=None, ge=0.01, le=1.0)
    max_iterations: Optional[int] = Field(default=None, ge=1, le=10000)
    n_bins: Optional[int] = Field(default=None, ge=2, le=20)


class ModelConfigOut(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    dataset_id: str
    columns: list[dict[str, Any]]
    target_suggestions: list[dict[str, Any]]
    models: dict[str, list[dict[str, Any]]]
    capabilities: dict[str, bool]
    objectives: list[dict[str, Any]] = []
    summary: dict[str, Any] = {}


class ModelPredictRequest(BaseModel):
    inputs: dict[str, Any] = Field(default_factory=dict)


class ModelPredictOut(BaseModel):
    prediction: Any
    probabilities: Optional[dict[str, float]] = None
    confidence: Optional[float] = None
    explanation: str = ""
    top_drivers: list[dict[str, Any]] = []


class ModelRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
    id: str
    dataset_id: str
    target: str
    task: str
    best_model_key: str
    best_model_label: str
    primary_metric: str
    primary_score: float
    result: dict[str, Any]
    created_at: dt.datetime


class ModelRunSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
    id: str
    target: str
    task: str
    best_model_label: str
    primary_metric: str
    primary_score: float
    created_at: dt.datetime


class TrainingJobOut(BaseModel):
    """Status of a background training job (poll-friendly)."""

    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
    id: str
    dataset_id: str
    status: str  # queued | running | succeeded | failed
    progress: float
    stage: str
    logs: list[dict[str, Any]] = []
    config: dict[str, Any] = {}
    config_hash: str = ""
    error: str = ""
    model_run_id: Optional[str] = None
    created_at: dt.datetime
    updated_at: dt.datetime


# --- API Keys -----------------------------------------------------------------
class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    prefix: str
    is_active: bool
    created_at: dt.datetime


class ApiKeyCreateResponse(BaseModel):
    id: str
    name: str
    prefix: str
    key: str  # Only shown once at creation
    created_at: str


class ApiKeyVerifyRequest(BaseModel):
    key: str = Field(min_length=10, max_length=200)


class ApiKeyVerifyResponse(BaseModel):
    valid: bool
    key_id: Optional[str] = None
    name: Optional[str] = None
    workspace_id: Optional[str] = None
    workspace_name: Optional[str] = None
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    role: Optional[str] = None
    last_used_at: Optional[str] = None
    error: Optional[str] = None


# --- SQL Editor ---------------------------------------------------------------
class SqlExecuteRequest(BaseModel):
    query: str = Field(min_length=1, max_length=10000)
    limit: int = Field(default=1000, ge=1, le=10000)
    dataset_ids: list[str] = Field(default_factory=list)


class SqlExecuteResponse(BaseModel):
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int
    truncated: bool
    execution_ms: int
    error: Optional[str] = None


# --- Team Invites -------------------------------------------------------------
class TeamInviteRequest(BaseModel):
    email: EmailStr
    role: str = Field(default="analyst", pattern=r"^(owner|data_scientist|analyst|executive|business)$")


class TeamInviteResponse(BaseModel):
    message: str
    email: str
    role: str


TokenResponse.model_rebuild()
