"use client";

/**
 * App-level prediction state so Playground predictions keep running when the
 * user navigates to another tab or page (mirrors TrainingProvider). Results
 * are kept per (dataset, run) key, so returning to the Playground shows the
 * finished prediction instead of losing it on unmount.
 */
import * as React from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import type { ModelPredictBody, ModelPredictOut } from "@/lib/types";

interface PredictionEntry {
  pending: boolean;
  result: ModelPredictOut | null;
  error: string | null;
}

interface PredictionContextValue {
  getEntry: (datasetId: string, runId: string) => PredictionEntry;
  startPrediction: (
    token: string,
    datasetId: string,
    runId: string,
    body: ModelPredictBody,
  ) => void;
  clearPrediction: (datasetId: string, runId: string) => void;
}

const EMPTY_ENTRY: PredictionEntry = { pending: false, result: null, error: null };

const PredictionContext = React.createContext<PredictionContextValue | null>(null);

function keyOf(datasetId: string, runId: string): string {
  return `${datasetId}:${runId}`;
}

export function PredictionProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = React.useState<Record<string, PredictionEntry>>({});

  const getEntry = React.useCallback(
    (datasetId: string, runId: string) => entries[keyOf(datasetId, runId)] ?? EMPTY_ENTRY,
    [entries],
  );

  const clearPrediction = React.useCallback((datasetId: string, runId: string) => {
    setEntries((prev) => {
      const key = keyOf(datasetId, runId);
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const startPrediction = React.useCallback(
    (token: string, datasetId: string, runId: string, body: ModelPredictBody) => {
      const key = keyOf(datasetId, runId);
      setEntries((prev) => {
        if (prev[key]?.pending) return prev; // already running for this run
        return { ...prev, [key]: { pending: true, result: null, error: null } };
      });

      api.models
        .predict(token, datasetId, runId, body)
        .then((out) => {
          setEntries((prev) => ({
            ...prev,
            [key]: { pending: false, result: out, error: null },
          }));
          toast.success("Prediction ready", {
            duration: 5000,
            description:
              typeof out.prediction === "number"
                ? `Predicted value: ${out.prediction.toLocaleString(undefined, { maximumFractionDigits: 3 })}`
                : `Predicted: ${String(out.prediction)}`,
          });
        })
        .catch((err) => {
          const message = err instanceof ApiError ? err.message : "Unknown error";
          setEntries((prev) => ({
            ...prev,
            [key]: { pending: false, result: null, error: message },
          }));
          toast.error("Prediction failed", { duration: 6000, description: message });
        });
    },
    [],
  );

  const value = React.useMemo(
    () => ({ getEntry, startPrediction, clearPrediction }),
    [getEntry, startPrediction, clearPrediction],
  );

  return (
    <PredictionContext.Provider value={value}>{children}</PredictionContext.Provider>
  );
}

export function usePredictionContext(): PredictionContextValue {
  const ctx = React.useContext(PredictionContext);
  if (!ctx) throw new Error("usePredictionContext must be used within PredictionProvider");
  return ctx;
}
