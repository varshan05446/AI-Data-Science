"use client";

import { Lightbulb, ScrollText, Sparkles, Wand2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { EmptyState } from "@/components/shared/empty-state";
import { InsightCard } from "@/components/shared/insight-card";
import { LoadingCards } from "@/components/shared/loading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCleaning, useInsights } from "@/lib/hooks";

export function InsightsTab({ datasetId }: { datasetId: string }) {
  const { data, isLoading, isError } = useInsights(datasetId);
  const { data: cleaning } = useCleaning(datasetId);

  if (isLoading) return <LoadingCards count={4} className="lg:grid-cols-2" />;
  if (isError || !data || data.insights.length === 0) {
    return (
      <EmptyState
        icon={Lightbulb}
        title="No insights yet"
        description="AI insights are generated from the profile. Try re-opening this tab in a moment."
      />
    );
  }

  return (
    <div className="space-y-6">
      {data.summary && (
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" /> Executive summary
              {data.summary.quality_grade && (
                <Badge variant="outline" className="ml-auto">
                  Quality {data.summary.quality_grade} · {data.summary.quality_score}/100
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {data.summary.executive_summary}
              </ReactMarkdown>
            </div>
            {data.summary.next_steps.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recommended next steps
                </p>
                <ol className="space-y-1.5">
                  {data.summary.next_steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary">
                        {i + 1}
                      </span>
                      <span className="prose prose-sm max-w-none dark:prose-invert prose-p:my-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{step}</ReactMarkdown>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.insights.map((insight, i) => (
          <InsightCard key={i} insight={insight} />
        ))}
      </div>

      {cleaning && cleaning.suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" /> Data cleaning
              suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Recommendations only — nothing is changed without your approval.
            </p>
            {cleaning.suggestions.map((s, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {s.column ? `${s.column}: ` : ""}
                    <span className="font-normal">{s.action}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{s.reason}</p>
                </div>
                <Badge variant="outline" className="shrink-0 gap-1">
                  <Sparkles className="h-3 w-3" /> Suggested
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
