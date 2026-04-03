import "server-only";

import { unstable_noStore as noStore } from "next/cache";

/**
 * Read env at request time. Bracket access + noStore() avoids stale/empty values on
 * Vercel when RSC caches or build-time inlining would otherwise hide runtime secrets.
 */
function env(name: string): string | undefined {
  return process.env[name];
}

export type ServerEnv = {
  REFORGER_SSH_HOST: string;
  REFORGER_SSH_PORT: number;
  REFORGER_SSH_USER: string;
  REFORGER_SSH_PRIVATE_KEY_PATH: string | undefined;
  REFORGER_SSH_PRIVATE_KEY: string | undefined;
  REFORGER_SERVER_PATH: string;
  REFORGER_CONFIG_PATH: string;
  REFORGER_TMUX_SESSION: string;
  REFORGER_SERVER_CMD: string;
  REFORGER_INSTANCE_NOTES: string;
  REFORGER_LOG_GLOB: string | undefined;
};

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: string | undefined, fallback: string): string {
  if (v === undefined || v === "") return fallback;
  return v;
}

/** Returns null if SSH is not fully configured (e.g. local dev without .env.local). */
export function tryGetServerEnv(): ServerEnv | null {
  noStore();
  const host = env("REFORGER_SSH_HOST")?.trim();
  const user = env("REFORGER_SSH_USER")?.trim();
  const keyPath = env("REFORGER_SSH_PRIVATE_KEY_PATH")?.trim();
  const keyInline = env("REFORGER_SSH_PRIVATE_KEY")?.trim();

  if (!host || !user || (!keyPath && !keyInline)) {
    return null;
  }

  return {
    REFORGER_SSH_HOST: host,
    REFORGER_SSH_PORT: num(env("REFORGER_SSH_PORT"), 22),
    REFORGER_SSH_USER: user,
    REFORGER_SSH_PRIVATE_KEY_PATH: keyPath || undefined,
    REFORGER_SSH_PRIVATE_KEY: keyInline || undefined,
    REFORGER_SERVER_PATH: str(
      env("REFORGER_SERVER_PATH"),
      "/home/ubuntu/arma-reforger",
    ),
    REFORGER_CONFIG_PATH: str(
      env("REFORGER_CONFIG_PATH"),
      "/home/ubuntu/arma-reforger/config.json",
    ),
    REFORGER_TMUX_SESSION: str(env("REFORGER_TMUX_SESSION"), "reforger"),
    REFORGER_SERVER_CMD: str(
      env("REFORGER_SERVER_CMD"),
      './ArmaReforgerServer -config ./config.json -maxFPS 60',
    ),
    REFORGER_INSTANCE_NOTES: str(env("REFORGER_INSTANCE_NOTES"), ""),
    REFORGER_LOG_GLOB: env("REFORGER_LOG_GLOB")?.trim() || undefined,
  };
}

export function requireServerEnv(): ServerEnv {
  const e = tryGetServerEnv();
  if (!e) {
    throw new Error(
      "SSH is not configured. Copy .env.example to .env.local and set REFORGER_SSH_HOST, REFORGER_SSH_USER, and a private key.",
    );
  }
  return e;
}

export type PublicServerSettings = {
  configured: boolean;
  host: string;
  port: number;
  user: string;
  privateKeyPath: string | null;
  privateKeyConfigured: boolean;
  serverPath: string;
  configPath: string;
  tmuxSession: string;
  serverCommand: string;
  instanceNotes: string;
  logGlob: string | null;
  /** Optional banner text for all users (set in hosting env) */
  announcement: string | null;
};

export function getPublicServerSettings(): PublicServerSettings {
  const e = tryGetServerEnv();
  const announcement = env("REFORGER_ANNOUNCEMENT")?.trim() || null;
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
  };
}
