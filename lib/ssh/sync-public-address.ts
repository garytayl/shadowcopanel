import "server-only";

import { normalizeReforgerConfig } from "@/lib/reforger/config-normalize";
import { requireResolvedServerEnv } from "@/lib/server-profiles/resolve";
import {
  getRemoteConfigText,
  saveRemoteConfig,
  type RemoteConfigSaveResult,
} from "@/lib/ssh/reforger";
import { parseConfigJson, type ReforgerConfig } from "@/lib/types/reforger-config";

/** Writes `publicAddress` in remote config.json to match the panel’s SSH host (usually EC2 public IP). */
export async function syncPublicAddressToSshHost(): Promise<RemoteConfigSaveResult> {
  const env = await requireResolvedServerEnv();
  const host = env.REFORGER_SSH_HOST.trim();
  if (!host) {
    throw new Error("Panel host is not set");
  }
  const raw = await getRemoteConfigText();
  const p = parseConfigJson(raw);
  if (!p.ok) {
    throw new Error(p.error);
  }
  const base = normalizeReforgerConfig(p.value as ReforgerConfig).config;
  const next: ReforgerConfig = { ...base, publicAddress: host };
  return saveRemoteConfig(next);
}
