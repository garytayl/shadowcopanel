"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { normalizeReforgerConfig } from "@/lib/reforger/config-normalize";
import { applyModsMutation } from "@/lib/reforger/mods";
import type { ConfigNormalizationIssue } from "@/lib/reforger/types";
import {
  parseConfigJson,
  type ReforgerConfig,
  type ReforgerMod,
} from "@/lib/types/reforger-config";
import { getRemoteConfigText, saveRemoteConfig } from "@/lib/ssh/reforger";
import type { RemoteConfigSaveResult } from "@/lib/ssh/reforger";
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
    anomalies: ConfigNormalizationIssue[];
  }>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const rawConfig = await getRemoteConfigText();
    const p = parseConfigJson(rawConfig);
    if (!p.ok) return err(p.error);
    const norm = normalizeReforgerConfig(p.value as ReforgerConfig);
    const cfg = norm.config;
    const gameMods = (cfg.game?.mods ?? []) as ReforgerMod[];
    const rows: ModRowPayload[] = gameMods.map((m) => ({
      modId: String(m.modId ?? ""),
      name: String(m.name ?? ""),
      version: String(m.version ?? ""),
      enabled: true,
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
      anomalies: norm.issues,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function saveModsAction(
  mods: ModRowPayload[],
): Promise<ApiResult<RemoteConfigSaveResult>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const raw = await getRemoteConfigText();
    const p = parseConfigJson(raw);
    if (!p.ok) return err(p.error);
    const { config, issues } = applyModsMutation(p.value as ReforgerConfig, mods);
    const blocking = issues.filter((i) => i.severity === "error");
    if (blocking.length > 0) {
      return err(blocking.map((i) => i.message).join(" "));
    }
    const r = await saveRemoteConfig(config);
    return ok(r);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
