"use server";

import { ensureConfigured } from "@/lib/actions/guard";
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
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
