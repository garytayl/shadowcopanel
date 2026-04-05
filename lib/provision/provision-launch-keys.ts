import "server-only";

import { getRedis, isUpstashRedisConfigured } from "@/lib/persistence/upstash-redis";

const TTL_SEC = 900;
const KEY_PREFIX = "reforger:v1:provision:pk:";

/** In-process fallback when Redis is not configured (local dev / single Node process). */
const memory = new Map<string, { pk: string; expiresAt: number }>();

function redisKey(instanceId: string): string {
  return `${KEY_PREFIX}${instanceId}`;
}

/**
 * Store the private key for a just-launched instance until `takeLaunchPrivateKey` runs.
 * On serverless hosts, Redis must be configured or the next request will not see this key.
 */
export async function storeLaunchPrivateKey(
  instanceId: string,
  privateKey: string,
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(redisKey(instanceId), privateKey, { ex: TTL_SEC });
    return;
  }
  memory.set(instanceId, { pk: privateKey, expiresAt: Date.now() + TTL_SEC * 1000 });
}

/** Pop the private key for this instance id, or null if missing/expired. */
export async function takeLaunchPrivateKey(instanceId: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    const key = redisKey(instanceId);
    const v = await redis.get<string>(key);
    if (v == null || v === "") return null;
    await redis.del(key);
    return v;
  }
  const row = memory.get(instanceId);
  memory.delete(instanceId);
  if (!row || Date.now() > row.expiresAt) return null;
  return row.pk;
}

/** One-click launch needs Redis on Vercel (different Lambdas); local single-process can use memory. */
export function canUseServerGeneratedKeysOnThisHost(): boolean {
  if (isUpstashRedisConfigured()) return true;
  if (process.env.VERCEL) return false;
  return true;
}
