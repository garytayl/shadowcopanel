"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { measureControlLinkRoundTrip } from "@/lib/ssh/client";
import {
  getHealthSnapshot,
  getListeningPorts,
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
  }>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const [system, ports, health, control] = await Promise.all([
      getSystemSnapshot(),
      getListeningPorts(),
      getHealthSnapshot(),
      measureControlLinkRoundTrip(),
    ]);
    return ok({
      system,
      portsSample: [ports.stderr, ports.stdout].filter(Boolean).join("\n"),
      health,
      controlLink: control.ok
        ? { ok: true, roundTripMs: control.roundTripMs }
        : { ok: false, message: control.message },
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
