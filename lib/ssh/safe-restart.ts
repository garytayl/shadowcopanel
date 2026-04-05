import "server-only";

import { requireResolvedServerEnv } from "@/lib/server-profiles/resolve";
import { getPublicServerSettingsResolved } from "@/lib/server-profiles/public-settings";
import { applyFixServerDefaults } from "@/lib/reforger/fix-server-defaults";
import { normalizeReforgerConfig } from "@/lib/reforger/config-normalize";
import { validateReforgerConfigForFixServer } from "@/lib/reforger/config-validate";
import { analyzeReforgerLogs } from "@/lib/reforger/log-analysis";
import { evaluateRuntimeTruth } from "@/lib/reforger/runtime-truth";
import type { RuntimeTruthResult } from "@/lib/reforger/runtime-truth";
import {
  killRefogerProcessesPgrep,
  killTmuxSessionLoose,
  snapshotRuntimeState,
  snapshotUdpPortsBound,
  waitForPostRestartConvergence,
  waitUntilProcessesGone,
} from "@/lib/ssh/orchestration";
import {
  getRecentLogs,
  getRemoteConfigText,
  saveRemoteConfig,
  startServer,
  stopServer,
} from "@/lib/ssh/reforger";
import type { LogAnalysisResult } from "@/lib/reforger/log-analysis";
import type {
  SafeRestartReason,
  SafeRestartResult,
  SafeRestartStateSnapshot,
  SafeRestartStep,
  SafeRestartVerification,
} from "@/lib/types/safe-restart";
import { parseConfigJson, type ReforgerConfig } from "@/lib/types/reforger-config";

function push(steps: SafeRestartStep[], step: string, status: SafeRestartStep["status"], message?: string) {
  steps.push({ step, status, message });
}

export type SafeRestartOptions = {
  reason?: SafeRestartReason;
};

