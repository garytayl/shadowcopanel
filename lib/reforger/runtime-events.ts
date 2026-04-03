/**
 * High-signal events extracted from log tails + structured analysis — not one event per line.
 */

import type { LogAnalysisResult } from "@/lib/reforger/log-analysis";

export type RuntimeEventSeverity = "info" | "success" | "warn" | "error";

export type RuntimeEvent = {
  id: string;
  timestamp?: string;
  severity: RuntimeEventSeverity;
  title: string;
  message?: string;
  source?: "logs" | "process" | "ports" | "action";
};

export type RuntimeEventSignals = {
  processRunning: boolean;
  tmuxActive: boolean;
  gamePortBound: boolean;
  a2sPortBound: boolean;
  checkPort: number;
};

function stableId(parts: string[]): string {
  let h = 5381;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return `evt-${(h >>> 0).toString(16).padStart(8, "0")}`;
}

const OBSOLETE_SPAM = /obsolete|deprecated.*script/i;

function isNoiseLine(line: string): boolean {
  return OBSOLETE_SPAM.test(line) && !/\berror|fail|fatal|critical\b/i.test(line);
}

type Milestone = {
  re: RegExp;
  title: string;
  severity: RuntimeEventSeverity;
  message?: string;
};

/** Order: first match in forward scan = chronological; we collect last index per milestone type. */
const MILESTONES: Milestone[] = [
  {
    re: /\b(loading.*config|dedicated server|server\.json|config.*valid)\b/i,
    title: "Config activity",
    severity: "info",
    message: "Config load or validation mentioned in logs.",
  },
  {
    re: /\b(Compiling.*script|Game scripts)\b/i,
    title: "Script compilation",
    severity: "info",
  },
  {
    re: /\b(CreateEntities|LoadEntities|loading.*world|Streaming)\b/i,
    title: "World / entities",
    severity: "info",
  },
  {
    re: /\b(RPL|replication|A2S|query.*port)\b/i,
    title: "Network stack",
    severity: "info",
  },
  {
    re: /\b(player.*join|authentication|connected|Steam.*user)\b/i,
    title: "Player activity",
    severity: "info",
  },
  {
    re: /\b(unable to initialize|initialization failed|fatal|FATAL|segfault)\b/i,
    title: "Startup failure signal",
    severity: "error",
  },
];

/**
 * Extract a small set of milestone events from the tail (deduped, not line-by-line).
 */
export function extractLogMilestoneEvents(logTail: string, maxEvents = 8): RuntimeEvent[] {
  const lines = logTail.split(/\r?\n/);
  const found: { idx: number; m: Milestone; line: string }[] = [];

  lines.forEach((line, idx) => {
    if (!line.trim() || isNoiseLine(line)) return;
    for (const m of MILESTONES) {
      if (m.re.test(line)) {
        found.push({ idx, m, line: line.trim().slice(0, 160) });
        break;
      }
    }
  });

  const byTitle = new Map<string, (typeof found)[0]>();
  for (const f of found) {
    const prev = byTitle.get(f.m.title);
    if (!prev || f.idx > prev.idx) byTitle.set(f.m.title, f);
  }

  const sorted = [...byTitle.values()].sort((a, b) => a.idx - b.idx).slice(-maxEvents);

  return sorted.map((f) => ({
    id: stableId(["milestone", f.m.title, String(f.idx)]),
    severity: f.m.severity,
    title: f.m.title,
    message: f.m.message ?? f.line,
    source: "logs" as const,
  }));
}

function issuesToEvents(logAnalysis: LogAnalysisResult | null): RuntimeEvent[] {
  if (!logAnalysis?.issues.length) return [];
  const cap = 5;
  return logAnalysis.issues.slice(0, cap).map((i) => ({
    id: stableId(["issue", i.key, i.title]),
    severity:
      i.severity === "critical" || i.severity === "error"
        ? "error"
        : i.severity === "warn"
          ? "warn"
          : ("info" as RuntimeEventSeverity),
    title: i.title,
    message: i.explanation.slice(0, 180),
    source: "logs" as const,
  }));
}

/**
 * Port/process snapshot as coarse events (not SSH spam).
 */
export function extractSignalEvents(signals: RuntimeEventSignals): RuntimeEvent[] {
  const out: RuntimeEvent[] = [];
  const { processRunning, tmuxActive, gamePortBound, a2sPortBound, checkPort } = signals;

  if (processRunning) {
    out.push({
      id: stableId(["sig", "process"]),
      severity: "success",
      title: "Process running",
      message: "Arma / enfMain process line seen in pgrep.",
      source: "process",
    });
  }
  if (tmuxActive) {
    out.push({
      id: stableId(["sig", "tmux"]),
      severity: "success",
      title: "tmux session active",
      message: "Named server session exists.",
      source: "process",
    });
  }
  if (gamePortBound) {
    out.push({
      id: stableId(["sig", "udp", String(checkPort)]),
      severity: "success",
      title: `UDP ${checkPort} bound`,
      message: "Visible in ss (UDP).",
      source: "ports",
    });
  }
  if (a2sPortBound) {
    out.push({
      id: stableId(["sig", "udp", "17777"]),
      severity: "success",
      title: "UDP 17777 bound",
      message: "A2S / query port visible.",
      source: "ports",
    });
  }
  return out;
}

/**
 * Build the log-derived feed for the dashboard: milestones + structured issues, capped and ordered.
 */
export function extractRuntimeEvents(
  logTail: string | null,
  logAnalysis: LogAnalysisResult | null,
  signals: RuntimeEventSignals,
): RuntimeEvent[] {
  const tail = logTail ?? "";
  const milestones = extractLogMilestoneEvents(tail, 6);
  const issues = issuesToEvents(logAnalysis);
  const sig = extractSignalEvents(signals);

  const merged = [...sig, ...milestones, ...issues];
  const seen = new Set<string>();
  const deduped: RuntimeEvent[] = [];
  for (const e of merged) {
    const key = `${e.title}|${e.source ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }
  return deduped.slice(0, 14);
}
