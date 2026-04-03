import "server-only";

import { getPublicServerSettings, requireServerEnv } from "@/lib/env/server";
import { applyFixServerDefaults } from "@/lib/reforger/fix-server-defaults";
import { normalizeReforgerConfig } from "@/lib/reforger/config-normalize";
import { validateReforgerConfigForFixServer } from "@/lib/reforger/config-validate";
import { analyzeReforgerLogs } from "@/lib/reforger/log-analysis";
import {
  killRefogerProcessesPgrep,
  killTmuxSessionLoose,
  shSingleQuote,
} from "@/lib/ssh/orchestration";
import { getRecentLogs, getRemoteConfigText, saveRemoteConfig, startServer } from "@/lib/ssh/reforger";
import { sshExec } from "@/lib/ssh/client";
import type { LogAnalysisResult } from "@/lib/reforger/log-analysis";
import type {
  FixServerDiagnostics,
  FixServerResult,
  FixServerResultLevel,
  FixServerStep,
} from "@/lib/types/fix-server";
import { parseConfigJson, type ReforgerConfig } from "@/lib/types/reforger-config";

function emptyDiagnostics(): FixServerDiagnostics {
  return {
    processesFound: 0,
    processesCleaned: false,
    tmuxReset: false,
    processRunning: false,
    portsOpen: false,
    tmuxSessionPresent: false,
  };
}

function buildResult(
  level: FixServerResultLevel,
  summary: string,
  steps: FixServerStep[],
  diagnostics: FixServerDiagnostics,
  whatWasFixed?: string[],
  logAnalysis?: LogAnalysisResult,
): FixServerResult {
  return {
    success: level !== "failure",
    level,
    summary,
    steps,
    diagnostics,
    whatWasFixed,
    logAnalysis,
  };
}

/**
 * One-click recovery: validate config first (no destructive steps if invalid),
 * then clean processes/tmux, write normalized config, start, verify.
 */
