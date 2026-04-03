"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Cpu,
  EthernetPort,
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

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "default" : "secondary"} className="font-normal">
      {label}
    </Badge>
  );
}

export function DashboardClient() {
  const [snap, setSnap] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionKey, setActionKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetchDashboardSnapshot();
    setLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setSnap(r.data);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

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
                  <div>
                    {s.user}@{s.host}:{s.port}
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
