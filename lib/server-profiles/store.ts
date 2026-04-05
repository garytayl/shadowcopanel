import "server-only";

import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";

import type { ServerProfile, ServerProfileId } from "@/lib/server-profiles/types";

const FILE_VERSION = 1;

type FileShape = {
  version: typeof FILE_VERSION;
  profiles: ServerProfile[];
};

export function getServerProfilesPath(): string {
  const env = process.env.REFORGER_SERVER_PROFILES_PATH?.trim();
  if (env) return env;
  return path.join(process.cwd(), "data", "server-profiles.json");
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

function isProfile(x: unknown): x is ServerProfile {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.host === "string" &&
    typeof o.user === "string" &&
    typeof o.port === "number" &&
    typeof o.serverPath === "string" &&
    typeof o.configPath === "string" &&
    typeof o.tmuxSession === "string" &&
    typeof o.serverCommand === "string" &&
    typeof o.instanceNotes === "string"
  );
}

export async function readProfilesFromDisk(): Promise<ServerProfile[]> {
  const p = getServerProfilesPath();
  try {
    if (!existsSync(p)) return [];
    const raw = await fs.readFile(p, "utf8");
    const j = JSON.parse(raw) as unknown;
    if (j == null || typeof j !== "object") return [];
    const profs = (j as FileShape).profiles;
    if (!Array.isArray(profs)) return [];
    return profs.filter(isProfile);
  } catch {
    return [];
  }
}

export async function writeProfilesToDisk(profiles: ServerProfile[]): Promise<void> {
  const p = getServerProfilesPath();
  await ensureDir(p);
  const payload: FileShape = { version: FILE_VERSION, profiles };
  await fs.writeFile(p, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function getProfileById(id: ServerProfileId): Promise<ServerProfile | null> {
  const all = await readProfilesFromDisk();
  return all.find((x) => x.id === id) ?? null;
}

export async function upsertProfile(profile: ServerProfile): Promise<void> {
  const all = await readProfilesFromDisk();
  const i = all.findIndex((x) => x.id === profile.id);
  if (i === -1) {
    all.push(profile);
  } else {
    all[i] = profile;
  }
  await writeProfilesToDisk(all);
}

export async function deleteProfile(id: ServerProfileId): Promise<boolean> {
  const all = await readProfilesFromDisk();
  const next = all.filter((x) => x.id !== id);
  if (next.length === all.length) return false;
  await writeProfilesToDisk(next);
  return true;
}
