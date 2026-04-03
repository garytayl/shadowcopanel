import "server-only";

import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";

import type { ActivityEvent } from "@/lib/activity/types";

const MAX_EVENTS = 500;

export function getActivityLogPath(): string {
  const env = process.env.REFORGER_ACTIVITY_LOG_PATH?.trim();
  if (env) return env;
  return path.join(process.cwd(), "data", "activity-events.json");
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

export async function readEventsFromDisk(): Promise<ActivityEvent[]> {
  const p = getActivityLogPath();
  try {
    if (!existsSync(p)) return [];
    const raw = await fs.readFile(p, "utf8");
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j.filter(
      (e): e is ActivityEvent =>
        e != null &&
        typeof e === "object" &&
        typeof (e as ActivityEvent).id === "string" &&
        typeof (e as ActivityEvent).type === "string" &&
        typeof (e as ActivityEvent).timestamp === "string",
    );
  } catch {
    return [];
  }
}

export async function writeEventsToDisk(events: ActivityEvent[]): Promise<void> {
  const p = getActivityLogPath();
  await ensureDir(p);
  const trimmed = events.slice(0, MAX_EVENTS);
  await fs.writeFile(p, `${JSON.stringify(trimmed, null, 2)}\n`, "utf8");
}

export { MAX_EVENTS };
