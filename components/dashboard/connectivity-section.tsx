"use client";

import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Minus,
  Network,
  Radio,
  Shield,
} from "lucide-react";

import {
  computeJoinabilityPreview,
  hostsEffectivelyMatch,
} from "@/lib/connectivity/joinability-model";
import {
  classifyControlLinkMs,
  controlLinkQualityLabel,
} from "@/lib/connectivity/control-link-labels";
import type { DashboardSnapshot } from "@/lib/actions/dashboard";
import type { JoinabilityResult } from "@/lib/types/connectivity";
import { parseDfRootLine, parseFreeMemM, parseLoad1m } from "@/lib/utils/dashboard-metrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Hint } from "@/components/dashboard/hint";
import {
  getControlLinkStats,
  LatencySparkline,
  type ControlLinkTrend,
} from "@/components/dashboard/latency-sparkline";
import { MetricBar } from "@/components/dashboard/metric-bar";
import { cn } from "@/lib/utils";

function PortBadge({ status, protocol }: { status: string; protocol: "udp" | "tcp" }) {
  const variant =
    status === "listening"
      ? "default"
      : status === "unknown"
        ? "secondary"
        : "destructive";
  const label =
    status === "listening"
      ? protocol === "udp"
        ? "Bound"
        : "Listening"
      : status === "unknown"
        ? "Unknown"
        : "Not seen";
  return (
    <Badge variant={variant} className="font-normal">
      {label}
    </Badge>
  );
}

function JoinBadge({ overall }: { overall: string }) {
  const map: Record<string, { className: string; label: string }> = {
    healthy: {
      className:
        "border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      label: "Healthy",
    },
    warning: {
      className: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
      label: "Needs review",
    },
    broken: {
      className: "border-red-500/45 bg-red-500/10 text-red-700 dark:text-red-400",
      label: "Broken",
    },
    unknown: {
      className: "border-border bg-muted/40 text-muted-foreground",
      label: "Unknown",
    },
  };
  const m = map[overall] ?? map.unknown;
  return (
    <Badge variant="outline" className={cn("font-medium", m.className)}>
      {m.label}
    </Badge>
  );
}

function TrendIcon({ t }: { t: ControlLinkTrend }) {
  if (t === "up") return <ArrowUpRight className="size-3.5 text-amber-500" aria-hidden />;
  if (t === "down") return <ArrowDownRight className="size-3.5 text-emerald-500" aria-hidden />;
  return <Minus className="size-3.5 text-muted-foreground" aria-hidden />;
}