export async function runSafeRestartPipeline(opts?: SafeRestartOptions): Promise<SafeRestartResult> {
  const steps: SafeRestartStep[] = [];
  const settings = await getPublicServerSettingsResolved();
  const checkPort = settings.checkPort;
  const env = await requireResolvedServerEnv();
  const panelHost = env.REFORGER_SSH_HOST ?? "";
  const session = env.REFORGER_TMUX_SESSION;
  const reason = opts?.reason ?? "manual";

  const fallbackSnapshot: SafeRestartStateSnapshot = {
    processRunning: false,
    tmuxActive: false,
    portsBound: false,
  };

  try {
    const tail = await getRecentLogs(250);
    const preLogAnalysis = analyzeReforgerLogs(tail);
    const hi = preLogAnalysis.summary.highestSeverity;
    if (hi === "none") {
      push(steps, "Pre-restart log scan", "ok", "No known failure patterns in recent tail.");
    } else {
      push(
        steps,
        "Pre-restart log scan",
        "warn",
        `${preLogAnalysis.summary.totalIssues} pattern(s) before restart (highest: ${hi}).`,
      );
    }
  } catch (e) {
    push(
      steps,
      "Pre-restart log scan",
      "warn",
      e instanceof Error ? e.message : String(e),
    );
  }

  let before: SafeRestartStateSnapshot = fallbackSnapshot;
  try {
    before = await snapshotRuntimeState(checkPort, session);
    push(
      steps,
      "Record pre-restart state",
      "ok",
      `process=${before.processRunning} · tmux=${before.tmuxActive} · UDP ports OK=${before.portsBound}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push(steps, "Record pre-restart state", "fail", msg);
    return failResult(
      steps,
      fallbackSnapshot,
      fallbackSnapshot,
      "Could not read server state — aborting.",
      reason,
    );
  }

  let raw: string;
  try {
    raw = await getRemoteConfigText();
  } catch (e) {
    push(steps, "Load remote config.json", "fail", e instanceof Error ? e.message : String(e));
    return failResult(steps, before, before, "Safe restart aborted — config not readable.", reason);
  }
  push(steps, "Load remote config.json", "ok");

  const parsed = parseConfigJson(raw);
  if (!parsed.ok) {
    push(steps, "Parse config JSON", "fail", parsed.error);
    return failResult(steps, before, before, "Safe restart aborted — invalid JSON.", reason);
  }

  const norm = normalizeReforgerConfig(parsed.value);
  const applied = applyFixServerDefaults(norm.config, {
    publicHostHint: env.REFORGER_SSH_HOST,
    defaultBindPort: checkPort,
  });

  const v = validateReforgerConfigForFixServer(applied.config);
  if (!v.ok) {
    const detail = v.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
    push(steps, "Validate config", "fail", detail);
    return failResult(
      steps,
      before,
      before,
      "Safe restart aborted — config failed validation.",
      reason,
    );
  }
  push(steps, "Validate config", "ok");

  const normalizationNotes: string[] = [
    ...norm.issues.map((i) => i.message),
    ...applied.filled.map((f) => `Default applied: ${f}`),
  ].filter(Boolean);

  const configRepaired = norm.changed || applied.filled.length > 0;

  try {
    await saveRemoteConfig(applied.config as ReforgerConfig);
    push(
      steps,
      "Persist normalized config",
      "ok",
      configRepaired ? "Wrote cleaned config (backup if needed)." : "Config already canonical.",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push(steps, "Persist normalized config", "fail", msg);
    return failResult(steps, before, before, "Safe restart aborted — could not save config.", reason);
  }

  try {
    await stopServer();
    push(steps, "Graceful stop (tmux)", "ok", "SIGINT + kill-session sequence.");
  } catch (e) {
    push(
      steps,
      "Graceful stop (tmux)",
      "warn",
      e instanceof Error ? e.message : String(e),
    );
  }

  try {
    const { pidCount } = await killRefogerProcessesPgrep();
    push(
      steps,
      "Stop processes (pkill)",
      "ok",
      pidCount > 0 ? `Matched ${pidCount} PID(s); cleared.` : "No Arma/enfMain PIDs found.",
    );
  } catch (e) {
    push(steps, "Stop processes (pkill)", "fail", e instanceof Error ? e.message : String(e));
    return failResult(steps, before, before, "Safe restart failed during process cleanup.", reason);
  }

  try {
    await killTmuxSessionLoose(session);
    push(steps, "Remove tmux session", "ok", "Session cleared (if it existed).");
  } catch (e) {
    push(
      steps,
      "Remove tmux session",
      "warn",
      e instanceof Error ? e.message : String(e),
    );
  }

  const gone = await waitUntilProcessesGone();
  if (!gone) {
    push(steps, "Verify processes stopped", "fail", "Processes still present after cleanup.");
    return failResult(
      steps,
      before,
      before,
      "Safe restart aborted — server processes did not exit cleanly.",
      reason,
    );
  }
  push(steps, "Verify processes stopped", "ok", "No Reforger/enfMain process lines.");

  try {
    const start = await startServer();
    push(steps, "Start server (tmux)", "ok", start.message);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push(steps, "Start server (tmux)", "fail", msg);
    const afterDead = await snapshotRuntimeState(checkPort, session);
    return {
      success: false,
      level: "failure",
      summary: "Restart failed — start command did not complete.",
      steps,
      before,
      after: afterDead,
      configRepaired,
      normalizationNotes: normalizationNotes.length ? normalizationNotes : undefined,
      reason,
    };
  }

  const converge = await waitForPostRestartConvergence(checkPort, session);
  const after: SafeRestartStateSnapshot = {
    processRunning: converge.snapshot.processRunning,
    tmuxActive: converge.snapshot.tmuxActive,
    portsBound: converge.snapshot.portsBound,
  };

  const verification: SafeRestartVerification = {
    attempts: converge.attempts,
    succeededOnAttempt: converge.succeededOnAttempt,
    portsBoundLate: converge.portsBoundLate,
  };

  let verifyStepStatus: SafeRestartStep["status"] = "warn";
  let verifyMsg: string;
  if (converge.succeededOnAttempt != null) {
    verifyStepStatus = "ok";
    if (converge.succeededOnAttempt === 1) {
      verifyMsg = `OK on first check. process=${after.processRunning} · tmux=${after.tmuxActive} · UDP :${checkPort}+17777 bound`;
    } else {
      verifyMsg = `OK on check ${converge.succeededOnAttempt}/${converge.attempts}. process=${after.processRunning} · tmux=${after.tmuxActive} · UDP :${checkPort}+17777 bound`;
      if (converge.portsBoundLate) {
        verifyMsg += " (ports were slow to bind)";
      }
    }
  } else if (!after.processRunning) {
    verifyStepStatus = "fail";
    verifyMsg = `After ${converge.attempts} check(s): process not running`;
  } else if (!after.tmuxActive) {
    verifyStepStatus = "fail";
    verifyMsg = `After ${converge.attempts} check(s): tmux session not active`;
  } else {
    verifyStepStatus = "warn";
    verifyMsg = `After ${converge.attempts} check(s): process+tmux OK but both UDP ports not seen (:${checkPort} + :17777)`;
  }
  push(steps, "Post-restart verification", verifyStepStatus, verifyMsg);

  let logAnalysis: LogAnalysisResult | undefined;
  let postRestartTruth: RuntimeTruthResult | undefined;
  try {
    const tail = await getRecentLogs(400);
    logAnalysis = analyzeReforgerLogs(tail);
    const portsDetail = await snapshotUdpPortsBound(checkPort);
    const pubRaw = applied.config.publicAddress;
    postRestartTruth = evaluateRuntimeTruth({
      logTail: tail,
      logAnalysis,
      sshReachable: true,
      configured: true,
      processRunning: after.processRunning,
      tmuxActive: after.tmuxActive,
      serverLikelyUp: after.processRunning && after.tmuxActive && after.portsBound,
      gamePortBound: portsDetail.game,
      a2sPortBound: portsDetail.a2s,
      checkPort,
      configPublicAddress:
        pubRaw != null && String(pubRaw).trim() !== "" ? String(pubRaw).trim() : null,
      panelHost,
    });
    const hi = logAnalysis.summary.highestSeverity;
    if (hi === "none") {
      push(steps, "Post-restart log analysis", "ok", "No known failure patterns in tail.");
    } else if (logAnalysis.summary.hasFatal || hi === "critical" || hi === "error") {
      push(
        steps,
        "Post-restart log analysis",
        "warn",
        `${logAnalysis.summary.totalIssues} pattern(s) — highest ${hi}.`,
      );
    } else {
      push(
        steps,
        "Post-restart log analysis",
        "warn",
        `${logAnalysis.summary.totalIssues} low-severity pattern(s).`,
      );
    }
    if (postRestartTruth) {
      const tOk =
        postRestartTruth.startupState === "running" &&
        postRestartTruth.joinability !== "not_joinable" &&
        postRestartTruth.a2sStatus !== "failed";
      push(
        steps,
        "Runtime truth (joinability & A2S)",
        tOk ? "ok" : postRestartTruth.startupState === "crashed" || postRestartTruth.startupState === "failed"
          ? "fail"
          : "warn",
        `${postRestartTruth.startupState} · ${postRestartTruth.joinability} · A2S ${postRestartTruth.a2sStatus} — ${postRestartTruth.summary}`.slice(
          0,
          280,
        ),
      );
    }
  } catch (e) {
    push(
      steps,
      "Post-restart log analysis",
      "warn",
      e instanceof Error ? e.message : String(e),
    );
  }

  const detectedIssues = logAnalysis?.issues.map((i) => i.title) ?? [];

  const fullyHealthy = converge.succeededOnAttempt != null;
  const logSevere =
    logAnalysis &&
    (logAnalysis.summary.hasFatal || logAnalysis.summary.highestSeverity === "critical");
  const logBad =
    logAnalysis &&
    (logAnalysis.summary.hasFatal ||
      logAnalysis.summary.highestSeverity === "critical" ||
      logAnalysis.summary.highestSeverity === "error");

  const runtimeOk =
    postRestartTruth &&
    postRestartTruth.startupState === "running" &&
    postRestartTruth.joinability !== "not_joinable" &&
    postRestartTruth.a2sStatus !== "failed";

  if (fullyHealthy && runtimeOk && !logSevere) {
    let summary = "Restart completed — server looks healthy.";
    if (converge.succeededOnAttempt != null && converge.succeededOnAttempt > 1) {
      if (converge.portsBoundLate) {
        summary = `Server restarted successfully; ports became ready after ${converge.succeededOnAttempt} checks.`;
      } else {
        summary = `Server restarted successfully; runtime became ready after ${converge.succeededOnAttempt} checks.`;
      }
    }
    return {
      success: true,
      level: "success",
      summary,
      steps,
      before,
      after,
      configRepaired,
      normalizationNotes: normalizationNotes.length ? normalizationNotes : undefined,
      detectedIssues: detectedIssues.length ? detectedIssues : undefined,
      logAnalysis,
      reason,
      verification,
    };
  }

  if (fullyHealthy && !runtimeOk && postRestartTruth) {
    return {
      success: true,
      level: "warning",
      summary: `Restarted, but runtime checks failed: ${postRestartTruth.summary}`,
      steps,
      before,
      after,
      configRepaired,
      normalizationNotes: normalizationNotes.length ? normalizationNotes : undefined,
      detectedIssues: detectedIssues.length ? detectedIssues : undefined,
      logAnalysis,
      reason,
      verification,
    };
  }

  if (!after.processRunning) {
    return {
      success: false,
      level: "failure",
      summary: "Restart failed — process not detected after verification window.",
      steps,
      before,
      after,
      configRepaired,
      normalizationNotes: normalizationNotes.length ? normalizationNotes : undefined,
      detectedIssues: detectedIssues.length ? detectedIssues : undefined,
      logAnalysis,
      reason,
      verification,
    };
  }

  if (!after.tmuxActive) {
    return {
      success: false,
      level: "failure",
      summary: "Restart failed — tmux session not active after verification window.",
      steps,
      before,
      after,
      configRepaired,
      normalizationNotes: normalizationNotes.length ? normalizationNotes : undefined,
      detectedIssues: detectedIssues.length ? detectedIssues : undefined,
      logAnalysis,
      reason,
      verification,
    };
  }

  if (!after.portsBound) {
    return {
      success: true,
      level: "warning",
      summary:
        `Restarted — both UDP ports were not bound after ${converge.attempts} check(s). ` +
        `If the server is still starting, refresh Home in a moment.`,
      steps,
      before,
      after,
      configRepaired,
      normalizationNotes: normalizationNotes.length ? normalizationNotes : undefined,
      detectedIssues: detectedIssues.length ? detectedIssues : undefined,
      logAnalysis,
      reason,
      verification,
    };
  }

  return {
    success: true,
    level: "warning",
    summary: logBad
      ? "Restarted, but logs show errors — check diagnostics."
      : "Restarted, but some checks need attention.",
    steps,
    before,
    after,
    configRepaired,
    normalizationNotes: normalizationNotes.length ? normalizationNotes : undefined,
    detectedIssues: detectedIssues.length ? detectedIssues : undefined,
    logAnalysis,
    reason,
    verification,
  };
}

function failResult(
  steps: SafeRestartStep[],
  before: SafeRestartStateSnapshot,
  after: SafeRestartStateSnapshot,
  summary: string,
  reason: SafeRestartReason,
): SafeRestartResult {
  return {
    success: false,
    level: "failure",
    summary,
    steps,
    before,
    after,
    reason,
  };
}
