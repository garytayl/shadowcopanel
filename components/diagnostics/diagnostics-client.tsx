"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Hint } from "@/components/dashboard/hint";
import { fetchDiagnosticsAction } from "@/lib/actions/diagnostics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DiagnosticsClient() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchDiagnosticsAction>
  > | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetchDiagnosticsAction();
    setLoading(false);
    setData(r);
    if (!r.ok) {
      toast.error(r.error);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  const d = data?.ok ? data.data : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Refresh
        </Button>
        <Hint label="Re-runs a fresh SSH round-trip and reloads system, memory, process, and port samples from the instance." />
      </div>

      {d?.controlLink ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-2xl border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Activity className="size-4" />
                Control link round-trip
                <Hint label="Panel → EC2 SSH latency (echo + exec). High values mean slow network or busy host, not FPS." />
              </CardTitle>
              <CardDescription>
                Time for this app to run a tiny command over SSH to your instance. This is not in-game player ping.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 text-sm">
              {d.controlLink.ok ? (
                <>
                  <Badge variant="default">OK</Badge>
                  <span className="text-muted-foreground tabular-nums">
                    {d.controlLink.roundTripMs} ms
                  </span>
                </>
              ) : (
                <>
                  <Badge variant="destructive">Problem</Badge>
                  <span className="text-destructive">{d.controlLink.message}</span>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      {d?.system ? (
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Machine details
              <Hint label="Kernel string, uptime, root disk, load average, and tmux session list from the remote shell." />
            </CardTitle>
            <CardDescription>OS name, uptime, disk space, how busy the CPU is, background sessions</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">System</p>
              <pre className="max-h-32 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
                {d.system.uname}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Uptime</p>
              <pre className="rounded-lg bg-muted/50 p-3 font-mono text-[11px]">{d.system.uptime}</pre>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Disk /</p>
              <pre className="rounded-lg bg-muted/50 p-3 font-mono text-[11px]">{d.system.diskRoot}</pre>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Load</p>
              <pre className="rounded-lg bg-muted/50 p-3 font-mono text-[11px]">{d.system.loadavg}</pre>
            </div>
            <div className="md:col-span-2">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">tmux</p>
              <pre className="max-h-24 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-[11px]">
                {d.system.tmuxSessions}
              </pre>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {d?.health ? (
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Memory &amp; programs
              <Hint label="Output of `free -m` and `pgrep` for Reforger-related processes—same signals the Home dashboard uses." />
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <pre className="max-h-48 overflow-auto rounded-xl bg-muted/50 p-4 font-mono text-[11px]">
              {d.health.free}
            </pre>
            <pre className="max-h-48 overflow-auto rounded-xl bg-muted/50 p-4 font-mono text-[11px]">
              {d.health.pgrep || "(none)"}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {d?.portsSample ? (
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Open network ports (sample)
              <Hint label="Combined stderr/stdout from the ss-based port check on the host; see Home for the game port in context." />
            </CardTitle>
            <CardDescription>What the server reports is listening—useful for firewall or port issues</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded-xl bg-muted/50 p-4 font-mono text-[11px] leading-relaxed">
              {d.portsSample || "—"}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
