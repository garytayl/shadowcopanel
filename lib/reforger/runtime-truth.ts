/**
 * Single evaluation of "what is actually true" about the dedicated server:
 * process/ports vs joinability vs log-reported registration — avoids naive success.
 */

import type { LogAnalysisResult } from "@/lib/reforger/log-analysis";
import type { HealthScoreResult } from "@/lib/reforger/health-score";
import type { RuntimeStateResult } from "@/lib/reforger/runtime-state";
import { hostsEffectivelyMatch } from "@/lib/connectivity/joinability-model";

export type RuntimeStartupState =
  | "starting"
  | "running"
  | "degraded"
  | "failed"
  | "crashed";

export type RuntimeJoinability = "likely_joinable" | "not_joinable" | "unknown";

export type RuntimeA2sStatus = "ok" | "failed" | "unknown";

export type RuntimeTruthFinding = {
  key: string;
  status: "pass" | "warn" | "fail";
  message: string;
};

export type RuntimeTruthResult = {
  startupState: RuntimeStartupState;
  joinability: RuntimeJoinability;
  /** Host:port parsed from "Server registered with address:" (if present). */
  advertisedAddress?: string;
  /** config.json publicAddress — what clients should use. */
  expectedPublicAddress?: string;
  /** Log + port-derived A2S / Steam query health. */
  a2sStatus: RuntimeA2sStatus;
  findings: RuntimeTruthFinding[];
  summary: string;
};

export type RuntimeTruthInput = {
  logTail: string;
  logAnalysis: LogAnalysisResult | null;
  sshReachable: boolean;
  configured: boolean;
  processRunning: boolean;
  tmuxActive: boolean;
  serverLikelyUp: boolean;
  gamePortBound: boolean;
  a2sPortBound: boolean;
  checkPort: number;
  configPublicAddress: string | null;
  panelHost: string;
};

/** Unroutable / useless for client discovery when advertised as the server's public identity. */
function isUnroutableAdvertisedHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").trim().toLowerCase();
  if (!h) return true;
  if (h === "0.0.0.0") return true;
  if (h === "::" || h === "0:0:0:0:0:0:0:0") return true;
  if (h === "127.0.0.1" || h === "::1") return true;
  return false;
}

/**
 * True when the log tail shows a post-start native crash / allocator failure.
 * Kept in sync with log-analysis `heap-corruption` / `segfault` patterns.
 */
export function detectCrashInLogTail(tail: string): boolean {
  return /\b(double free|corruption\s*\(|malloc\(\):.*corruption|malloc_consolidate|invalid next size|glibc detected|\*\*\* Error in|SIGABRT|SIGSEGV|segfault|segmentation fault|core dumped)\b/i.test(
    tail,
  );
}

/** True when logs report A2S / query layer disabled or failed. */
export function parseLogA2sFailure(tail: string): boolean {
  return /\[A2S\].*Init failed|A2S is now turned off|\[A2S\].*(fail|error|turned off)/i.test(tail);
}

/**
 * Parse the last "registered with address" line from Reforger logs (order: bottom-up = most recent).
 */
export function parseLogAdvertisedRegistration(
  tail: string,
): { full: string; host: string; port: number } | null {
  const lines = tail.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    const m = line.match(/registered\s+with\s+address:\s*(.+)$/i);
    if (!m) continue;
    const rest = m[1]!.trim();
    const lastColon = rest.lastIndexOf(":");
    if (lastColon <= 0) continue;
    const hostPart = rest.slice(0, lastColon).trim();
    const portStr = rest.slice(lastColon + 1).trim();
    const port = Number.parseInt(portStr, 10);
    if (!Number.isFinite(port)) continue;
    return { full: rest, host: hostPart, port };
  }
  return null;
}

function push(
  findings: RuntimeTruthFinding[],
  key: string,
  status: RuntimeTruthFinding["status"],
  message: string,
) {
  findings.push({ key, status, message });
}

