"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowUpRight,
  ClipboardCopy,
  Cpu,
  Download,
  EthernetPort,
  Loader2,
  Megaphone,
  Play,
  Power,
  RefreshCw,
  ScrollText,
  Server,
  Timer,
  Users,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConnectivitySection } from "@/components/dashboard/connectivity-section";
import { Hint } from "@/components/dashboard/hint";
import {
  readControlLinkHistory,
  recordControlLinkSample,
} from "@/components/dashboard/latency-sparkline";
import { PowerOrb, type PowerOrbPhase } from "@/components/dashboard/power-orb";
import { cn } from "@/lib/utils";

const AUTO_REFRESH_KEY = "reforger-dashboard-auto-refresh";
const STICKY_NOTES_KEY = "reforger-dashboard-sticky-notes";

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
  };
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

function StatCard({
  icon: Icon,
  label,
  hint,
  children,
  className,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Icon className="size-3.5 text-primary/90" aria-hidden />
            {label}
            {hint ? <Hint label={hint} /> : null}
          </div>
        </div>
        <div className="min-h-[2rem] text-sm font-medium leading-snug text-foreground">{children}</div>
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
  const [stickyNotes, setStickyNotes] = useState("");
  const [modCount, setModCount] = useState<number | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [gameName, setGameName] = useState<string | null>(null);
  const [publicAddr, setPublicAddr] = useState<string | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [joinResult, setJoinResult] = useState<JoinabilityResult | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

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
    if (typeof r.data.status.controlLinkRoundTripMs === "number") {
      recordControlLinkSample(r.data.status.controlLinkRoundTripMs);
      setLatencyHistory(readControlLinkHistory());
    }
    if (modsR.ok) {
      setModCount(modsR.data.mods.length);
      setScenarioId(modsR.data.scenarioId);
      setGameName(modsR.data.gameName);
      setPublicAddr(modsR.data.publicAddress);
    } else {
      setModCount(null);
      setScenarioId(null);
      setGameName(null);
      setPublicAddr(null);
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

  return (
    <div className="space-y-6 md:space-y-8">
      {s?.announcement ? (
        <Alert className="rounded-2xl border-amber-500/35 bg-amber-500/[0.07]">
          <Megaphone className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
          <AlertTitle className="text-foreground">Notice</AlertTitle>
          <AlertDescription className="text-muted-foreground">{s.announcement}</AlertDescription>
        </Alert>
      ) : null}

      {/* Command header */}
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/40 p-4 shadow-sm ring-1 ring-primary/5 md:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight md:text-2xl">{serverTitle}</h2>
              {st?.sshReachable ? (
                <Badge variant="default" className="font-normal">
                  Control link
                </Badge>
              ) : (
                <Badge variant="secondary">Offline</Badge>
              )}
              {st?.serverLikelyUp ? (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                  Process
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {lastRefresh ? <>Updated {lastRefresh.toLocaleTimeString()}</> : "—"}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-end">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-2 py-1.5">
              <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} size="sm" />
              <Label htmlFor="auto-refresh" className="text-[11px] font-normal">
                30s
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="min-h-10 touch-manipulation"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="min-h-10 min-w-10 touch-manipulation"
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

        <div className="mt-6 flex flex-col items-center gap-2 border-t border-border/50 pt-6 md:mt-8 md:pt-8">
          <PowerOrb
            phase={phase}
            disabled={powerOrbDisabled}
            title={powerOrbTitle}
            onClick={handlePowerOrbClick}
          />
          <p className="max-w-md text-center text-[11px] text-muted-foreground">
            {s?.configured ? `${s.user}@${s.host}` : "Configure SSH in Settings"}
          </p>
        </div>
      </section>

      {/* Primary metrics */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={Activity}
          label="Power"
          hint="tmux session + game process"
        >
          {loading && !snap ? (
            "…"
          ) : st?.serverLikelyUp ? (
            <span className="text-emerald-500">Up</span>
          ) : (
            <span className="text-muted-foreground">Down</span>
          )}
        </StatCard>
        <StatCard icon={Users} label="Players" hint="Not measured from the panel; game API TBD">
          —
        </StatCard>
        <StatCard icon={Server} label="Mods" hint="mods in config.json">
          {modCount == null ? "—" : modCount}
        </StatCard>
        <StatCard icon={Cpu} label="Scenario" hint="game.scenarioId">
          <span className="line-clamp-2 break-all font-mono text-xs text-muted-foreground">
            {scenarioId ?? "—"}
          </span>
        </StatCard>
        <StatCard icon={Timer} label="Uptime" hint="Host uptime">
          <span className="line-clamp-2 font-mono text-xs text-muted-foreground">
            {snap?.system?.uptime?.replace(/^up\s*/i, "") ?? "—"}
          </span>
        </StatCard>
      </section>

      <ConnectivitySection
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
      <section className="flex flex-wrap gap-2">
        <Button
          className="min-h-11 min-w-[7rem] touch-manipulation sm:min-h-8"
          onClick={() => run("start", () => actionStartServer() as Promise<{ ok: boolean; error?: string }>)}
          disabled={!!actionKey}
        >
          {actionKey === "start" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
          Start
        </Button>
        <Button
          variant="secondary"
          className="min-h-11 min-w-[7rem] touch-manipulation sm:min-h-8"
          onClick={() => run("stop", () => actionStopServer() as Promise<{ ok: boolean; error?: string }>)}
          disabled={!!actionKey}
        >
          {actionKey === "stop" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Power className="mr-2 size-4" />}
          Stop
        </Button>
        <Button
          variant="secondary"
          className="min-h-11 min-w-[7rem] touch-manipulation sm:min-h-8"
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
          className="min-h-11 touch-manipulation sm:min-h-8"
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
        <Button
          variant="outline"
          className="min-h-11 touch-manipulation sm:min-h-8"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Refresh
        </Button>
        <Link
          href="/logs"
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "inline-flex min-h-11 items-center justify-center gap-1 touch-manipulation sm:min-h-8",
          )}
        >
          Logs
          <ArrowUpRight className="size-3.5 opacity-70" aria-hidden />
        </Link>
      </section>

      {/* Diagnostics strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-border/70">
          <CardContent className="space-y-1 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Port</p>
            <p className="font-mono text-xs text-foreground">{s?.checkPort ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="space-y-1 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">tmux</p>
            <p className="font-mono text-xs text-foreground">{s?.tmuxSession ?? "—"}</p>
            <Badge variant={st?.tmuxSessionExists ? "default" : "secondary"} className="text-[10px]">
              {st?.tmuxSessionExists ? "yes" : "no"}
            </Badge>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="space-y-1 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Public IP</p>
            <p className="truncate font-mono text-xs text-foreground" title={publicAddr ?? ""}>
              {publicAddr ?? "—"}
            </p>
            {publicMatch != null ? (
              <Badge variant={publicMatch ? "outline" : "secondary"} className="text-[10px]">
                {publicMatch ? "matches panel host" : "differs"}
              </Badge>
            ) : null}
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="space-y-1 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Process</p>
            <Badge variant={st?.processRunning ? "default" : "secondary"} className="text-[10px]">
              {st?.processRunning ? "Arma seen" : "not seen"}
            </Badge>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="space-y-1 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Mods</p>
            <p className="font-mono text-xs">{modCount ?? "—"}</p>
          </CardContent>
        </Card>
      </section>

      {/* Advanced */}
      <details className="group rounded-2xl border border-border/70 bg-muted/10 open:bg-muted/20">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring md:px-5 md:py-4 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span>Advanced</span>
            <span className="text-[11px] font-normal text-muted-foreground group-open:hidden">Show raw data</span>
            <span className="hidden text-[11px] font-normal text-muted-foreground group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-border/60 px-4 pb-4 pt-2 md:px-5 md:pb-5">
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
        </div>
      </details>

      {/* Secondary actions (collapsed tools) */}
      <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() =>
            run("health", async () => {
              const r = await actionCheckHealth();
              if (r.ok) {
                toast.message("Health snapshot", { description: r.data.free.slice(0, 160) + (r.data.free.length > 160 ? "…" : "") });
              }
              return r;
            })
          }
          disabled={!!actionKey}
        >
          {actionKey === "health" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Cpu className="mr-2 size-4" />}
          CPU check
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
          Peek logs
        </Button>
      </div>
    </div>
  );
}
