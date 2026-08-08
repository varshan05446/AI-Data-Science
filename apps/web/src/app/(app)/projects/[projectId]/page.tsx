"use client";

import {
  ArrowLeft,
  Database,
  FileUp,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { LoadingLines } from "@/components/shared/loading";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn, type DataTableAction } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/ui/status-pill";
import {
  useDatasets,
  useDeleteDataset,
  useProject,
  useUploadDataset,
} from "@/lib/hooks";
import type { Dataset } from "@/lib/types";
import { formatBytes, formatNumber, timeAgo } from "@/lib/utils";

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();
  const { data: project } = useProject(projectId);
  const { data: datasets, isLoading } = useDatasets(projectId);
  const upload = useUploadDataset(projectId);
  const remove = useDeleteDataset(projectId);
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);

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
        width: 200,
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
        align: "right",
        width: 100,
      },
      {
        key: "columns",
        header: "Columns",
        sortValue: (d) => d.column_count ?? 0,
        cell: (d) => formatNumber(d.column_count),
        align: "right",
        width: 100,
      },
      {
        key: "quality",
        header: "Quality",
        sortValue: (d) => d.quality_score ?? 0,
        cell: (d) =>
          d.quality_score != null
            ? `${Math.round(d.quality_score)}/100`
            : "—",
        align: "right",
        width: 100,
      },
      {
        key: "size",
        header: "Size",
        sortValue: (d) => d.size_bytes,
        cell: (d) => formatBytes(d.size_bytes),
        align: "right",
        width: 100,
      },
      {
        key: "uploaded",
        header: "Uploaded",
        sortValue: (d) => new Date(d.created_at).getTime(),
        cell: (d) => timeAgo(d.created_at),
        width: 120,
      },
    ],
    [],
  );

  const rowActions: DataTableAction<Dataset>[] = [
    {
      label: "Open dataset",
      onClick: (d) => router.push(`/datasets/${d.id}`),
    },
    {
      label: "Delete",
      destructive: true,
      onClick: (d) => onDelete(d.id),
    },
  ];

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      toast.error("Choose a CSV, Excel, or JSON file.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("name", (e.currentTarget.elements.namedItem("name") as HTMLInputElement)?.value || file.name);
    try {
      await upload.mutateAsync(form);
      toast.success("Dataset uploaded and profiled.");
      setOpen(false);
      setFile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  async function onDelete(id: string) {
    try {
      await remove.mutateAsync(id);
      toast.success("Dataset deleted.");
    } catch {
      toast.error("Could not delete dataset.");
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>

      <PageHeader
        title={project?.name ?? "Project"}
        description={
          project?.description ||
          project?.business_domain ||
          "Datasets uploaded to this project."
        }
        actions={
          <Button onClick={() => setOpen(true)}>
            <Upload className="h-4 w-4" /> Upload dataset
          </Button>
        }
      />

      {isLoading ? (
        <LoadingLines count={5} />
      ) : !datasets || datasets.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No datasets yet"
          description="Upload a CSV, Excel, or JSON file to profile it and unlock EDA, insights, and chat."
          action={
            <Button onClick={() => setOpen(true)}>
              <Upload className="h-4 w-4" /> Upload dataset
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={datasets}
          getRowId={(d) => d.id}
          onRowClick={(d) => router.push(`/datasets/${d.id}`)}
          rowActions={rowActions}
          searchPlaceholder="Filter datasets…"
          emptyState="No matching datasets."
        />
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Upload dataset"
        description="CSV, Excel (.xlsx), or JSON. The file is profiled automatically on upload."
      >
        <form onSubmit={onUpload} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">File</Label>
            <label
              htmlFor="file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <FileUp className="h-6 w-6" />
              {file ? (
                <span className="font-medium text-foreground">{file.name}</span>
              ) : (
                <span>Click to choose a file</span>
              )}
              <Input
                id="file"
                name="file"
                type="file"
                accept=".csv,.xlsx,.xls,.json,text/csv,application/json"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Display name (optional)</Label>
            <Input id="name" name="name" placeholder="Defaults to the file name" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={upload.isPending}>
              {upload.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Profiling…
                </>
              ) : (
                "Upload & profile"
              )}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
