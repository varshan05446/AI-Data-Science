"use client";

import { BarChart3 } from "lucide-react";
import * as React from "react";

import { ChartCard } from "@/components/dataset/eda/chart-card";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingCards } from "@/components/shared/loading";
import { cn } from "@/lib/utils";
import { useEda } from "@/lib/hooks";

const ALL = "All";

export function EdaTab({ datasetId }: { datasetId: string }) {
  const { data, isLoading, isError } = useEda(datasetId);
  const [filter, setFilter] = React.useState<string>(ALL);

  const groups = React.useMemo(() => {
    const set = new Set<string>();
    data?.charts.forEach((c) => c.group && set.add(String(c.group)));
    return [ALL, ...Array.from(set)];
  }, [data]);

  if (isLoading) return <LoadingCards count={4} className="lg:grid-cols-2" />;
  if (isError || !data || data.charts.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No charts available"
        description="EDA charts are generated from the dataset profile. Re-upload if this persists."
      />
    );
  }

  const charts =
    filter === ALL
      ? data.charts
      : data.charts.filter((c) => String(c.group) === filter);

  return (
    <div className="space-y-4">
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setFilter(g)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === g
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {charts.map((chart) => (
          <ChartCard key={chart.id} chart={chart} />
        ))}
      </div>
    </div>
  );
}
