"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCopilot } from "@/components/copilot/copilot-context";

/**
 * Workspace-level AI Insights hub. Links into per-dataset insights.
 */
export default function InsightsPage() {
  const { activeDatasetId } = useCopilot();

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Insights"
        description="Workspace-wide AI-generated findings, anomalies, and recommendations across all your datasets."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card interactive>
          <CardHeader>
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <CardTitle>Key Findings</CardTitle>
            <CardDescription>
              Automated detection of patterns, correlations, and statistical significance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeDatasetId ? (
              <Button asChild size="sm">
                <Link href={`/datasets/${activeDatasetId}?tab=insights`}>
                  View Insights
                </Link>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select a dataset to view AI-generated insights.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anomaly Detection</CardTitle>
            <CardDescription>
              Outliers, distribution shifts, and unexpected patterns flagged automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Available per dataset after profiling completes.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
            <CardDescription>
              Suggested cleaning steps, feature engineering, and modelling approaches.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Recommendations generated alongside insights.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
