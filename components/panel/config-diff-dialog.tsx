"use client";

import { useMemo, useState } from "react";
import { ChevronDown, GitCompare, ShieldAlert } from "lucide-react";

import {
  type ConfigDiffResult,
  formatDiffValue,
} from "@/lib/reforger/config-diff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function kindStyles(kind: ConfigDiffResult["entries"][0]["kind"]) {
  switch (kind) {
    case "added":
      return "border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-900 dark:text-emerald-100";
    case "removed":
      return "border-red-500/35 bg-red-500/[0.08] text-red-900 dark:text-red-100";
    default:
      return "border-amber-500/35 bg-amber-500/[0.08] text-amber-950 dark:text-amber-100";
  }
}

function groupEntries(entries: ConfigDiffResult["entries"]) {
  const mods: typeof entries = [];
  const rest: typeof entries = [];
  for (const e of entries) {
    if (e.path.includes("game.mods") || e.path.includes("load order")) mods.push(e);
    else rest.push(e);
  }
  return { mods, rest };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: ConfigDiffResult | null;
  title?: string;
  description?: string;
  onConfirm: () => void;
  confirmLabel?: string;
  /** Optional pretty JSON for advanced users */
  rawBefore?: string;
  rawAfter?: string;
};

export function ConfigDiffDialog({
  open,
  onOpenChange,
  diff,
  title = "Review changes",
  description = "This is what will be written to your remote config.json after normalization.",
  onConfirm,
  confirmLabel = "Save to server",
  rawBefore,
  rawAfter,
}: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const grouped = useMemo(() => (diff ? groupEntries(diff.entries) : { mods: [], rest: [] }), [diff]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,720px)] max-w-[min(100%,42rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton
      >
        <div className="border-b border-border/60 bg-gradient-to-br from-muted/40 to-transparent px-5 py-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <GitCompare className="size-4 text-primary" aria-hidden />
              {title}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">{description}</DialogDescription>
          </DialogHeader>
          {diff && diff.riskNotes.length > 0 ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-950 dark:text-amber-50">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <div>
                <p className="font-medium">Heads up</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] opacity-95">
                  {diff.riskNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          {diff ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary" className="font-normal tabular-nums">
                {diff.summary.total} change{diff.summary.total === 1 ? "" : "s"}
              </Badge>
              {diff.summary.added > 0 ? (
                <Badge className="border-emerald-500/40 bg-emerald-600/15 font-normal text-emerald-800 dark:text-emerald-200">
                  +{diff.summary.added} added
                </Badge>
              ) : null}
              {diff.summary.removed > 0 ? (
                <Badge variant="destructive" className="font-normal">
                  −{diff.summary.removed} removed
                </Badge>
              ) : null}
              {diff.summary.changed > 0 ? (
                <Badge className="border-amber-500/40 bg-amber-500/15 font-normal text-amber-900 dark:text-amber-100">
                  ~{diff.summary.changed} changed
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="max-h-[min(52vh,480px)] overflow-y-auto px-5 py-4">
          {!diff || diff.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No differences to show.</p>
          ) : (
            <div className="space-y-6">
              {grouped.mods.length > 0 ? (
                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Workshop mods
                  </p>
                  <ul className="space-y-2">
                    {grouped.mods.map((e, i) => (
                      <li
                        key={`mod-${i}-${e.path}-${e.kind}`}
                        className={cn("rounded-xl border px-3 py-2.5 text-sm", kindStyles(e.kind))}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase opacity-80">{e.kind}</span>
                          <span className="font-medium">{e.label ?? e.path}</span>
                        </div>
                        {e.kind === "changed" && (e.before !== undefined || e.after !== undefined) ? (
                          <p className="mt-1.5 font-mono text-[11px] leading-relaxed opacity-95">
                            <span className="text-red-600/90 line-through dark:text-red-400/90">
                              {formatDiffValue(e.before)}
                            </span>
                            <span className="mx-1.5 text-muted-foreground">→</span>
                            <span className="text-emerald-600 dark:text-emerald-400">{formatDiffValue(e.after)}</span>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {grouped.rest.length > 0 ? (
                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Config
                  </p>
                  <ul className="space-y-2">
                    {grouped.rest.map((e, i) => (
                      <li
                        key={`rest-${i}-${e.path}-${e.kind}`}
                        className={cn("rounded-xl border px-3 py-2.5 text-sm", kindStyles(e.kind))}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="text-[10px] font-semibold uppercase opacity-80">{e.kind}</span>
                          <code className="text-[11px] text-foreground/90">{e.path || "(root)"}</code>
                        </div>
                        {e.label ? <p className="mt-0.5 text-xs font-medium">{e.label}</p> : null}
                        {e.kind === "changed" ? (
                          <p className="mt-1.5 font-mono text-[11px] leading-relaxed">
                            <span className="text-red-600/90 line-through dark:text-red-400/90">
                              {formatDiffValue(e.before)}
                            </span>
                            <span className="mx-1.5 text-muted-foreground">→</span>
                            <span className="text-emerald-600 dark:text-emerald-400">{formatDiffValue(e.after)}</span>
                          </p>
                        ) : e.kind === "added" ? (
                          <p className="mt-1 font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                            {formatDiffValue(e.after)}
                          </p>
                        ) : (
                          <p className="mt-1 font-mono text-[11px] text-red-700 line-through dark:text-red-300">
                            {formatDiffValue(e.before)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </div>

        {rawBefore != null && rawAfter != null ? (
          <div className="border-t border-border/50 px-5 py-2">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50"
              onClick={() => setShowRaw((s) => !s)}
            >
              Raw JSON (before / after)
              <ChevronDown className={cn("size-4 transition-transform", showRaw && "rotate-180")} />
            </button>
            {showRaw ? (
              <div className="mt-2 grid max-h-48 gap-2 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-2 md:grid-cols-2">
                <pre className="overflow-auto text-[10px] leading-relaxed whitespace-pre-wrap">{rawBefore}</pre>
                <pre className="overflow-auto text-[10px] leading-relaxed whitespace-pre-wrap">{rawAfter}</pre>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-border/60 bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!diff || diff.entries.length === 0}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