export function ConnectivitySection({
  snap,
  loading,
  history,
  publicAddr,
  joinResult,
  joinLoading,
  syncLoading,
  onRunJoinCheck,
  onSyncPublicIp,
}: {
  snap: DashboardSnapshot | null;
  loading: boolean;
  history: number[];
  publicAddr: string | null;
  joinResult: JoinabilityResult | null;
  joinLoading: boolean;
  syncLoading: boolean;
  onRunJoinCheck: () => void;
  onSyncPublicIp: () => void;
}) {
  const st = snap?.status;
  const s = snap?.settings;
  const ms = st?.controlLinkRoundTripMs;
  const quality = classifyControlLinkMs(ms);
  const stats = useMemo(() => getControlLinkStats(history), [history]);

  const mem = snap?.health?.free ? parseFreeMemM(snap.health.free) : null;
  const disk = snap?.system?.diskRoot ? parseDfRootLine(snap.system.diskRoot) : null;
  const load = snap?.system?.loadavg ? parseLoad1m(snap.system.loadavg) : null;

  const preview =
    snap && st && s?.host
      ? computeJoinabilityPreview({
          status: st,
          controlRoundTripMs: ms,
          portChecks: snap.portChecks ?? [],
          publicAddressMatch:
            publicAddr && publicAddr.length > 0
              ? hostsEffectivelyMatch(publicAddr, s.host)
              : null,
          configPublicAddress: publicAddr,
          panelHost: s.host,
        })
      : null;

  const displayJoin = joinResult ?? preview;

  const ipMismatch = Boolean(
    publicAddr && s?.host && !hostsEffectivelyMatch(publicAddr, s.host),
  );

  return (
    <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-card/80 to-card/30 p-4 shadow-sm ring-1 ring-primary/[0.06] md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Network className="size-4 text-primary" aria-hidden />
            <h3 className="text-sm font-semibold tracking-tight">Latency & connectivity</h3>
            <Hint label="Control link is panel→server SSH time. Game ports show listening state from ss, not UDP RTT. True in-game ping is not measured here." />
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Honest labels: control round-trip vs socket visibility — not player ping.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="touch-manipulation"
            onClick={onRunJoinCheck}
            disabled={joinLoading || !s?.configured}
          >
            {joinLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Shield className="mr-2 size-4" />}
            Joinability check
          </Button>
          {ipMismatch ? (
            <Button
              size="sm"
              variant="outline"
              className="touch-manipulation border-amber-500/40"
              onClick={onSyncPublicIp}
              disabled={syncLoading}
            >
              {syncLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Sync public address
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Control link */}
        <Card className="border-border/60 bg-background/40">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Radio className="size-3.5 text-primary/90" aria-hidden />
                Control link latency
                <Hint label="Time for the panel to run a tiny command over SSH. Useful for operator UX, not gameplay ping." />
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "font-normal",
                  quality === "good" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
                  quality === "moderate" && "border-amber-500/40 text-amber-700 dark:text-amber-300",
                  quality === "slow" && "border-red-500/40 text-red-600 dark:text-red-400",
                )}
              >
                {controlLinkQualityLabel(quality)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <p className="text-2xl font-semibold tabular-nums tracking-tight">
                  {loading && !snap ? "…" : ms != null ? `${Math.round(ms)}` : "—"}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">ms</span>
                </p>
                <p className="text-[10px] text-muted-foreground">current sample</p>
              </div>
              <div>
                <p className="text-lg font-medium tabular-nums text-muted-foreground">
                  {stats.avg != null ? `${stats.avg}` : "—"}
                  <span className="ml-1 text-xs">ms avg</span>
                </p>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <TrendIcon t={stats.trend} />
                  <span>trend</span>
                </div>
              </div>
              <div className="ml-auto">
                <LatencySparkline values={history} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Game ports */}
        <Card className="border-border/60 bg-background/40">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Activity className="size-3.5 text-primary/90" aria-hidden />
              Game port visibility
              <Hint label="Parsed from ss -tuanp (all states). UDP often shows UNCONN, not LISTEN — both count as bound here. Not a packet RTT test." />
            </div>
            <div className="flex flex-wrap gap-3">
              {(snap?.portChecks ?? []).map((p) => (
                <div
                  key={`${p.protocol}-${p.port}`}
                  className="flex min-w-[7rem] flex-col gap-1 rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.protocol.toUpperCase()} {p.port}
                  </span>
                  <PortBadge status={p.status} protocol={p.protocol} />
                  {p.processName ? (
                    <span className="text-[10px] text-muted-foreground" title={p.detail}>
                      {p.processName}
                    </span>
                  ) : null}
                </div>
              ))}
              {!snap?.portChecks?.length && (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Load context */}
        <Card className="border-border/60 bg-background/40 lg:col-span-1">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Activity className="size-3.5 text-primary/90" aria-hidden />
              Server load context
              <Hint label="Snapshot from the last refresh." />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Memory</span>
                  {mem ? <span>{mem.usedPct}%</span> : null}
                </div>
                <MetricBar
                  value={mem?.usedPct ?? 0}
                  label={mem?.line}
                  tone={mem && mem.usedPct > 90 ? "danger" : mem && mem.usedPct > 75 ? "warn" : "default"}
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Disk /</span>
                  {disk ? <span>{disk.usedPct}%</span> : null}
                </div>
                <MetricBar
                  value={disk?.usedPct ?? 0}
                  label={disk?.line}
                  tone={disk && disk.usedPct > 90 ? "danger" : disk && disk.usedPct > 80 ? "warn" : "default"}
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Load</span>
                  {load ? <span>{load.label}</span> : null}
                </div>
                <MetricBar
                  value={load?.pct ?? 0}
                  label={snap?.system.loadavg}
                  tone={load && load.pct > 85 ? "warn" : "default"}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Joinability */}
        <Card className="border-border/60 bg-background/40 lg:col-span-1">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Shield className="size-3.5 text-primary/90" aria-hidden />
                Joinability (heuristic)
                <Hint label="Combines process, tmux, ports, and config IP vs panel host. Run full check for log scan." />
              </div>
              {displayJoin ? <JoinBadge overall={displayJoin.overall} /> : null}
            </div>
            {publicAddr && s?.host && !joinResult ? (
              <p className="text-[11px] text-muted-foreground">
                config publicAddress:{" "}
                <span className="font-mono text-foreground/90">{publicAddr}</span>
                {ipMismatch ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="size-3" aria-hidden />
                    Mismatch vs panel host
                  </span>
                ) : null}
              </p>
            ) : null}
            {joinResult ? (
              <ul className="space-y-2 text-[11px]">
                {joinResult.checks.slice(0, 8).map((c) => (
                  <li key={c.key} className="flex gap-2">
                    {c.status === "pass" ? (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                    ) : c.status === "fail" ? (
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-500" />
                    ) : (
                      <HelpCircle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    )}
                    <span>
                      <span className="font-medium text-foreground">{c.label}:</span> {c.message}
                    </span>
                  </li>
                ))}
              </ul>
            ) : preview ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {preview.suggestions[0] ?? "Run joinability check for log-assisted diagnostics."}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">—</p>
            )}
            {joinResult?.suggestions?.length ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">Next steps: </span>
                {joinResult.suggestions.join(" · ")}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
