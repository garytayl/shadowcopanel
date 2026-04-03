"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { runFixServerPipeline } from "@/lib/ssh/fix-server";
import { err, ok, type ApiResult } from "@/lib/types/api";
import type { FixServerResult } from "@/lib/types/fix-server";

export async function actionFixServer(): Promise<ApiResult<FixServerResult>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const result = await runFixServerPipeline();
    return ok(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(msg);
  }
}
