"use client";

import type { DetectedIssue, LogAnalysisResult } from "@/lib/reforger/log-analysis";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function severityVariant(
  s: DetectedIssue["severity"],
): "default" | "secondary" | "destructive" | "outline" {
  if (s === "critical" || s === "error") return "destructive";
  if (s === "warn") return "secondary";
  return "outline";
}

export function LogAnalysisCard({
  analysis,
  title = "Log diagnostics",
  description = "Structured patterns from your server log tail — not a raw dump.",
  compact = false,
}: {
  analysis: LogAnalysisResult;
  title?: string;
  description?: string;
  /** Fewer paddings when nested (e.g. dashboard). */
  compact?: boolean;
}) {
  const { summary, issues } = analysis;
  const hi = summary.highestSeverity;
  const summaryBadgeVariant: "default" | "secondary" | "destructive" | "outline" =
    hi === "none"
      ? "default"
      : hi === "critical" || hi === "error"
        ? "destructive"
        : hi === "warn"
          ? "secondary"
          : "outline";

  return (
    <Card className={compact ? "rounded-2xl border-border/80" : "rounded-2xl border-border/80"}>
      <CardHeader className={compact ? "pb-2" : ""}>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant={summaryBadgeVariant}>
            Highest: {hi === "none" ? "none detected" : hi}
          </Badge>
          <Badge variant="outline">{summary.totalIssues} pattern(s)</Badge>
          {summary.hasFatal ? (
            <Badge variant="destructive" className="font-normal">
              Fatal pattern
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No known failure signatures matched this slice of logs.
          </p>
        ) : (
          <ul className="space-y-3">
            {issues.map((i) => (
              <li
                key={i.key}
                className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm leading-relaxed"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant={severityVariant(i.severity)} className="font-normal">
                    {i.severity}
                  </Badge>
                  <span className="font-medium text-foreground">{i.title}</span>
                </div>
                <p className="text-muted-foreground">{i.explanation}</p>
                {i.likelyCause ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/90">Likely cause: </span>
                    {i.likelyCause}
                  </p>
                ) : null}
                {i.suggestedFix ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/90">Try: </span>
                    {i.suggestedFix}
                  </p>
                ) : null}
                {i.matchedText ? (
                  <pre className="mt-2 max-h-24 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground">
                    {i.matchedText}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
