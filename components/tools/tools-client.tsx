"use client";

import { useEffect, useState } from "react";
import { Loader2, Network, HardDrive, Activity, Radio, RotateCw } from "lucide-react";
import { toast } from "sonner";

import {
  runServerToolAction,
  type ToolKind,
} from "@/lib/actions/tools";
import { actionSafeRestart } from "@/lib/actions/safe-restart";
import { SafeRestartPanel } from "@/components/dashboard/safe-restart-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SafeRestartResult } from "@/lib/types/safe-restart";

const LAST_SAFE_RESTART_KEY = "reforger-dashboard-last-safe-restart";
const LAST_SAFE_RESTART_AT_KEY = "reforger-dashboard-last-safe-restart-at";

const TOOLS: {
  kind: ToolKind;
  label: string;
  description: string;
  icon: typeof HardDrive;
}[] = [
  {
    kind: "disk",
    label: "Disk space",
    description: "Full df -h report on the cloud machine",
    icon: HardDrive,
  },
  {
    kind: "processes",
    label: "Processes (sample)",
    description: "Top processes from ps aux",
    icon: Activity,
  },
  {
    kind: "sockets",
    label: "Sockets summary",
    description: "ss -s network socket stats",
    icon: Radio,
  },
  {
    kind: "ping",
    label: "Ping test",
    description: "ICMP ping to 8.8.8.8 (checks outbound connectivity)",
    icon: Network,
  },
];

export function ToolsClient() {
  const [running, setRunning] = useState<ToolKind | null>(null);
  const [output, setOutput] = useState<string>("");
  const [safeRestartLoading, setSafeRestartLoading] = useState(false);
  const [safeRestartResult, setSafeRestartResult] = useState<SafeRestartResult | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_SAFE_RESTART_KEY);
      if (raw) setSafeRestartResult(JSON.parse(raw) as SafeRestartResult);
    } catch {
      /* ignore */
    }
  }, []);

  async function runSafeRestart() {
    setSafeRestartLoading(true);
    try {
      const r = await actionSafeRestart({ reason: "manual" });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const data = r.data;
      setSafeRestartResult(data);
      try {
        localStorage.setItem(LAST_SAFE_RESTART_KEY, JSON.stringify(data));
      } catch {
        /* ignore */
      }
      if (data.level === "success") {
        try {
          localStorage.setItem(LAST_SAFE_RESTART_AT_KEY, new Date().toISOString());
        } catch {
          /* ignore */
        }
      }
      if (data.level === "failure" || !data.success) {
        toast.error(data.summary);
      } else if (data.level === "warning") {
        toast.message(data.summary);
      } else {
        toast.success(data.summary);
      }
    } finally {
      setSafeRestartLoading(false);
    }
  }

  async function run(kind: ToolKind) {
    setRunning(kind);
    setOutput("");
    try {
      const r = await runServerToolAction(kind);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setOutput(r.data.text);
      toast.success("Done");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-primary/25 bg-gradient-to-br from-primary/[0.06] to-transparent ring-1 ring-primary/15">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <RotateCw className="size-4 text-primary" aria-hidden />
            Safe restart
          </CardTitle>
          <CardDescription>
            Same orchestration as Home — validate config, stop cleanly, start, verify ports and logs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            className="min-h-11 touch-manipulation"
            disabled={safeRestartLoading}
            onClick={() => void runSafeRestart()}
          >
            {safeRestartLoading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RotateCw className="mr-2 size-4" aria-hidden />
            )}
            Run Safe Restart
          </Button>
          {safeRestartResult ? (
            <SafeRestartPanel result={safeRestartResult} checkPort={2001} />
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map(({ kind, label, description, icon: Icon }) => (
          <Card key={kind} className="rounded-2xl border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="size-4 text-primary" />
                {label}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                size="sm"
                variant="secondary"
                disabled={!!running}
                onClick={() => void run(kind)}
              >
                {running === kind ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                Run
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border-border/80">
        <CardHeader>
          <CardTitle className="text-base">Output</CardTitle>
          <CardDescription>Last command result (read-only)</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[min(70vh,520px)] overflow-auto rounded-xl bg-muted/50 p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {output || "—"}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
