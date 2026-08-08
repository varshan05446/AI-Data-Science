"use client";

/**
 * React Query hooks. Each hook reads the backend JWT from the Auth.js session
 * and delegates to the typed API client. Query keys are centralised for cache
 * consistency and targeted invalidation after mutations.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { api } from "@/lib/api";
import type {
  CleaningApplyBody,
  CleaningState,
  ChartBuildSpec,
  ModelTrainBody,
  ProjectCreate,
  ProReportType,
  ReportType,
} from "@/lib/types";

function useToken(): string {
  const { data } = useSession();
  return data?.accessToken ?? "";
}

export const queryKeys = {
  workspace: ["workspace"] as const,
  members: ["workspace", "members"] as const,
  workspaceStats: ["workspace", "stats"] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  datasets: (projectId: string) => ["projects", projectId, "datasets"] as const,
  dataset: (id: string) => ["datasets", id] as const,
  profile: (id: string) => ["datasets", id, "profile"] as const,
  eda: (id: string) => ["datasets", id, "eda"] as const,
  explorationCatalog: (id: string) =>
    ["datasets", id, "exploration", "catalog"] as const,
  insights: (id: string) => ["datasets", id, "insights"] as const,
  cleaning: (id: string) => ["datasets", id, "cleaning"] as const,
  cleaningState: (id: string) => ["datasets", id, "cleaning", "state"] as const,
  cleaningOps: (id: string) => ["datasets", id, "cleaning", "operations"] as const,
  modelConfig: (id: string) => ["datasets", id, "models", "config"] as const,
  modelRuns: (id: string) => ["datasets", id, "models", "runs"] as const,
  modelRun: (id: string, runId: string) => ["datasets", id, "models", "run", runId] as const,
  report: (id: string, type: string) =>
    ["datasets", id, "report", type] as const,
  reportCenter: (id: string) => ["datasets", id, "report-center"] as const,
  reportDocument: (id: string, type: string) =>
    ["datasets", id, "report-center", type] as const,
  exportFormats: (id: string) => ["datasets", id, "exports"] as const,
  notebookInfo: (id: string) => ["datasets", id, "notebook", "info"] as const,
  chat: (id: string) => ["datasets", id, "chat"] as const,
};

// --- Workspace / projects --------------------------------------------------
export function useProjects() {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api.projects.list(token),
    enabled: !!token,
  });
}

export function useProject(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => api.projects.get(token, id),
    enabled: !!token && !!id,
  });
}

export function useCreateProject() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectCreate) => api.projects.create(token, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useDeleteProject() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.remove(token, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
      qc.invalidateQueries({ queryKey: queryKeys.workspaceStats });
    },
  });
}

export function useMembers() {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.members,
    queryFn: () => api.workspace.members(token),
    enabled: !!token,
  });
}

export function useWorkspaceStats() {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.workspaceStats,
    queryFn: () => api.workspace.stats(token),
    enabled: !!token,
  });
}

// --- Datasets --------------------------------------------------------------
export function useDatasets(projectId: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.datasets(projectId),
    queryFn: () => api.datasets.listByProject(token, projectId),
    enabled: !!token && !!projectId,
  });
}

export function useDataset(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.dataset(id),
    queryFn: () => api.datasets.get(token, id),
    enabled: !!token && !!id,
  });
}

export function useUploadDataset(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.datasets.upload(token, projectId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.datasets(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    },
  });
}

export function useDeleteDataset(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.datasets.remove(token, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.datasets(projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.workspaceStats });
    },
  });
}

export function useProfile(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.profile(id),
    queryFn: () => api.datasets.profile(token, id),
    enabled: !!token && !!id,
  });
}

export function useEda(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.eda(id),
    queryFn: () => api.datasets.eda(token, id),
    enabled: !!token && !!id,
  });
}

// --- Exploration (interactive viz builder) ---------------------------------
export function useChartCatalog(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.explorationCatalog(id),
    queryFn: () => api.datasets.explorationCatalog(token, id),
    enabled: !!token && !!id,
    staleTime: 60_000,
  });
}

export function useBuildChart(id: string) {
  const token = useToken();
  return useMutation({
    mutationFn: (spec: ChartBuildSpec) => api.datasets.buildChart(token, id, spec),
  });
}

export function useInsights(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.insights(id),
    queryFn: () => api.datasets.insights(token, id),
    enabled: !!token && !!id,
  });
}

export function useCleaning(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.cleaning(id),
    queryFn: () => api.datasets.cleaning(token, id),
    enabled: !!token && !!id,
  });
}

// --- Cleaning workspace ----------------------------------------------------
export function useCleaningOperations(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.cleaningOps(id),
    queryFn: () => api.cleaning.operations(token, id),
    enabled: !!token && !!id,
    staleTime: Infinity,
  });
}

export function useCleaningState(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.cleaningState(id),
    queryFn: () => api.cleaning.state(token, id),
    enabled: !!token && !!id,
  });
}

/**
 * All cleaning mutations return the fresh :class:`CleaningState`, so we write it
 * straight into the query cache to keep the grid instant and consistent.
 */
