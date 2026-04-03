"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ClipboardCopy,
  Cpu,
  Download,
  EthernetPort,
  HardDrive,
  Loader2,
  Megaphone,
  Network,
  Play,
  Power,
  RefreshCw,
  ScrollText,
  Server,
  ShieldCheck,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "default" : "secondary"} className="font-normal">
      {label}
    </Badge>
  );
}

const AUTO_REFRESH_KEY = "reforger-dashboard-auto-refresh";
const STICKY_NOTES_KEY = "reforger-dashboard-sticky-notes";

function safeDashboardExport(snap: DashboardSnapshot) {
  const { privateKeyPath: _pk, ...settingsRest } = snap.settings;
  void _pk;
  return {
    exportedAt: new Date().toISOString(),
    exportKind: "reforger-control-panel-dashboard",
    settings: {
      ...settingsRest,
      privateKeyPath: null,
    },
    status: snap.status,
    ports: snap.ports,
    health: snap.health,
    system: snap.system,
  };
}

export function DashboardClient() {
  const [snap, setSnap] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [stickyNotes, setStickyNotes] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetchDashboardSnapshot();
    setLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setSnap(r.data);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
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
              toast.success("Downloaded safe snapshot");
            }}
            disabled={loading || !snap}
          >
            <Download className="mr-2 size-4" />
            Export snapshot
          </Button>
          <div className="flex items-center gap-2 rounded-xl border border-border/80 px-3 py-1.5">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-xs font-normal">
              Auto every 30s
            </Label>
          </div>
        </div>
        {lastRefresh ? (
          <p className="text-[11px] text-muted-foreground">
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </p>
        ) : null}
      </div>

      {s?.announcement ? (
        <Alert className="rounded-2xl border-amber-500/35 bg-amber-500/[0.07]">
          <Megaphone className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
          <AlertTitle className="text-foreground">Announcement</AlertTitle>
          <AlertDescription className="text-muted-foreground">{s.announcement}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="rounded-2xl border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-primary" />
                Is the game running?
              </CardTitle>
              <CardDescription>
                Best guess from background session + game process (not 100% exact, but usually right)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {loading && !snap ? (
                <p className="text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge
                      ok={!!st?.serverLikelyUp}
                      label={st?.serverLikelyUp ? "Probably running" : "Stopped or unknown"}
                    />
                    <StatusBadge
                      ok={!!st?.tmuxSessionExists}
                      label={st?.tmuxSessionExists ? "Background session OK" : "No background session"}
                    />
                    <StatusBadge
                      ok={!!st?.processRunning}
                      label={st?.processRunning ? "Game process seen" : "No game process"}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="rounded-2xl border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="size-4 text-primary" />
                Your cloud server
              </CardTitle>
              <CardDescription>Address this app uses to reach your rented machine</CardDescription>
            </CardHeader>
            <CardContent className="font-mono text-xs leading-relaxed text-muted-foreground">
              {s?.configured ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      {s.user}@{s.host}:{s.port}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      title="Copy address"
                      onClick={() => {
                        void navigator.clipboard.writeText(`${s.user}@${s.host}`);
                        toast.success("Copied login address");
                      }}
                    >
                      <ClipboardCopy className="size-3.5" />
                    </Button>
                  </div>
                  <div className="mt-1 truncate" title={s.serverPath}>
                    {s.serverPath}
                  </div>
                </>
              ) : (
                <span className="text-amber-500">Not set up yet — open Connection details (Settings)</span>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="rounded-2xl border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-primary" />
                Link test
              </CardTitle>
              <CardDescription>Can this website reach your server right now?</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {st ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge ok={st.sshReachable} label={st.sshReachable ? "Connected" : "Can’t connect"} />
                    {typeof st.sshLatencyMs === "number" ? (
                      <span className="text-muted-foreground">{st.sshLatencyMs} ms</span>
                    ) : null}
                  </div>
                  {st.sshError ? (
                    <p className="text-xs text-destructive">{st.sshError}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="rounded-2xl border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your notes</CardTitle>
              <CardDescription>
                Hosting note (env) + sticky pad (saved in this browser only)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/90">
                  From settings
                </p>
                <p>{s?.instanceNotes ? s.instanceNotes : "—"}</p>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/90">
                  Sticky pad
                </p>
                <Textarea
                  placeholder="Passwords for teammates, next map rotation, etc."
                  value={stickyNotes}
                  onChange={(e) => setStickyNotes(e.target.value)}
                  className="min-h-[88px] resize-y rounded-xl text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="rounded-2xl border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="size-4 text-primary" />
                Settings file on the server
              </CardTitle>
              <CardDescription className="text-xs">Where config.json lives (advanced)</CardDescription>
            </CardHeader>
            <CardContent className="break-all font-mono text-xs text-muted-foreground">
              {s?.configPath ?? "—"}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="rounded-2xl border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <EthernetPort className="size-4 text-primary" />
                Network ports
              </CardTitle>
              <CardDescription>
                Snippet of open ports (game port matches your REFORGER_CHECK_PORT setting)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-28 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                {snap?.ports.stdout || "—"}
              </pre>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {snap?.system ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-2xl border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="size-4 text-primary" />
                Computer health (cloud)
              </CardTitle>
              <CardDescription>OS, uptime, disk space, load, and background sessions</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Operating system</p>
                <pre className="max-h-24 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[10px] leading-relaxed">
                  {snap.system.uname}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Uptime</p>
                <pre className="rounded-lg bg-muted/50 p-2 font-mono text-[10px]">{snap.system.uptime}</pre>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Disk space (main drive)</p>
                <pre className="rounded-lg bg-muted/50 p-2 font-mono text-[10px]">{snap.system.diskRoot}</pre>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">How busy the CPU is</p>
                <pre className="rounded-lg bg-muted/50 p-2 font-mono text-[10px]">{snap.system.loadavg}</pre>
              </div>
              <div className="md:col-span-2 lg:col-span-2">
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Background sessions</p>
                <pre className="max-h-20 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[10px]">
                  {snap.system.tmuxSessions}
                </pre>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      <Card className="rounded-2xl border-border/80">
        <CardHeader>
          <CardTitle className="text-base">Quick actions</CardTitle>
          <CardDescription>Runs safe commands on your cloud machine (same as you’d type in a terminal)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() =>
              run("start", () => actionStartServer() as Promise<{ ok: boolean; error?: string }>)
            }
            disabled={!!actionKey}
          >
            {actionKey === "start" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Play className="mr-2 size-4" />
            )}
            Start server
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              run("stop", () => actionStopServer() as Promise<{ ok: boolean; error?: string }>)
            }
            disabled={!!actionKey}
          >
            {actionKey === "stop" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Power className="mr-2 size-4" />
            )}
            Stop server
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              run("restart", () =>
                actionRestartServer() as Promise<{ ok: boolean; error?: string }>,
              )
            }
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
            size="sm"
            variant="outline"
            onClick={() =>
              run("health", async () => {
                const r = await actionCheckHealth();
                if (r.ok) {
                  toast.message("Memory & CPU snapshot", {
                    description: `${r.data.free.slice(0, 120)}…`,
                  });
                }
                return r;
              })
            }
            disabled={!!actionKey}
          >
            {actionKey === "health" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Cpu className="mr-2 size-4" />
            )}
            Memory &amp; CPU check
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              run("ports", () => actionCheckPorts() as Promise<{ ok: boolean; error?: string }>)
            }
            disabled={!!actionKey}
          >
            {actionKey === "ports" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <EthernetPort className="mr-2 size-4" />
            )}
            Refresh port list
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              run("logs", async () => {
                const r = await actionFetchLogs();
                if (r.ok) {
                  toast.message("Latest logs (preview)", {
                    description: r.data.text.slice(0, 200) + (r.data.text.length > 200 ? "…" : ""),
                  });
                }
                return r;
              })
            }
            disabled={!!actionKey}
          >
            {actionKey === "logs" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <ScrollText className="mr-2 size-4" />
            )}
            Peek at latest logs
          </Button>
        </CardContent>
      </Card>

      {snap?.health ? (
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base">Memory &amp; running programs (last refresh)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <pre className="max-h-40 overflow-auto rounded-xl bg-muted/50 p-4 font-mono text-[11px] leading-relaxed">
              {snap.health.free}
            </pre>
            <pre className="max-h-40 overflow-auto rounded-xl bg-muted/50 p-4 font-mono text-[11px] leading-relaxed">
              {snap.health.pgrep || "(no matching process)"}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
