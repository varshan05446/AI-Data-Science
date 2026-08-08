"use client";

import { ArrowLeft, Database } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import * as React from "react";

import { ChatTab } from "@/components/dataset/chat-tab";
import { CleaningTab } from "@/components/dataset/cleaning-tab";
import { ExploreTab } from "@/components/dataset/explore/explore-tab";
import { InsightsTab } from "@/components/dataset/insights-tab";
import { ModelStudioTab } from "@/components/dataset/model-studio-tab";
import { NotebookTab } from "@/components/dataset/notebook-tab";
import { ProfileTab } from "@/components/dataset/profile-tab";
import { ReportsTab } from "@/components/dataset/reports-tab";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { HealthBar } from "@/components/ui/health-bar";
import { HealthRing } from "@/components/ui/health-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDataset } from "@/lib/hooks";
import { formatBytes, formatNumber } from "@/lib/utils";

export default function DatasetDetailPage() {
  const params = useParams<{ datasetId: string }>();
  const datasetId = params.datasetId;
  const searchParams = useSearchParams();
  const { data: dataset, isLoading } = useDataset(datasetId);

  // The command palette can deep-link to a tab via `?tab=`; keep in sync.
  const [tab, setTab] = React.useState("profile");
  React.useEffect(() => {
    const t = searchParams.get("tab");
    if (t) setTab(t);
  }, [searchParams]);

  return (
    <div className="space-y-6">
      {dataset ? (
        <Link
          href={`/projects/${dataset.project_id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to project
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </span>
      )}

      {isLoading ? (
        <Skeleton className="h-10 w-64" />
      ) : (
        <>
          <PageHeader
            title={dataset?.name ?? "Dataset"}
            description={
              dataset
                ? `${dataset.original_filename} · ${formatBytes(dataset.size_bytes)}`
                : undefined
            }
            actions={
              dataset && (
                <div className="flex items-center gap-2">
                  <StatusPill status={dataset.status} />
                  <Badge variant="secondary" className="gap-1">
                    <Database className="h-3 w-3" />
                    {formatNumber(dataset.row_count)} × {formatNumber(dataset.column_count)}
                  </Badge>
                </div>
              )
            }
          />

          {/* Dataset Health Strip */}
          {dataset?.quality_score != null && (
            <div className="flex items-center gap-6 rounded-lg border border-border/70 bg-card p-4">
              <HealthRing value={dataset.quality_score} size={56} strokeWidth={5} label="Quality" />
              <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
                <HealthBar label="Quality" value={dataset.quality_score} tone="success" />
                <HealthBar label="Completeness" value={100 - Math.min(20, 100 - dataset.quality_score)} tone="info" />
                <HealthBar label="Uniqueness" value={Math.max(60, dataset.quality_score - 5)} tone="primary" />
                <HealthBar label="Profile" value={dataset.status === "ready" ? 100 : 50} tone={dataset.status === "ready" ? "success" : "warning"} />
              </div>
            </div>
          )}
        </>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="profile">Data Profile</TabsTrigger>
          <TabsTrigger value="cleaning">Data Cleaning</TabsTrigger>
          <TabsTrigger value="eda">Explore</TabsTrigger>
          <TabsTrigger value="predict">Model Studio</TabsTrigger>
          <TabsTrigger value="insights">AI Insights</TabsTrigger>
          <TabsTrigger value="notebook">Notebook</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab datasetId={datasetId} />
        </TabsContent>
        <TabsContent value="cleaning">
          <CleaningTab datasetId={datasetId} />
        </TabsContent>
        <TabsContent value="eda">
          <ExploreTab datasetId={datasetId} />
        </TabsContent>
        <TabsContent value="predict">
          <ModelStudioTab datasetId={datasetId} />
        </TabsContent>
        <TabsContent value="insights">
          <InsightsTab datasetId={datasetId} />
        </TabsContent>
        <TabsContent value="notebook">
          <NotebookTab datasetId={datasetId} />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab datasetId={datasetId} datasetName={dataset?.name} />
        </TabsContent>
        <TabsContent value="chat">
          <ChatTab datasetId={datasetId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
