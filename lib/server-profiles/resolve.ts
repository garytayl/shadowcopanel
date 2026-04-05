import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import type { ServerEnv } from "@/lib/env/server";
import { tryGetServerEnv } from "@/lib/env/server";
import { getProfileById } from "@/lib/server-profiles/store";
import type { ServerProfile } from "@/lib/server-profiles/types";

/** HttpOnly cookie holding the active saved profile id (if any). */
export const ACTIVE_PROFILE_COOKIE = "reforger_active_profile";

function env(name: string): string | undefined {
  return process.env[name];
}

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function profileToServerEnv(p: ServerProfile): ServerEnv | null {
  const host = p.host.trim();
  const user = p.user.trim();
  const keyPath = p.privateKeyPath?.trim() || undefined;
  const keyInline = p.privateKeyInline?.trim() || undefined;
  if (!host || !user || (!keyPath && !keyInline)) {
    return null;
  }
  return {
    REFORGER_SSH_HOST: host,
    REFORGER_SSH_PORT: p.port,
    REFORGER_SSH_USER: user,
    REFORGER_SSH_PRIVATE_KEY_PATH: keyPath,
    REFORGER_SSH_PRIVATE_KEY: keyInline,
    REFORGER_SERVER_PATH: p.serverPath,
    REFORGER_CONFIG_PATH: p.configPath,
    REFORGER_TMUX_SESSION: p.tmuxSession,
    REFORGER_SERVER_CMD: p.serverCommand,
    REFORGER_INSTANCE_NOTES: p.instanceNotes,
    REFORGER_LOG_GLOB: p.logGlob?.trim() || undefined,
  };
}

/**
 * Resolves SSH env: optional active saved profile (cookie) wins over process env.
 * Outside a request (no cookies), falls back to env only.
 */
export async function tryGetResolvedServerEnv(): Promise<ServerEnv | null> {
  noStore();
  let cookieId: string | undefined;
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    cookieId = jar.get(ACTIVE_PROFILE_COOKIE)?.value?.trim() || undefined;
  } catch {
    cookieId = undefined;
  }

  if (cookieId) {
    const profile = await getProfileById(cookieId);
    if (profile) {
      const e = profileToServerEnv(profile);
      if (e) return e;
    }
  }

  return tryGetServerEnv();
}

export async function requireResolvedServerEnv(): Promise<ServerEnv> {
  const e = await tryGetResolvedServerEnv();
  if (!e) {
    throw new Error(
      "SSH is not configured. Add a saved server on the Servers page, or set REFORGER_SSH_HOST, REFORGER_SSH_USER, and a private key in the environment.",
    );
  }
  return e;
}

/** Check port: profile override, else REFORGER_CHECK_PORT, else 2001. */
export async function getResolvedCheckPort(): Promise<number> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const cookieId = jar.get(ACTIVE_PROFILE_COOKIE)?.value?.trim();
    if (cookieId) {
      const profile = await getProfileById(cookieId);
      if (profile?.checkPort != null && Number.isFinite(profile.checkPort)) {
        return profile.checkPort;
      }
    }
  } catch {
    /* no request */
  }
  return num(env("REFORGER_CHECK_PORT"), 2001);
}
