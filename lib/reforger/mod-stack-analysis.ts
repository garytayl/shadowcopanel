/**
 * Shared mod stack validation: duplicates, shape, workshop-backed dependencies,
 * known conflicts, load-order hints, and coarse risk heuristics.
 */

import type { WorkshopCatalogMod, WorkshopDependencyRef } from "@/lib/workshop/types";

// ─── Public types (stable API for UI + server actions) ───────────────────────

export type ModValidationSeverity = "info" | "warn" | "error";

export type ModValidationIssue = {
  key: string;
  severity: ModValidationSeverity;
  title: string;
  message: string;
  modId?: string;
  relatedModIds?: string[];
  suggestedFix?: string;
};

export type ModDependencyRef = {
  modId: string;
  name?: string;
};

export type ValidatedServerMod = {
  modId: string;
  name: string;
  version: string;
  dependencies?: ModDependencyRef[];
};

export type ModStackValidationResult = {
  issues: ModValidationIssue[];
  summary: {
    duplicates: number;
    missingDependencies: number;
    conflicts: number;
    warnings: number;
    errors: number;
  };
};

export type ModStackRowInput = {
  modId: string;
  name: string;
  version: string;
  /** When false, row is excluded from the saved stack (UI-only). */
  enabled?: boolean;
};

export type ModStackValidationContext = {
  /** Workshop metadata keyed by modId (detail tier preferred). Omitted entries = unknown deps. */
  catalogByModId?: Map<string, Pick<WorkshopCatalogMod, "modId" | "name" | "dependencies" | "tags" | "dependencyCount">>;
  maxPlayers?: number;
};

/** Declarative known conflicts — extend with real workshop IDs as you confirm them. */
export type KnownModConflict = {
  mods: string[];
  title: string;
  message: string;
};

export const KNOWN_MOD_CONFLICTS: KnownModConflict[] = [
  // Add pairs/groups only when verified; empty default keeps the system honest.
];

const LARGE_STACK_WARN = 25;
const LARGE_STACK_STRONG = 40;
const HEAVY_PLAYER_THRESHOLD = 96;
const HEAVY_PLAYER_MOD_COUNT = 18;
const CONTENT_TAG_HINTS = new Set([
  "CHARACTER",
  "WEAPON",
  "VEHICLE",
  "EQUIPMENT",
  "UNIFORM",
  "MAP",
  "WORLD",
]);

function pushIssue(
  issues: ModValidationIssue[],
  issue: ModValidationIssue,
): void {
  issues.push(issue);
}

function summarize(issues: ModValidationIssue[]): ModStackValidationResult["summary"] {
  let duplicates = 0;
  let missingDependencies = 0;
  let conflicts = 0;
  let warnings = 0;
  let errors = 0;
  for (const i of issues) {
    if (i.key.startsWith("duplicate:")) duplicates++;
    else if (i.key.startsWith("missing-dep:")) missingDependencies++;
    else if (i.key.startsWith("conflict:")) conflicts++;
    if (i.severity === "warn") warnings++;
    if (i.severity === "error") errors++;
  }
  return { duplicates, missingDependencies, conflicts, warnings, errors };
}

/** Enabled rows with trimmed modId — order preserved. */
export function activeStackRows(rows: ModStackRowInput[]): ModStackRowInput[] {
  return rows.filter((r) => r.modId.trim() && r.enabled !== false);
}

export function detectDuplicateMods(rows: ModStackRowInput[]): ModValidationIssue[] {
  const issues: ModValidationIssue[] = [];
  const active = activeStackRows(rows);
  const counts = new Map<string, number>();
  for (const r of active) {
    const id = r.modId.trim();
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const [id, n] of counts) {
    if (n > 1) {
      pushIssue(issues, {
        key: `duplicate:${id}`,
        severity: "error",
        title: "Duplicate mod detected",
        message: `The mod "${id}" appears ${n} times in the enabled stack.`,
        modId: id,
        relatedModIds: [id],
        suggestedFix: "Remove duplicate rows so each workshop ID appears once.",
      });
    }
  }
  return issues;
}

export function detectInvalidModShape(rows: ModStackRowInput[]): ModValidationIssue[] {
  const issues: ModValidationIssue[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.enabled === false) continue;
    const modId = r.modId.trim();
    const name = r.name.trim();
    const version = r.version.trim();
    if (!modId && !name && !version) continue;
    if (!modId || !name || !version) {
      pushIssue(issues, {
        key: `invalid-shape:${i}:${modId || "empty"}`,
        severity: "error",
        title: "Invalid mod entry",
        message: `Row ${i + 1} is enabled but missing modId, name, or version.`,
        modId: modId || undefined,
        suggestedFix: "Fill modId, display name, and exact workshop version, or disable the row.",
      });
    }
  }
  return issues;
}

