"use client";

import { Badge } from "@/components/ui/badge";
import { LogAnalysisCard } from "@/components/panel/log-analysis-card";
import type { SafeRestartResult } from "@/lib/types/safe-restart";

const REASON_LABEL: Record<NonNullable<SafeRestartResult["reason"]>, string> = {
  manual: "Manual",
  after_config_save: "After config save",
  after_mod_change: "After mod change",
  after_repair: "After repair",
};

export function SafeRestartPanel({
  result,
  checkPort = 2001,
}: {
  result: SafeRestartResult;
  /** Game UDP port label (panel check port). */
  checkPort?: number;
}) {
  const level = result.level;
  const titleColor =
    level === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : level === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-destructive";

  return (
    <details className="rounded-2xl border border-primary/20 bg-gradient-to-b from-card/90 to-card/40 px-4 py-3 shadow-sm ring-1 ring-primary/10 open:ring-primary/20">
      <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-2">
          <span>Safe restart</span>
          <Badge variant={level === "success" ? "default" : level === "warning" ? "secondary" : "destructive"}>
            {level}
          </Badge>
          {result.reason ? (
            <span className="text-[11px] font-normal text-muted-foreground">
              {REASON_LABEL[result.reason]}
            </span>
          ) : null}
          <span className={titleColor}>{result.summary}</span>
        </span>
      </summary>
      <div className="mt-4 space-y-4 text-xs">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="mb-2 font-medium text-foreground">Before</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>Process: {result.before.processRunning ? "yes" : "no"}</li>
              <li>tmux: {result.before.tmuxActive ? "yes" : "no"}</li>
              <li>
                UDP :{checkPort} + :17777: {result.before.portsBound ? "both seen" : "not both"}
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="mb-2 font-medium text-foreground">After</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>Process: {result.after.processRunning ? "yes" : "no"}</li>
              <li>tmux: {result.after.tmuxActive ? "yes" : "no"}</li>
              <li>
                UDP :{checkPort} + :17777: {result.after.portsBound ? "both seen" : "not both"}
              </li>
            </ul>
          </div>
        </div>
        {result.configRepaired ? (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Config: </span>
            Normalized config was written before restart.
          </p>
        ) : null}
        {result.normalizationNotes && result.normalizationNotes.length > 0 ? (
          <div>
            <p className="mb-1 font-medium text-foreground">Normalization notes</p>
            <ul className="list-inside list-disc text-muted-foreground">
              {result.normalizationNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.detectedIssues && result.detectedIssues.length > 0 ? (
          <div>
            <p className="mb-1 font-medium text-foreground">Detected issues (post-restart)</p>
            <div className="flex flex-wrap gap-1.5">
              {result.detectedIssues.map((t) => (
                <Badge key={t} variant="outline" className="font-normal">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        {result.logAnalysis ? (
          <LogAnalysisCard
            analysis={result.logAnalysis}
            compact
            title="Post-restart log analysis"
            description="Patterns in the log tail after restart."
          />
        ) : null}
        <div>
          <p className="mb-2 font-medium text-foreground">Steps</p>
          <ul className="space-y-1">
            {result.steps.map((st, i) => (
              <li
                key={`${st.step}-${i}`}
                className="flex flex-wrap gap-2 border-b border-border/40 py-1 last:border-0"
              >
                <span
                  className={
                    st.status === "ok"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : st.status === "warn"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-destructive"
                  }
                >
                  [{st.status}]
                </span>
                <span className="font-medium text-foreground">{st.step}</span>
                {st.message ? <span className="text-muted-foreground">{st.message}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
