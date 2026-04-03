"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Info, Sparkles } from "lucide-react";

import type {
  ModStackValidationResult,
  ModValidationIssue,
} from "@/lib/reforger/mod-stack-analysis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function severityStyles(sev: ModValidationIssue["severity"]) {
  switch (sev) {
    case "error":
      return "border-red-500/35 bg-red-500/[0.06] text-red-800 dark:text-red-200";
    case "warn":
      return "border-amber-500/35 bg-amber-500/[0.06] text-amber-900 dark:text-amber-100";
    default:
      return "border-border/60 bg-muted/30 text-muted-foreground";
  }
}

function badgeVariant(sev: ModValidationIssue["severity"]) {
  switch (sev) {
    case "error":
      return "destructive" as const;
    case "warn":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export function formatModStackSummaryLine(result: ModStackValidationResult | null): string {
  if (!result || result.issues.length === 0) return "No stack issues detected.";
  const { summary } = result;
  const parts: string[] = [];
  if (summary.errors > 0) parts.push(`${summary.errors} error${summary.errors === 1 ? "" : "s"}`);
  if (summary.warnings > 0) parts.push(`${summary.warnings} warning${summary.warnings === 1 ? "" : "s"}`);
  if (summary.duplicates > 0) parts.push(`${summary.duplicates} duplicate`);
  if (summary.missingDependencies > 0) parts.push(`${summary.missingDependencies} missing dep`);
  if (summary.conflicts > 0) parts.push(`${summary.conflicts} known conflict`);
  return parts.join(" · ");
}

type Props = {
  result: ModStackValidationResult | null;
  loading?: boolean;
  /** Smaller one-liner for dashboard / tight layouts */
  compact?: boolean;
  title?: string;
  /** Extra actions e.g. “Deep workshop check” */
  extraActions?: React.ReactNode;
};

export function ModStackValidationPanel({
  result,
  loading,
  compact,
  title = "Mod stack check",
  extraActions,
}: Props) {
  const [open, setOpen] = useState(false);

  const sorted = useMemo(() => {
    if (!result?.issues.length) return [];
    const rank = { error: 0, warn: 1, info: 2 } as const;
    return [...result.issues].sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [result]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Checking mod stack…
      </div>
    );
  }

  if (!result || result.issues.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">
              No structural issues from this pass (Workshop dependency data may still be incomplete until you run a
              deep check).
            </p>
          </div>
        </div>
        {extraActions ? <div className="flex shrink-0 gap-2">{extraActions}</div> : null}
      </div>
    );
  }

  const hasErrors = result.summary.errors > 0;

  if (compact) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs",
          hasErrors ? "border-red-500/40 bg-red-500/[0.07]" : "border-amber-500/35 bg-amber-500/[0.06]",
        )}
      >
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{formatModStackSummaryLine(result)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-card/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={cn("size-4", hasErrors ? "text-red-500" : "text-amber-500")}
              aria-hidden
            />
            <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{formatModStackSummaryLine(result)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {extraActions}
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Details"}
            <ChevronDown className={cn("ml-1 size-3 transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      </div>

      <ul className="space-y-2">
        {sorted.slice(0, open ? sorted.length : Math.min(4, sorted.length)).map((issue) => (
          <li
            key={issue.key}
            className={cn("rounded-xl border px-3 py-2.5 text-sm", severityStyles(issue.severity))}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={badgeVariant(issue.severity)} className="text-[10px] font-normal uppercase">
                {issue.severity}
              </Badge>
              <span className="font-medium">{issue.title}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed opacity-95">{issue.message}</p>
            {issue.suggestedFix ? (
              <p className="mt-1.5 flex items-start gap-1 text-[11px] text-muted-foreground">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                {issue.suggestedFix}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {!open && sorted.length > 4 ? (
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => setOpen(true)}
        >
          Show {sorted.length - 4} more…
        </button>
      ) : null}
    </div>
  );
}
