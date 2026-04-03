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

    // World / mission / map (Enfusion / Reforger–style wording)
    if (
      /\b(CreateEntities|LoadEntities|LoadMap|WorldController|loading.*entities|world.*load|Load world|Streaming.*world|mission.*load|scenario|prefab.*stream|terrain)\b/i.test(
        line,
      )
    ) {
      return "loading_world";
    }
    if (
      /\b(Compiling.*script|Game scripts|script compilation|compiling game|EnforceScript|workshop.*compile)\b/i.test(
        line,
      )
    ) {
      return "compiling_scripts";
    }
    if (
      /\b(loading.*config|dedicated server|server\.json|config.*loaded|Load.*config|Backend.*config|GameSettings)\b/i.test(
        line,
      )
    ) {
      return "loading_config";
    }
    if (
      /\b(RPL|replication.*server|Starting.*network|network.*bind|Game.*network|A2S|query.*port|Networking|Socket|listening.*UDP|Steam.*socket)\b/i.test(
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
  return /\b(server ready|ready to accept|Game initialized|Initialization complete|Session.*started|game is running|server.*running|listening for connections)\b/i.test(
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
    const bindingHint =
      phase === "binding_network" ||
      /\b(bind|socket|UDP|17777|2001|listening|RPL|network)\b/i.test(tail.slice(-6000));
    if (bindingHint) {
      return {
        state: "binding_network",
        title: "Binding ports",
        message:
          phase === "binding_network"
            ? `Network stack activity in logs; waiting for UDP :${checkPort} and :17777 in ss.`
            : `Process is up; game and A2S UDP ports are still binding (often 10–30s).`,
        confidence: "medium",
      };
    }
    return {
      state: phase ?? "starting",
      title: phaseTitle(phase ?? "starting"),
      message:
        phase != null
          ? `Boot phase from recent logs — UDP :${checkPort} + :17777 not visible yet.`
          : `Process running — still loading or waiting for ports (refresh to update).`,
      confidence: phase ? "medium" : "low",
    };
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

export type HeroRuntimeTone = "green" | "red" | "amber" | "muted" | "primary";

export type HeroRuntimeVisual = {
  headline: string;
  subline: string;
  tone: HeroRuntimeTone;
};

/**
 * Map classifier output to the large hero headline + subtitle (replaces generic RUNNING during boot).
 */
export function deriveHeroRuntimeVisual(
  rs: RuntimeStateResult | undefined,
  statusHeadline: string,
  statusTone: HeroRuntimeTone,
): HeroRuntimeVisual {
  if (!rs) {
    return { headline: statusHeadline, subline: "", tone: statusTone };
  }

  if (rs.state === "ready") {
    return { headline: "READY", subline: rs.message, tone: "green" };
  }
  if (rs.state === "warning") {
    if (rs.title === "Not joinable") {
      return { headline: "NOT JOINABLE", subline: rs.message, tone: "amber" };
    }
    return { headline: "RUNNING", subline: rs.message, tone: "amber" };
  }
  if (rs.state === "failed") {
    return { headline: "FAILED", subline: rs.message, tone: "red" };
  }

  if (
    rs.state === "starting" ||
    rs.state === "loading_config" ||
    rs.state === "compiling_scripts" ||
    rs.state === "loading_world" ||
    rs.state === "binding_network"
  ) {
    return {
      headline: runtimeStateToHeroHeadline(rs.state),
      subline: rs.message,
      tone: "primary",
    };
  }

  if (rs.state === "idle") {
    return { headline: statusHeadline, subline: rs.message, tone: statusTone };
  }

  return { headline: statusHeadline, subline: rs.message, tone: statusTone };
}

export function runtimeStateToHeroHeadline(s: RuntimeState): string {
  switch (s) {
    case "loading_config":
      return "LOADING CONFIG";
    case "compiling_scripts":
      return "COMPILING SCRIPTS";
    case "loading_world":
      return "LOADING WORLD";
    case "binding_network":
      return "BINDING PORTS";
    case "starting":
      return "STARTING UP";
    default:
      return "STARTING UP";
  }
}

/** 0–4 = startup ladder; 5 = ready/warn; -1 = unknown/offline */
export function runtimeStateToStartupStep(state: RuntimeState): number {
  switch (state) {
    case "loading_config":
      return 0;
    case "compiling_scripts":
      return 1;
    case "loading_world":
      return 2;
    case "binding_network":
      return 3;
    case "starting":
      return 0;
    case "ready":
    case "warning":
      return 5;
    case "failed":
      return -1;
    default:
      return -1;
  }
}
