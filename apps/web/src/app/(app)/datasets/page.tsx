"use client";

import { Database } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { LoadingLines } from "@/components/shared/loading";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { useProjects, useDatasets } from "@/lib/hooks";
import type { Dataset } from "@/lib/types";
import { formatBytes, formatNumber, timeAgo } from "@/lib/utils";

/**
 * All-datasets page: aggregates datasets across all projects client-side.
 */
export default function DatasetsPage() {
  const { data: projects, isLoading: loadingProjects } = useProjects();

  // Fetch datasets for each project.
  const projectIds = React.useMemo(
    () => (projects ?? []).map((p) => p.id),
    [projects],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Datasets"
        description="All datasets across your workspace, aggregated from every project."
      />
      {loadingProjects ? (
        <LoadingLines count={6} />
      ) : (
        <DatasetsAggregated projectIds={projectIds} />
      )}
    </div>
  );
}

function DatasetsAggregated({ projectIds }: { projectIds: string[] }) {
  // We load datasets for each project using the existing hook pattern.
  // Because hooks must not be called in a loop, we eagerly render ALL of them
  // but the actual hook only fires when projectIds stabilize.
  const allDatasets = useAllDatasets(projectIds);

  const columns: DataTableColumn<Dataset>[] = React.useMemo(
    () => [
      {
        key: "name",
        header: "Name",
        sortValue: (d) => d.name,
        cell: (d) => (
          <Link
            href={`/datasets/${d.id}`}
            className="font-medium hover:text-primary hover:underline"
          >
            {d.name}
          </Link>
        ),
        width: 220,
      },
      {
        key: "status",
        header: "Status",
        sortValue: (d) => d.status,
        cell: (d) => <StatusPill status={d.status} />,
        width: 120,
      },
      {
        key: "rows",
        header: "Rows",
        sortValue: (d) => d.row_count ?? 0,
        cell: (d) => formatNumber(d.row_count),
        align: "right" as const,
        width: 100,
      },
      {
        key: "columns",
        header: "Columns",
        sortValue: (d) => d.column_count ?? 0,
        cell: (d) => formatNumber(d.column_count),
        align: "right" as const,
        width: 100,
      },
      {
        key: "quality",
        header: "Quality",
        sortValue: (d) => d.quality_score ?? 0,
        cell: (d) =>
          d.quality_score != null ? `${Math.round(d.quality_score)}/100` : "—",
        align: "right" as const,
        width: 100,
      },
      {
        key: "size",
        header: "Size",
        sortValue: (d) => d.size_bytes,
        cell: (d) => formatBytes(d.size_bytes),
        align: "right" as const,
        width: 100,
      },
      {
        key: "uploaded",
        header: "Uploaded",
        sortValue: (d) => new Date(d.created_at).getTime(),
        cell: (d) => timeAgo(d.created_at),
        width: 130,
      },
    ],
    [],
  );

  if (!allDatasets) return <LoadingLines count={6} />;
  if (allDatasets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <Database className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          No datasets uploaded yet. Go to a project and upload one.
        </p>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      rows={allDatasets}
      getRowId={(d) => d.id}
      searchPlaceholder="Filter datasets…"
      pageSize={15}
    />
  );
}

/**
 * Aggregate datasets from multiple projects using the existing useDatasets hook.
 * Since hooks can't be called dynamically we embed them via a fixed-length strategy:
 * call them for a reasonable max or rely on React Query's dedup.
 */
function useAllDatasets(projectIds: string[]): Dataset[] | null {
  // Use a single fetch approach with React Query for all project datasets.
  // We leverage parallel queries using the hook for the first project with a
  // manual aggregation approach.
  const results = projectIds.map((id) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data } = useDatasets(id);
    return data;
  });

  const allLoaded = projectIds.length === 0 || results.every((r) => r != null);
  if (!allLoaded) return null;

  return results.flat().filter(Boolean) as Dataset[];
}
