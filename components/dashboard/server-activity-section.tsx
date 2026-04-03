"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ChevronRight, Circle } from "lucide-react";

import { listActivityEventsAction } from "@/lib/actions/activity";
import type { ServerActivitySnapshot } from "@/lib/actions/dashboard";
import type { ActivityEvent } from "@/lib/activity/types";
import type { RuntimeEvent } from "@/lib/reforger/runtime-events";
import type { RuntimeTruthResult } from "@/lib/reforger/runtime-truth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function stateBadgeClass(state: string): string {
  switch (state) {
    case "ready":
      return "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "warning":
      return "border-amber-500/45 bg-amber-500/10 text-amber-900 dark:text-amber-200";
    case "failed":
      return "border-red-500/45 bg-red-500/10 text-red-800 dark:text-red-200";
    case "idle":
      return "border-border bg-muted/40 text-muted-foreground";
    default:
      return "border-primary/40 bg-primary/10 text-primary";
  }
}

function severityDot(sev: RuntimeEvent["severity"] | ActivityEvent["severity"]): string {
  switch (sev) {
    case "success":
      return "bg-emerald-500";
    case "error":
      return "bg-red-500";
    case "warn":
      return "bg-amber-500";
    default:
      return "bg-sky-500";
  }
}

type MergedRow =
  | { kind: "panel"; ev: ActivityEvent }
  | { kind: "derived"; ev: RuntimeEvent };

