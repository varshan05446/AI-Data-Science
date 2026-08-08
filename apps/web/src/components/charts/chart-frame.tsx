"use client";

/**
 * Premium shared chart wrapper. Provides a consistent toolbar (fullscreen,
 * legend toggle, export PNG/SVG/PDF, copy image, download CSV), a framer-motion
 * mount animation and dark-mode surfaces. It renders either the interactive
 * Plotly engine or a server-rendered statistical image, chosen by `chart.engine`.
 */
import { motion } from "framer-motion";
import { Check, Copy, Download, Eye, EyeOff, Maximize2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { ImageChart } from "@/components/charts/image-chart";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import {
  copyImage,
  downloadCsv,
  downloadDataUrl,
  plotlyImage,
  printPdf,
} from "@/components/charts/export-utils";
import { AiExplanation } from "@/components/shared/ai-explanation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
} from "@/components/ui/dropdown-menu";
import type { Chart } from "@/lib/types";

function ChartBody({
  chart,
  height,
  showLegend,
}: {
  chart: Chart;
  height: number;
  showLegend: boolean;
}) {
  if (chart.engine === "image") return <ImageChart chart={chart} height={height} />;
  const withLegend = {
    ...chart,
    options: { ...(chart.options ?? {}), show_legend: showLegend },
  };
  return <PlotlyChart chart={withLegend} height={height} />;
}

export function ChartFrame({
  chart,
  height = 300,
  category,
  children,
  toolbar,
}: {
  chart: Chart;
  height?: number;
  category?: string;
  children?: React.ReactNode;
  toolbar?: React.ReactNode;
}) {
  const [fullscreen, setFullscreen] = React.useState(false);
  const [legend, setLegend] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const fullRef = React.useRef<HTMLDivElement>(null);
  const isImage = chart.engine === "image";

  async function getDataUrl(container: HTMLElement | null, format: "png" | "svg") {
    if (isImage) {
      const b64 = format === "svg" ? chart.image?.svg : chart.image?.png;
      return b64 ? `data:image/${format === "svg" ? "svg+xml" : "png"};base64,${b64}` : null;
    }
    if (!container) return null;
    return plotlyImage(container, format);
  }

  async function exportImage(format: "png" | "svg", container: HTMLElement | null) {
    try {
      const url = await getDataUrl(container, format);
      if (!url) return toast.error("Nothing to export yet.");
      downloadDataUrl(url, `${chart.id}.${format}`);
    } catch {
      toast.error("Export failed.");
    }
  }

  async function exportPdf(container: HTMLElement | null) {
    const url = await getDataUrl(container, "png");
    if (!url) return toast.error("Nothing to export yet.");
    printPdf(url, chart.title);
  }

  async function copyChart(container: HTMLElement | null) {
    const url = await getDataUrl(container, "png");
    if (!url) return;
    const ok = await copyImage(url);
    if (ok) {
      setCopied(true);
      toast.success("Chart copied to clipboard.");
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Clipboard not available in this browser.");
    }
  }

  const ExportMenu = ({ container }: { container: React.RefObject<HTMLDivElement> }) => (
    <DropdownMenu
      trigger={
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Export">
          <Download className="h-3.5 w-3.5" />
        </Button>
      }
    >
      <DropdownItem onClick={() => exportImage("png", container.current)}>
        Download PNG
      </DropdownItem>
      <DropdownItem onClick={() => exportImage("svg", container.current)}>
        Download SVG
      </DropdownItem>
      <DropdownItem onClick={() => exportPdf(container.current)}>Print / PDF</DropdownItem>
      {!isImage && (chart.data?.length ?? 0) > 0 && (
        <>
          <DropdownSeparator />
          <DropdownItem onClick={() => downloadCsv(chart)}>Download data (CSV)</DropdownItem>
        </>
      )}
    </DropdownMenu>
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <Card className="flex h-full flex-col">
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div className="min-w-0">
              <CardTitle className="truncate text-sm">{chart.title}</CardTitle>
              {category && (
                <Badge variant="secondary" className="mt-1 text-[10px]">
                  {category}
                </Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {toolbar}
              {!isImage && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title={legend ? "Hide legend" : "Show legend"}
                  onClick={() => setLegend((v) => !v)}
                >
                  {legend ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Copy image"
                onClick={() => copyChart(bodyRef.current)}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              <ExportMenu container={bodyRef} />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Fullscreen"
                onClick={() => setFullscreen(true)}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <div ref={bodyRef}>
              <ChartBody chart={chart} height={height} showLegend={legend} />
            </div>
            {chart.ai_explanation && <AiExplanation>{chart.ai_explanation}</AiExplanation>}
            {children}
          </CardContent>
        </Card>
      </motion.div>

      <Dialog
        open={fullscreen}
        onOpenChange={setFullscreen}
        title={chart.title}
        description={chart.summary}
        className="max-w-5xl"
      >
        <div className="space-y-3" ref={fullRef}>
          <div className="flex justify-end gap-1">
            <ExportMenu container={fullRef} />
          </div>
          <ChartBody chart={chart} height={560} showLegend={legend} />
          {chart.ai_explanation && <AiExplanation>{chart.ai_explanation}</AiExplanation>}
        </div>
      </Dialog>
    </>
  );
}
