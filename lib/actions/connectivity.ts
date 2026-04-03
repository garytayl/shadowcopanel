"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { requireServerEnv } from "@/lib/env/server";
import { runJoinabilityDiagnostics } from "@/lib/ssh/joinability";
import { getRemoteConfigText, saveRemoteConfig } from "@/lib/ssh/reforger";
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
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Set `publicAddress` in remote config.json to the panel’s configured SSH host (EC2 public IP/DNS).
 */
export async function actionSyncPublicAddressToPanelHost(): Promise<
  ApiResult<{ bytes: number }>
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
    const base = p.value as ReforgerConfig;
    const next: ReforgerConfig = {
      ...base,
      publicAddress: host,
    };
    return ok(await saveRemoteConfig(next));
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
