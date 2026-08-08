/**
 * Typed API client for the FastAPI backend.
 *
 * A single `apiFetch` attaches the Auth.js-issued backend JWT as a Bearer
 * token and normalises errors. Resource helpers wrap each endpoint so the React
 * Query layer stays declarative and fully typed.
 */
import type {
  ApiKey,
  ApiKeyCreate,
  ApiKeyCreateResponse,
  ChatMessage,
  ChatResponse,
  CleaningApplyBody,
  CleaningCatalog,
  CleaningResponse,
  CleaningState,
  Dataset,
  EdaResponse,
  ExplorationCatalog,
  ChartBuildSpec,
  ChartResult,
  InsightsResponse,
  MemberOut,
  ModelConfig,
  ModelPredictBody,
  ModelPredictOut,
  ModelRun,
  ModelRunSummary,
  ModelTrainBody,
  Project,
  ProjectCreate,
  ProfileResponse,
  ReportResponse,
  ReportCenterMeta,
  ReportDocument,
  ProReportType,
  ExportFormatsResponse,
  NotebookInfo,
  NotebookExecuteResult,
  SqlDataset,
  SqlExecuteResponse,
  TeamInviteRequest,
  TeamInviteResponse,
  TrainingJob,
  WorkspaceOut,
  WorkspaceStats,
} from "@/lib/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "http://localhost:8000/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

interface FetchOptions extends Omit<RequestInit, "body"> {
  token?: string;
  body?: unknown;
  raw?: boolean; // send body as-is (e.g. FormData)
}

export async function apiFetch<T>(
  path: string,
  { token, body, raw, headers, ...init }: FetchOptions = {},
): Promise<T> {
  const finalHeaders = new Headers(headers);
  if (token) finalHeaders.set("Authorization", `Bearer ${token}`);

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (raw) {
      payload = body as BodyInit;
    } else {
      finalHeaders.set("Content-Type", "application/json");
      payload = JSON.stringify(body);
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: finalHeaders,
    body: payload,
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data?.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return res.json() as Promise<T>;
  return (await res.text()) as unknown as T;
}

export async function apiDownload(
  path: string,
  token: string,
): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data?.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.blob();
}

