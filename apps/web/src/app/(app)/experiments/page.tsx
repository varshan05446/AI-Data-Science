"use client";

import { TestTubes } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ExperimentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Experiments"
        description="Track, compare, and reproduce machine learning experiments across your workspace."
      />

      <div className="rounded-lg border border-dashed p-12 text-center">
        <TestTubes className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <h3 className="mt-3 text-sm font-medium">No experiments yet</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Train models via Model Studio and experiments will be logged here for comparison.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TestTubes className="h-4 w-4 text-primary" /> Coming features
          </CardTitle>
          <CardDescription>Experiment tracking is being expanded.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge>Hyperparameter logging</Badge>
          <Badge>Metric comparison</Badge>
          <Badge>Artifact versioning</Badge>
          <Badge variant="info">Model lineage</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
