/**
 * Semantic diff between two normalized Reforger configs — readable paths,
 * mod-aware entries, and summary counts for pre-save review.
 */

import { applyModsMutation } from "@/lib/reforger/mods";
import { normalizeReforgerConfig } from "@/lib/reforger/config-normalize";
import type { ConfigNormalizationIssue } from "@/lib/reforger/types";
import type { ModRowPayload } from "@/lib/actions/mods";
import {
  applyFormToConfig,
  parseConfigJson,
  stringifyConfig,
  type ReforgerConfig,
  type ReforgerFormValues,
  type ReforgerMod,
} from "@/lib/types/reforger-config";

export type ConfigDiffKind = "added" | "removed" | "changed";

export type ConfigDiffEntry = {
  path: string;
  kind: ConfigDiffKind;
  /** Human label for mods / important keys */
  label?: string;
  before?: unknown;
  after?: unknown;
};

export type ConfigDiffResult = {
  entries: ConfigDiffEntry[];
  summary: {
    total: number;
    added: number;
    removed: number;
    changed: number;
  };
  /** High-signal bullets for the trust strip */
  riskNotes: string[];
};

function summarize(entries: ConfigDiffEntry[]): ConfigDiffResult["summary"] {
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const e of entries) {
    if (e.kind === "added") added++;
    else if (e.kind === "removed") removed++;
    else changed++;
  }
  return { total: entries.length, added, removed, changed };
}

function formatModLine(m: ReforgerMod | undefined): string {
  if (!m) return "—";
  const name = m.name ?? m.modId;
  const v = m.version ?? "?";
  return `${name} (${v})`;
}

function asModArray(v: unknown): ReforgerMod[] {
  if (!Array.isArray(v)) return [];
  return v as ReforgerMod[];
}

/**
 * Mod list diff: additions, removals, version/name updates, load-order change (same ID set).
 */
export function diffGameMods(
  beforeMods: unknown,
  afterMods: unknown,
  out: ConfigDiffEntry[],
): void {
  const b = asModArray(beforeMods);
  const a = asModArray(afterMods);
  const bMap = new Map(b.map((m) => [m.modId, m]));
  const aMap = new Map(a.map((m) => [m.modId, m]));
  const bIds = b.map((m) => m.modId);
  const aIds = a.map((m) => m.modId);
  const bSet = new Set(bIds);
  const aSet = new Set(aIds);

  for (const id of bSet) {
    if (!aSet.has(id)) {
      const m = bMap.get(id);
      out.push({
        kind: "removed",
        path: `game.mods[${id}]`,
        label: `Removed mod: ${m?.name ?? id}`,
        before: m,
      });
    }
  }
  for (const id of aSet) {
    if (!bSet.has(id)) {
      const m = aMap.get(id);
      out.push({
        kind: "added",
        path: `game.mods[${id}]`,
        label: `Added mod: ${formatModLine(m)}`,
        after: m,
      });
    }
  }
  for (const id of bSet) {
    if (!aSet.has(id)) continue;
    const bm = bMap.get(id)!;
    const am = aMap.get(id)!;
    if (bm.version !== am.version || bm.name !== am.name) {
      out.push({
        kind: "changed",
        path: `game.mods[${id}].version`,
        label: `Updated mod: ${am.name ?? id}`,
        before: formatModLine(bm),
        after: formatModLine(am),
      });
    }
  }

  const sameIds =
    bSet.size === aSet.size && bSet.size > 0 && [...bSet].every((id) => aSet.has(id));
  if (sameIds && bIds.join("\0") !== aIds.join("\0")) {
    const beforeOrder = bIds.map((id) => bMap.get(id)?.name ?? id).join(" → ");
    const afterOrder = aIds.map((id) => aMap.get(id)?.name ?? id).join(" → ");
    out.push({
      kind: "changed",
      path: "game.mods (load order)",
      label: "Mod load order changed",
      before: beforeOrder,
      after: afterOrder,
    });
  }
}

function stripGameMods(c: ReforgerConfig): ReforgerConfig {
  const x = JSON.parse(JSON.stringify(c)) as ReforgerConfig;
  if (x.game && typeof x.game === "object" && !Array.isArray(x.game)) {
    const g = { ...(x.game as Record<string, unknown>) };
    delete g.mods;
    x.game = g as typeof x.game;
  }
  return x;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).sort();
  const bk = Object.keys(bo).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
  }
  for (const k of ak) {
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

function diffValue(before: unknown, after: unknown, path: string, out: ConfigDiffEntry[]): void {
  if (deepEqual(before, after)) return;

  const isObj = (v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v);

  if (!isObj(before) || !isObj(after)) {
    if (Array.isArray(before) && Array.isArray(after)) {
      const max = Math.max(before.length, after.length);
      for (let i = 0; i < max; i++) {
        const p = `${path}[${i}]`;
        if (i >= before.length) {
          out.push({ kind: "added", path: p, after: after[i] });
        } else if (i >= after.length) {
          out.push({ kind: "removed", path: p, before: before[i] });
        } else {
          diffValue(before[i], after[i], p, out);
        }
      }
      return;
    }
    out.push({ kind: "changed", path: path || "(root)", before, after });
    return;
  }

  const bo = before as Record<string, unknown>;
  const ao = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(bo), ...Object.keys(ao)]);
  for (const k of [...keys].sort()) {
    const p = path ? `${path}.${k}` : k;
    const hasB = Object.prototype.hasOwnProperty.call(bo, k);
    const hasA = Object.prototype.hasOwnProperty.call(ao, k);
    if (!hasB) {
      out.push({ kind: "added", path: p, after: ao[k] });
    } else if (!hasA) {
      out.push({ kind: "removed", path: p, before: bo[k] });
    } else {
      diffValue(bo[k], ao[k], p, out);
    }
  }
}