export function ServerActivitySection({
  serverActivity,
  runtimeTruth,
  checkPort,
  loading,
  refreshTick,
  processRunning,
  tmuxActive,
  gamePortBound,
  a2sPortBound,
}: {
  serverActivity: ServerActivitySnapshot | undefined;
  runtimeTruth: RuntimeTruthResult | undefined;
  checkPort: number;
  loading: boolean;
  refreshTick: number;
  processRunning: boolean;
  tmuxActive: boolean;
  gamePortBound: boolean;
  a2sPortBound: boolean;
}) {
  const [panelEvents, setPanelEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await listActivityEventsAction(14);
      if (cancelled || !r.ok) return;
      setPanelEvents(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const merged = useMemo(() => {
    const rows: MergedRow[] = [];
    const titles = new Set<string>();
    for (const ev of panelEvents.slice(0, 8)) {
      rows.push({ kind: "panel", ev });
      titles.add(ev.title.trim().toLowerCase());
    }
    if (serverActivity?.events?.length) {
      for (const ev of serverActivity.events) {
        const t = ev.title.trim().toLowerCase();
        if (titles.has(t)) continue;
        titles.add(t);
        rows.push({ kind: "derived", ev });
        if (rows.length >= 14) break;
      }
    }
    return rows;
  }, [panelEvents, serverActivity?.events]);

  const st = serverActivity?.state;

  if (loading && !serverActivity) {
    return (
      <Card className="rounded-2xl border-border/70 bg-gradient-to-br from-card/90 to-muted/5">
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Loading server activity…</p>
        </CardContent>
      </Card>
    );
  }

  if (!st) return null;

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 bg-gradient-to-br from-zinc-950/40 via-card to-card shadow-md ring-1 ring-white/5">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Activity className="size-4 text-primary" aria-hidden />
            <h3 className="text-sm font-semibold tracking-tight">What the server is doing</h3>
            <Badge variant="outline" className={cn("font-semibold", stateBadgeClass(st.state))}>
              {st.title}
            </Badge>
            {st.confidence ? (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {st.confidence} confidence
              </span>
            ) : null}
          </div>
          <Link
            href="/activity"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Full timeline
            <ChevronRight className="size-3.5 opacity-70" aria-hidden />
          </Link>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{st.message}</p>

        {runtimeTruth ? (
          <div className="space-y-2 rounded-xl border border-border/50 bg-muted/10 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">Runtime truth</span>
              <Badge variant="outline" className="font-normal">
                Startup: {runtimeTruth.startupState}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "font-normal",
                  runtimeTruth.joinability === "likely_joinable"
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                    : runtimeTruth.joinability === "not_joinable"
                      ? "border-red-500/40 text-red-700 dark:text-red-300"
                      : "border-border text-muted-foreground",
                )}
              >
                Joinability: {runtimeTruth.joinability.replace(/_/g, " ")}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "font-normal",
                  runtimeTruth.a2sStatus === "ok"
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                    : runtimeTruth.a2sStatus === "failed"
                      ? "border-red-500/40 text-red-700 dark:text-red-300"
                      : "border-border text-muted-foreground",
                )}
              >
                A2S: {runtimeTruth.a2sStatus}
              </Badge>
            </div>
            {(runtimeTruth.advertisedAddress || runtimeTruth.expectedPublicAddress) && (
              <p className="text-[11px] text-muted-foreground">
                {runtimeTruth.advertisedAddress ? (
                  <>
                    <span className="font-medium text-foreground">Log registration: </span>
                    {runtimeTruth.advertisedAddress}
                  </>
                ) : null}
                {runtimeTruth.expectedPublicAddress ? (
                  <>
                    {runtimeTruth.advertisedAddress ? " · " : null}
                    <span className="font-medium text-foreground">config publicAddress: </span>
                    {runtimeTruth.expectedPublicAddress}
                  </>
                ) : null}
              </p>
            )}
            <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px]">
              {runtimeTruth.findings.map((f) => (
                <li
                  key={f.key}
                  className={cn(
                    "flex gap-2 rounded-lg border px-2 py-1.5",
                    f.status === "fail"
                      ? "border-red-500/35 bg-red-500/10 text-red-100"
                      : f.status === "warn"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                        : "border-border/40 bg-background/20 text-muted-foreground",
                  )}
                >
                  <span className="shrink-0 font-mono text-[10px] uppercase opacity-80">{f.status}</span>
                  <span>{f.message}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] font-medium text-foreground">{runtimeTruth.summary}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Chip ok={processRunning} label="Process" />
          <Chip ok={tmuxActive} label="tmux" />
          <Chip ok={gamePortBound} label={`UDP ${checkPort}`} />
          <Chip ok={a2sPortBound} label="UDP 17777" />
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Recent signals
          </p>
          <ul className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
            {merged.slice(0, 12).map((row, i) => {
              if (row.kind === "panel") {
                const ev = row.ev;
                return (
                  <li
                    key={`p-${ev.id}`}
                    className="flex gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs"
                  >
                    <span
                      className={cn("mt-1 size-2 shrink-0 rounded-full", severityDot(ev.severity))}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-foreground">{ev.title}</span>
                        <time className="tabular-nums text-[10px] text-muted-foreground">
                          {new Date(ev.timestamp).toLocaleString()}
                        </time>
                      </div>
                      {ev.message ? (
                        <p className="mt-0.5 line-clamp-2 text-muted-foreground">{ev.message}</p>
                      ) : null}
                      <span className="text-[10px] text-muted-foreground/80">Panel action</span>
                    </div>
                  </li>
                );
              }
              const ev = row.ev;
              return (
                <li
                  key={`d-${ev.id}-${i}`}
                  className="flex gap-2 rounded-xl border border-border/40 bg-background/30 px-3 py-2 text-xs"
                >
                  <span
                    className={cn("mt-1 size-2 shrink-0 rounded-full", severityDot(ev.severity))}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{ev.title}</span>
                    {ev.message ? (
                      <p className="mt-0.5 line-clamp-2 text-muted-foreground">{ev.message}</p>
                    ) : null}
                    <span className="text-[10px] capitalize text-muted-foreground/90">
                      {ev.source ?? "logs"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {merged.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent panel or log-derived events yet.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        ok
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
          : "border-border/60 bg-muted/30 text-muted-foreground",
      )}
    >
      <Circle
        className={cn("size-2 shrink-0 fill-current", ok ? "text-emerald-500" : "text-muted-foreground/50")}
        aria-hidden
      />
      {label}
    </span>
  );
}