function fatalBootOrStuckLog(logAnalysis: LogAnalysisResult | null, tail: string): boolean {
  if (!logAnalysis) {
    return /\b(unable to initialize|initialization failed|fatal|FATAL|segfault|SIGSEGV)\b/i.test(tail);
  }
  const hi = logAnalysis.summary.highestSeverity;
  const hasFatal = logAnalysis.summary.hasFatal;
  if (hasFatal || hi === "critical") return true;
  if (hi === "error") {
    return logAnalysis.issues.some((i) =>
      ["oom", "segfault", "assert-fail", "init-failed", "disk-full", "heap-corruption"].includes(i.key),
    );
  }
  return false;
}

/**
 * Evaluate runtime truth for dashboard, joinability, and health — call server-side only.
 */
export function evaluateRuntimeTruth(input: RuntimeTruthInput): RuntimeTruthResult {
  const findings: RuntimeTruthFinding[] = [];
  const {
    logTail,
    logAnalysis,
    sshReachable,
    configured,
    processRunning,
    tmuxActive,
    serverLikelyUp,
    gamePortBound,
    a2sPortBound,
    checkPort,
    configPublicAddress,
    panelHost,
  } = input;

  let joinability: RuntimeJoinability = "unknown";
  let startupState: RuntimeStartupState = "starting";
  let a2sStatus: RuntimeA2sStatus = "unknown";

  if (!configured) {
    push(findings, "configured", "fail", "SSH / panel is not fully configured.");
    return {
      startupState: "failed",
      joinability: "not_joinable",
      a2sStatus: "unknown",
      expectedPublicAddress: configPublicAddress ?? undefined,
      findings,
      summary: "Panel is not configured — cannot assess joinability.",
    };
  }

  if (!sshReachable) {
    push(findings, "ssh", "fail", "Control link (SSH) unreachable — cannot verify runtime.");
    return {
      startupState: "failed",
      joinability: "not_joinable",
      a2sStatus: "unknown",
      expectedPublicAddress: configPublicAddress ?? undefined,
      findings,
      summary: "Cannot reach the host — joinability unknown and likely broken.",
    };
  }
  push(findings, "ssh", "pass", "Control link reachable.");

  const crashInTail = detectCrashInLogTail(logTail);
  if (crashInTail && !processRunning) {
    push(
      findings,
      "crash_log",
      "fail",
      "Recent logs show a native crash / memory error and the game process is gone — post-start failure.",
    );
    const registered = parseLogAdvertisedRegistration(logTail);
    const advertisedAddress = registered ? `${registered.host}:${registered.port}` : undefined;
    if (parseLogA2sFailure(logTail)) {
      a2sStatus = "failed";
      push(findings, "a2s_log", "fail", "Logs show A2S / query init failed before crash.");
    } else {
      a2sStatus = a2sPortBound ? "ok" : "unknown";
    }
    return {
      startupState: "crashed",
      joinability: "not_joinable",
      a2sStatus,
      advertisedAddress,
      expectedPublicAddress: configPublicAddress?.trim() || undefined,
      findings,
      summary:
        "Process exited after crash signatures in the log (e.g. heap corruption) — treat as down until restarted.",
    };
  }

  if (crashInTail && processRunning) {
    push(
      findings,
      "crash_log",
      "fail",
      "Logs show crash / corruption signatures while a process is still reported — unstable or exiting.",
    );
    return {
      startupState: "failed",
      joinability: "not_joinable",
      a2sStatus: parseLogA2sFailure(logTail) ? "failed" : "unknown",
      expectedPublicAddress: configPublicAddress?.trim() || undefined,
      findings,
      summary: "Fatal error in recent logs — server may be crashing or stuck; do not treat as healthy.",
    };
  }

  const hi = logAnalysis?.summary.highestSeverity ?? "none";
  const hasFatalLog = fatalBootOrStuckLog(logAnalysis, logTail);

  if (hasFatalLog) {
    push(
      findings,
      "log_fatal",
      "fail",
      "Recent logs show critical/error patterns that usually block a healthy boot.",
    );
    return {
      startupState: "failed",
      joinability: "not_joinable",
      a2sStatus: parseLogA2sFailure(logTail) ? "failed" : "unknown",
      expectedPublicAddress: configPublicAddress ?? undefined,
      findings,
      summary: logAnalysis?.issues[0]?.title
        ? `Startup failed — ${logAnalysis.issues[0].title}`
        : "Startup failed — critical issues in recent log tail.",
    };
  }

  push(findings, "process", processRunning ? "pass" : "warn", processRunning ? "Game process seen." : "Process not seen in pgrep.");
  push(findings, "tmux", tmuxActive ? "pass" : "warn", tmuxActive ? "tmux session present." : "tmux session not seen.");

  if (!gamePortBound) {
    push(findings, "udp_game", "fail", `UDP :${checkPort} not visible in ss — not listening for game traffic.`);
  } else {
    push(findings, "udp_game", "pass", `UDP :${checkPort} visible.`);
  }

  const a2sLogFailed = parseLogA2sFailure(logTail);
  if (a2sLogFailed) {
    a2sStatus = "failed";
    push(
      findings,
      "a2s_log",
      "fail",
      "Logs report A2S / query failure (e.g. init failed or A2S turned off) — Steam server browser may not list this host.",
    );
  } else if (a2sPortBound) {
    a2sStatus = "ok";
    push(findings, "udp_a2s", "pass", "UDP :17777 visible.");
  } else {
    a2sStatus = "unknown";
    push(findings, "udp_a2s", "warn", "UDP :17777 not visible — query / Steam list may fail.");
  }

  const registered = parseLogAdvertisedRegistration(logTail);
  let advertisedAddress: string | undefined;
  if (registered) {
    advertisedAddress = `${registered.host}:${registered.port}`;
    if (isUnroutableAdvertisedHost(registered.host)) {
      push(
        findings,
        "log_registration",
        "fail",
        `Log reports "registered with address: ${advertisedAddress}" — ${registered.host} is not a usable public address for clients (set publicAddress in config to your real IP/DNS).`,
      );
    } else {
      push(
        findings,
        "log_registration",
        "pass",
        `Log reports registration at ${advertisedAddress}.`,
      );
    }
  } else {
    push(
      findings,
      "log_registration",
      "warn",
      'No "registered with address" line in recent log tail — cannot confirm advertised endpoint.',
    );
  }

  const pub = configPublicAddress?.trim() ?? "";
  const expectedPublicAddress = pub || undefined;
  if (pub) {
    const match = hostsEffectivelyMatch(pub, panelHost);
    if (match) {
      push(findings, "config_public_vs_panel", "pass", `publicAddress (${pub}) matches panel host.`);
    } else {
      push(
        findings,
        "config_public_vs_panel",
        "warn",
        `publicAddress (${pub}) differs from panel SSH host (${panelHost}) — friends may use the wrong address unless intentional.`,
      );
    }
  } else {
    push(findings, "config_public", "warn", "publicAddress is empty — clients may rely on wrong defaults; set your public IP/DNS.");
  }

  const registrationBlocksJoin =
    registered != null && isUnroutableAdvertisedHost(registered.host);
  const portsOk = gamePortBound && a2sPortBound;
  const infraUp = processRunning && tmuxActive && serverLikelyUp;

  if (registrationBlocksJoin) {
    joinability = "not_joinable";
  } else if (!gamePortBound) {
    joinability = "not_joinable";
  } else if (
    registered &&
    !isUnroutableAdvertisedHost(registered.host) &&
    portsOk &&
    processRunning &&
    !a2sLogFailed
  ) {
    joinability = "likely_joinable";
  } else if (portsOk && processRunning && pub && !registrationBlocksJoin && !a2sLogFailed) {
    joinability = "likely_joinable";
  } else if (portsOk && processRunning) {
    joinability = "unknown";
  } else {
    joinability = "unknown";
  }

  if (registrationBlocksJoin || !gamePortBound) {
    startupState = infraUp ? "degraded" : "starting";
  } else if (!processRunning || !tmuxActive) {
    startupState = "starting";
  } else if (joinability === "not_joinable") {
    startupState = "degraded";
  } else if (a2sLogFailed) {
    startupState = "degraded";
  } else if (joinability === "likely_joinable" && portsOk && !a2sLogFailed) {
    startupState = "running";
  } else if (!portsOk && processRunning && !a2sLogFailed) {
    startupState = "starting";
  } else {
    startupState = "degraded";
  }

  let summary: string;
  if (a2sLogFailed && registrationBlocksJoin) {
    summary =
      "Invalid advertised registration (e.g. 0.0.0.0) and A2S/query failed — not suitable for public play until fixed.";
  } else if (registrationBlocksJoin) {
    summary =
      "Server process and ports may be up, but logs show registration on a non-public address (e.g. 0.0.0.0) — clients cannot join until publicAddress is correct.";
  } else if (a2sLogFailed) {
    summary =
      "A2S / query layer failed in logs — Steam browser listing may be broken even if the game port responds.";
  } else if (!gamePortBound) {
    summary = "Game UDP port is not bound — server is not ready for players.";
  } else if (joinability === "likely_joinable" && startupState === "running") {
    summary = "Runtime looks healthy: process, ports, registration, and A2S checks pass.";
  } else if (startupState === "degraded") {
    summary =
      "Runtime is degraded: check registration line, publicAddress, A2S messages, and UDP ports before expecting players.";
  } else {
    summary = "Server is still converging or verification is incomplete — see findings below.";
  }

  return {
    startupState,
    joinability,
    advertisedAddress,
    expectedPublicAddress,
    a2sStatus,
    findings,
    summary,
  };
}

