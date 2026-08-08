"use client";

import {
  Download,
  FileBarChart,
  FileText,
  Presentation,
  Sparkles,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const REPORT_TYPES = [
  {
    icon: Presentation,
    title: "Executive summary",
    description:
      "One-page, business-first narrative: headline findings, impact, and recommended actions.",
  },
  {
    icon: FileText,
    title: "Business report",
    description:
      "Detailed, plain-language walkthrough of the analysis with charts and explanations.",
  },
  {
    icon: FileBarChart,
    title: "Technical report",
    description:
      "Full statistical profile, methodology, and reproducible steps for data teams.",
  },
];

const EXPORTS: { name: string; ready: boolean }[] = [
  { name: "CSV", ready: true },
  { name: "Excel", ready: true },
  { name: "JSON", ready: true },
  { name: "Notebook", ready: true },
  { name: "SQL", ready: true },
  { name: "PDF", ready: true },
  { name: "PowerPoint", ready: false },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & exports"
        description="Generate role-tailored reports and export analyses in your preferred format."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {REPORT_TYPES.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.title} className="relative">
              <CardHeader>
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="flex items-center gap-2">
                  {r.title}
                </CardTitle>
                <CardDescription>{r.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary">Open a dataset to generate</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" /> Export formats
          </CardTitle>
          <CardDescription>
            Available from any dataset&apos;s Reports tab. CSV, Excel, JSON,
            Notebook and SQL download instantly; PDF is produced from the report
            preview via Print → Save as PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {EXPORTS.map((e) => (
            <Badge
              key={e.name}
              variant={e.ready ? "secondary" : "outline"}
              className={e.ready ? "" : "opacity-60"}
            >
              {e.name}
              {!e.ready && <span className="ml-1 text-[10px]">soon</span>}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="flex items-center gap-1.5 font-medium text-primary">
          <Sparkles className="h-4 w-4" /> How reports work
        </p>
        <p className="mt-1 text-muted-foreground">
          Reports are generated per dataset from its profile and AI insights.
          Open a project, select a dataset, and use the Reports tab to preview,
          copy, print or export findings — all wired to the same analysis engine.
        </p>
      </div>
    </div>
  );
}
