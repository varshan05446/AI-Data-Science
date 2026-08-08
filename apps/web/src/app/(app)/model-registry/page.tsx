"use client";

import { LineChart } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ModelRegistryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Model Registry"
        description="Version, deploy, and monitor your trained models in a central registry."
      />

      <div className="rounded-lg border border-dashed p-12 text-center">
        <LineChart className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <h3 className="mt-3 text-sm font-medium">No registered models</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Models trained in Model Studio will appear here once registered.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Registry features</CardTitle>
          <CardDescription>Lifecycle management for production models.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge>Version control</Badge>
          <Badge>Stage promotion</Badge>
          <Badge>Performance monitoring</Badge>
          <Badge variant="info">A/B deployment</Badge>
          <Badge variant="info">Auto-retrain triggers</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
