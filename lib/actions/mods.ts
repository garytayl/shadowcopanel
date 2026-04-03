"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import {
  parseConfigJson,
  type ReforgerConfig,
  type ReforgerMod,
} from "@/lib/types/reforger-config";
import { getRemoteConfigText, saveRemoteConfig } from "@/lib/ssh/reforger";
import { err, ok, type ApiResult } from "@/lib/types/api";

export type ModRowPayload = {
  modId: string;
  name: string;
  version: string;
  enabled: boolean;
};

export async function loadModsAction(): Promise<
  ApiResult<{
    mods: ModRowPayload[];
    rawConfig: string;
    scenarioId: string | null;
    gameName: string | null;
    publicAddress: string | null;
  }>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const rawConfig = await getRemoteConfigText();
    const p = parseConfigJson(rawConfig);
    if (!p.ok) return err(p.error);
    const cfg = p.value as ReforgerConfig;
    const mods = (cfg.mods ?? []) as ReforgerMod[];
    const rows: ModRowPayload[] = mods.map((m) => ({
      modId: String(m.modId ?? ""),
      name: String(m.name ?? ""),
      version: String(m.version ?? ""),
      enabled: m.enabled !== false,
    }));
    const sid = cfg.game?.scenarioId;
    const gname = cfg.game?.name;
    const pub = cfg.publicAddress;
    return ok({
      mods: rows,
      rawConfig,
      scenarioId: sid != null && sid !== "" ? String(sid) : null,
      gameName: gname != null && gname !== "" ? String(gname) : null,
      publicAddress: pub != null && pub !== "" ? String(pub) : null,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function saveModsAction(
  mods: ModRowPayload[],
): Promise<ApiResult<{ bytes: number }>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const raw = await getRemoteConfigText();
    const p = parseConfigJson(raw);
    if (!p.ok) return err(p.error);
    const base = p.value as ReforgerConfig;
    const nextMods: ReforgerMod[] = mods
      .filter((m) => m.modId.trim())
      .map((m) => ({
        modId: m.modId.trim(),
        name: m.name.trim() || undefined,
        version: m.version.trim() || undefined,
        enabled: m.enabled,
      }));
    const next: ReforgerConfig = {
      ...base,
      mods: nextMods,
    };
    return ok(await saveRemoteConfig(next));
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