export async function runFixServerPipeline(): Promise<FixServerResult> {
  const steps: FixServerStep[] = [];
  const diag = emptyDiagnostics();
  const settings = getPublicServerSettings();
  const checkPort = settings.checkPort;
  const env = requireServerEnv();
  const session = env.REFORGER_TMUX_SESSION;

  const push = (step: string, status: FixServerStep["status"], message?: string) => {
    steps.push({ step, status, message });
  };

  let raw: string;
  try {
    raw = await getRemoteConfigText();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push("Load remote config.json", "fail", msg);
    return buildResult("failure", "Repair failed — see details", steps, diag);
  }
  push("Load remote config.json", "ok");

  const parsed = parseConfigJson(raw);
  if (!parsed.ok) {
    push("Parse JSON", "fail", parsed.error);
    return buildResult("failure", "Repair failed — see details", steps, diag);
  }
  push("Parse JSON", "ok");

  const norm = normalizeReforgerConfig(parsed.value);
  const applied = applyFixServerDefaults(norm.config, {
    publicHostHint: env.REFORGER_SSH_HOST,
    defaultBindPort: checkPort,
  });

  const v = validateReforgerConfigForFixServer(applied.config);
  if (!v.ok) {
    const detail = v.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
    push("Validate config", "fail", detail);
    const wf = [
      ...collectWhatWasFixed(norm.issues.map((i) => i.message), applied.filled),
      ...v.issues.map((i) => `${i.path}: ${i.message}`),
    ];
    return buildResult("failure", "Repair failed — see details", steps, diag, wf);
  }
  push("Validate config", "ok");

  const whatWasFixed = collectWhatWasFixed(
    norm.issues.map((i) => i.message),
    applied.filled,
  );

  // --- Destructive + save (config known good) ---

  let pcount = 0;
  try {
    const k = await killRefogerProcessesPgrep();
    pcount = k.pidCount;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push("Kill stuck processes", "fail", msg);
    return buildResult("failure", "Repair failed — see details", steps, diag, whatWasFixed);
  }
  diag.processesFound = pcount;
  diag.processesCleaned = pcount > 0;
  push(
    "Kill stuck processes",
    "ok",
    pcount > 0 ? `Found ${pcount} matching PID(s); sent pkill.` : "No matching processes.",
  );

  let hadTmux = false;
  try {
    const has = await sshExec(`tmux has-session -t ${shSingleQuote(session)} 2>/dev/null`);
    hadTmux = has.code === 0;
  } catch {
    hadTmux = false;
  }

  try {
    await killTmuxSessionLoose(session);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push("Reset tmux session", "fail", msg);
    return buildResult("failure", "Repair failed — see details", steps, diag, whatWasFixed);
  }
  diag.tmuxReset = hadTmux;
  push("Reset tmux session", "ok", hadTmux ? `Removed session “${session}”.` : "No session to remove.");

  try {
    await saveRemoteConfig(applied.config as ReforgerConfig);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push("Save cleaned config", "fail", msg);
    return buildResult("failure", "Repair failed — see details", steps, diag, whatWasFixed);
  }
  push("Save cleaned config", "ok");

  try {
    const start = await startServer();
    push("Start server", "ok", start.message);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push("Start server", "fail", msg);
    return buildResult("failure", "Repair failed — see details", steps, diag, whatWasFixed);
  }

  await new Promise((r) => setTimeout(r, 2500));

  try {
    const pg = await sshExec("pgrep -fl enfMain 2>/dev/null || true");
    diag.processRunning = /enfMain/i.test(pg.stdout);
    if (!diag.processRunning) {
      push("Verify process (enfMain)", "warn", "Process not seen yet — may still be booting.");
    } else {
      push("Verify process (enfMain)", "ok");
    }
  } catch (e) {
    diag.processRunning = false;
    push("Verify process (enfMain)", "warn", e instanceof Error ? e.message : String(e));
  }

  const portPat = `:${checkPort}([^0-9]|$)|:17777([^0-9]|$)`;
  try {
    const ss = await sshExec(`ss -u -lpn 2>/dev/null | grep -E ${shSingleQuote(portPat)} || true`);
    diag.portsOpen = ss.stdout.trim().length > 0;
    if (!diag.portsOpen) {
      push("Verify ports (UDP)", "warn", `No socket lines for :${checkPort} or :17777 in ss -u -lpn.`);
    } else {
      push("Verify ports (UDP)", "ok");
    }
  } catch (e) {
    diag.portsOpen = false;
    push("Verify ports (UDP)", "warn", e instanceof Error ? e.message : String(e));
  }

  try {
    const tls = await sshExec("tmux ls 2>/dev/null || true");
    diag.tmuxSessionPresent = tls.stdout
      .split("\n")
      .some((line) => line.startsWith(`${session}:`));
    if (!diag.tmuxSessionPresent) {
      push("Verify tmux session", "warn", `Session “${session}” not listed yet.`);
    } else {
      push("Verify tmux session", "ok");
    }
  } catch (e) {
    diag.tmuxSessionPresent = false;
    push("Verify tmux session", "warn", e instanceof Error ? e.message : String(e));
  }

  const allGreen = diag.processRunning && diag.portsOpen && diag.tmuxSessionPresent;

  let logTailAnalysis: LogAnalysisResult | undefined;
  try {
    const tail = await getRecentLogs(450);
    logTailAnalysis = analyzeReforgerLogs(tail);
    const hi = logTailAnalysis.summary.highestSeverity;
    if (hi === "none") {
      push("Log pattern check", "ok", "No known failure patterns in recent log tail.");
    } else if (logTailAnalysis.summary.hasFatal || hi === "critical" || hi === "error") {
      push(
        "Log pattern check",
        "warn",
        `${logTailAnalysis.summary.totalIssues} pattern(s) — highest: ${hi}.`,
      );
    } else {
      push(
        "Log pattern check",
        "warn",
        `${logTailAnalysis.summary.totalIssues} pattern(s) (${hi}) — review below.`,
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push("Log pattern check", "warn", `Could not read logs: ${msg}`);
  }

  if (allGreen) {
    return buildResult(
      "success",
      "Server repaired successfully",
      steps,
      diag,
      whatWasFixed,
      logTailAnalysis,
    );
  }

  return buildResult(
    "warning",
    "Server running, but issues detected",
    steps,
    diag,
    whatWasFixed,
    logTailAnalysis,
  );
}

function collectWhatWasFixed(normMessages: string[], filled: string[]): string[] {
  const out: string[] = [];
  for (const m of normMessages) {
    if (m && !out.includes(m)) out.push(m);
  }
  for (const f of filled) {
    if (f && !out.includes(f)) out.push(`Default applied: ${f}`);
  }
  return out;
}
