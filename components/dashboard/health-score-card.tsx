"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, ChevronDown } from "lucide-react";

import { Hint } from "@/components/dashboard/hint";
import type { HealthScoreResult } from "@/lib/reforger/health-score";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TREND_KEY = "reforger-health-score-trend";
const MAX_TREND = 5;

export type HealthScoreTrendPoint = { score: number; at: string };

function statusAccent(status: HealthScoreResult["status"]): {
  ring: string;
  text: string;
  glow: string;
  bar: string;
} {
  switch (status) {
    case "Healthy":
      return {
        ring: "stroke-emerald-500",
        text: "text-emerald-600 dark:text-emerald-400",
        glow: "shadow-emerald-500/20",
        bar: "bg-emerald-500",
      };
    case "Warning":
      return {
        ring: "stroke-amber-400",
        text: "text-amber-700 dark:text-amber-300",
        glow: "shadow-amber-500/15",
        bar: "bg-amber-400",
      };
    case "Degraded":
      return {
        ring: "stroke-orange-500",
        text: "text-orange-700 dark:text-orange-300",
        glow: "shadow-orange-500/15",
        bar: "bg-orange-500",
      };
    case "Critical":
    case "Down":
      return {
        ring: "stroke-red-500",
        text: "text-red-600 dark:text-red-400",
        glow: "shadow-red-500/20",
        bar: "bg-red-500",
      };
    default:
      return {
        ring: "stroke-muted-foreground",
        text: "text-muted-foreground",
        glow: "shadow-muted/20",
        bar: "bg-muted-foreground",
      };
  }
}

function CircularRing({
  score,
  className,
  accentClass,
}: {
  score: number;
  className?: string;
  accentClass: string;
}) {
  const pct = Math.min(100, Math.max(0, score));
  const radius = 52;
  const stroke = 8;
  const c = 2 * Math.PI * radius;
  const dash = (pct / 100) * c;

  return (
    <svg
      viewBox="0 0 120 120"
      className={cn("size-32 shrink-0 sm:size-36", className)}
      aria-hidden
    >
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-muted/25"
      />
      <motion.circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        className={cn(accentClass, "origin-center -rotate-90")}
        initial={{ strokeDasharray: `0 ${c}` }}
        animate={{ strokeDasharray: `${dash} ${c}` }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
      />
    </svg>
  );
}

export function HealthScoreCard({
  healthScore,
  loading,
  refreshTick,
}: {
  healthScore: HealthScoreResult | null | undefined;
  loading: boolean;
  /** Increments on each successful dashboard snapshot refresh (for trend samples). */
  refreshTick: number;
}) {
  const [trend, setTrend] = useState<HealthScoreTrendPoint[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TREND_KEY);
      if (raw) setTrend(JSON.parse(raw) as HealthScoreTrendPoint[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!healthScore || loading || refreshTick < 1) return;
    const point: HealthScoreTrendPoint = { score: healthScore.score, at: new Date().toISOString() };
    setTrend((prev) => {
      const next = [...prev, point].slice(-MAX_TREND);
      try {
        localStorage.setItem(TREND_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [healthScore, loading, refreshTick]);

  const accent = useMemo(
    () => statusAccent(healthScore?.status ?? "Healthy"),
    [healthScore?.status],
  );

  if (loading && !healthScore) {
    return (
      <Card className="overflow-hidden rounded-2xl border-border/80 bg-gradient-to-br from-card via-card to-muted/20">
        <CardContent className="flex min-h-[10rem] items-center justify-center p-6 text-sm text-muted-foreground">
          Calculating health…
        </CardContent>
      </Card>
    );
  }

  if (!healthScore) {
    return null;
  }

  const { score, status, summary, factors, penalties } = healthScore;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card
        className={cn(
          "overflow-hidden rounded-2xl border-border/80 bg-gradient-to-br from-card via-card to-muted/20 shadow-lg",
          accent.glow,
        )}
      >
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
            <div className="relative flex min-w-0 flex-1 items-center gap-5">
              <div className="relative">
                <CircularRing score={score} accentClass={accent.ring} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <motion.span
                    key={score}
                    initial={{ scale: 0.92, opacity: 0.6 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl"
                  >
                    {score}
                  </motion.span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    / 100
                  </span>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Activity className="size-4 text-primary" aria-hidden />
                  <h3 className="text-lg font-semibold tracking-tight">Server health</h3>
                  <Hint label="Starts at 100 and subtracts points for missing process, ports, log patterns, and high CPU/RAM/disk. Log penalties are capped at 45 points total. Critical log patterns force status to Critical." />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <Badge
                    variant="outline"
                    className={cn("border font-medium", accent.text)}
                  >
                    {status}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
                <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted/60">
                  <motion.div
                    className={cn("h-full rounded-full", accent.bar)}
                    initial={{ width: 0 }}
                    animate={{ width: `${score}%` }}
                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                  />
                </div>
              </div>
            </div>

            {trend.length > 1 ? (
              <div className="shrink-0 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Recent trend
                </p>
                <div className="flex items-end gap-1">
                  {trend.map((p, i) => (
                    <div
                      key={`${p.at}-${i}`}
                      className="flex flex-col items-center gap-0.5"
                      title={new Date(p.at).toLocaleString()}
                    >
                      <div
                        className="w-5 rounded-t bg-primary/40"
                        style={{ height: `${Math.max(4, (p.score / 100) * 32)}px` }}
                      />
                      <span className="font-mono text-[9px] text-muted-foreground">{p.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <details className="group mt-5 border-t border-border/50 pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
              Factors &amp; penalties
            </summary>
            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
                <p className="mb-2 font-medium text-foreground">Signals</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>Process: {factors.process ? "running" : "not seen"}</li>
                  <li>
                    Game UDP: {factors.ports.game ? "bound" : "not seen"} · A2S:{" "}
                    {factors.ports.a2s ? "bound" : "not seen"}
                  </li>
                  <li>
                    Logs: {factors.logs.critical} critical, {factors.logs.errors} errors,{" "}
                    {factors.logs.warnings} warnings
                  </li>
                  {factors.system ? (
                    <li>
                      System: RAM {factors.system.memoryPercent ?? "—"}% · load{" "}
                      {factors.system.load != null ? factors.system.load.toFixed(2) : "—"} · disk{" "}
                      {factors.system.diskPercent ?? "—"}%
                    </li>
                  ) : null}
                </ul>
              </div>
              <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
                <p className="mb-2 font-medium text-foreground">Penalties applied</p>
                {penalties.length ? (
                  <ul className="list-inside list-disc text-muted-foreground">
                    {penalties.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">None — full score.</p>
                )}
              </div>
            </div>
          </details>
        </CardContent>
      </Card>
    </motion.div>
  );
}
