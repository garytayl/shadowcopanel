"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import {
  maybeRecordCriticalLogIssue,
  maybeRecordHealthWarning,
  safeRecordActivity,
} from "@/lib/activity/log";
import { getPublicServerSettings } from "@/lib/env/server";
import { getGamePortChecks } from "@/lib/ssh/port-check";
import {
  computeHealthScore,
  countDistinctPidsFromPgrep,
  parseLoad1mRaw,
  type HealthScoreResult,
} from "@/lib/reforger/health-score";
import { analyzeReforgerLogs } from "@/lib/reforger/log-analysis";
import { extractRuntimeEvents } from "@/lib/reforger/runtime-events";
import type { RuntimeEvent } from "@/lib/reforger/runtime-events";
import {
  applyTruthToRuntimeState,
  evaluateRuntimeTruth,
  mergeHealthScoreWithRuntimeTruth,
} from "@/lib/reforger/runtime-truth";
import type { RuntimeTruthResult } from "@/lib/reforger/runtime-truth";
import { deriveRuntimeState } from "@/lib/reforger/runtime-state";
import type { RuntimeStateResult } from "@/lib/reforger/runtime-state";
import {
  getCpuCoreCount,
  getHealthSnapshot,
  getListeningPorts,
  getRecentLogs,
  getRemoteConfigText,
  getServerRuntimeStatus,
  getSystemSnapshot,
  restartServer,
  startServer,
  stopServer,
} from "@/lib/ssh/reforger";
import type { LogAnalysisResult } from "@/lib/reforger/log-analysis";
import { parseDfRootLine, parseFreeMemM } from "@/lib/utils/dashboard-metrics";
import { err, ok, type ApiResult } from "@/lib/types/api";
import type { PortCheck } from "@/lib/types/connectivity";
import { parseConfigJson, type ReforgerConfig } from "@/lib/types/reforger-config";

export type ServerActivitySnapshot = {
  state: RuntimeStateResult;
  events: RuntimeEvent[];
};

export type DashboardSnapshot = {
  settings: ReturnType<typeof getPublicServerSettings>;
  status: Awaited<ReturnType<typeof getServerRuntimeStatus>>;
  ports: { stdout: string };
  /** Parsed UDP/TCP socket hints for game ports (not UDP gameplay RTT). */
  portChecks: PortCheck[];
  /** Raw `ss -tuanp` snapshot used for port checks (Advanced / troubleshooting). */
  portCheckSsRaw: string;
  health: { free: string; pgrep: string };
  system: Awaited<ReturnType<typeof getSystemSnapshot>>;
  /** Structured log diagnostics from a recent tail (null if logs could not be read). */
  logAnalysis: LogAnalysisResult | null;
  /** Logical CPUs on the remote host (from `nproc`). */
  cpuCores: number;
  /** Combined health score for dashboard hero. */
  healthScore: HealthScoreResult;
  /** Humanized “what is the server doing” + high-signal events (not raw logs). */
  serverActivity: ServerActivitySnapshot;
  /** Joinability + registration truth — not naive process/ports only. */
  runtimeTruth: RuntimeTruthResult;
};

