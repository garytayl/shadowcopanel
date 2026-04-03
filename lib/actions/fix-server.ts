"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { severityForFixServer } from "@/lib/activity/categories";
import { safeRecordActivity } from "@/lib/activity/log";
import { runFixServerPipeline } from "@/lib/ssh/fix-server";
import { err, ok, type ApiResult } from "@/lib/types/api";
import type { FixServerResult } from "@/lib/types/fix-server";

export async function actionFixServer(): Promise<ApiResult<FixServerResult>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const result = await runFixServerPipeline();
    safeRecordActivity({
      type: "fix_server",
      severity: severityForFixServer(result.level),
      title: result.success ? "Fix Server completed" : "Fix Server finished",
      message: result.summary,
      metadata: {
        level: result.level,
        success: result.success,
        diagnostics: result.diagnostics,
        stepCount: result.steps.length,
      },
    });
    return ok(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(msg);
  }
}
