/**
 * Human-readable Reforger dedicated server "what is it doing now" from signals + log tail.
 * Deterministic heuristics — extend with more patterns as you see real logs.
 */

import type { LogAnalysisResult } from "@/lib/reforger/log-analysis";

export type RuntimeState =
  | "idle"
  | "starting"
  | "loading_config"
  | "compiling_scripts"
  | "loading_world"
  | "binding_network"
  | "ready"
  | "warning"
  | "failed";

export type RuntimeStateResult = {
  state: RuntimeState;
  title: string;
  message: string;
  confidence?: "low" | "medium" | "high";
};

export type RuntimeStateInput = {
  sshReachable: boolean;
  configured: boolean;
  processRunning: boolean;
  tmuxActive: boolean;
  gamePortBound: boolean;
  a2sPortBound: boolean;
  checkPort: number;
  /** Recent log tail (same slice as log analysis). */
  logTail: string | null;
  logAnalysis: LogAnalysisResult | null;
};

/** Scan from bottom of tail for the most recent phase hint (last matching line wins). */
function lastLogPhase(tail: string): RuntimeState | null {
  const lines = tail.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (/obsolete|deprecated.*script/i.test(line) && !/error|fail|fatal/i.test(line)) continue;

    if (
      /\b(CreateEntities|LoadEntities|loading.*entities|world.*load|Load world|Streaming.*world)\b/i.test(
        line,
      )
    ) {
      return "loading_world";
    }
    if (/\b(Compiling.*script|Game scripts|script compilation|compiling game)\b/i.test(line)) {
      return "compiling_scripts";
    }
    if (
      /\b(loading.*config|dedicated server config|server\.json|config.*loaded|Load.*config)\b/i.test(line)
    ) {
      return "loading_config";
    }
    if (
      /\b(RPL|replication.*server|Starting.*network|network.*bind|Game.*network|A2S|query.*port)\b/i.test(
        line,
      ) ||
      new RegExp(`:${String(17777)}\\b`).test(line)
    ) {
      return "binding_network";
    }
  }
  return null;
}

function hasReadyHint(tail: string): boolean {
  return /\b(server ready|ready to accept|Game initialized|Initialization complete|Session.*started)\b/i.test(
    tail.slice(-8000),
  );
}

function logFatalOrStartupFailure(logAnalysis: LogAnalysisResult | null, tail: string): boolean {
  if (!logAnalysis) return /\b(unable to initialize|initialization failed|fatal|FATAL|segfault|SIGSEGV)\b/i.test(tail);
  if (logAnalysis.summary.hasFatal) return true;
  const hi = logAnalysis.summary.highestSeverity;
  if (hi === "critical") return true;
  if (hi === "error") {
    const fatalKeys = new Set([
      "oom",
      "segfault",
      "bind-failed",
      "mod-dependency",
      "config-parse",
      "file-missing",
      "init-failed",
      "assert-fail",
      "disk-full",
    ]);
    return logAnalysis.issues.some((i) => fatalKeys.has(i.key));
  }
  return false;
}

function logWarningOnly(logAnalysis: LogAnalysisResult | null): boolean {
  if (!logAnalysis || logAnalysis.issues.length === 0) return false;
  const hi = logAnalysis.summary.highestSeverity;
  return hi === "warn" || hi === "info";
}

/**
 * Derive current runtime state for dashboard / activity UI.
 */
export function deriveRuntimeState(input: RuntimeStateInput): RuntimeStateResult {
  const {
    sshReachable,
    configured,
    processRunning,
    tmuxActive,
    gamePortBound,
    a2sPortBound,
    checkPort,
    logTail,
    logAnalysis,
  } = input;

  const tail = logTail ?? "";
  const bothPorts = gamePortBound && a2sPortBound;

  if (!configured) {
    return {
      state: "idle",
      title: "Not configured",
      message: "Add SSH settings to monitor this server.",
      confidence: "high",
    };
  }

  if (!sshReachable) {
    return {
      state: "idle",
      title: "Control link offline",
      message: "This panel cannot reach the host — check IP, key, or firewall.",
      confidence: "high",
    };
  }

  if (logFatalOrStartupFailure(logAnalysis, tail)) {
    return {
      state: "failed",
      title: "Startup or fatal issue",
      message:
        logAnalysis?.issues[0]?.explanation?.slice(0, 200) ??
        "Recent logs or analysis show a blocking error.",
      confidence: "medium",
    };
  }

  if (processRunning && tmuxActive && bothPorts) {
    if (logWarningOnly(logAnalysis)) {
      return {
        state: "warning",
        title: "Running with warnings",
        message:
          logAnalysis?.summary.totalIssues === 1
            ? (logAnalysis.issues[0]?.title ?? "Log patterns need review.")
            : `${logAnalysis?.summary.totalIssues ?? 0} pattern(s) in recent logs — non-fatal.`,
        confidence: "high",
      };
    }
    if (hasReadyHint(tail) || !logAnalysis?.issues.length) {
      return {
        state: "ready",
        title: "Ready",
        message: "Process up, tmux active, game and query UDP ports visible.",
        confidence: "high",
      };
    }
    return {
      state: "ready",
      title: "Ready",
      message: "World loaded, ports bound, process healthy.",
      confidence: "medium",
    };
  }

  if (processRunning && tmuxActive && !bothPorts) {
    const phase = lastLogPhase(tail);
    const base: RuntimeStateResult = {
      state: phase ?? "starting",
      title: phaseTitle(phase ?? "starting"),
      message: `Game process is running; UDP :${checkPort} and :17777 are still coming online.`,
      confidence: phase ? "medium" : "low",
    };
    if (phase === "binding_network" || /\b(bind|socket|UDP|17777|2001)\b/i.test(tail.slice(-4000))) {
      return {
        ...base,
        state: "binding_network",
        title: "Binding network",
        message: "Server is up; waiting for both UDP sockets to appear in the OS.",
        confidence: "medium",
      };
    }
    return base;
  }

  if ((processRunning || tmuxActive) && !bothPorts) {
    const phase = lastLogPhase(tail);
    return {
      state: phase ?? "starting",
      title: phaseTitle(phase ?? "starting"),
      message: "Server is starting or recovering — ports may take a few seconds after the process appears.",
      confidence: "low",
    };
  }

  return {
    state: "idle",
    title: "Idle",
    message: "No Reforger process or tmux session detected on the host.",
    confidence: "medium",
  };
}

function phaseTitle(s: RuntimeState): string {
  switch (s) {
    case "loading_config":
      return "Loading config";
    case "compiling_scripts":
      return "Compiling scripts";
    case "loading_world":
      return "Loading world";
    case "binding_network":
      return "Binding network";
    case "starting":
      return "Starting";
    default:
      return "Starting";
  }
}

/** States where faster dashboard refresh is useful (startup convergence). */
export const RUNTIME_FAST_POLL_STATES: ReadonlySet<RuntimeState> = new Set([
  "starting",
  "loading_config",
  "compiling_scripts",
  "loading_world",
  "binding_network",
]);
