/**
 * Canonical types for Reforger server config pipeline (mods live under `game.mods` only).
 */

import type { ReforgerConfig } from "@/lib/types/reforger-config";

/** What the dedicated server JSON should contain per mod (no UI-only fields). */
export type ServerModEntry = {
  modId: string;
  name: string;
  version: string;
};

/** Row in Mods / Marketplace UI — includes `enabled` and is never written verbatim to server JSON. */
export type ModUiRow = {
  modId: string;
  name: string;
  version: string;
  enabled: boolean;
};

export type ConfigNormalizationIssueSeverity = "info" | "warn" | "error";

export type ConfigNormalizationIssue = {
  key: string;
  severity: ConfigNormalizationIssueSeverity;
  message: string;
};

export type NormalizationResult = {
  config: ReforgerConfig;
  issues: ConfigNormalizationIssue[];
  /** True if normalization changed structure (e.g. removed top-level mods, merged, deduped). */
  changed: boolean;
};

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};
