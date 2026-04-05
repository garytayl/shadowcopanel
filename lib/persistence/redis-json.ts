import "server-only";

/**
 * Upstash `@upstash/redis` may return either a JSON string or a parsed object for the same key,
 * depending on client version / REST deserialization. Never double-JSON.parse.
 */
export function parseRedisJson<T = unknown>(raw: unknown): T | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw as T;
}
