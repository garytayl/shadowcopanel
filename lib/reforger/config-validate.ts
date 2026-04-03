import type { ReforgerConfig } from "@/lib/types/reforger-config";
import type { ValidationIssue, ValidationResult } from "@/lib/reforger/types";

/**
 * Structural checks before writing `config.json` to the remote host.
 * Call after `normalizeReforgerConfig` so shape is canonical.
 */
export function validateReforgerConfigForWrite(config: ReforgerConfig): ValidationResult {
  const issues: ValidationIssue[] = [];
  const root = config as Record<string, unknown>;

  if ("mods" in root && root.mods !== undefined) {
    issues.push({
      path: "mods",
      message: "Top-level `mods` must not be present — use `game.mods` only.",
    });
  }

  const g = config.game;
  if (!g || typeof g !== "object" || Array.isArray(g)) {
    issues.push({ path: "game", message: "Missing or invalid `game` object." });
    return { ok: false, issues };
  }

  const gm = (g as Record<string, unknown>).mods;
  if (gm !== undefined && !Array.isArray(gm)) {
    issues.push({ path: "game.mods", message: "`game.mods` must be an array when present." });
  }

  if (Array.isArray(gm)) {
    const seen = new Set<string>();
    gm.forEach((entry, i) => {
      const p = `game.mods[${i}]`;
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        issues.push({ path: p, message: "Each mod must be an object." });
        return;
      }
      const o = entry as Record<string, unknown>;
      const forbidden = ["enabled", "selected", "source", "dependencyState", "key"];
      for (const k of forbidden) {
        if (k in o) {
          issues.push({
            path: `${p}.${k}`,
            message: `Field "${k}" is UI-only and must not appear in server config.`,
          });
        }
      }
      const modId = String(o.modId ?? "").trim();
      const name = String(o.name ?? "").trim();
      const version = String(o.version ?? "").trim();
      if (!modId) issues.push({ path: `${p}.modId`, message: "modId is required." });
      if (!name) issues.push({ path: `${p}.name`, message: "name is required." });
      if (!version) issues.push({ path: `${p}.version`, message: "version is required." });
      if (modId) {
        if (seen.has(modId)) {
          issues.push({ path: p, message: `Duplicate modId "${modId}".` });
        }
        seen.add(modId);
      }
    });
  }

  return { ok: issues.length === 0, issues };
}
