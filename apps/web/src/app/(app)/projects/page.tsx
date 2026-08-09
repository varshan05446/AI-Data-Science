"use client";

import {
  Box,
  BrainCircuit,
  Database,
  FolderKanban,
  Grid,
  LayoutList,
  LineChart,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { LoadingCards } from "@/components/shared/loading";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownItem,
  DropdownSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateProject,
  useDeleteProject,
  useRenameProject,
  useProjects,
  useWorkspaceStats,
} from "@/lib/hooks";
import { cn, formatNumber, timeAgo } from "@/lib/utils";

export default function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();
  const { data: stats, isLoading: statsLoading } = useWorkspaceStats();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const renameProject = useRenameProject();
  const [open, setOpen] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");
  const [renameTarget, setRenameTarget] = React.useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null);

  const totalProjects = projects?.length ?? 0;
  const totalDatasets =
    projects?.reduce((sum, p) => sum + (p.dataset_count ?? 0), 0) ?? 0;
  const totalModels = stats?.models ?? 0;

  async function onRename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!renameTarget) return;
    const name = String(new FormData(e.currentTarget).get("name") || "").trim();
    if (!name) return;
    try {
      await renameProject.mutateAsync({ id: renameTarget.id, name });
      toast.success("Project renamed.");
      setRenameTarget(null);
    } catch {
      toast.error("Could not rename project.");
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    try {
      await deleteProject.mutateAsync(deleteTarget.id);
      toast.success("Project deleted.");
      setDeleteTarget(null);
    } catch {
      toast.error("Could not delete project.");
    }
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) return;
    try {
      await createProject.mutateAsync({
        name,
        description: String(form.get("description") || ""),
        business_domain: String(form.get("business_domain") || ""),
        goals: String(form.get("goals") || ""),
      });
      toast.success("Project created successfully.");
      setOpen(false);
    } catch {
      toast.error("Could not create project.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Organize datasets and analyses by business initiative."
        actions={
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-border/70 bg-surface/60 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors",
                  viewMode === "grid"
                    ? "bg-card text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Grid View"
              >
                <Grid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors",
                  viewMode === "list"
                    ? "bg-card text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="List View"
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
            </div>

            <Button onClick={() => setOpen(true)} className="gap-1.5 shadow-sm font-medium">
              <Plus className="h-4 w-4" /> New Project
            </Button>
          </div>
        }
      />

      {/* Metrics row – live workspace counts from the API */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Projects"
          value={
            isLoading ? (
              <Skeleton className="h-8 w-14" />
            ) : (
              formatNumber(totalProjects)
            )
          }
          icon={FolderKanban}
          iconBg="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        />
        <StatCard
          label="Datasets"
          value={
            isLoading ? (
              <Skeleton className="h-8 w-14" />
            ) : (
              formatNumber(totalDatasets)
            )
          }
          icon={Database}
          iconBg="bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
        />
        <StatCard
          label="Models"
          value={
            statsLoading ? (
              <Skeleton className="h-8 w-14" />
            ) : (
              formatNumber(totalModels)
            )
          }
          icon={Box}
          iconBg="bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
        />
        <StatCard
          label="AI insights"
          value="On demand"
          hint="Generated per dataset"
          icon={Sparkles}
          iconBg="bg-teal-500/10 text-teal-400 border-teal-500/20"
        />
      </div>

      {isLoading ? (
        <LoadingCards count={6} />
      ) : !projects || projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create a project to start uploading and analyzing datasets."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card interactive className="h-full border-border/60 hover:border-primary/40 transition-all">
                <CardHeader className="space-y-0 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                        <FolderKanban className="h-4 w-4" />
                      </span>
                      <CardTitle className="line-clamp-1 text-base font-semibold">{p.name}</CardTitle>
                    </div>
                    <StatusPill status={p.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                    {p.description || p.business_domain || "No description"}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground/80 pt-1 border-t border-border/40">
                    <span className="flex items-center gap-1 font-medium">
                      <Database className="h-3.5 w-3.5 text-primary/70" />
                      {p.dataset_count} {p.dataset_count === 1 ? "dataset" : "datasets"} • Updated {timeAgo(p.updated_at)}
                    </span>
                    <DropdownMenu
                      trigger={
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Project options"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      }
                    >
                      <DropdownItem onClick={(e) => { e.preventDefault(); setRenameTarget({ id: p.id, name: p.name }); }}>
                        <Pencil className="h-3.5 w-3.5" /> Rename
                      </DropdownItem>
                      <DropdownSeparator />
                      <DropdownItem
                        onClick={(e) => { e.preventDefault(); setDeleteTarget({ id: p.id, name: p.name }); }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </DropdownItem>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/60">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex items-center justify-between p-4 hover:bg-surface/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                  <FolderKanban className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-foreground truncate">{p.name}</p>
                    <StatusPill status={p.status} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{p.description || "No description"}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-xs text-muted-foreground shrink-0">
                <span className="flex items-center gap-1">
                  <Database className="h-3.5 w-3.5 text-primary" />
                  {p.dataset_count} datasets
                </span>
                <span>Updated {timeAgo(p.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(v) => !v && setRenameTarget(null)}
        title="Rename Project"
        description="Enter a new name for the project."
      >
        <form onSubmit={onRename} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rename-name">Project Name *</Label>
            <Input
              id="rename-name"
              name="name"
              defaultValue={renameTarget?.name}
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button type="submit">Rename</Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete Project"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onDelete}
            disabled={deleteProject.isPending}
          >
            {deleteProject.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Dialog>

      {/* New Project Dialog */}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New Project"
        description="Give your project a name and optional context to guide the AI."
      >
        <form onSubmit={onCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name *</Label>
            <Input id="name" name="name" placeholder="Customer Lifetime Value Prediction" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business_domain">Business Domain</Label>
            <Input
              id="business_domain"
              name="business_domain"
              placeholder="e.g. E-commerce, Finance, Healthcare"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Build a machine learning model to predict customer lifetime value and identify high value customers."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goals">Goals (optional)</Label>
            <Textarea
              id="goals"
              name="goals"
              placeholder="Improve marketing ROI, increase customer retention, identify upsell opportunities."
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createProject.isPending}>
              {createProject.isPending ? "Creating…" : "Create Project"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
