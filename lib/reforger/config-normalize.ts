import type { ReforgerConfig, ReforgerMod } from "@/lib/types/reforger-config";
import type {
  ConfigNormalizationIssue,
  NormalizationResult,
  ServerModEntry,
} from "@/lib/reforger/types";

function stableStringifyConfig(c: ReforgerConfig): string {
  return JSON.stringify(sortKeysDeep(c as Record<string, unknown>));
}

function sortKeysDeep(v: unknown): unknown {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    if (Array.isArray(v)) return v.map(sortKeysDeep);
    return v;
  }
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = sortKeysDeep(o[k]);
  }
  return out;
}

/** Strip UI / unknown keys; keep only modId, name, version for server JSON. */
export function modRecordToServerEntry(
  m: unknown,
  issues: ConfigNormalizationIssue[],
  indexHint: string,
): ServerModEntry | null {
  if (m === null || typeof m !== "object" || Array.isArray(m)) {
    issues.push({
      key: indexHint,
      severity: "warn",
      message: "Skipped mod entry that is not an object.",
    });
    return null;
  }
  const o = m as Record<string, unknown>;
  const extra = new Set([
    "modId",
    "name",
    "version",
    "enabled",
    "selected",
    "source",
    "dependencyState",
    "key",
  ]);
  for (const k of Object.keys(o)) {
    if (!extra.has(k)) {
      issues.push({
        key: `${indexHint}.${k}`,
        severity: "info",
        message: `Removed unsupported mod field "${k}" from server config.`,
      });
    }
  }
  const modId = String(o.modId ?? "").trim();
  const name = String(o.name ?? "").trim();
  const version = String(o.version ?? "").trim();
  if (!modId) {
    issues.push({
      key: indexHint,
      severity: "warn",
      message: "Skipped mod entry with empty modId.",
    });
    return null;
  }
  return { modId, name, version };
}

/**
 * Deduplicate by modId (first occurrence wins). Optional fallback when modId missing: name+version.
 */
/** Deduplicate by `modId` (first wins). */
export function dedupeMods(
  entries: ServerModEntry[],
  issues: ConfigNormalizationIssue[],
): ServerModEntry[] {
  const byId = new Map<string, ServerModEntry>();
  for (const e of entries) {
    const id = e.modId.trim();
    if (!id) continue;
    if (byId.has(id)) {
      issues.push({
        key: `mod:${id}`,
        severity: "warn",
        message: `Duplicate modId "${id}" collapsed to a single entry (first load order kept).`,
      });
      continue;
    }
    byId.set(id, e);
  }
  return [...byId.values()];
}

/** Convert UI rows to server mod list: excludes disabled rows, dedupes, validates required strings. */
export function uiModsToServerEntries(
  rows: { modId: string; name: string; version: string; enabled: boolean }[],
  issues: ConfigNormalizationIssue[],
): ServerModEntry[] {
  const enabledRows = rows.filter((r) => r.modId.trim() && r.enabled !== false);
  const mapped: ServerModEntry[] = [];
  for (const r of enabledRows) {
    const modId = r.modId.trim();
    const name = r.name.trim();
    const version = r.version.trim();
    if (!name || !version) {
      issues.push({
        key: `mod:${modId || "(empty)"}`,
        severity: "error",
        message:
          "Each enabled mod needs non-empty name and version before saving to the server.",
      });
      continue;
    }
    mapped.push({ modId, name, version });
  }
  return dedupeMods(mapped, issues);
}

function asModArray(v: unknown): ReforgerMod[] {
  if (!Array.isArray(v)) return [];
  return v as ReforgerMod[];
}

/**
 * Single canonical path: `game.mods` only; remove top-level `mods`, merge legacy safely, dedupe, strip fields.
 */
export function normalizeReforgerConfig(input: ReforgerConfig): NormalizationResult {
  const issues: ConfigNormalizationIssue[] = [];
  const clone = JSON.parse(JSON.stringify(input)) as ReforgerConfig;
  const root = clone as Record<string, unknown>;

  const hadTopLevelMods = "mods" in root && root.mods !== undefined;
  const topLevel = asModArray(root.mods);
  if (hadTopLevelMods) {
    issues.push({
      key: "mods",
      severity: "warn",
      message:
        "Invalid top-level `mods` key detected (mods must live under `game.mods`). It will be merged into `game.mods` and removed on save.",
    });
    delete root.mods;
  }

  if (!clone.game || typeof clone.game !== "object" || Array.isArray(clone.game)) {
    issues.push({
      key: "game",
      severity: "info",
      message: "Created missing `game` object.",
    });
    clone.game = {};
  }

  const game = clone.game as Record<string, unknown>;
  const gameModsRaw = asModArray(game.mods);

  const collected: ServerModEntry[] = [];

  for (let i = 0; i < gameModsRaw.length; i++) {
    const e = modRecordToServerEntry(gameModsRaw[i], issues, `game.mods[${i}]`);
    if (e) collected.push(e);
  }

  for (let i = 0; i < topLevel.length; i++) {
    const e = modRecordToServerEntry(topLevel[i], issues, `mods[${i}]`);
    if (!e) continue;
    if (collected.some((c) => c.modId === e.modId)) {
      issues.push({
        key: `mods[${i}]`,
        severity: "info",
        message: `Skipped legacy top-level mod "${e.modId}" (already present under game.mods).`,
      });
      continue;
    }
    collected.push(e);
  }

  const deduped = dedupeMods(collected, issues);
  game.mods = deduped.map((m) => ({ modId: m.modId, name: m.name, version: m.version }));

  const changed = stableStringifyConfig(input) !== stableStringifyConfig(clone);
  return { config: clone, issues, changed };
}