/**
 * Cap health score when joinability or A2S is broken so the hero does not show false "Healthy".
 */
export function mergeHealthScoreWithRuntimeTruth(
  base: HealthScoreResult,
  truth: RuntimeTruthResult,
): HealthScoreResult {
  if (
    truth.joinability !== "not_joinable" &&
    truth.a2sStatus !== "failed" &&
    truth.startupState !== "crashed" &&
    truth.startupState !== "degraded"
  ) {
    return base;
  }

  const penalties = [...base.penalties];
  let nextScore = base.score;

  if (truth.startupState === "crashed") {
    penalties.push("Server crashed — native / heap error (−50)");
    nextScore = Math.min(nextScore, 24);
  } else {
    if (truth.joinability === "not_joinable") {
      penalties.push("Joinability blocked — registration or ports (−25)");
      nextScore = Math.min(nextScore, 49);
    }
    if (truth.a2sStatus === "failed") {
      penalties.push("A2S / query failed in logs (−15)");
      nextScore = Math.min(nextScore, 59);
    }
    if (truth.startupState === "degraded") {
      nextScore = Math.min(nextScore, 54);
    }
  }

  let nextStatus: HealthScoreResult["status"] = base.status;
  if (nextScore < 45) nextStatus = "Critical";
  else if (nextScore < 60) nextStatus = "Warning";
  else nextStatus = "Degraded";

  const summaryFromTruth =
    truth.startupState === "crashed"
      ? truth.summary
      : (truth.findings.find((f) => f.key === "log_registration" && f.status === "fail")?.message ??
        (truth.a2sStatus === "failed"
          ? truth.findings.find((f) => f.key === "a2s_log")?.message
          : undefined) ??
        `Runtime: ${truth.summary}`);

  return {
    ...base,
    score: nextScore,
    status: nextStatus,
    penalties,
    summary: summaryFromTruth,
  };
}

/** Override naive classifier output when truth shows failed boot, crash, or non-joinable server. */
export function applyTruthToRuntimeState(
  base: RuntimeStateResult,
  truth: RuntimeTruthResult,
): RuntimeStateResult {
  if (truth.startupState === "crashed") {
    return {
      state: "failed",
      title: "Server crashed",
      message: truth.summary,
      confidence: "high",
    };
  }
  if (truth.startupState === "failed") {
    return {
      state: "failed",
      title: "Startup failed",
      message: truth.summary,
      confidence: "high",
    };
  }
  if (truth.joinability === "not_joinable") {
    return {
      state: "warning",
      title: "Not joinable",
      message: truth.summary,
      confidence: "high",
    };
  }
  if (truth.startupState === "degraded") {
    return {
      state: "warning",
      title: "Degraded runtime",
      message: truth.summary,
      confidence: "high",
    };
  }
  return base;
}
