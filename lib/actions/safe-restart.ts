"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { severityForSafeRestart } from "@/lib/activity/categories";
import { safeRecordActivity } from "@/lib/activity/log";
import { runSafeRestartPipeline } from "@/lib/ssh/safe-restart";
import type { SafeRestartReason, SafeRestartResult } from "@/lib/types/safe-restart";
import { err, ok, type ApiResult } from "@/lib/types/api";

export async function actionSafeRestart(opts?: {
  reason?: SafeRestartReason;
}): Promise<ApiResult<SafeRestartResult>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const result = await runSafeRestartPipeline({ reason: opts?.reason ?? "manual" });
    safeRecordActivity({
      type: "safe_restart",
      severity: severityForSafeRestart(result.level),
      title: result.success ? "Safe restart completed" : "Safe restart finished",
      message: result.summary,
      metadata: {
        reason: result.reason ?? opts?.reason ?? "manual",
        level: result.level,
        before: result.before,
        after: result.after,
      },
    });
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
