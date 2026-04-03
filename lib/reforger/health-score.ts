import type { LogAnalysisResult } from "@/lib/reforger/log-analysis";

/** Max total points deducted from log-related issues (v1 cap). */
const LOG_PENALTY_CAP = 45;

export type HealthScoreStatus = "Healthy" | "Warning" | "Degraded" | "Critical" | "Down";

export type HealthScoreResult = {
  score: number;
  status: HealthScoreStatus;
  summary: string;
  factors: {
    process: boolean;
    ports: {
      game: boolean;
      a2s: boolean;
    };
    logs: {
      critical: number;
      errors: number;
      warnings: number;
    };
    system?: {
      memoryPercent?: number;
      load?: number;
      diskPercent?: number;
    };
  };
  /** Human-readable list of what reduced the score (for expandable UI). */
  penalties: string[];
};

export type HealthScoreInput = {
  /** True if Reforger/enfMain process is running. */
  processRunning: boolean;
  /** Distinct PIDs from pgrep (0 if none). */
  processCount: number;
  gamePortBound: boolean;
  a2sPortBound: boolean;
  logAnalysis: LogAnalysisResult | null;
  memoryUsedPercent?: number;
  /** 1-minute load average (raw). */
  load1m?: number;
  diskUsedPercent?: number;
  /** From `nproc` — used to compare load1m. */
  cpuCores: number;
};

export function countDistinctPidsFromPgrep(pgrepStdout: string): number {
  const pids = new Set<string>();
  for (const line of pgrepStdout.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)/);
    if (m) pids.add(m[1]!);
  }
  return pids.size;
}

export function parseLoad1mRaw(loadavgLine: string | undefined): number | undefined {
  if (!loadavgLine?.trim()) return undefined;
  const first = loadavgLine.trim().split(/\s+/)[0];
  const v = Number.parseFloat(first ?? "");
  return Number.isFinite(v) ? v : undefined;
}

/**
 * Deterministic v1 score: starts at 100, subtracts for process/ports/logs/system.
 */
export function computeHealthScore(input: HealthScoreInput): HealthScoreResult {
  const penalties: string[] = [];
  let score = 100;

  const hasProcess = input.processRunning;
  const pidCount = input.processCount;

  if (!hasProcess) {
    score -= 50;
    penalties.push("No Reforger process detected (−50)");
  } else if (pidCount > 1) {
    score -= 20;
    penalties.push(`Multiple server processes (${pidCount}) (−20)`);
  }

  if (!input.gamePortBound) {
    score -= 30;
    penalties.push("Game UDP port not bound (−30)");
  }
  if (!input.a2sPortBound) {
    score -= 10;
    penalties.push("A2S / query UDP port (17777) not bound (−10)");
  }

  let logDeduction = 0;
  const logs = { critical: 0, errors: 0, warnings: 0 };
  for (const issue of input.logAnalysis?.issues ?? []) {
    if (issue.severity === "critical") {
      logs.critical++;
      logDeduction += 30;
    } else if (issue.severity === "error") {
      logs.errors++;
      logDeduction += 15;
    } else if (issue.severity === "warn") {
      logs.warnings++;
      logDeduction += 5;
    }
  }
  const appliedLog = Math.min(logDeduction, LOG_PENALTY_CAP);
  if (appliedLog > 0) {
    penalties.push(`Log patterns (capped at −${LOG_PENALTY_CAP} total): −${appliedLog}`);
  }
  score -= appliedLog;

  const sys: HealthScoreResult["factors"]["system"] = {};
  if (input.memoryUsedPercent != null) {
    sys.memoryPercent = input.memoryUsedPercent;
    if (input.memoryUsedPercent > 85) {
      score -= 10;
      penalties.push(`Memory usage >85% (${input.memoryUsedPercent}%) (−10)`);
    }
  }
  if (input.load1m != null) {
    sys.load = input.load1m;
    const cores = Math.max(1, input.cpuCores);
    if (input.load1m > cores) {
      score -= 10;
      penalties.push(`Load 1m (${input.load1m.toFixed(2)}) > CPU cores (${cores}) (−10)`);
    }
  }
  if (input.diskUsedPercent != null) {
    sys.diskPercent = input.diskUsedPercent;
    if (input.diskUsedPercent > 90) {
      score -= 10;
      penalties.push(`Disk usage >90% (${input.diskUsedPercent}%) (−10)`);
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const hasCriticalLog =
    logs.critical > 0 || Boolean(input.logAnalysis?.summary.hasFatal);

  let status: HealthScoreStatus;
  if (!hasProcess) {
    status = "Down";
  } else if (hasCriticalLog) {
    status = "Critical";
  } else if (score >= 85) {
    status = "Healthy";
  } else if (score >= 65) {
    status = "Warning";
  } else if (score >= 40) {
    status = "Degraded";
  } else {
    status = "Critical";
  }

  const summary = buildHealthSummary({
    hasProcess,
    game: input.gamePortBound,
    a2s: input.a2sPortBound,
    logs,
    score,
    status,
  });

  return {
    score,
    status,
    summary,
    factors: {
      process: hasProcess,
      ports: {
        game: input.gamePortBound,
        a2s: input.a2sPortBound,
      },
      logs,
      system: Object.keys(sys).length ? sys : undefined,
    },
    penalties,
  };
}

function buildHealthSummary(args: {
  hasProcess: boolean;
  game: boolean;
  a2s: boolean;
  logs: { critical: number; errors: number; warnings: number };
  score: number;
  status: HealthScoreStatus;
}): string {
  const { hasProcess, game, a2s, logs, status } = args;
  const parts: string[] = [];
  if (!hasProcess) {
    return "Server process not running — players cannot join.";
  }
  if (!game) parts.push("game port not visible");
  if (!a2s) parts.push("query port (17777) not visible");
  if (logs.critical > 0) parts.push(`${logs.critical} critical log pattern(s)`);
  else if (logs.errors > 0) parts.push(`${logs.errors} error-level log pattern(s)`);
  else if (logs.warnings > 0) parts.push(`${logs.warnings} warning(s) in logs`);

  if (parts.length === 0) {
    if (status === "Healthy") return "Process up, ports look good, logs quiet.";
    return "Mostly healthy — see factors below.";
  }
  const head = parts.slice(0, 3).join("; ");
  return head.charAt(0).toUpperCase() + head.slice(1) + ".";
}
