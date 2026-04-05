import "server-only";

import { existsSync, readFileSync } from "fs";
import fs from "fs/promises";
import path from "path";

import { getRedis, isUpstashRedisConfigured, REDIS_KEYS } from "@/lib/persistence/upstash-redis";

export type StoredAwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string | null;
  sgCidr?: string | null;
  updatedAt: string;
};

export function getAwsCredentialsFilePath(): string {
  const env = process.env.REFORGER_AWS_CREDENTIALS_PATH?.trim();
  if (env) return env;
  return path.join(process.cwd(), "data", "aws-credentials.json");
}

function isStoredShape(x: unknown): x is StoredAwsCredentials {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.accessKeyId === "string" &&
    typeof o.secretAccessKey === "string" &&
    typeof o.region === "string" &&
    o.accessKeyId.length > 0 &&
    o.secretAccessKey.length > 0 &&
    o.region.length > 0
  );
}

export function readAwsCredentialsFromDiskSync(): StoredAwsCredentials | null {
  const p = getAwsCredentialsFilePath();
  try {
    if (!existsSync(p)) return null;
    const raw = readFileSync(p, "utf8");
    const j = JSON.parse(raw) as unknown;
    if (!isStoredShape(j)) return null;
    return j;
  } catch {
    return null;
  }
}

async function writeAwsCredentialsToDisk(
  data: Omit<StoredAwsCredentials, "updatedAt">,
): Promise<void> {
  const p = getAwsCredentialsFilePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const payload: StoredAwsCredentials = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(p, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function deleteAwsCredentialsFromDisk(): Promise<boolean> {
  const p = getAwsCredentialsFilePath();
  try {
    if (!existsSync(p)) return false;
    await fs.unlink(p);
    return true;
  } catch {
    return false;
  }
}

/** Prefer Redis when configured; otherwise local file (dev / self-hosted). */
export async function readStoredAwsCredentialsAsync(): Promise<StoredAwsCredentials | null> {
  if (isUpstashRedisConfigured()) {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.get<string>(REDIS_KEYS.awsCredentials);
    if (raw == null || raw === "") return null;
    try {
      const j = JSON.parse(raw) as unknown;
      if (!isStoredShape(j)) return null;
      return j;
    } catch {
      return null;
    }
  }
  return readAwsCredentialsFromDiskSync();
}

export async function writeStoredAwsCredentialsAsync(
  data: Omit<StoredAwsCredentials, "updatedAt">,
): Promise<void> {
  const payload: StoredAwsCredentials = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  if (isUpstashRedisConfigured()) {
    const redis = getRedis();
    if (!redis) throw new Error("Redis is not configured.");
    await redis.set(REDIS_KEYS.awsCredentials, JSON.stringify(payload));
    return;
  }
  await writeAwsCredentialsToDisk(data);
}

export async function deleteStoredAwsCredentialsAsync(): Promise<boolean> {
  if (isUpstashRedisConfigured()) {
    const redis = getRedis();
    if (!redis) return false;
    const n = await redis.del(REDIS_KEYS.awsCredentials);
    return n > 0;
  }
  return deleteAwsCredentialsFromDisk();
}

export function maskAccessKeyId(id: string): string {
  const t = id.trim();
  if (t.length <= 8) return "••••••••";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}
