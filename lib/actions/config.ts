"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import {
  configToFormValues,
  parseConfigJson,
  stringifyConfig,
  type ReforgerConfig,
  type ReforgerFormValues,
} from "@/lib/types/reforger-config";
import { getRemoteConfigText, saveRemoteConfigFromForm } from "@/lib/ssh/reforger";
import { err, ok, type ApiResult } from "@/lib/types/api";

export type ConfigLoadResult = {
  raw: string;
  parsed: ReforgerConfig;
  form: ReforgerFormValues;
};

export async function loadRemoteConfigAction(): Promise<ApiResult<ConfigLoadResult>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const raw = await getRemoteConfigText();
    const p = parseConfigJson(raw);
    if (!p.ok) return err(p.error);
    const form = configToFormValues(p.value);
    return ok({ raw, parsed: p.value, form });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function saveRemoteConfigAction(
  baseJson: string,
  form: ReforgerFormValues,
): Promise<ApiResult<{ bytes: number }>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const p = parseConfigJson(baseJson);
    if (!p.ok) return err(`Invalid JSON before save: ${p.error}`);
    const r = await saveRemoteConfigFromForm(p.value as ReforgerConfig, form);
    return ok(r);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function saveRawConfigAction(
  rawJson: string,
): Promise<ApiResult<{ bytes: number }>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const p = parseConfigJson(rawJson);
    if (!p.ok) return err(p.error);
    const { saveRemoteConfig } = await import("@/lib/ssh/reforger");
    const r = await saveRemoteConfig(p.value);
    return ok(r);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function validateJsonAction(
  raw: string,
): Promise<ApiResult<{ formatted: string }>> {
  try {
    const p = parseConfigJson(raw);
    if (!p.ok) return err(p.error);
    const formatted = stringifyConfig(p.value);
    return ok({ formatted });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
