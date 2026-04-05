"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { severityForFixServer } from "@/lib/activity/categories";
import { safeRecordActivity } from "@/lib/activity/log";
import { runFixServerPipeline } from "@/lib/ssh/fix-server";
import { syncPublicAddressToSshHost } from "@/lib/ssh/sync-public-address";
import { err, ok, type ApiResult } from "@/lib/types/api";
import type { FixServerResult } from "@/lib/types/fix-server";
import type { RemoteConfigSaveResult } from "@/lib/ssh/reforger";

export type RepairJoinabilityResult = {
  sync: RemoteConfigSaveResult;
  fix: FixServerResult;
};

/**
 * One control from the dashboard: sync publicAddress to the panel SSH host, then run the full
 * fix pipeline (normalize config, reset tmux/processes, start, verify).
 */
export async function actionRepairJoinabilityFromPanel(): Promise<
  ApiResult<RepairJoinabilityResult>
> {
  const g = await ensureConfigured();
  if (g !== true) return g;
  try {
    const sync = await syncPublicAddressToSshHost();
    const fix = await runFixServerPipeline();
    safeRecordActivity({
      type: "fix_server",
      severity: severityForFixServer(fix.level),
      title: "Repair joinability from panel",
      message: fix.summary,
      metadata: {
        level: fix.level,
        success: fix.success,
        syncBytes: sync.bytes,
        stepCount: fix.steps.length,
        mode: "sync_public_address_then_fix_pipeline",
      },
    });
    return ok({ sync, fix });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
