"use client";

import {
  ArrowRight,
  Database,
  FolderKanban,
  Plus,
  Sparkles,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { LoadingCards } from "@/components/shared/loading";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProjects } from "@/lib/hooks";
import { formatNumber, timeAgo } from "@/lib/utils";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data: projects, isLoading } = useProjects();

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const totalProjects = projects?.length ?? 0;
  const totalDatasets =
    projects?.reduce((sum, p) => sum + (p.dataset_count ?? 0), 0) ?? 0;
  const recent = [...(projects ?? [])]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Your AI data science workspace. Upload a dataset to get an explainable, business-ready analysis."
        actions={
          <Button asChild>
            <Link href="/projects">
              <Plus className="h-4 w-4" /> New project
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Projects"
          value={formatNumber(totalProjects)}
          icon={FolderKanban}
          hint="Active analysis workspaces"
        />
        <StatCard
          label="Datasets"
          value={formatNumber(totalDatasets)}
          icon={Database}
          accent="success"
          hint="Profiled & ready to explore"
        />
        <StatCard
          label="AI insights"
          value="On demand"
          icon={Sparkles}
          accent="primary"
          hint="Generated per dataset"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Recent projects</CardTitle>
                <CardDescription>
                  Jump back into your latest work.
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/projects">
                  View all <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <LoadingCards count={2} className="lg:grid-cols-1" />
              ) : recent.length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title="No projects yet"
                  description="Create your first project to organize datasets and analyses."
                  action={
                    <Button asChild>
                      <Link href="/projects">
                        <Plus className="h-4 w-4" /> New project
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y">
                  {recent.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/projects/${p.id}`}
                        className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {p.description || p.business_domain || "No description"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <Badge variant="secondary">
                            {p.dataset_count} datasets
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(p.updated_at)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Common workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/projects">
                <Plus className="h-4 w-4" /> Create a project
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/projects">
                <Upload className="h-4 w-4" /> Upload a dataset
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/reports">
                <Sparkles className="h-4 w-4" /> Browse reports
              </Link>
            </Button>
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Tip
              </p>
              <p className="mt-1 text-muted-foreground">
                After uploading, open a dataset to see its profile, EDA charts,
                AI insights, and chat.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
