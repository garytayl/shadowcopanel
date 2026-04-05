"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { analyzeReforgerLogs, type LogAnalysisResult } from "@/lib/reforger/log-analysis";
import { measureControlLinkRoundTrip } from "@/lib/ssh/client";
import {
  getHealthSnapshot,
  getListeningPorts,
  getRecentLogs,
  getSystemSnapshot,
} from "@/lib/ssh/reforger";
import { err, ok, type ApiResult } from "@/lib/types/api";

export async function fetchDiagnosticsAction(): Promise<
  ApiResult<{
    system: Awaited<ReturnType<typeof getSystemSnapshot>>;
    portsSample: string;
    health: { free: string; pgrep: string };
    controlLink: {
      ok: boolean;
      roundTripMs?: number;
      message?: string;
    };
    logAnalysis: LogAnalysisResult | null;
  }>
> {
  const g = await ensureConfigured();
  if (g !== true) return g;
  try {
    const [system, ports, health, control] = await Promise.all([
      getSystemSnapshot(),
      getListeningPorts(),
      getHealthSnapshot(),
      measureControlLinkRoundTrip(),
    ]);

    let logAnalysis: LogAnalysisResult | null = null;
    try {
      const tail = await getRecentLogs(500);
      logAnalysis = analyzeReforgerLogs(tail);
    } catch {
      logAnalysis = null;
    }

    return ok({
      system,
      portsSample: [ports.stderr, ports.stdout].filter(Boolean).join("\n"),
      health,
      controlLink: control.ok
        ? { ok: true, roundTripMs: control.roundTripMs }
        : { ok: false, message: control.message },
      logAnalysis,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
