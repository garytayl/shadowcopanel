"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { safeRecordActivity } from "@/lib/activity/log";
import { requireResolvedServerEnv } from "@/lib/server-profiles/resolve";
import { runJoinabilityDiagnostics } from "@/lib/ssh/joinability";
import { syncPublicAddressToSshHost } from "@/lib/ssh/sync-public-address";
import type { RemoteConfigSaveResult } from "@/lib/ssh/reforger";
import { err, ok, type ApiResult } from "@/lib/types/api";
import type { JoinabilityResult } from "@/lib/types/connectivity";

export async function actionRunJoinabilityCheck(): Promise<
  ApiResult<JoinabilityResult>
> {
  const g = await ensureConfigured();
  if (g !== true) return g;
  try {
    const result = await runJoinabilityDiagnostics();
    safeRecordActivity({
      type: "joinability_check",
      severity:
        result.overall === "healthy" ? "success" : result.overall === "broken" ? "error" : "warn",
      title: "Joinability check",
      message: `Overall: ${result.overall}`,
      metadata: { overall: result.overall, checkCount: result.checks.length },
    });
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Set `publicAddress` in remote config.json to the panel’s configured SSH host (EC2 public IP/DNS).
 */
export async function actionSyncPublicAddressToPanelHost(): Promise<
  ApiResult<RemoteConfigSaveResult>
> {
  const g = await ensureConfigured();
  if (g !== true) return g;
  try {
    const r = await syncPublicAddressToSshHost();
    const env = await requireResolvedServerEnv();
    const h = env.REFORGER_SSH_HOST.trim();
    safeRecordActivity({
      type: "config_saved",
      severity: "success",
      title: "Public address synced from panel",
      message: `publicAddress → ${h}`,
      metadata: { bytes: r.bytes, host: h },
    });
    return ok(r);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
