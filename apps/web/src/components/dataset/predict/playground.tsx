"use client";

/**
 * Prediction Playground: a dynamic what-if form generated from the run's
 * stored input schema. Submits a single row to the persisted winning
 * pipeline and renders the prediction, confidence, class probabilities and
 * the top drivers behind the model's decision. Predictions run through the
 * app-level PredictionProvider, so they keep going (and finish with a toast)
 * even when the user switches tabs or pages. Runs trained before artifact
 * persistence existed render a disabled hint instead.
 */
import { FlaskConical, Loader2, Wand2 } from "lucide-react";
import { useSession } from "next-auth/react";
import * as React from "react";

import { usePredictionContext } from "@/components/prediction-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { InputSchemaField, ModelPredictBody, ModelRun } from "@/lib/types";
import { cn } from "@/lib/utils";

function fmtNumber(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: InputSchemaField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.kind === "categorical") {
    return (
      <select
        id={`pg-${field.name}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">(most common{field.mode != null ? `: ${field.mode}` : ""})</option>
        {(field.choices ?? []).map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      id={`pg-${field.name}`}
      type="number"
      step="any"
      value={value}
      placeholder={field.median != null ? `median ${fmtNumber(field.median)}` : "value"}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

export function Playground({ datasetId, run }: { datasetId: string; run: ModelRun }) {
  const schema = run.result.input_schema ?? [];
  const hasArtifact = Boolean(run.result.artifact_key) && schema.length > 0;
  const { getEntry, startPrediction } = usePredictionContext();
  const { data: session } = useSession();
  const token = session?.accessToken ?? "";

  const [values, setValues] = React.useState<Record<string, string>>({});

  // Reset the form whenever the displayed run changes. Predictions live in the
  // provider keyed per run, so other runs' results are untouched.
  React.useEffect(() => {
    setValues({});
  }, [run.id]);

  const entry = getEntry(datasetId, run.id);

  if (
    run.result.task !== "classification" &&
    run.result.task !== "regression" &&
    run.result.task !== "semi_supervised"
  )
    return null;

  if (!hasArtifact) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-5 text-sm text-muted-foreground">
          <FlaskConical className="h-5 w-5 shrink-0" />
          The Prediction Playground is unavailable for this run — it was trained before model
          artifacts were saved. Retrain to enable live predictions.
        </CardContent>
      </Card>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (entry.pending) return;
    const inputs: ModelPredictBody["inputs"] = {};
    for (const field of schema) {
      const raw = values[field.name];
      if (raw == null || raw === "") {
        inputs[field.name] = null; // backend fills median / mode
      } else if (field.kind === "numeric") {
        const num = Number(raw);
        inputs[field.name] = Number.isFinite(num) ? num : null;
      } else {
        inputs[field.name] = raw;
      }
    }
    startPrediction(token, datasetId, run.id, { inputs });
  }

  const out = entry.result;
  const probEntries = out?.probabilities
    ? Object.entries(out.probabilities).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FlaskConical className="h-4 w-4 text-primary" />
          Prediction Playground
          <span className="text-xs font-normal text-muted-foreground">
            What-if predictions with the winning model — blank fields use typical values.
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {schema.map((field) => (
              <div key={field.name} className="space-y-1">
                <Label htmlFor={`pg-${field.name}`} className="font-mono text-xs">
                  {field.name}
                </Label>
                <FieldInput
                  field={field}
                  value={values[field.name] ?? ""}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))}
                />
                {field.kind === "numeric" && field.min != null && field.max != null && (
                  <div className="text-[10px] text-muted-foreground">
                    seen {fmtNumber(field.min)} – {fmtNumber(field.max)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button type="submit" disabled={entry.pending} className="gap-2">
            {entry.pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Predicting…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" /> Predict
              </>
            )}
          </Button>
        </form>

        {entry.error && (
          <p className="text-sm text-destructive">
            Prediction failed: {entry.error}
          </p>
        )}

        {out && (
          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Predicted {run.target || "value"}
                </div>
                <div className="font-mono text-2xl font-bold text-primary">
                  {typeof out.prediction === "number" ? fmtNumber(out.prediction) : String(out.prediction)}
                </div>
              </div>
              {out.confidence != null && (
                <Badge variant="secondary" className="text-xs">
                  {Math.round(out.confidence * 100)}% confidence
                </Badge>
              )}
            </div>

            {probEntries.length > 0 && (
              <div className="space-y-1.5">
                {probEntries.map(([label, prob]) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span className="w-28 truncate font-mono" title={label}>
                      {label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          String(out.prediction) === label ? "bg-primary" : "bg-primary/40",
                        )}
                        style={{ width: `${Math.max(2, Math.round(prob * 100))}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-muted-foreground">
                      {(prob * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {out.explanation && <p className="text-xs text-muted-foreground">{out.explanation}</p>}

            {out.top_drivers.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                Top drivers:
                {out.top_drivers.map((d) => (
                  <Badge key={d.feature} variant="outline" className="font-mono text-[10px]">
                    {d.feature}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
