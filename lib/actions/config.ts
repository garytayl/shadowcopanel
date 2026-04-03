"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { normalizeReforgerConfig } from "@/lib/reforger/config-normalize";
import { validateReforgerConfigForWrite } from "@/lib/reforger/config-validate";
import type { ConfigNormalizationIssue } from "@/lib/reforger/types";
import {
  configToFormValues,
  parseConfigJson,
  stringifyConfig,
  type ReforgerConfig,
  type ReforgerFormValues,
} from "@/lib/types/reforger-config";
import {
  getRemoteConfigText,
  saveRemoteConfig,
  saveRemoteConfigFromForm,
  type RemoteConfigSaveResult,
} from "@/lib/ssh/reforger";
import { err, ok, type ApiResult } from "@/lib/types/api";

export type ConfigLoadResult = {
  raw: string;
  parsed: ReforgerConfig;
  form: ReforgerFormValues;
  anomalies: ConfigNormalizationIssue[];
};

export async function loadRemoteConfigAction(): Promise<ApiResult<ConfigLoadResult>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const raw = await getRemoteConfigText();
    const p = parseConfigJson(raw);
    if (!p.ok) return err(p.error);
    const norm = normalizeReforgerConfig(p.value);
    const form = configToFormValues(norm.config);
    return ok({ raw, parsed: norm.config, form, anomalies: norm.issues });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function saveRemoteConfigAction(
  form: ReforgerFormValues,
): Promise<ApiResult<RemoteConfigSaveResult>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const raw = await getRemoteConfigText();
    const p = parseConfigJson(raw);
    if (!p.ok) return err(`Invalid JSON on server before save: ${p.error}`);
    const baseNorm = normalizeReforgerConfig(p.value);
    const r = await saveRemoteConfigFromForm(baseNorm.config, form);
    return ok(r);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function saveRawConfigAction(
  rawJson: string,
): Promise<ApiResult<RemoteConfigSaveResult>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const p = parseConfigJson(rawJson);
    if (!p.ok) return err(p.error);
    const norm = normalizeReforgerConfig(p.value);
    const v = validateReforgerConfigForWrite(norm.config);
    if (!v.ok) {
      return err(v.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
    }
    const r = await saveRemoteConfig(norm.config);
    return ok(r);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function validateJsonAction(
  raw: string,
): Promise<ApiResult<{ formatted: string; warnings: string[] }>> {
  try {
    const p = parseConfigJson(raw);
    if (!p.ok) return err(p.error);
    const norm = normalizeReforgerConfig(p.value);
    const formatted = stringifyConfig(norm.config);
    const warnings = norm.issues.map((i) => i.message);
    return ok({ formatted, warnings });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function exportRemoteConfigAction(): Promise<
  ApiResult<{ content: string; filename: string }>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const raw = await getRemoteConfigText();
    const p = parseConfigJson(raw);
    if (!p.ok) return err(p.error);
    const norm = normalizeReforgerConfig(p.value);
    const filename = `reforger-config-${new Date().toISOString().slice(0, 10)}.json`;
    return ok({ content: stringifyConfig(norm.config), filename });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

/** Fetch remote config, normalize, and write back (repairs legacy shape). */
export async function repairRemoteConfigAction(): Promise<
  ApiResult<RemoteConfigSaveResult & { summaryLines: string[] }>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const raw = await getRemoteConfigText();
    const p = parseConfigJson(raw);
    if (!p.ok) return err(p.error);
    const norm = normalizeReforgerConfig(p.value);
    const v = validateReforgerConfigForWrite(norm.config);
    if (!v.ok) {
      return err(v.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
    }
    const r = await saveRemoteConfig(norm.config);
    const summaryLines =
      norm.issues.length > 0
        ? norm.issues.map((i) => `[${i.severity}] ${i.message}`)
        : ["Config already matched canonical shape (no structural fixes)."];
    return ok({ ...r, summaryLines });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
