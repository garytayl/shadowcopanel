"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { getPublicServerSettings } from "@/lib/env/server";
import { getGamePortChecks } from "@/lib/ssh/port-check";
import {
  getHealthSnapshot,
  getListeningPorts,
  getRecentLogs,
  getServerRuntimeStatus,
  getSystemSnapshot,
  restartServer,
  startServer,
  stopServer,
} from "@/lib/ssh/reforger";
import { err, ok, type ApiResult } from "@/lib/types/api";
import type { PortCheck } from "@/lib/types/connectivity";

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
};

export async function fetchDashboardSnapshot(): Promise<
  ApiResult<DashboardSnapshot>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const settings = getPublicServerSettings();
    const [status, ports, portResult, health, system] = await Promise.all([
      getServerRuntimeStatus(),
      getListeningPorts(),
      getGamePortChecks(settings.checkPort),
      getHealthSnapshot(),
      getSystemSnapshot(),
    ]);
    return ok({
      settings,
      status,
      ports: { stdout: ports.stdout },
      portChecks: portResult.checks,
      portCheckSsRaw: portResult.ssRaw,
      health,
      system,
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
    return ok(await startServer());
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
    return ok(await stopServer());
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
    return ok(await restartServer());
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
