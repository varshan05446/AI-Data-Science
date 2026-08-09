"use client";

/**
 * Signal Discovery Scan panel.
 *
 * Ranks every viable target column by its achievable prediction score (hold-out +
 * cross-validated) and flags derived-column tautologies (e.g. ``revenue ≈ units ×
 * unit_price``) that make high accuracy an arithmetic artifact rather than real
 * signal. Users can pick a ranked target straight into Step 1's target/features.
 */
import * as React from "react";
import { AlertTriangle, Check, Loader2, Radar } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import type { SignalScanEntry } from "@/lib/types";

interface SignalScanPanelProps {
  datasetId: string;
  token: string;
  onPickTarget: (target: string) => void;
}

function scoreLabel(entry: SignalScanEntry): string {
  if (entry.error) return "—";
  if (entry.task === "classification") {
    return `${(entry.test_score * 100).toFixed(1)}%`;
  }
  return entry.test_score.toFixed(3);
}

function signalBadge(entry: SignalScanEntry) {
  if (entry.leaky) {
    return (
      <Badge variant="destructive" className="text-[9px] gap-1">
        <AlertTriangle className="h-3 w-3" />
        Derived-column leak
      </Badge>
    );
  }
  if (entry.error) {
    return (
      <span className="text-[10px] text-muted-foreground" title={entry.error}>
        Failed
      </span>
    );
  }
  return (
    <Badge
      variant="success"
      className="text-[9px] gap-1"
    >
      <Check className="h-3 w-3" />
      Real signal
    </Badge>
  );
}

export function SignalScanPanel({
  datasetId,
  token,
  onPickTarget,
}: SignalScanPanelProps) {
  const [scanning, setScanning] = React.useState(false);
  const [entries, setEntries] = React.useState<SignalScanEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [chosen, setChosen] = React.useState<string | null>(null);

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const result = await api.models.signalScan(token, datasetId);
      setEntries(result);
      if (result.length === 0) {
        setError("No viable target columns were found in this dataset.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signal scan failed.");
    } finally {
      setScanning(false);
    }
  }

  function pick(target: string) {
    setChosen(target);
    onPickTarget(target);
    toast.success(`Target set to "${target}".`);
  }

  const leaks = entries?.filter((e) => e.leaky) ?? [];

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Radar className="h-4 w-4 text-primary" />
              Signal Discovery Scan
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground mt-1">
              Ranks every viable column by its achievable prediction score and flags
              derived-column tautologies that inflate accuracy. Takes ~30–60 seconds.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant={entries ? "outline" : "default"}
            onClick={runScan}
            disabled={scanning}
            className="gap-2 shrink-0"
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radar className="h-4 w-4" />
            )}
            {scanning ? "Scanning…" : entries ? "Re-run Scan" : "Run Signal Scan"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {entries && entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-2 font-semibold">Target</th>
                  <th className="py-2 pr-2 font-semibold">Task</th>
                  <th className="py-2 pr-2 font-semibold">Score</th>
                  <th className="py-2 pr-2 font-semibold">CV</th>
                  <th className="py-2 pr-2 font-semibold">Best Model</th>
                  <th className="py-2 pr-2 font-semibold">Signal</th>
                  <th className="py-2 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const selected = chosen === entry.target;
                  return (
                    <tr
                      key={entry.target}
                      className="border-b border-border/30"
                    >
                      <td className="py-2 pr-2 font-mono font-medium">
                        {entry.target}
                      </td>
                      <td className="py-2 pr-2 capitalize text-muted-foreground">
                        {entry.task}
                      </td>
                      <td className="py-2 pr-2 font-mono font-semibold">
                        {scoreLabel(entry)}
                      </td>
                      <td className="py-2 pr-2 font-mono text-muted-foreground">
                        {entry.cv_mean != null ? entry.cv_mean.toFixed(3) : "—"}
                      </td>
                      <td className="py-2 pr-2 text-muted-foreground">
                        {entry.best_model || "—"}
                      </td>
                      <td className="py-2 pr-2">{signalBadge(entry)}</td>
                      <td className="py-2 text-right">
                        {entry.error ? (
                          <span className="text-[10px] text-muted-foreground">
                            —
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant={selected ? "secondary" : "ghost"}
                            disabled={selected}
                            onClick={() => pick(entry.target)}
                            className="h-6 px-2 text-[11px] gap-1"
                          >
                            {selected && <Check className="h-3 w-3" />}
                            {selected ? "Selected" : "Select as Target"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {leaks.length > 0 && (
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 space-y-1 text-[11px] text-muted-foreground">
            {leaks.map((entry) => (
              <div key={entry.target} className="py-0.5">
                <span className="font-mono font-semibold text-foreground">
                  {entry.target}
                </span>
                {" — "}
                {entry.note ??
                  `High accuracy is driven by derived column(s)${entry.driver ? ` (${entry.driver})` : ""} — this looks like a tautology of the data itself, not a real business signal.`}
              </div>
            ))}
          </div>
        )}

        {!entries && !scanning && !error && (
          <p className="text-[11px] text-muted-foreground">
            Every viable column is ranked by its achievable prediction score using a
            quick hold-out + cross-validated model. Targets flagged as leaks look
            accurate only because they are arithmetic combinations of other columns.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
