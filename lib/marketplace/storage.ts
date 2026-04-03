/**
 * Client-only persistence for marketplace UX (starred mods, recently viewed).
 * Call these only from browser event handlers or useEffect in client components.
 */

const STARRED_KEY = "reforger-marketplace-starred";
const RECENT_KEY = "reforger-marketplace-recent";
const MAX_STARRED = 80;
const MAX_RECENT = 14;

export type StarredEntry = {
  modId: string;
  name: string;
  sourceUrl?: string;
};

export type RecentEntry = {
  modId: string;
  name: string;
  at: number;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readStarred(): StarredEntry[] {
  if (typeof window === "undefined") return [];
  const v = safeParse<unknown>(localStorage.getItem(STARRED_KEY), []);
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (x): x is StarredEntry =>
        x !== null &&
        typeof x === "object" &&
        typeof (x as StarredEntry).modId === "string" &&
        typeof (x as StarredEntry).name === "string",
    )
    .slice(0, MAX_STARRED);
}

export function writeStarred(entries: StarredEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STARRED_KEY, JSON.stringify(entries.slice(0, MAX_STARRED)));
}

/** Returns true if now starred */
export function toggleStarred(entry: StarredEntry): boolean {
  const cur = readStarred();
  const i = cur.findIndex((x) => x.modId === entry.modId);
  if (i >= 0) {
    cur.splice(i, 1);
    writeStarred(cur);
    return false;
  }
  cur.unshift({
    modId: entry.modId,
    name: entry.name,
    sourceUrl: entry.sourceUrl,
  });
  writeStarred(cur);
  return true;
}

export function isStarred(modId: string): boolean {
  return readStarred().some((x) => x.modId === modId);
}

export function removeStarred(modId: string) {
  writeStarred(readStarred().filter((x) => x.modId !== modId));
}

export function readRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  const v = safeParse<unknown>(localStorage.getItem(RECENT_KEY), []);
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (x): x is RecentEntry =>
        x !== null &&
        typeof x === "object" &&
        typeof (x as RecentEntry).modId === "string" &&
        typeof (x as RecentEntry).name === "string" &&
        typeof (x as RecentEntry).at === "number",
    )
    .slice(0, MAX_RECENT);
}

export function pushRecent(entry: { modId: string; name: string }) {
  if (typeof window === "undefined") return;
  const cur = readRecent().filter((x) => x.modId !== entry.modId);
  cur.unshift({ modId: entry.modId, name: entry.name, at: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, MAX_RECENT)));
}