/** Endpoint helpers grouped by resource. All take the backend JWT. */
export const api = {
  workspace: {
    current: (token: string) =>
      apiFetch<WorkspaceOut>("/workspaces/current", { token }),
    members: (token: string) =>
      apiFetch<MemberOut[]>("/workspaces/current/members", { token }),
    stats: (token: string) =>
      apiFetch<WorkspaceStats>("/workspaces/current/stats", { token }),
  },
  projects: {
    list: (token: string) => apiFetch<Project[]>("/projects", { token }),
    get: (token: string, id: string) =>
      apiFetch<Project>(`/projects/${id}`, { token }),
    create: (token: string, body: ProjectCreate) =>
      apiFetch<Project>("/projects", { token, method: "POST", body }),
    update: (token: string, id: string, body: Partial<ProjectCreate>) =>
      apiFetch<Project>(`/projects/${id}`, { token, method: "PATCH", body }),
    remove: (token: string, id: string) =>
      apiFetch<void>(`/projects/${id}`, { token, method: "DELETE" }),
  },
  datasets: {
    listByProject: (token: string, projectId: string) =>
      apiFetch<Dataset[]>(`/projects/${projectId}/datasets`, { token }),
    get: (token: string, id: string) =>
      apiFetch<Dataset>(`/datasets/${id}`, { token }),
    upload: (token: string, projectId: string, form: FormData) =>
      apiFetch<Dataset>(`/projects/${projectId}/datasets`, {
        token,
        method: "POST",
        body: form,
        raw: true,
      }),
    remove: (token: string, id: string) =>
      apiFetch<void>(`/datasets/${id}`, { token, method: "DELETE" }),
    profile: (token: string, id: string) =>
      apiFetch<ProfileResponse>(`/datasets/${id}/profile`, { token }),
    eda: (token: string, id: string) =>
      apiFetch<EdaResponse>(`/datasets/${id}/eda`, { token }),
    explorationCatalog: (token: string, id: string) =>
      apiFetch<ExplorationCatalog>(`/datasets/${id}/exploration/catalog`, { token }),
    buildChart: (token: string, id: string, spec: ChartBuildSpec) =>
      apiFetch<ChartResult>(`/datasets/${id}/exploration/chart`, {
        token,
        method: "POST",
        body: spec,
      }),
    insights: (token: string, id: string) =>
      apiFetch<InsightsResponse>(`/datasets/${id}/insights`, { token }),
    cleaning: (token: string, id: string) =>
      apiFetch<CleaningResponse>(`/datasets/${id}/cleaning`, { token }),
    report: (
      token: string,
      id: string,
      type: "executive" | "business" | "technical",
    ) => apiFetch<ReportResponse>(`/datasets/${id}/reports/${type}`, { token }),
    exportFormats: (token: string, id: string) =>
      apiFetch<ExportFormatsResponse>(`/datasets/${id}/exports`, { token }),
    exportFile: (token: string, id: string, format: string) =>
      apiDownload(`/datasets/${id}/export?format=${encodeURIComponent(format)}`, token),
    notebookInfo: (token: string, id: string) =>
      apiFetch<NotebookInfo>(`/datasets/${id}/notebook/info`, { token }),
    notebookExecute: (token: string, id: string, code: string) =>
      apiFetch<NotebookExecuteResult>(`/datasets/${id}/notebook/execute`, {
        token,
        method: "POST",
        body: { code },
      }),
    notebookAssist: (
      token: string,
      id: string,
      prompt: string,
      error?: string,
    ) =>
      apiFetch<{ code: string }>(`/datasets/${id}/notebook/assist`, {
        token,
        method: "POST",
        body: { prompt, error },
      }),
  },
  cleaning: {
    operations: (token: string, id: string) =>
      apiFetch<CleaningCatalog>(`/datasets/${id}/cleaning/operations`, { token }),
    state: (token: string, id: string) =>
      apiFetch<CleaningState>(`/datasets/${id}/cleaning/state`, { token }),
    apply: (token: string, id: string, body: CleaningApplyBody) =>
      apiFetch<CleaningState>(`/datasets/${id}/cleaning/apply`, {
        token,
        method: "POST",
        body,
      }),
    undo: (token: string, id: string) =>
      apiFetch<CleaningState>(`/datasets/${id}/cleaning/undo`, {
        token,
        method: "POST",
      }),
    redo: (token: string, id: string) =>
      apiFetch<CleaningState>(`/datasets/${id}/cleaning/redo`, {
        token,
        method: "POST",
      }),
    reset: (token: string, id: string) =>
      apiFetch<CleaningState>(`/datasets/${id}/cleaning/reset`, {
        token,
        method: "POST",
      }),
    saveVersion: (token: string, id: string, label: string) =>
      apiFetch<CleaningState>(`/datasets/${id}/cleaning/versions`, {
        token,
        method: "POST",
        body: { label },
      }),
    restoreVersion: (token: string, id: string, versionId: string) =>
      apiFetch<CleaningState>(
        `/datasets/${id}/cleaning/versions/${versionId}/restore`,
        { token, method: "POST" },
      ),
    commit: (token: string, id: string, name?: string) =>
      apiFetch<Dataset>(`/datasets/${id}/cleaning/commit`, {
        token,
        method: "POST",
        body: { name: name ?? null },
      }),
  },
  chat: {
    messages: (token: string, datasetId: string) =>
      apiFetch<ChatMessage[]>(`/datasets/${datasetId}/chat/messages`, { token }),
    send: (
      token: string,
      datasetId: string,
      message: string,
      sessionId?: string,
    ) =>
      apiFetch<ChatResponse>(`/datasets/${datasetId}/chat`, {
        token,
        method: "POST",
        body: { message, session_id: sessionId ?? null },
      }),
  },
  models: {
    config: (token: string, id: string) =>
      apiFetch<ModelConfig>(`/datasets/${id}/models/config`, { token }),
    train: (token: string, id: string, body: ModelTrainBody) =>
      apiFetch<ModelRun>(`/datasets/${id}/models/train`, {
        token,
        method: "POST",
        body,
      }),
    trainAsync: (token: string, id: string, body: ModelTrainBody) =>
      apiFetch<TrainingJob>(`/datasets/${id}/models/train-async`, {
        token,
        method: "POST",
        body,
      }),
    jobs: (token: string, id: string, activeOnly = false) =>
      apiFetch<TrainingJob[]>(
        `/datasets/${id}/models/jobs${activeOnly ? "?active=true" : ""}`,
        { token },
      ),
    job: (token: string, id: string, jobId: string) =>
      apiFetch<TrainingJob>(`/datasets/${id}/models/jobs/${jobId}`, { token }),
    runs: (token: string, id: string) =>
      apiFetch<ModelRunSummary[]>(`/datasets/${id}/models/runs`, { token }),
    run: (token: string, id: string, runId: string) =>
      apiFetch<ModelRun>(`/datasets/${id}/models/runs/${runId}`, { token }),
    predict: (token: string, id: string, runId: string, body: ModelPredictBody) =>
      apiFetch<ModelPredictOut>(`/datasets/${id}/models/runs/${runId}/predict`, {
        token,
        method: "POST",
        body,
      }),
  },
  reports: {
    center: (token: string, id: string) =>
      apiFetch<ReportCenterMeta>(`/datasets/${id}/reports`, { token }),
    document: (token: string, id: string, type: ProReportType) =>
      apiFetch<ReportDocument>(`/datasets/${id}/reports/${type}/document`, {
        token,
      }),
    export: (token: string, id: string, type: ProReportType, format: string) =>
      apiDownload(
        `/datasets/${id}/reports/${type}/export?format=${encodeURIComponent(format)}`,
        token,
      ),
  },
  sql: {
    datasets: (token: string) =>
      apiFetch<SqlDataset[]>("/sql/datasets", { token }),
    execute: (token: string, datasetId: string, query: string, limit?: number) =>
      apiFetch<SqlExecuteResponse>(`/datasets/${datasetId}/sql/execute`, {
        token,
        method: "POST",
        body: { query, limit: limit ?? 1000 },
      }),
  },
  team: {
    invite: (token: string, body: TeamInviteRequest) =>
      apiFetch<TeamInviteResponse>("/team/invite", {
        token,
        method: "POST",
        body,
      }),
    removeMember: (token: string, userId: string) =>
      apiFetch<void>(`/team/members/${userId}`, { token, method: "DELETE" }),
  },
  apiKeys: {
    list: (token: string) => apiFetch<ApiKey[]>("/api-keys", { token }),
    create: (token: string, body: ApiKeyCreate) =>
      apiFetch<ApiKeyCreateResponse>("/api-keys", {
        token,
        method: "POST",
        body,
      }),
    revoke: (token: string, id: string) =>
      apiFetch<void>(`/api-keys/${id}`, { token, method: "DELETE" }),
  },
  copilot: {
    chat: (
      token: string,
      message: string,
      history: { role: string; content: string }[],
    ) =>
      apiFetch<{ reply: string; handoff: boolean }>("/copilot/chat", {
        token,
        method: "POST",
        body: { message, history },
      }),
  },
};
