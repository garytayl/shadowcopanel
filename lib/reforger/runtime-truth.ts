/**
 * Single evaluation of "what is actually true" about the dedicated server:
 * process/ports vs joinability vs log-reported registration — avoids naive success.
 */

import type { LogAnalysisResult } from "@/lib/reforger/log-analysis";
import type { HealthScoreResult } from "@/lib/reforger/health-score";
import type { RuntimeStateResult } from "@/lib/reforger/runtime-state";
import { hostsEffectivelyMatch } from "@/lib/connectivity/joinability-model";

export type RuntimeStartupState = "starting" | "running" | "degraded" | "failed";

export type RuntimeJoinability = "likely_joinable" | "not_joinable" | "unknown";

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

  if (!configured) {
    push(findings, "configured", "fail", "SSH / panel is not fully configured.");
    return {
      startupState: "failed",
      joinability: "not_joinable",
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
      expectedPublicAddress: configPublicAddress ?? undefined,
      findings,
      summary: "Cannot reach the host — joinability unknown and likely broken.",
    };
  }
  push(findings, "ssh", "pass", "Control link reachable.");

  const hi = logAnalysis?.summary.highestSeverity ?? "none";
  const hasFatalLog =
    logAnalysis?.summary.hasFatal ||
    hi === "critical" ||
    (hi === "error" &&
      logAnalysis?.issues.some((i) =>
        ["oom", "segfault", "assert-fail", "init-failed", "disk-full"].includes(i.key),
      ));

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
  if (!a2sPortBound) {
    push(findings, "udp_a2s", "warn", "UDP :17777 not visible — query / Steam list may fail.");
  } else {
    push(findings, "udp_a2s", "pass", "UDP :17777 visible.");
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
  } else if (registered && !isUnroutableAdvertisedHost(registered.host) && portsOk && processRunning) {
    joinability = "likely_joinable";
  } else if (portsOk && processRunning && pub && !registrationBlocksJoin) {
    joinability = "likely_joinable";
  } else if (portsOk && processRunning) {
    joinability = "unknown";
  } else {
    joinability = "unknown";
  }

  if (hasFatalLog) {
    startupState = "failed";
  } else if (registrationBlocksJoin || !gamePortBound) {
    startupState = infraUp ? "degraded" : "starting";
  } else if (!processRunning || !tmuxActive) {
    startupState = "starting";
  } else if (joinability === "not_joinable") {
    startupState = "degraded";
  } else if (joinability === "likely_joinable" && portsOk) {
    startupState = "running";
  } else {
    startupState = portsOk ? "running" : "degraded";
  }

  let summary: string;
  if (registrationBlocksJoin) {
    summary =
      "Server process and ports may be up, but logs show registration on a non-public address (e.g. 0.0.0.0) — clients cannot join until publicAddress is correct.";
  } else if (!gamePortBound) {
    summary = "Game UDP port is not bound — server is not ready for players.";
  } else if (joinability === "likely_joinable" && startupState === "running") {
    summary = "Runtime looks healthy: process, ports, and joinability checks pass.";
  } else if (startupState === "degraded") {
    summary =
      "Runtime is degraded: check registration line, publicAddress, and UDP ports before expecting players to connect.";
  } else {
    summary = "Server is still converging or verification is incomplete — see findings below.";
  }

  return {
    startupState,
    joinability,
    advertisedAddress,
    expectedPublicAddress,
    findings,
    summary,
  };
}

/**
 * Cap health score when joinability is broken so the hero does not show false "Healthy".
 */
export function mergeHealthScoreWithRuntimeTruth(
  base: HealthScoreResult,
  truth: RuntimeTruthResult,
): HealthScoreResult {
  if (truth.joinability !== "not_joinable") return base;

  const penalty = "Joinability blocked — registration or ports (−25)";
  const nextScore = Math.min(base.score, 49);
  const nextPenalties = [...base.penalties, penalty];
  let nextStatus: HealthScoreResult["status"] = base.status;
  if (nextScore < 40) nextStatus = "Critical";
  else if (nextScore < 60) nextStatus = "Warning";
  else nextStatus = "Degraded";

  return {
    ...base,
    score: nextScore,
    status: nextStatus,
    penalties: nextPenalties,
    summary:
      truth.findings.find((f) => f.key === "log_registration" && f.status === "fail")?.message ??
      `Joinability: not joinable — ${truth.summary}`,
  };
}

/** Override naive classifier output when truth shows failed boot or non-joinable server. */
export function applyTruthToRuntimeState(
  base: RuntimeStateResult,
  truth: RuntimeTruthResult,
): RuntimeStateResult {
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
  return base;
}
