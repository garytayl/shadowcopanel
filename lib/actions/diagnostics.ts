"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import { sshPing } from "@/lib/ssh/client";
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
    ping: { ok: boolean; latencyMs?: number; message?: string };
  }>
> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    const [system, ports, health, ping] = await Promise.all([
      getSystemSnapshot(),
      getListeningPorts(),
      getHealthSnapshot(),
      sshPing(),
    ]);
    return ok({
      system,
      portsSample: [ports.stderr, ports.stdout].filter(Boolean).join("\n"),
      health,
      ping: ping.ok
        ? { ok: true, latencyMs: ping.latencyMs }
        : { ok: false, message: ping.message },
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
