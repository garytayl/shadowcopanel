"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import {
  analyzeReforgerLogs,
  countErrorWarnLines,
  type LogAnalysisResult,
} from "@/lib/reforger/log-analysis";
import { getRecentLogs } from "@/lib/ssh/reforger";
import { err, ok, type ApiResult } from "@/lib/types/api";

export type LogHealthSummary = {
  errorCount: number;
  warnCount: number;
  /** Short labels for legacy badges — prefer `analysis` for real diagnostics. */
  hints: string[];
};

function buildHealthSummary(text: string, analysis: LogAnalysisResult): LogHealthSummary {
  const { errorLines, warnLines } = countErrorWarnLines(text);
  const hints = analysis.issues.slice(0, 8).map((i) => i.title);
  if (hints.length === 0) {
    hints.push("No known failure patterns in this tail");
  }
  return { errorCount: errorLines, warnCount: warnLines, hints };
}

export async function fetchLogsAction(
  lines = 500,
): Promise<ApiResult<{ text: string; health: LogHealthSummary; analysis: LogAnalysisResult }>> {
  const g = await ensureConfigured();
  if (g !== true) return g;
  try {
    const text = await getRecentLogs(lines);
    const analysis = analyzeReforgerLogs(text);
    return ok({ text, health: buildHealthSummary(text, analysis), analysis });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
