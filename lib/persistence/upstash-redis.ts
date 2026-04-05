import "server-only";

import { Redis } from "@upstash/redis";

let client: Redis | null | undefined;

/** True when Upstash env vars are set (Vercel / hosted durable state). */
export function isUpstashRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

/** Singleton Redis REST client; null if not configured. */
export function getRedis(): Redis | null {
  if (!isUpstashRedisConfigured()) return null;
  if (client === undefined) {
    client = Redis.fromEnv();
  }
  return client;
}

export const REDIS_KEYS = {
  serverProfiles: "reforger:v1:server_profiles",
  awsCredentials: "reforger:v1:aws_credentials",
} as const;
