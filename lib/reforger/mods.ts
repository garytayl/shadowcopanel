import type { ReforgerConfig } from "@/lib/types/reforger-config";
import type { ConfigNormalizationIssue, ModUiRow } from "@/lib/reforger/types";
import { normalizeReforgerConfig, uiModsToServerEntries } from "@/lib/reforger/config-normalize";

/**
 * Apply a mod stack from the UI onto an already-loaded config object.
 * Preserves unrelated keys; writes only under `game.mods`; strips top-level `mods`.
 */
export function applyModsMutation(
  base: ReforgerConfig,
  rows: ModUiRow[],
): { config: ReforgerConfig; issues: ConfigNormalizationIssue[] } {
  const issues: ConfigNormalizationIssue[] = [];
  const baseNorm = normalizeReforgerConfig(base);
  issues.push(...baseNorm.issues);

  const serverMods = uiModsToServerEntries(rows, issues);
  if (issues.some((i) => i.severity === "error")) {
    return { config: baseNorm.config, issues };
  }

  const next = JSON.parse(JSON.stringify(baseNorm.config)) as ReforgerConfig;
  delete (next as Record<string, unknown>).mods;
  if (!next.game || typeof next.game !== "object") next.game = {};
  (next.game as Record<string, unknown>).mods = serverMods.map((m) => ({
    modId: m.modId,
    name: m.name,
    version: m.version,
  }));

  const final = normalizeReforgerConfig(next);
  issues.push(...final.issues);
  return { config: final.config, issues };
}

/** True if adding this modId would duplicate an existing row. */
export function stackHasModId(rows: Pick<ModUiRow, "modId">[], modId: string): boolean {
  const id = modId.trim();
  if (!id) return false;
  return rows.some((r) => r.modId.trim() === id);
}
