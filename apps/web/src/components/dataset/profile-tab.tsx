"use client";

import { AlertCircle, Key, Target } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { LoadingLines } from "@/components/shared/loading";
import { QualityScoreCard } from "@/components/shared/quality-score";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProfile } from "@/lib/hooks";
import { formatNumber } from "@/lib/utils";

export function ProfileTab({ datasetId }: { datasetId: string }) {
  const { data, isLoading, isError } = useProfile(datasetId);
  if (isLoading) return <LoadingLines count={8} />;
  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        Profile is not available for this dataset yet.
      </p>
    );
  }

  const r = data.report;
  const s = r.dataset_summary;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Rows" value={formatNumber(s.rows)} />
        <StatCard label="Columns" value={formatNumber(s.columns)} />
        <StatCard
          label="Missing cells"
          value={formatNumber(s.total_missing_cells)}
          accent={s.total_missing_cells > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Duplicate rows"
          value={`${formatNumber(s.duplicate_rows)} (${s.duplicate_pct.toFixed(1)}%)`}
          accent={s.duplicate_rows > 0 ? "warning" : "success"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data quality</CardTitle>
          <CardDescription>
            Weighted score across completeness, uniqueness, and consistency.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QualityScoreCard quality={r.quality} />
        </CardContent>
      </Card>

      {(r.target_suggestions.length > 0 ||
        r.probable_primary_keys.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {r.target_suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" /> Suggested targets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {r.target_suggestions.map((t) => (
                  <div
                    key={t.column}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{t.column}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t.reason}
                      </span>
                    </div>
                    <Badge variant="secondary" className="capitalize">
                      {t.type}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {r.probable_primary_keys.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary" /> Probable keys
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {r.probable_primary_keys.map((k) => (
                  <Badge key={k} variant="outline">
                    {k}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Columns</CardTitle>
          <CardDescription>
            Types, missingness, and cardinality per column.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Missing</TableHead>
                <TableHead>Unique</TableHead>
                <TableHead>Mean</TableHead>
                <TableHead>Outliers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.columns.map((c) => (
                <TableRow key={c.name}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      {c.name}
                      {c.is_probable_id && (
                        <Key className="h-3 w-3 text-muted-foreground" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {c.semantic_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        c.missing_pct > 20 ? "text-warning" : undefined
                      }
                    >
                      {formatNumber(c.missing)}
                    </span>
                  </TableCell>
                  <TableCell>{formatNumber(c.unique)}</TableCell>
                  <TableCell>
                    {c.stats?.mean != null ? c.stats.mean.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell>
                    {c.stats?.outliers != null ? c.stats.outliers : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {r.missing_report.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning" /> Missing values
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {r.missing_report.slice(0, 8).map((m) => (
              <div key={m.column} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{m.column}</span>
                  <span className="text-muted-foreground">
                    {formatNumber(m.missing)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-warning"
                    style={{ width: `${Math.min(100, m.missing_pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sample rows</CardTitle>
          <CardDescription>First rows from your dataset.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={r.sample.columns} rows={r.sample.rows} />
        </CardContent>
      </Card>


    </div>
  );
}
