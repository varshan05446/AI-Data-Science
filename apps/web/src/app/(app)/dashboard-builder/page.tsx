"use client";

import { LayoutGrid, Plus } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardBuilderPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Builder"
        description="Compose real-time dashboards from your datasets and model outputs."
        actions={
          <Button disabled>
            <Plus className="h-4 w-4" /> New Dashboard
          </Button>
        }
      />

      <div className="rounded-lg border border-dashed p-12 text-center">
        <LayoutGrid className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <h3 className="mt-3 text-sm font-medium">No dashboards yet</h3>
        <p className="mt-1 max-w-sm mx-auto text-xs text-muted-foreground">
          Create a dashboard to pin charts from Explore, model metrics, and AI insights into a single view.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dashboard capabilities</CardTitle>
          <CardDescription>Drag-and-drop builder for data storytelling.</CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>• Pin any chart from Explore or Model Studio</p>
          <p>• Auto-refresh on dataset updates</p>
          <p>• Share with team members (view only)</p>
          <p>• Export to PDF or embed externally</p>
        </CardContent>
      </Card>
    </div>
  );
}
