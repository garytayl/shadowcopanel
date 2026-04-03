"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ClipboardCopy,
  Cpu,
  EthernetPort,
  HardDrive,
  Loader2,
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

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "default" : "secondary"} className="font-normal">
      {label}
    </Badge>
  );
}

const AUTO_REFRESH_KEY = "reforger-dashboard-auto-refresh";

export function DashboardClient() {
  const [snap, setSnap] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

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
  }, []);

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
                Server status
              </CardTitle>
              <CardDescription>tmux session + process heuristic</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {loading && !snap ? (
                <p className="text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge
                      ok={!!st?.serverLikelyUp}
                      label={st?.serverLikelyUp ? "Likely running" : "Not running / unknown"}
                    />
                    <StatusBadge
                      ok={!!st?.tmuxSessionExists}
                      label={st?.tmuxSessionExists ? "tmux session" : "no tmux"}
                    />
                    <StatusBadge
                      ok={!!st?.processRunning}
                      label={st?.processRunning ? "process seen" : "no process"}
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
                EC2 target
              </CardTitle>
              <CardDescription>SSH destination from env</CardDescription>
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
                      title="Copy SSH target"
                      onClick={() => {
                        void navigator.clipboard.writeText(`${s.user}@${s.host}`);
                        toast.success("Copied user@host");
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
                <span className="text-amber-500">Not configured — see Settings</span>
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
                SSH
              </CardTitle>
              <CardDescription>Control plane connectivity</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {st ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge ok={st.sshReachable} label={st.sshReachable ? "Reachable" : "Unreachable"} />
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
              <CardTitle className="text-base">Instance notes</CardTitle>
              <CardDescription>REFORGER_INSTANCE_NOTES</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {s?.instanceNotes ? s.instanceNotes : "—"}
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
                Config path
              </CardTitle>
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
                Listening ports
              </CardTitle>
              <CardDescription>
                <code className="text-xs">ss -tulnp | grep</code> (see REFORGER_CHECK_PORT)
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
                Remote system
              </CardTitle>
              <CardDescription>Kernel, uptime, root disk, load, tmux (one SSH round-trip)</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Kernel</p>
                <pre className="max-h-24 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[10px] leading-relaxed">
                  {snap.system.uname}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Uptime</p>
                <pre className="rounded-lg bg-muted/50 p-2 font-mono text-[10px]">{snap.system.uptime}</pre>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Disk /</p>
                <pre className="rounded-lg bg-muted/50 p-2 font-mono text-[10px]">{snap.system.diskRoot}</pre>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Load</p>
                <pre className="rounded-lg bg-muted/50 p-2 font-mono text-[10px]">{snap.system.loadavg}</pre>
              </div>
              <div className="md:col-span-2 lg:col-span-2">
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">tmux</p>
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
          <CardDescription>Runs privileged commands on the remote host over SSH</CardDescription>
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
                  toast.message("Health snapshot", {
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
            Check health
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
            Check ports
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
            Fetch latest logs
          </Button>
        </CardContent>
      </Card>

      {snap?.health ? (
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base">Memory &amp; process (last refresh)</CardTitle>
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