export function detectMissingDependencies(
  rows: ModStackRowInput[],
  catalogByModId: ModStackValidationContext["catalogByModId"],
): ModValidationIssue[] {
  const issues: ModValidationIssue[] = [];
  if (!catalogByModId || catalogByModId.size === 0) return issues;

  const active = activeStackRows(rows);
  const stackIds = new Set(active.map((r) => r.modId.trim()));

  for (const r of active) {
    const id = r.modId.trim();
    const cat = catalogByModId.get(id);
    const deps = cat?.dependencies;
    if (!deps?.length) continue;

    for (const d of deps) {
      const depId = d.modId?.trim();
      if (!depId) continue;
      if (stackIds.has(depId)) continue;
      const depName = d.name?.trim();
      pushIssue(issues, {
        key: `missing-dep:${id}:${depId}`,
        severity: "error",
        title: "Missing dependency",
        message: `${cat?.name ?? id} may require ${depName ?? depId} (${depId}), which is not in the stack.`,
        modId: id,
        relatedModIds: [depId],
        suggestedFix: "Add the dependency above this mod in load order, or use “Add with dependencies” from the mod detail dialog.",
      });
    }
  }
  return issues;
}

export function detectConflicts(rows: ModStackRowInput[]): ModValidationIssue[] {
  const issues: ModValidationIssue[] = [];
  const stackIds = new Set(activeStackRows(rows).map((r) => r.modId.trim()));
  let c = 0;
  for (const def of KNOWN_MOD_CONFLICTS) {
    const present = def.mods.filter((m) => stackIds.has(m));
    if (present.length >= 2) {
      c++;
      pushIssue(issues, {
        key: `conflict:${c}:${def.mods.join("+")}`,
        severity: "warn",
        title: def.title,
        message: `${def.message} (present: ${present.join(", ")})`,
        relatedModIds: present,
        suggestedFix: "Run with only one of these mods unless you know they are compatible for your scenario.",
      });
    }
  }
  return issues;
}

export function detectDependencyOrderIssues(
  rows: ModStackRowInput[],
  catalogByModId: ModStackValidationContext["catalogByModId"],
): ModValidationIssue[] {
  const issues: ModValidationIssue[] = [];
  if (!catalogByModId || catalogByModId.size === 0) return issues;

  const active = activeStackRows(rows);
  const index = new Map<string, number>();
  active.forEach((r, i) => index.set(r.modId.trim(), i));

  for (const r of active) {
    const id = r.modId.trim();
    const cat = catalogByModId.get(id);
    const deps = cat?.dependencies;
    if (!deps?.length) continue;
    const i = index.get(id) ?? 0;
    for (const d of deps) {
      const depId = d.modId?.trim();
      if (!depId) continue;
      const j = index.get(depId);
      if (j === undefined) continue;
      if (j > i) {
        pushIssue(issues, {
          key: `order:${id}:${depId}`,
          severity: "warn",
          title: "Dependency load order",
          message: `"${depId}" should load before "${id}" (dependency is currently below dependent).`,
          modId: id,
          relatedModIds: [depId],
          suggestedFix: "Move dependencies above mods that require them.",
        });
      }
    }
  }
  return issues;
}

function countDistinctContentTags(catalogByModId: ModStackValidationContext["catalogByModId"], rows: ModStackRowInput[]): number {
  if (!catalogByModId) return 0;
  const seen = new Set<string>();
  for (const r of activeStackRows(rows)) {
    const cat = catalogByModId.get(r.modId.trim());
    for (const t of cat?.tags ?? []) {
      const u = String(t).toUpperCase();
      if (CONTENT_TAG_HINTS.has(u)) seen.add(u);
    }
  }
  return seen.size;
}

