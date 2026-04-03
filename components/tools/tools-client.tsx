"use client";

import { useState } from "react";
import { Loader2, Network, HardDrive, Activity, Radio } from "lucide-react";
import { toast } from "sonner";

import {
  runServerToolAction,
  type ToolKind,
} from "@/lib/actions/tools";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
