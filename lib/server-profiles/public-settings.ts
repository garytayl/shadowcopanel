import "server-only";

import type { PublicServerSettings } from "@/lib/env/server";
import {
  ACTIVE_PROFILE_COOKIE,
  getResolvedCheckPort,
  profileToServerEnv,
  tryGetResolvedServerEnv,
} from "@/lib/server-profiles/resolve";
import { getProfileById } from "@/lib/server-profiles/store";

function env(name: string): string | undefined {
  return process.env[name];
}

/**
 * Request-aware settings: honors the active saved profile (cookie) when set.
 */
export async function getPublicServerSettingsResolved(): Promise<PublicServerSettings> {
  const announcement = env("REFORGER_ANNOUNCEMENT")?.trim() || null;
  const e = await tryGetResolvedServerEnv();
  const checkPort = await getResolvedCheckPort();

  let activeProfileId: string | null = null;
  let activeProfileName: string | null = null;
  let connectionSource: PublicServerSettings["connectionSource"] = "none";

  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const cid = jar.get(ACTIVE_PROFILE_COOKIE)?.value?.trim();
    if (cid) {
      const prof = await getProfileById(cid);
      if (prof && profileToServerEnv(prof)) {
        activeProfileId = prof.id;
        activeProfileName = prof.name;
        connectionSource = "profile";
      }
    }
  } catch {
    /* no request context */
  }

  if (e && connectionSource === "none") {
    connectionSource = "env";
  }

  if (!e) {
    return {
      configured: false,
      host: "",
      port: 22,
      user: "",
      privateKeyPath: null,
      privateKeyConfigured: false,
      serverPath: "/home/ubuntu/arma-reforger",
      configPath: "/home/ubuntu/arma-reforger/config.json",
      tmuxSession: "reforger",
      serverCommand: './ArmaReforgerServer -config ./config.json -maxFPS 60',
      instanceNotes: "",
      logGlob: null,
      announcement,
      checkPort,
      activeProfileId,
      activeProfileName,
      connectionSource: activeProfileId ? "profile" : "none",
    };
  }

  return {
    configured: true,
    host: e.REFORGER_SSH_HOST,
    port: e.REFORGER_SSH_PORT,
    user: e.REFORGER_SSH_USER,
    privateKeyPath: e.REFORGER_SSH_PRIVATE_KEY_PATH ?? null,
    privateKeyConfigured: Boolean(
      e.REFORGER_SSH_PRIVATE_KEY_PATH || e.REFORGER_SSH_PRIVATE_KEY,
    ),
    serverPath: e.REFORGER_SERVER_PATH,
    configPath: e.REFORGER_CONFIG_PATH,
    tmuxSession: e.REFORGER_TMUX_SESSION,
    serverCommand: e.REFORGER_SERVER_CMD,
    instanceNotes: e.REFORGER_INSTANCE_NOTES,
    logGlob: e.REFORGER_LOG_GLOB ?? null,
    announcement,
    checkPort,
    activeProfileId,
    activeProfileName,
    connectionSource,
  };
}
