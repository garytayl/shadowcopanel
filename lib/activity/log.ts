import "server-only";

import { readEventsFromDisk, writeEventsToDisk, MAX_EVENTS } from "@/lib/activity/persistence";
import type { ActivityEvent, ActivityEventInput } from "@/lib/activity/types";

/**
 * Append an event. Never throws — failures are swallowed so core flows stay reliable.
 */
export async function recordActivityEvent(input: ActivityEventInput): Promise<ActivityEvent | null> {
  try {
    const ev: ActivityEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...input,
    };
    const all = await readEventsFromDisk();
    all.unshift(ev);
    await writeEventsToDisk(all.slice(0, MAX_EVENTS));
    return ev;
  } catch {
    return null;
  }
}

/** Fire-and-forget safe wrapper for server actions. */
export function safeRecordActivity(input: ActivityEventInput): void {
  void recordActivityEvent(input);
}

export async function listActivityEvents(limit = 200): Promise<ActivityEvent[]> {
  const all = await readEventsFromDisk();
  return all.slice(0, Math.min(limit, MAX_EVENTS));
}

export async function clearActivityEvents(): Promise<void> {
  await writeEventsToDisk([]);
}

const CRITICAL_DEDUPE_MS = 15 * 60 * 1000;

/**
 * Record critical log patterns once per fingerprint per dedupe window.
 */
export async function maybeRecordCriticalLogIssue(opts: {
  fingerprint: string;
  titles: string[];
}): Promise<void> {
  try {
    const recent = await readEventsFromDisk();
    const now = Date.now();
    const dup = recent.find(
      (e) =>
        e.type === "critical_issue_detected" &&
        e.metadata?.fingerprint === opts.fingerprint &&
        now - new Date(e.timestamp).getTime() < CRITICAL_DEDUPE_MS,
    );
    if (dup) return;
    await recordActivityEvent({
      type: "critical_issue_detected",
      severity: "error",
      title: "Critical log pattern detected",
      message: opts.titles.slice(0, 3).join(" · "),
      metadata: { fingerprint: opts.fingerprint, titles: opts.titles },
    });
  } catch {
    /* ignore */
  }
}

const HEALTH_WARN_DEDUPE_MS = 30 * 60 * 1000;

/** Record when health score is in Critical band (optional, deduped). */
export async function maybeRecordHealthWarning(opts: {
  score: number;
  status: string;
  summary: string;
}): Promise<void> {
  if (opts.score > 39) return;
  try {
    const recent = await readEventsFromDisk();
    const now = Date.now();
    const dup = recent.find(
      (e) =>
        e.type === "health_warning" &&
        now - new Date(e.timestamp).getTime() < HEALTH_WARN_DEDUPE_MS,
    );
    if (dup) return;
    await recordActivityEvent({
      type: "health_warning",
      severity: "warn",
      title: `Health score ${opts.score} (${opts.status})`,
      message: opts.summary,
      metadata: { score: opts.score, status: opts.status },
    });
  } catch {
    /* ignore */
  }
}

