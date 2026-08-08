"use client";

/**
 * Global training state, backed by server-side background jobs.
 *
 * "Predict Best Model" creates a TrainingJob on the backend which runs on its
 * own thread there — completely independent of the React component lifecycle.
 * This provider only *watches* the job (light polling), so navigating between
 * pages, closing the tab or refreshing never interrupts training. On mount,
 * `reconnect` re-attaches to any live job for a dataset, and cached results
 * are returned instantly when the same configuration was already trained.
 */
import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/hooks";
import type { ModelRun, ModelTrainBody, TrainingJob } from "@/lib/types";

const POLL_MS = 1500;

interface ActiveTraining {
  datasetId: string;
  jobId: string;
  target: string;
  optimize: boolean;
}

interface TrainingContextValue {
  /** Non-null while a job for some dataset is queued/running. */
  activeJob: ActiveTraining | null;
  /** Live job snapshot (progress, stage, logs) refreshed by polling. */
  job: TrainingJob | null;
  /** The most recently completed run (from this session). */
  lastRun: ModelRun | null;
  /** Kick off (or reconnect to a cached) training job. */
  startTraining: (token: string, datasetId: string, body: ModelTrainBody) => void;
  /** Re-attach to a live job for this dataset after a refresh/navigation. */
  reconnect: (token: string, datasetId: string) => void;
}

const TrainingContext = React.createContext<TrainingContextValue | null>(null);

export function TrainingProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = React.useState<ActiveTraining | null>(null);
  const [job, setJob] = React.useState<TrainingJob | null>(null);
  const [lastRun, setLastRun] = React.useState<ModelRun | null>(null);
  const qc = useQueryClient();

  const tokenRef = React.useRef("");
  const toastIdRef = React.useRef<string | number | undefined>(undefined);

  const finishJob = React.useCallback(
    async (datasetId: string, finished: TrainingJob) => {
      const toastId = toastIdRef.current;
      toastIdRef.current = undefined;
      setActive(null);
      setJob(finished);

      if (finished.status === "failed") {
        toast.error("Model training failed", {
          id: toastId,
          duration: 6000,
          description: finished.error || "Unknown error",
        });
        return;
      }

      try {
        if (finished.model_run_id) {
          const run = await api.models.run(
            tokenRef.current,
            datasetId,
            finished.model_run_id,
          );
          setLastRun(run);
          qc.invalidateQueries({ queryKey: queryKeys.modelRuns(datasetId) });
          toast.success(`Training complete — best model: ${run.best_model_label}`, {
            id: toastId,
            duration: 6000,
            description: `${run.primary_metric}: ${run.primary_score.toFixed(3)}`,
          });
        }
      } catch (err) {
        toast.error("Could not load training results", {
          id: toastId,
          duration: 6000,
          description: err instanceof ApiError ? err.message : "Unknown error",
        });
      }
    },
    [qc],
  );

  // Poll the active job. The job itself runs server-side, so this effect can
  // unmount/remount freely (navigation, refresh) without touching training.
  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let busy = false;

    const tick = async () => {
      if (busy || cancelled) return;
      busy = true;
      try {
        const fresh = await api.models.job(
          tokenRef.current,
          active.datasetId,
          active.jobId,
        );
        if (cancelled) return;
        setJob(fresh);
        if (fresh.status === "succeeded" || fresh.status === "failed") {
          await finishJob(active.datasetId, fresh);
        }
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.status === 404) {
          // Job disappeared (dataset deleted, etc.) — stop watching.
          setActive(null);
          setJob(null);
          if (toastIdRef.current !== undefined) {
            toast.dismiss(toastIdRef.current);
            toastIdRef.current = undefined;
          }
        }
        // Transient network errors: keep polling.
      } finally {
        busy = false;
      }
    };

    void tick();
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active, finishJob]);

  const attach = React.useCallback((datasetId: string, j: TrainingJob) => {
    const cfg = (j.config ?? {}) as { target?: string; tune?: boolean; optimize?: boolean };
    setActive({
      datasetId,
      jobId: j.id,
      target: cfg.target ?? "",
      optimize: Boolean(cfg.tune ?? cfg.optimize),
    });
    setJob(j);
  }, []);

  const startTraining = React.useCallback(
    (token: string, datasetId: string, body: ModelTrainBody) => {
      if (active) return; // a job is already being watched
      tokenRef.current = token;

      api.models
        .trainAsync(token, datasetId, body)
        .then((j) => {
          if (j.status === "succeeded") {
            // Same data + same configuration → cached results, no retraining.
            toast.info("Loaded cached results — this exact configuration was already trained.");
            void finishJob(datasetId, j);
            return;
          }
          if (j.status === "failed") {
            toast.error("Model training failed", {
              duration: 6000,
              description: j.error || "Unknown error",
            });
            return;
          }
          toastIdRef.current = toast.loading(
            body.tune || body.optimize
              ? `Training & tuning models for "${body.target}"…`
              : `Training models for "${body.target}"…`,
            { duration: Infinity },
          );
          setLastRun(null);
          attach(datasetId, j);
        })
        .catch((err) => {
          toast.error("Could not start training", {
            duration: 6000,
            description: err instanceof ApiError ? err.message : "Unknown error",
          });
        });
    },
    [active, attach, finishJob],
  );

  const reconnect = React.useCallback(
    (token: string, datasetId: string) => {
      if (active) return; // already watching a job
      tokenRef.current = token;
      api.models
        .jobs(token, datasetId, true)
        .then((jobs) => {
          const live = jobs.find((j) => j.status === "queued" || j.status === "running");
          if (!live) return;
          const cfg = (live.config ?? {}) as { target?: string };
          toastIdRef.current = toast.loading(
            `Reconnected to training for "${cfg.target ?? "model"}"…`,
            { duration: Infinity },
          );
          attach(datasetId, live);
        })
        .catch(() => {
          /* best-effort: nothing to reconnect to */
        });
    },
    [active, attach],
  );

  return (
    <TrainingContext.Provider
      value={{ activeJob: active, job, lastRun, startTraining, reconnect }}
    >
      {children}
    </TrainingContext.Provider>
  );
}

export function useTrainingContext() {
  const ctx = React.useContext(TrainingContext);
  if (!ctx) throw new Error("useTrainingContext must be used within TrainingProvider");
  return ctx;
}