export function useCleaningActions(id: string) {
  const token = useToken();
  const qc = useQueryClient();
  const write = (state: CleaningState) => {
    qc.setQueryData(queryKeys.cleaningState(id), state);
    return state;
  };

  const apply = useMutation({
    mutationFn: (body: CleaningApplyBody) => api.cleaning.apply(token, id, body),
    onSuccess: write,
  });
  const undo = useMutation({
    mutationFn: () => api.cleaning.undo(token, id),
    onSuccess: write,
  });
  const redo = useMutation({
    mutationFn: () => api.cleaning.redo(token, id),
    onSuccess: write,
  });
  const reset = useMutation({
    mutationFn: () => api.cleaning.reset(token, id),
    onSuccess: write,
  });
  const saveVersion = useMutation({
    mutationFn: (label: string) => api.cleaning.saveVersion(token, id, label),
    onSuccess: write,
  });
  const restoreVersion = useMutation({
    mutationFn: (versionId: string) =>
      api.cleaning.restoreVersion(token, id, versionId),
    onSuccess: write,
  });
  const commit = useMutation({
    mutationFn: (name?: string) => api.cleaning.commit(token, id, name),
  });

  return { apply, undo, redo, reset, saveVersion, restoreVersion, commit };
}

// --- Models / AutoML -------------------------------------------------------
export function useModelConfig(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.modelConfig(id),
    queryFn: () => api.models.config(token, id),
    enabled: !!token && !!id,
    staleTime: 60_000,
  });
}

export function useModelRuns(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.modelRuns(id),
    queryFn: () => api.models.runs(token, id),
    enabled: !!token && !!id,
  });
}

export function useModelRun(id: string, runId: string | null) {
  const token = useToken();
  return useQuery({
    queryKey: ["datasets", id, "models", "run", runId] as const,
    queryFn: () => api.models.run(token, id, runId as string),
    enabled: !!token && !!id && !!runId,
  });
}

export function useTrainModels(id: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ModelTrainBody) => api.models.train(token, id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.modelRuns(id) });
      qc.invalidateQueries({ queryKey: queryKeys.workspaceStats });
    },
  });
}

// --- Reports & exports -----------------------------------------------------
export function useReport(id: string, type: ReportType) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.report(id, type),
    queryFn: () => api.datasets.report(token, id, type),
    enabled: !!token && !!id,
    staleTime: 60_000,
  });
}

/** Reporting-center metadata: professional report types + export formats. */
export function useReportCenter(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.reportCenter(id),
    queryFn: () => api.reports.center(token, id),
    enabled: !!token && !!id,
    staleTime: 60_000,
  });
}

/** Structured professional report document (sections of typed blocks). */
export function useReportDocument(id: string, type: ProReportType) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.reportDocument(id, type),
    queryFn: () => api.reports.document(token, id, type),
    enabled: !!token && !!id,
    staleTime: 60_000,
  });
}

/** Downloads a professional report in the chosen format (pdf/docx/pptx/md/html). */
export function useReportExport(id: string) {
  const token = useToken();
  return useMutation({
    mutationFn: async ({
      type,
      format,
      filename,
    }: {
      type: ProReportType;
      format: string;
      filename: string;
    }) => {
      const blob = await api.reports.export(token, id, type, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}

export function useExportFormats(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.exportFormats(id),
    queryFn: () => api.datasets.exportFormats(token, id),
    enabled: !!token && !!id,
    staleTime: Infinity,
  });
}

/**
 * Downloads a dataset export as a file. Fetches the blob with the auth token,
 * then triggers a browser save via a transient object URL.
 */
export function useExportFile(id: string) {
  const token = useToken();
  return useMutation({
    mutationFn: async ({ format, filename }: { format: string; filename: string }) => {
      const blob = await api.datasets.exportFile(token, id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  });
}

// --- Notebook --------------------------------------------------------------
export function useNotebookInfo(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.notebookInfo(id),
    queryFn: () => api.datasets.notebookInfo(token, id),
    enabled: !!token && !!id,
    staleTime: 60_000,
  });
}

export function useExecuteCell(id: string) {
  const token = useToken();
  return useMutation({
    mutationFn: (code: string) => api.datasets.notebookExecute(token, id, code),
  });
}

export function useNotebookAssist(id: string) {
  const token = useToken();
  return useMutation({
    mutationFn: ({ prompt, error }: { prompt: string; error?: string }) =>
      api.datasets.notebookAssist(token, id, prompt, error),
  });
}

// --- Chat ------------------------------------------------------------------
export function useChatMessages(datasetId: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.chat(datasetId),
    queryFn: () => api.chat.messages(token, datasetId),
    enabled: !!token && !!datasetId,
  });
}

export function useSendMessage(datasetId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ message, sessionId }: { message: string; sessionId?: string }) =>
      api.chat.send(token, datasetId, message, sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.chat(datasetId) }),
  });
}

// --- API Keys ----------------------------------------------------------------
export const apiQueryKeys = {
  apiKeys: ["api-keys"] as const,
  sqlDatasets: ["sql-datasets"] as const,
};

export function useApiKeys() {
  const token = useToken();
  return useQuery({
    queryKey: apiQueryKeys.apiKeys,
    queryFn: () => api.apiKeys.list(token),
    enabled: !!token,
  });
}

export function useCreateApiKey() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => api.apiKeys.create(token, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: apiQueryKeys.apiKeys }),
  });
}

export function useRevokeApiKey() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.apiKeys.revoke(token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: apiQueryKeys.apiKeys }),
  });
}

// --- SQL Editor ---------------------------------------------------------------
export function useSqlDatasets() {
  const token = useToken();
  return useQuery({
    queryKey: apiQueryKeys.sqlDatasets,
    queryFn: () => api.sql.datasets(token),
    enabled: !!token,
  });
}

export function useExecuteSql() {
  const token = useToken();
  return useMutation({
    mutationFn: ({ datasetId, query, limit }: { datasetId: string; query: string; limit?: number }) =>
      api.sql.execute(token, datasetId, query, limit),
  });
}

// --- Team Invites -------------------------------------------------------------
export function useInviteMember() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role?: string }) =>
      api.team.invite(token, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members }),
  });
}

export function useRemoveMember() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.team.removeMember(token, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.members }),
  });
}
