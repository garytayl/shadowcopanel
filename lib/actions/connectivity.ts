"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { safeRecordActivity } from "@/lib/activity/log";
import { requireServerEnv } from "@/lib/env/server";
import { runJoinabilityDiagnostics } from "@/lib/ssh/joinability";
import { normalizeReforgerConfig } from "@/lib/reforger/config-normalize";
import { getRemoteConfigText, saveRemoteConfig, type RemoteConfigSaveResult } from "@/lib/ssh/reforger";
import { parseConfigJson, type ReforgerConfig } from "@/lib/types/reforger-config";
import { err, ok, type ApiResult } from "@/lib/types/api";
import type { JoinabilityResult } from "@/lib/types/connectivity";

export async function actionRunJoinabilityCheck(): Promise<
  ApiResult<JoinabilityResult>
> {
  const g = ensureConfigured();
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
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const env = requireServerEnv();
    const host = env.REFORGER_SSH_HOST.trim();
    if (!host) return err("Panel host is not set");

    const raw = await getRemoteConfigText();
    const p = parseConfigJson(raw);
    if (!p.ok) return err(p.error);
    const base = normalizeReforgerConfig(p.value as ReforgerConfig).config;
    const next: ReforgerConfig = { ...base, publicAddress: host };
    const r = await saveRemoteConfig(next);
    safeRecordActivity({
      type: "config_saved",
      severity: "success",
      title: "Public address synced from panel",
      message: `publicAddress → ${host}`,
      metadata: { bytes: r.bytes, host },
    });
    return ok(r);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
