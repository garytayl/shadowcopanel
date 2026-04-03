"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ClipboardCopy,
  Cpu,
  Download,
  EthernetPort,
  FlaskConical,
  HardDrive,
  Loader2,
  Megaphone,
  Play,
  Power,
  RefreshCw,
  RotateCw,
  ScrollText,
  Server,
  Timer,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import {
  actionCheckHealth,
  actionCheckPorts,
  actionFetchLogs,
  actionRestartServer,
  actionStartServer,
  actionStopServer,
  fetchDashboardSnapshot,
  type DashboardSnapshot,
} from "@/lib/actions/dashboard";
import { actionFixServer } from "@/lib/actions/fix-server";
import { actionSafeRestart } from "@/lib/actions/safe-restart";
import { SafeRestartPanel } from "@/components/dashboard/safe-restart-panel";
import type { FixServerResult } from "@/lib/types/fix-server";
import type { SafeRestartReason, SafeRestartResult } from "@/lib/types/safe-restart";
import {
  actionRunJoinabilityCheck,
  actionSyncPublicAddressToPanelHost,
} from "@/lib/actions/connectivity";
import { loadModsAction } from "@/lib/actions/mods";
import { hostsEffectivelyMatch } from "@/lib/connectivity/joinability-model";
import type { JoinabilityResult } from "@/lib/types/connectivity";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConnectivitySection } from "@/components/dashboard/connectivity-section";
import { ServerActivitySection } from "@/components/dashboard/server-activity-section";
import { HealthScoreCard } from "@/components/dashboard/health-score-card";
import { LogAnalysisCard } from "@/components/panel/log-analysis-card";
import { ModStackValidationPanel } from "@/components/panel/mod-stack-validation-panel";
import type { ModStackValidationResult } from "@/lib/reforger/mod-stack-analysis";
import {
  readControlLinkHistory,
  recordControlLinkSample,
} from "@/components/dashboard/latency-sparkline";
import { PowerOrb, type PowerOrbPhase } from "@/components/dashboard/power-orb";
import { parseDfRootLine, parseFreeMemM, parseLoad1m } from "@/lib/utils/dashboard-metrics";
import { RUNTIME_FAST_POLL_STATES } from "@/lib/reforger/runtime-state";
import { cn } from "@/lib/utils";

const AUTO_REFRESH_KEY = "reforger-dashboard-auto-refresh";
const STICKY_NOTES_KEY = "reforger-dashboard-sticky-notes";
const LAST_FIX_KEY = "reforger-dashboard-last-fix";
const LAST_SAFE_RESTART_KEY = "reforger-dashboard-last-safe-restart";
const LAST_SAFE_RESTART_AT_KEY = "reforger-dashboard-last-safe-restart-at";

function safeDashboardExport(snap: DashboardSnapshot) {
  const { privateKeyPath: _pk, ...settingsRest } = snap.settings;
  void _pk;
  return {
    exportedAt: new Date().toISOString(),
    exportKind: "reforger-control-panel-dashboard",
    settings: { ...settingsRest, privateKeyPath: null },
    status: snap.status,
    ports: snap.ports,
    portChecks: snap.portChecks,
    portCheckSsRaw: snap.portCheckSsRaw,
    health: snap.health,
    system: snap.system,
    logAnalysis: snap.logAnalysis,
    healthScore: snap.healthScore,
    cpuCores: snap.cpuCores,
    serverActivity: snap.serverActivity,
  };
}

function deriveServerStatusDisplay(
  loading: boolean,
  snap: DashboardSnapshot | null,
  st: DashboardSnapshot["status"] | undefined,
): { headline: string; tone: "green" | "red" | "amber" | "muted" } {
  if (loading && !snap) return { headline: "LOADING", tone: "muted" };
  if (!st) return { headline: "UNKNOWN", tone: "muted" };
  if (!snap?.settings?.configured) return { headline: "ERROR", tone: "amber" };
  if (!st.sshReachable) return { headline: "ERROR", tone: "amber" };
  if (st.serverLikelyUp) return { headline: "RUNNING", tone: "green" };
  if (st.tmuxSessionExists || st.processRunning) return { headline: "PARTIAL", tone: "amber" };
  return { headline: "STOPPED", tone: "red" };
}

