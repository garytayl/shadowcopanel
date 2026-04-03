"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import type { ModRowPayload } from "@/lib/actions/mods";
import {
  validateModStack,
  type ModStackValidationResult,
} from "@/lib/reforger/mod-stack-analysis";
import { getRemoteConfigText } from "@/lib/ssh/reforger";
import { parseConfigJson, type ReforgerConfig } from "@/lib/types/reforger-config";
import { activeWorkshopProvider } from "@/lib/workshop/provider";
import type { WorkshopCatalogMod } from "@/lib/workshop/types";
import { err, ok, type ApiResult } from "@/lib/types/api";

const FETCH_CHUNK = 4;

async function fetchCatalogForIds(ids: string[]): Promise<Map<string, WorkshopCatalogMod>> {
  const map = new Map<string, WorkshopCatalogMod>();
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_CHUNK);
    const results = await Promise.all(
      chunk.map(async (id) => {
        try {
          return await activeWorkshopProvider.getModById(id);
        } catch {
          return null;
        }
      }),
    );
    for (let j = 0; j < chunk.length; j++) {
      const mod = results[j];
      if (mod) map.set(chunk[j]!, mod);
    }
  }
  return map;
}

/**
 * Workshop-enriched validation (dependency + order hints). One HTML fetch per unique mod ID (batched).
 */
export async function actionValidateModStackFull(
  rows: ModRowPayload[],
): Promise<ApiResult<ModStackValidationResult>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const raw = await getRemoteConfigText();
    const p = parseConfigJson(raw);
    if (!p.ok) return err(p.error);
    const cfg = p.value as ReforgerConfig;
    const maxPlayers = Math.round(Number(cfg.game?.maxPlayers ?? 64));

    const uniq = [
      ...new Set(
        rows
          .filter((r) => r.enabled !== false && r.modId.trim())
          .map((r) => r.modId.trim()),
      ),
    ];
    const catalog = await fetchCatalogForIds(uniq);
    const catalogByModId = new Map<
      string,
      Pick<WorkshopCatalogMod, "modId" | "name" | "dependencies" | "tags" | "dependencyCount">
    >();
    for (const [id, mod] of catalog) {
      catalogByModId.set(id, {
        modId: mod.modId,
        name: mod.name,
        dependencies: mod.dependencies,
        tags: mod.tags,
        dependencyCount: mod.dependencyCount,
      });
    }

    return ok(
      validateModStack(rows, {
        maxPlayers,
        catalogByModId,
      }),
    );
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
