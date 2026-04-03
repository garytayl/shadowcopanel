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

function issueEmoji(sev: DetectedIssue["severity"]) {
  if (sev === "critical" || sev === "error") return "❌";
  return "⚠️";
}

export function LogAnalysisCard({
  analysis,
  title = "Log diagnostics",
  description = "Structured patterns from your server log tail — not a raw dump.",
  compact = false,
  variant = "default",
}: {
  analysis: LogAnalysisResult;
  title?: string;
  description?: string;
  /** Fewer paddings when nested (e.g. dashboard). */
  compact?: boolean;
  /** Compact expandable rows for Home dashboard. */
  variant?: "default" | "dashboard";
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

  if (variant === "dashboard" && issues.length > 0) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Alerts
        </p>
        <ul className="space-y-2">
          {issues.map((i) => (
            <li key={i.key}>
              <details className="group rounded-2xl border border-border/70 bg-muted/15 open:bg-muted/25">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <span aria-hidden>{issueEmoji(i.severity)}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{i.title}</span>
                  <Badge variant={severityVariant(i.severity)} className="shrink-0 text-[10px]">
                    {i.severity}
                  </Badge>
                </summary>
                <div className="space-y-2 border-t border-border/50 px-3 pb-3 pt-2 text-xs text-muted-foreground">
                  <p>{i.explanation}</p>
                  {i.likelyCause ? (
                    <p>
                      <span className="font-medium text-foreground/90">Likely: </span>
                      {i.likelyCause}
                    </p>
                  ) : null}
                  {i.suggestedFix ? (
                    <p>
                      <span className="font-medium text-foreground/90">Try: </span>
                      {i.suggestedFix}
                    </p>
                  ) : null}
                  {i.matchedText ? (
                    <pre className="max-h-20 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[10px]">
                      {i.matchedText}
                    </pre>
                  ) : null}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    );
  }

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