function derivePhase(
  loading: boolean,
  actionKey: string | null,
  st: DashboardSnapshot["status"] | undefined,
): PowerOrbPhase {
  if (loading && !st) return "loading";
  if (actionKey === "restart") return "restarting";
  if (actionKey === "start" || actionKey === "safe-start") return "starting";
  if (actionKey === "stop") return "stopping";
  if (!st) return "unknown";
  if (st.serverLikelyUp) return "running";
  if (st.tmuxSessionExists || st.processRunning) return "degraded";
  return "stopped";
}

function MetricTile({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-2xl border-border/70 bg-gradient-to-br from-card/80 to-muted/5 shadow-sm transition-colors hover:border-border",
        className,
      )}
    >
      <CardContent className="flex flex-col gap-1.5 p-4">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Icon className="size-3.5 text-primary/85" aria-hidden />
          {label}
        </div>
        <div className="min-h-[2rem] text-lg font-semibold tabular-nums tracking-tight text-foreground">{children}</div>
      </CardContent>
    </Card>
  );
}

export function DashboardClient() {
  const [snap, setSnap] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [stickyNotes, setStickyNotes] = useState("");
  const [modCount, setModCount] = useState<number | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [gameName, setGameName] = useState<string | null>(null);
  const [publicAddr, setPublicAddr] = useState<string | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [joinResult, setJoinResult] = useState<JoinabilityResult | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [lastFix, setLastFix] = useState<FixServerResult | null>(null);
  const [lastSafeRestart, setLastSafeRestart] = useState<SafeRestartResult | null>(null);
  const [lastSafeRestartAt, setLastSafeRestartAt] = useState<string | null>(null);
  const [safeRestartReason, setSafeRestartReason] = useState<SafeRestartReason>("manual");
  const [modStackValidation, setModStackValidation] = useState<ModStackValidationResult | null>(null);
  const [safeRestartOpen, setSafeRestartOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [r, modsR] = await Promise.all([fetchDashboardSnapshot(), loadModsAction()]);
    setLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setSnap(r.data);
    setJoinResult(null);
    setLastRefresh(new Date());
    setRefreshTick((t) => t + 1);
    if (typeof r.data.status.controlLinkRoundTripMs === "number") {
      recordControlLinkSample(r.data.status.controlLinkRoundTripMs);
      setLatencyHistory(readControlLinkHistory());
    }
    if (modsR.ok) {
      setModCount(modsR.data.mods.length);
      setScenarioId(modsR.data.scenarioId);
      setGameName(modsR.data.gameName);
      setPublicAddr(modsR.data.publicAddress);
      setModStackValidation(modsR.data.modStackValidation);
    } else {
      setModCount(null);
      setScenarioId(null);
      setGameName(null);
      setPublicAddr(null);
      setModStackValidation(null);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    try {
      setAutoRefresh(localStorage.getItem(AUTO_REFRESH_KEY) === "1");
    } catch {
      /* ignore */
    }
    try {
      setStickyNotes(localStorage.getItem(STICKY_NOTES_KEY) ?? "");
    } catch {
      /* ignore */
    }
    setLatencyHistory(readControlLinkHistory());
    try {
      const raw = localStorage.getItem(LAST_FIX_KEY);
      if (raw) setLastFix(JSON.parse(raw) as FixServerResult);
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem(LAST_SAFE_RESTART_KEY);
      if (raw) setLastSafeRestart(JSON.parse(raw) as SafeRestartResult);
    } catch {
      /* ignore */
    }
    try {
      setLastSafeRestartAt(localStorage.getItem(LAST_SAFE_RESTART_AT_KEY));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STICKY_NOTES_KEY, stickyNotes);
    } catch {
      /* ignore */
    }
  }, [stickyNotes]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_REFRESH_KEY, autoRefresh ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!autoRefresh) return;
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh]);

  /** Faster polling while the classifier thinks the server is still converging (startup). */
  useEffect(() => {
    const rs = snap?.serverActivity?.state?.state;
    if (!rs || !autoRefresh || !RUNTIME_FAST_POLL_STATES.has(rs)) return;
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, [snap?.serverActivity?.state?.state, autoRefresh, refresh]);

  async function runSafeRestartAction() {
    setActionKey("safe-restart");
    try {
      const r = await actionSafeRestart({ reason: safeRestartReason });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const data = r.data;
      setLastSafeRestart(data);
      try {
        localStorage.setItem(LAST_SAFE_RESTART_KEY, JSON.stringify(data));
      } catch {
        /* ignore */
      }
      if (data.level === "success") {
        const at = new Date().toISOString();
        setLastSafeRestartAt(at);
        try {
          localStorage.setItem(LAST_SAFE_RESTART_AT_KEY, at);
        } catch {
          /* ignore */
        }
      }
      if (data.level === "failure" || !data.success) {
        toast.error(data.summary);
      } else if (data.level === "warning") {
        toast.message(data.summary, {
          description: "Open the Safe restart panel below for full steps.",
        });
      } else {
        toast.success(data.summary);
      }
      await refresh();
    } finally {
      setActionKey(null);
    }
  }

  async function runFixServerAction() {
    setActionKey("fix");
    try {
      const r = await actionFixServer();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const data = r.data;
      setLastFix(data);
      try {
        localStorage.setItem(LAST_FIX_KEY, JSON.stringify(data));
      } catch {
        /* ignore */
      }
      if (data.level === "failure" || !data.success) {
        toast.error(data.summary);
      } else if (data.level === "warning") {
        toast.message(data.summary, {
          description: "Open “Last repair” below for step details.",
        });
      } else {
        toast.success(data.summary);
      }
      await refresh();
    } finally {
      setActionKey(null);
    }
  }

  async function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>,
  ) {
    setActionKey(key);
    try {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? "Request failed");
        return;
      }
      toast.success("Done");
      await refresh();
    } finally {
      setActionKey(null);
    }
  }

  const s = snap?.settings;
  const st = snap?.status;

  const phase = useMemo(
    () => derivePhase(loading, actionKey, st),
    [loading, actionKey, st],
  );

  const powerOrbDisabled =
    !s?.configured || !!actionKey || phase === "loading" || phase === "unknown";

  const powerOrbTitle =
    phase === "running"
      ? "Stop server"
      : phase === "stopped"
        ? "Start server"
        : phase === "degraded"
          ? "Restart server"
          : undefined;

  function handlePowerOrbClick() {
    if (powerOrbDisabled || !s?.configured) return;
    if (phase === "running") {
      void run("stop", () => actionStopServer() as Promise<{ ok: boolean; error?: string }>);
      return;
    }
    if (phase === "stopped") {
      void run("start", () => actionStartServer() as Promise<{ ok: boolean; error?: string }>);
      return;
    }
    if (phase === "degraded") {
      void run("restart", () => actionRestartServer() as Promise<{ ok: boolean; error?: string }>);
    }
  }

  const serverTitle = useMemo(() => {
    const note = s?.instanceNotes?.trim();
    if (note) return note.split(/\r?\n/)[0]!.slice(0, 48) || "Server";
    if (s?.host) return s.host;
    return "Server";
  }, [s]);

  const publicMatch =
    publicAddr && s?.host ? hostsEffectivelyMatch(publicAddr, s.host) : null;

  const checkPort = s?.checkPort ?? 2001;
  const gamePortBound = useMemo(() => {
    const p = snap?.portChecks?.find((c) => c.port === checkPort && c.protocol === "udp");
    return p?.status === "listening";
  }, [snap?.portChecks, checkPort]);
  const a2sPortBound = useMemo(() => {
    const p = snap?.portChecks?.find((c) => c.port === 17777 && c.protocol === "udp");
    return p?.status === "listening";
  }, [snap?.portChecks]);

  const mem = useMemo(
    () => (snap?.health?.free ? parseFreeMemM(snap.health.free) : null),
    [snap?.health?.free],
  );
  const disk = useMemo(
    () => (snap?.system?.diskRoot ? parseDfRootLine(snap.system.diskRoot) : null),
    [snap?.system?.diskRoot],
  );
  const load = useMemo(
    () => (snap?.system?.loadavg ? parseLoad1m(snap.system.loadavg) : null),
    [snap?.system?.loadavg],
  );

  const statusDisplay = useMemo(
    () => deriveServerStatusDisplay(loading, snap, st),
    [loading, snap, st],
  );

  const powerActionLabel =
    phase === "running"
      ? "Stop server"
      : phase === "stopped"
        ? "Start server"
        : phase === "degraded"
          ? "Restart server"
          : undefined;

  const statusHeadlineClass =
    statusDisplay.tone === "green"
      ? "text-emerald-400 drop-shadow-[0_0_28px_rgba(52,211,153,0.4)]"
      : statusDisplay.tone === "red"
        ? "text-red-400 drop-shadow-[0_0_22px_rgba(248,113,113,0.3)]"
        : statusDisplay.tone === "amber"
          ? "text-amber-400 drop-shadow-[0_0_22px_rgba(251,191,36,0.3)]"
          : "text-muted-foreground";

  return (
    <div className="space-y-6 md:space-y-8">
      {s?.announcement ? (
        <Alert className="rounded-2xl border-amber-500/35 bg-amber-500/[0.07]">
          <Megaphone className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
          <AlertTitle className="text-foreground">Notice</AlertTitle>
          <AlertDescription className="text-muted-foreground">{s.announcement}</AlertDescription>
        </Alert>
      ) : null}

      {/* Hero — status + power */}
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-zinc-900/90 via-card to-zinc-950/95 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_-24px_rgba(0,0,0,0.55)] ring-1 ring-primary/10 md:p-10">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,197,94,0.12),transparent)]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 text-center sm:text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                {serverTitle}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground/90">
                {lastRefresh ? lastRefresh.toLocaleTimeString() : "—"}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
              <div className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background/40 px-2.5 py-1.5">
                <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} size="sm" />
                <Label htmlFor="auto-refresh" className="text-[10px] font-medium text-muted-foreground">
                  30s
                </Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-border/60"
                onClick={() => void refresh()}
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                title="Export snapshot JSON"
                onClick={() => {
                  if (!snap) {
                    toast.error("Nothing to export yet");
                    return;
                  }
                  const json = JSON.stringify(safeDashboardExport(snap), null, 2);
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `reforger-dashboard-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("Snapshot downloaded");
                }}
                disabled={loading || !snap}
              >
                <Download className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-6 md:gap-8">
            <div className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                Server status
              </p>
              <p
                className={cn(
                  "mt-2 font-mono text-4xl font-black tracking-tight sm:text-5xl md:text-6xl",
                  statusHeadlineClass,
                )}
              >
                {statusDisplay.headline}
              </p>
            </div>

            <PowerOrb
              phase={phase}
              disabled={powerOrbDisabled}
              title={powerOrbTitle}
              actionLabel={powerActionLabel}
              size="hero"
              onClick={handlePowerOrbClick}
            />

            {!s?.configured ? (
              <Link
                href="/settings"
                className={cn(
                  buttonVariants({ variant: "secondary", size: "default" }),
                  "rounded-full px-6",
                )}
              >
                Configure in Settings
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <HealthScoreCard
        healthScore={snap?.healthScore}
        loading={loading}
        refreshTick={refreshTick}
        variant="dashboard"
      />

      <ServerActivitySection
        serverActivity={snap?.serverActivity}
        checkPort={checkPort}
        loading={loading}
        refreshTick={refreshTick}
        processRunning={st?.processRunning ?? false}
        tmuxActive={st?.tmuxSessionExists ?? false}
        gamePortBound={gamePortBound ?? false}
        a2sPortBound={a2sPortBound ?? false}
      />

      {modStackValidation && modStackValidation.issues.length > 0 ? (
        <div className="space-y-2">
          <ModStackValidationPanel compact title="Mod stack" result={modStackValidation} />
          <p className="text-center text-[11px] text-muted-foreground">
            <Link href="/mods" className="font-medium text-primary underline underline-offset-2">
              Fix on Mods
            </Link>
          </p>
        </div>
      ) : null}

      {/* Metrics */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricTile icon={Timer} label="Uptime">
          <span className="line-clamp-2 font-mono text-base text-foreground">
            {snap?.system?.uptime?.replace(/^up\s*/i, "") ?? "—"}
          </span>
        </MetricTile>
        <MetricTile icon={Users} label="Players">
          <span className="text-muted-foreground">—</span>
        </MetricTile>
        <MetricTile icon={Server} label="Mods">
          {modCount == null ? "—" : modCount}
        </MetricTile>
        <MetricTile icon={Cpu} label="Load">
          {load ? (
            <span>
              {load.label}
              <span className="ml-1 text-xs font-normal text-muted-foreground">({load.pct}%)</span>
            </span>
          ) : (
            "—"
          )}
        </MetricTile>
        <MetricTile icon={Activity} label="Memory">
          {mem ? <span>{mem.usedPct}%</span> : "—"}
        </MetricTile>
        <MetricTile icon={HardDrive} label="Disk">
          {disk ? <span>{disk.usedPct}%</span> : "—"}
        </MetricTile>
      </section>

      {snap?.logAnalysis && snap.logAnalysis.issues.length > 0 ? (
        <LogAnalysisCard analysis={snap.logAnalysis} variant="dashboard" />
      ) : null}

      <ConnectivitySection
        variant="dashboard"
        snap={snap}
        loading={loading}
        history={latencyHistory}
        publicAddr={publicAddr}
        joinResult={joinResult}
        joinLoading={joinLoading}
        syncLoading={syncLoading}
        onRunJoinCheck={async () => {
          setJoinLoading(true);
          try {
            const r = await actionRunJoinabilityCheck();
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            setJoinResult(r.data);
            toast.success("Joinability check complete");
          } finally {
            setJoinLoading(false);
          }
        }}
        onSyncPublicIp={async () => {
          setSyncLoading(true);
          try {
            const r = await actionSyncPublicAddressToPanelHost();
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success(`Saved config (${r.data.bytes} bytes)`);
            setJoinResult(null);
            await refresh();
          } finally {
            setSyncLoading(false);
          }
        }}
      />

      {/* Quick actions */}
      <section className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Quick actions
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="h-11 min-h-11 touch-manipulation rounded-xl border border-border/60 px-4"
            onClick={() => void runFixServerAction()}
            disabled={!!actionKey || !s?.configured}
          >
            {actionKey === "fix" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Wrench className="mr-2 size-4" aria-hidden />
            )}
            <span aria-hidden>🔧</span> Fix server
          </Button>
          <Button
            className="h-11 min-h-11 touch-manipulation rounded-xl px-4"
            onClick={() => setSafeRestartOpen(true)}
            disabled={!!actionKey || !s?.configured}
          >
            <RotateCw className="mr-2 size-4" aria-hidden />
            <span aria-hidden>🔄</span> Safe restart
          </Button>
          <Link
            href="/diagnostics"
            className={cn(
              buttonVariants({ variant: "outline", size: "default" }),
              "inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-xl px-4 touch-manipulation",
            )}
          >
            <FlaskConical className="size-4" aria-hidden />
            <span aria-hidden>🧪</span> Diagnostics
          </Link>
          <Link
            href="/logs"
            className={cn(
              buttonVariants({ variant: "outline", size: "default" }),
              "inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-xl px-4 touch-manipulation",
            )}
          >
            <ScrollText className="size-4" aria-hidden />
            <span aria-hidden>📄</span> View logs
          </Link>
        </div>

        {modStackValidation && modStackValidation.summary.errors > 0 ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Mod stack errors ({modStackValidation.summary.errors}) —{" "}
            <Link href="/mods" className="font-medium underline underline-offset-2">
              Mods
            </Link>
          </p>
        ) : null}

        {lastSafeRestartAt ? (
          <p className="text-[10px] text-muted-foreground">
            Last safe restart:{" "}
            <span className="font-mono text-foreground/90">
              {new Date(lastSafeRestartAt).toLocaleString()}
            </span>
          </p>
        ) : null}

        <Dialog open={safeRestartOpen} onOpenChange={setSafeRestartOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Safe restart</DialogTitle>
              <DialogDescription className="text-xs">
                Stops cleanly, normalizes config if needed, then starts and verifies ports. Full steps stay in the
                panel below after it runs.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="safe-restart-reason-dlg" className="text-[10px] uppercase tracking-wide">
                Reason
              </Label>
              <select
                id="safe-restart-reason-dlg"
                className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                value={safeRestartReason}
                disabled={!!actionKey}
                onChange={(e) => setSafeRestartReason(e.target.value as SafeRestartReason)}
              >
                <option value="manual">Manual</option>
                <option value="after_config_save">After config save</option>
                <option value="after_mod_change">After mod change</option>
                <option value="after_repair">After repair</option>
              </select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSafeRestartOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setSafeRestartOpen(false);
                  void runSafeRestartAction();
                }}
                disabled={!!actionKey || !s?.configured}
              >
                {actionKey === "safe-restart" ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RotateCw className="mr-2 size-4" aria-hidden />
                )}
                Run safe restart
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      <details className="group rounded-2xl border border-border/60 bg-muted/5 open:bg-muted/10">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium outline-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span>More controls</span>
            <span className="text-[11px] font-normal text-muted-foreground group-open:hidden">
              Start · Stop · Restart…
            </span>
          </span>
        </summary>
        <div className="space-y-3 border-t border-border/50 px-4 pb-4 pt-3">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => run("start", () => actionStartServer() as Promise<{ ok: boolean; error?: string }>)}
              disabled={!!actionKey}
            >
              {actionKey === "start" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
              Start
            </Button>
            <Button
              variant="secondary"
              onClick={() => run("stop", () => actionStopServer() as Promise<{ ok: boolean; error?: string }>)}
              disabled={!!actionKey}
            >
              {actionKey === "stop" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Power className="mr-2 size-4" />}
              Stop
            </Button>
            <Button
              variant="secondary"
              onClick={() => run("restart", () => actionRestartServer() as Promise<{ ok: boolean; error?: string }>)}
              disabled={!!actionKey}
            >
              {actionKey === "restart" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Restart
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (st?.serverLikelyUp) {
                  toast.message("Already running", { description: "Stop first if you need a clean start." });
                  return;
                }
                run("safe-start", () => actionStartServer() as Promise<{ ok: boolean; error?: string }>);
              }}
              disabled={!!actionKey}
            >
              Safe start
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Same actions as the power control — use when you want explicit buttons.{" "}
            <Link href="/settings" className="text-primary underline underline-offset-2">
              SSH & paths → Settings
            </Link>
            {" · "}
            <Link href="/diagnostics" className="text-primary underline underline-offset-2">
              Raw stats → Diagnostics
            </Link>
          </p>
        </div>
      </details>

      {lastSafeRestart ? (
        <SafeRestartPanel result={lastSafeRestart} checkPort={s?.checkPort ?? 2001} />
      ) : null}

      {lastFix ? (
        <details className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3 open:bg-muted/15">
          <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
            Last repair ·{" "}
            <span
              className={
                lastFix.level === "success"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : lastFix.level === "warning"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-destructive"
              }
            >
              {lastFix.summary}
            </span>
          </summary>
          <div className="mt-3 space-y-3 text-xs">
            {lastFix.whatWasFixed && lastFix.whatWasFixed.length > 0 ? (
              <div>
                <p className="mb-1 font-medium text-foreground">What changed</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {lastFix.whatWasFixed.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <p className="mb-1 font-medium text-foreground">Steps</p>
              <ul className="space-y-1">
                {lastFix.steps.map((st, i) => (
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
                    {st.message ? (
                      <span className="text-muted-foreground">{st.message}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            {lastFix.logAnalysis ? (
              <div className="border-t border-border/50 pt-3">
                <LogAnalysisCard
                  analysis={lastFix.logAnalysis}
                  compact
                  title="Log check after repair"
                  description="Patterns found in the log tail immediately after this run."
                />
              </div>
            ) : null}
            <p className="font-mono text-[10px] text-muted-foreground">
              Processes: {lastFix.diagnostics.processesFound} found · cleaned:{" "}
              {lastFix.diagnostics.processesCleaned ? "yes" : "no"} · tmux reset:{" "}
              {lastFix.diagnostics.tmuxReset ? "yes" : "no"} · enfMain:{" "}
              {lastFix.diagnostics.processRunning ? "yes" : "no"} · UDP ports:{" "}
              {lastFix.diagnostics.portsOpen ? "yes" : "no"} · tmux session:{" "}
              {lastFix.diagnostics.tmuxSessionPresent ? "yes" : "no"}
            </p>
          </div>
        </details>
      ) : null}

      {/* Advanced */}
      <details className="group rounded-2xl border border-border/70 bg-muted/10 open:bg-muted/20">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring md:px-5 md:py-4 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span>Advanced · SSH, paths, raw snapshots</span>
            <span className="text-[11px] font-normal text-muted-foreground group-open:hidden">Open</span>
            <span className="hidden text-[11px] font-normal text-muted-foreground group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-border/60 px-4 pb-4 pt-2 md:px-5 md:pb-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="rounded-xl border-border/70">
              <CardContent className="space-y-1 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Game port</p>
                <p className="font-mono text-xs text-foreground">{s?.checkPort ?? "—"}</p>
              </CardContent>
            </Card>
            <Card className="rounded-xl border-border/70">
              <CardContent className="space-y-1 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">tmux</p>
                <p className="font-mono text-xs text-foreground">{s?.tmuxSession ?? "—"}</p>
                <Badge variant={st?.tmuxSessionExists ? "default" : "secondary"} className="text-[10px]">
                  {st?.tmuxSessionExists ? "yes" : "no"}
                </Badge>
              </CardContent>
            </Card>
            <Card className="rounded-xl border-border/70">
              <CardContent className="space-y-1 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Public address</p>
                <p className="truncate font-mono text-xs text-foreground" title={publicAddr ?? ""}>
                  {publicAddr ?? "—"}
                </p>
                {publicMatch != null ? (
                  <Badge variant={publicMatch ? "outline" : "secondary"} className="text-[10px]">
                    {publicMatch ? "matches panel" : "differs"}
                  </Badge>
                ) : null}
              </CardContent>
            </Card>
            <Card className="rounded-xl border-border/70">
              <CardContent className="space-y-1 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Process</p>
                <Badge variant={st?.processRunning ? "default" : "secondary"} className="text-[10px]">
                  {st?.processRunning ? "Arma seen" : "not seen"}
                </Badge>
              </CardContent>
            </Card>
            <Card className="rounded-xl border-border/70">
              <CardContent className="space-y-1 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Scenario</p>
                <p className="line-clamp-3 break-all font-mono text-[10px] text-muted-foreground">
                  {scenarioId ?? "—"}
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] uppercase text-muted-foreground">Host</p>
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                {s?.configured ? (
                  <>
                    <span>
                      {s.user}@{s.host}:{s.port}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title="Copy"
                      onClick={() => {
                        void navigator.clipboard.writeText(`${s.user}@${s.host}`);
                        toast.success("Copied");
                      }}
                    >
                      <ClipboardCopy className="size-3.5" />
                    </Button>
                  </>
                ) : (
                  <span className="text-muted-foreground">Not configured</span>
                )}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase text-muted-foreground">Game name (config)</p>
              <p className="font-mono text-xs text-muted-foreground">{gameName ?? "—"}</p>
            </div>
            <div className="md:col-span-2">
              <p className="mb-1 text-[10px] uppercase text-muted-foreground">Paths</p>
              <p className="break-all font-mono text-[11px] text-muted-foreground">{s?.serverPath ?? "—"}</p>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{s?.configPath ?? "—"}</p>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase text-muted-foreground">Ports (ss grep, check port)</p>
            <pre className="max-h-36 overflow-auto rounded-xl bg-muted/50 p-3 font-mono text-[10px] leading-relaxed">
              {snap?.ports.stdout || "—"}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase text-muted-foreground">Port check snapshot (ss -tuanp)</p>
            <pre className="max-h-48 overflow-auto rounded-xl bg-muted/50 p-3 font-mono text-[10px] leading-relaxed">
              {snap?.portCheckSsRaw?.trim() || "—"}
            </pre>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] uppercase text-muted-foreground">Memory / CPU</p>
              <pre className="max-h-40 overflow-auto rounded-xl bg-muted/50 p-3 font-mono text-[10px] leading-relaxed">
                {snap?.health.free ?? "—"}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase text-muted-foreground">Processes</p>
              <pre className="max-h-40 overflow-auto rounded-xl bg-muted/50 p-3 font-mono text-[10px] leading-relaxed">
                {snap?.health.pgrep ?? "—"}
              </pre>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase text-muted-foreground">Kernel</p>
            <pre className="max-h-24 overflow-auto rounded-xl bg-muted/50 p-3 font-mono text-[10px] leading-relaxed">
              {snap?.system.uname ?? "—"}
            </pre>
          </div>
            <div>
              <p className="mb-1 text-[10px] uppercase text-muted-foreground">Sticky notes (this browser)</p>
            <Textarea
              placeholder="Internal notes…"
              value={stickyNotes}
              onChange={(e) => setStickyNotes(e.target.value)}
              className="min-h-[80px] resize-y rounded-xl text-sm"
            />
          </div>
          <div className="border-t border-border/50 pt-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Peek tools</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() =>
                  run("health", async () => {
                    const r = await actionCheckHealth();
                    if (r.ok) {
                      toast.message("Health snapshot", {
                        description: r.data.free.slice(0, 160) + (r.data.free.length > 160 ? "…" : ""),
                      });
                    }
                    return r;
                  })
                }
                disabled={!!actionKey}
              >
                {actionKey === "health" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Cpu className="mr-2 size-4" />}
                Memory snapshot
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => run("ports", () => actionCheckPorts() as Promise<{ ok: boolean; error?: string }>)}
                disabled={!!actionKey}
              >
                {actionKey === "ports" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <EthernetPort className="mr-2 size-4" />}
                Refresh ports
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() =>
                  run("logs", async () => {
                    const r = await actionFetchLogs();
                    if (r.ok) {
                      toast.message("Log preview", {
                        description: r.data.text.slice(0, 200) + (r.data.text.length > 200 ? "…" : ""),
                      });
                    }
                    return r;
                  })
                }
                disabled={!!actionKey}
              >
                {actionKey === "logs" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ScrollText className="mr-2 size-4" />}
                Log preview
              </Button>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
