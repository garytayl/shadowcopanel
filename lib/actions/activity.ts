"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { clearActivityEvents, listActivityEvents, recordActivityEvent } from "@/lib/activity/log";
import type { ActivityEvent } from "@/lib/activity/types";
import { err, ok, type ApiResult } from "@/lib/types/api";

export async function listActivityEventsAction(limit = 200): Promise<ApiResult<ActivityEvent[]>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    return ok(await listActivityEvents(limit));
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function clearActivityEventsAction(): Promise<ApiResult<{ cleared: true }>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    await clearActivityEvents();
    return ok({ cleared: true });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

/** Client-triggered marketplace add — validated server-side. */
export async function recordMarketplaceImportAction(modId: string, name: string): Promise<ApiResult<void>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  const id = modId.trim();
  if (!id || id.length > 64) return err("Invalid mod id");
  await recordActivityEvent({
    type: "marketplace_import",
    severity: "info",
    title: "Mod added from Marketplace",
    message: `${name.trim() || id} (${id})`,
    metadata: { modId: id, name: name.trim() },
  });
  return ok(undefined);
}

export async function recordMarketplaceBulkAddAction(
  count: number,
  summary: string,
): Promise<ApiResult<void>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  const n = Math.round(Number(count));
  if (!Number.isFinite(n) || n < 1 || n > 200) return err("Invalid count");
  await recordActivityEvent({
    type: "marketplace_import",
    severity: "info",
    title: "Mods added from Marketplace",
    message: summary,
    metadata: { count: n },
  });
  return ok(undefined);
}