function collectRiskNotes(entries: ConfigDiffEntry[]): string[] {
  const notes: string[] = [];
  for (const e of entries) {
    const p = e.path.toLowerCase();
    if (p.includes("game.mods") || p.includes("load order")) {
      if (!notes.includes("Mod stack changed")) notes.push("Mod stack changed");
    }
    if (p === "game.maxplayers" || p.endsWith(".maxplayers")) {
      const after = Number(e.after);
      if (Number.isFinite(after) && after >= 96) {
        notes.push(`Max players set to ${after}`);
      } else if (e.kind === "changed") {
        notes.push(`Max players: ${String(e.before)} → ${String(e.after)}`);
      }
    }
    if (p === "publicaddress" || p.endsWith(".publicaddress")) {
      notes.push("Public address changed");
    }
    if (p === "game.scenarioid" || p.endsWith(".scenarioid")) {
      notes.push("Scenario changed");
    }
  }
  return notes.slice(0, 8);
}

/**
 * Compare two **normalized** configs. Pass results of `normalizeReforgerConfig(...).config` for both sides.
 */
export function diffReforgerConfig(before: ReforgerConfig, after: ReforgerConfig): ConfigDiffResult {
  const entries: ConfigDiffEntry[] = [];

  diffGameMods(before.game?.mods, after.game?.mods, entries);

  const b2 = stripGameMods(before);
  const a2 = stripGameMods(after);
  diffValue(b2, a2, "", entries);

  const riskNotes = collectRiskNotes(entries);
  return { entries, summary: summarize(entries), riskNotes };
}

export function formatDiffValue(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v.length > 120 ? `${v.slice(0, 117)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 0);
  } catch {
    return String(v);
  }
}

/** True when save would be a no-op (normalized payloads identical). */
export function isConfigDiffEmpty(result: ConfigDiffResult): boolean {
  return result.summary.total === 0;
}

export type ModsSavePreview =
  | { ok: true; diff: ConfigDiffResult; rawBefore: string; rawAfter: string }
  | { ok: false; parseError: string }
  | { ok: false; mutationErrors: ConfigNormalizationIssue[] };

/**
 * Compare normalized remote config vs proposed `game.mods` after UI mutation (same pipeline as save).
 */
export function previewModsSaveDiff(remoteRawJson: string, rows: ModRowPayload[]): ModsSavePreview {
  const p = parseConfigJson(remoteRawJson);
  if (!p.ok) return { ok: false, parseError: p.error };
  const before = normalizeReforgerConfig(p.value).config;
  const { config: after, issues } = applyModsMutation(p.value, rows);
  const blocking = issues.filter((i) => i.severity === "error");
  if (blocking.length > 0) {
    return { ok: false, mutationErrors: blocking };
  }
  const diff = diffReforgerConfig(before, after);
  return {
    ok: true,
    diff,
    rawBefore: stringifyConfig(before),
    rawAfter: stringifyConfig(after),
  };
}

export function previewFormSaveDiff(
  baselineNormalized: ReforgerConfig,
  form: ReforgerFormValues,
): { diff: ConfigDiffResult; rawBefore: string; rawAfter: string } {
  const baseClone = JSON.parse(JSON.stringify(baselineNormalized)) as ReforgerConfig;
  const merged = applyFormToConfig(baseClone, form);
  const after = normalizeReforgerConfig(merged).config;
  const diff = diffReforgerConfig(baselineNormalized, after);
  return {
    diff,
    rawBefore: stringifyConfig(baselineNormalized),
    rawAfter: stringifyConfig(after),
  };
}

export type RawSavePreview =
  | { ok: true; diff: ConfigDiffResult; rawBefore: string; rawAfter: string }
  | { ok: false; error: string };

export function previewRawSaveDiff(baselineNormalized: ReforgerConfig, rawJson: string): RawSavePreview {
  const p = parseConfigJson(rawJson);
  if (!p.ok) return { ok: false, error: p.error };
  const after = normalizeReforgerConfig(p.value).config;
  const diff = diffReforgerConfig(baselineNormalized, after);
  return {
    ok: true,
    diff,
    rawBefore: stringifyConfig(baselineNormalized),
    rawAfter: stringifyConfig(after),
  };
}
