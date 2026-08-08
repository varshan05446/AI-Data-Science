"use client";

import { FlaskConical, Play } from "lucide-react";
import Link from "next/link";

import { useCopilot } from "@/components/copilot/copilot-context";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TRANSFORMS = [
  { name: "Log Transform", description: "Apply natural log to reduce skewness." },
  { name: "Standardize (Z-Score)", description: "Mean-center and scale to unit variance." },
  { name: "Min-Max Scaling", description: "Scale values to [0, 1] range." },
  { name: "One-Hot Encoding", description: "Convert categorical columns to binary indicators." },
  { name: "Polynomial Features", description: "Generate interaction and squared terms." },
  { name: "Binning", description: "Discretize continuous variables into bins." },
];

export default function FeatureEngineeringPage() {
  const { activeDatasetId } = useCopilot();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feature Engineering"
        description="Transform, combine, and derive new features to improve model performance."
        actions={
          activeDatasetId ? (
            <Button asChild>
              <Link href={`/datasets/${activeDatasetId}?tab=cleaning`}>
                <Play className="h-4 w-4" /> Open in Cleaning Studio
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TRANSFORMS.map((t) => (
          <Card key={t.name}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FlaskConical className="h-4 w-4 text-primary" />
                {t.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{t.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      {!activeDatasetId && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <FlaskConical className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            Select a dataset from the sidebar to apply transformations.
          </p>
        </div>
      )}
    </div>
  );
}