export async function fetchDashboardSnapshot(): Promise<
  ApiResult<DashboardSnapshot>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const settings = getPublicServerSettings();
    const [status, ports, portResult, health, system, cpuCores, configRaw] = await Promise.all([
      getServerRuntimeStatus(),
      getListeningPorts(),
      getGamePortChecks(settings.checkPort),
      getHealthSnapshot(),
      getSystemSnapshot(),
      getCpuCoreCount(),
      getRemoteConfigText().catch(() => ""),
    ]);

    let configPublicAddress: string | null = null;
    if (configRaw) {
      const p = parseConfigJson(configRaw);
      if (p.ok) {
        const pub = (p.value as ReforgerConfig).publicAddress;
        configPublicAddress = pub != null && String(pub).trim() !== "" ? String(pub).trim() : null;
      }
    }

    let logAnalysis: LogAnalysisResult | null = null;
    let logTail = "";
    try {
      logTail = await getRecentLogs(400);
      logAnalysis = analyzeReforgerLogs(logTail);
    } catch {
      logAnalysis = null;
    }

    const gameCheck = portResult.checks.find(
      (c) => c.port === settings.checkPort && c.protocol === "udp",
    );
    const a2sCheck = portResult.checks.find((c) => c.port === 17777 && c.protocol === "udp");
    const gamePortBound = gameCheck?.status === "listening";
    const a2sPortBound = a2sCheck?.status === "listening";

    const mem = health.free ? parseFreeMemM(health.free) : null;
    const disk = system.diskRoot ? parseDfRootLine(system.diskRoot) : null;
    const load1m = parseLoad1mRaw(system.loadavg);

    const runtimeTruth = evaluateRuntimeTruth({
      logTail,
      logAnalysis,
      sshReachable: status.sshReachable,
      configured: settings.configured,
      processRunning: status.processRunning,
      tmuxActive: status.tmuxSessionExists,
      serverLikelyUp: status.serverLikelyUp,
      gamePortBound,
      a2sPortBound,
      checkPort: settings.checkPort,
      configPublicAddress,
      panelHost: settings.host ?? "",
    });

    const healthScore = mergeHealthScoreWithRuntimeTruth(
      computeHealthScore({
        processRunning: status.processRunning,
        processCount: countDistinctPidsFromPgrep(health.pgrep),
        gamePortBound,
        a2sPortBound,
        logAnalysis,
        memoryUsedPercent: mem?.usedPct,
        load1m,
        diskUsedPercent: disk?.usedPct,
        cpuCores,
      }),
      runtimeTruth,
    );

    const baseRuntimeState = deriveRuntimeState({
      sshReachable: status.sshReachable,
      configured: settings.configured,
      processRunning: status.processRunning,
      tmuxActive: status.tmuxSessionExists,
      gamePortBound,
      a2sPortBound,
      checkPort: settings.checkPort,
      logTail: logTail || null,
      logAnalysis,
    });

    const serverActivity: ServerActivitySnapshot = {
      state: applyTruthToRuntimeState(baseRuntimeState, runtimeTruth),
      events: extractRuntimeEvents(logTail || null, logAnalysis, {
        processRunning: status.processRunning,
        tmuxActive: status.tmuxSessionExists,
        gamePortBound,
        a2sPortBound,
        checkPort: settings.checkPort,
      }),
    };

    if (logAnalysis) {
      const criticalIssues = logAnalysis.issues.filter((i) => i.severity === "critical");
      if (criticalIssues.length > 0) {
        void maybeRecordCriticalLogIssue({
          fingerprint: criticalIssues
            .map((i) => i.key)
            .sort()
            .join("|"),
          titles: criticalIssues.map((i) => i.title),
        });
      }
    }
    if (healthScore.score <= 39) {
      void maybeRecordHealthWarning({
        score: healthScore.score,
        status: healthScore.status,
        summary: healthScore.summary,
      });
    }

    return ok({
      settings,
      status,
      ports: { stdout: ports.stdout },
      portChecks: portResult.checks,
      portCheckSsRaw: portResult.ssRaw,
      health,
      system,
      logAnalysis,
      cpuCores,
      healthScore,
      serverActivity,
      runtimeTruth,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(msg);
  }
}

export async function actionStartServer(): Promise<
  ApiResult<{ message: string }>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const out = await startServer();
    safeRecordActivity({
      type: "server_started",
      severity: "success",
      title: "Start server",
      message: out.message,
    });
    return ok(out);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function actionStopServer(): Promise<
  ApiResult<{ message: string }>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const out = await stopServer();
    safeRecordActivity({
      type: "server_stopped",
      severity: "success",
      title: "Stop server",
      message: out.message,
    });
    return ok(out);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function actionRestartServer(): Promise<
  ApiResult<{ message: string }>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const out = await restartServer();
    safeRecordActivity({
      type: "server_restarted",
      severity: "success",
      title: "Restart server",
      message: out.message,
    });
    return ok(out);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function actionCheckHealth(): Promise<
  ApiResult<{ free: string; pgrep: string }>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    return ok(await getHealthSnapshot());
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function actionCheckPorts(): Promise<
  ApiResult<{ stdout: string }>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const p = await getListeningPorts();
    return ok({ stdout: p.stdout });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function actionFetchLogs(): Promise<ApiResult<{ text: string }>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const text = await getRecentLogs(500);
    return ok({ text });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function fetchPublicSettingsOnly(): Promise<
  ApiResult<{ settings: ReturnType<typeof getPublicServerSettings> }>
> {
  try {
    return ok({ settings: getPublicServerSettings() });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