export function detectRiskyStackPatterns(
  rows: ModStackRowInput[],
  ctx: ModStackValidationContext,
): ModValidationIssue[] {
  const issues: ModValidationIssue[] = [];
  const active = activeStackRows(rows);
  const n = active.length;

  if (n >= LARGE_STACK_STRONG) {
    pushIssue(issues, {
      key: "risk:stack-very-large",
      severity: "warn",
      title: "Very large mod stack",
      message: `You have ${n} enabled mods — startup time, memory, and stability can suffer.`,
      suggestedFix: "Trim non-essential mods, test in smaller batches, and watch Logs after changes.",
    });
  } else if (n >= LARGE_STACK_WARN) {
    pushIssue(issues, {
      key: "risk:stack-large",
      severity: "warn",
      title: "Large mod stack",
      message: `You have ${n} enabled mods — startup and stability may degrade.`,
      suggestedFix: "Add mods gradually and verify the server boots cleanly after each batch.",
    });
  }

  const distinctTags = countDistinctContentTags(ctx.catalogByModId, rows);
  if (distinctTags >= 4) {
    pushIssue(issues, {
      key: "risk:multi-content",
      severity: "warn",
      title: "Multiple major content areas",
      message: "Several heavy workshop tags (vehicles, weapons, characters, maps, etc.) are represented — interaction bugs are more likely.",
      suggestedFix: "Prefer curated modlists from trusted sources and test load order.",
    });
  }

  const unknownDepHeavy = active.filter((r) => {
    const c = ctx.catalogByModId?.get(r.modId.trim());
    return c != null && (c.dependencyCount ?? 0) >= 5 && !(c.dependencies?.length);
  }).length;
  if (unknownDepHeavy >= 3) {
    pushIssue(issues, {
      key: "risk:unknown-deps",
      severity: "info",
      title: "Many mods with unknown dependency trees",
      message: "Some workshop entries report many dependencies but details weren’t loaded — verify on the Workshop page.",
      suggestedFix: "Open each mod’s detail here or on the Workshop to confirm requirements.",
    });
  }

  return issues;
}

export function detectHeavyPlayerLoadWarning(
  rows: ModStackRowInput[],
  maxPlayers: number | undefined,
): ModValidationIssue[] {
  const issues: ModValidationIssue[] = [];
  if (maxPlayers == null || maxPlayers < HEAVY_PLAYER_THRESHOLD) return issues;
  const n = activeStackRows(rows).length;
  if (n < HEAVY_PLAYER_MOD_COUNT) return issues;

  pushIssue(issues, {
    key: "risk:players-vs-mods",
    severity: "warn",
    title: "High player slot count with heavy mod stack",
    message: `maxPlayers is ${maxPlayers} with ${n} enabled mods — responsiveness and browser query behavior may suffer.`,
    suggestedFix: "Test with a lower max player count or reduce mods for production.",
  });
  return issues;
}

/**
 * Full validation pass. Idempotent; deterministic for the same inputs.
 */
export function validateModStack(
  rows: ModStackRowInput[],
  ctx: ModStackValidationContext = {},
): ModStackValidationResult {
  const issues: ModValidationIssue[] = [];

  issues.push(...detectInvalidModShape(rows));
  issues.push(...detectDuplicateMods(rows));
  issues.push(...detectConflicts(rows));
  issues.push(...detectMissingDependencies(rows, ctx.catalogByModId));
  issues.push(...detectDependencyOrderIssues(rows, ctx.catalogByModId));
  issues.push(...detectRiskyStackPatterns(rows, ctx));
  issues.push(...detectHeavyPlayerLoadWarning(rows, ctx.maxPlayers));

  return { issues, summary: summarize(issues) };
}

/**
 * Remove duplicate mod IDs (first occurrence wins), drop empty modId rows.
 * Preserves relative order of surviving rows.
 */
export function autoCleanModStack<T extends ModStackRowInput>(rows: T[]): { rows: T[]; removedDuplicateIds: string[]; removedEmptyRows: number } {
  const seen = new Set<string>();
  const removedDuplicateIds: string[] = [];
  let removedEmptyRows = 0;
  const out: T[] = [];

  for (const r of rows) {
    const id = r.modId.trim();
    if (!id) {
      removedEmptyRows++;
      continue;
    }
    if (seen.has(id)) {
      removedDuplicateIds.push(id);
      continue;
    }
    seen.add(id);
    out.push(r);
  }
  return { rows: out, removedDuplicateIds, removedEmptyRows };
}

/** Build a catalog map slice from workshop models (for client-side checks). */
export function catalogMapFromMods(mods: WorkshopCatalogMod[]): ModStackValidationContext["catalogByModId"] {
  const m = new Map<
    string,
    Pick<WorkshopCatalogMod, "modId" | "name" | "dependencies" | "tags" | "dependencyCount">
  >();
  for (const mod of mods) {
    m.set(mod.modId, {
      modId: mod.modId,
      name: mod.name,
      dependencies: mod.dependencies as WorkshopDependencyRef[] | undefined,
      tags: mod.tags,
      dependencyCount: mod.dependencyCount,
    });
  }
  return m;
}
