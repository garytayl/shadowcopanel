"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { getRecentLogs } from "@/lib/ssh/reforger";
import { err, ok, type ApiResult } from "@/lib/types/api";

export type LogHealthSummary = {
  errorCount: number;
  warnCount: number;
  hints: string[];
};

function parseHealthSummary(text: string): LogHealthSummary {
  const lines = text.split(/\r?\n/);
  let errorCount = 0;
  let warnCount = 0;
  const hints: string[] = [];

  const lower = text.toLowerCase();
  for (const line of lines) {
    if (/error/i.test(line)) errorCount++;
    if (/\bwarn(ing)?\b/i.test(line)) warnCount++;
  }

  if (lower.includes("out of memory")) hints.push("Possible OOM condition in logs");
  if (/unable to initialize/i.test(text)) hints.push("Initialization failure mentioned");
  if (/dependency/i.test(lower)) hints.push("Dependency-related messages present");
  if (errorCount > 5) hints.push("High ERROR count — verify server health");

  return { errorCount, warnCount, hints };
}

export async function fetchLogsAction(
  lines = 500,
): Promise<ApiResult<{ text: string; health: LogHealthSummary }>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const text = await getRecentLogs(lines);
    return ok({ text, health: parseHealthSummary(text) });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
