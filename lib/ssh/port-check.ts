import "server-only";

import { parsePortChecksFromSs } from "@/lib/connectivity/ss-port-parse";
import { sshExec } from "@/lib/ssh/client";
import type { PortCheck } from "@/lib/types/connectivity";

export { parsePortChecksFromSs } from "@/lib/connectivity/ss-port-parse";
export {
  extractSsProcessName,
  lineHasBoundPort,
} from "@/lib/connectivity/ss-port-parse";

/** Default Reforger-related ports to inspect (UDP-first game traffic). */
export function defaultGamePortsToCheck(extraPort?: number): { port: number; protocol: "udp" | "tcp" }[] {
  const base = [
    { port: 2001, protocol: "udp" as const },
    { port: 17777, protocol: "udp" as const },
  ];
  if (extraPort != null && extraPort > 0 && ![2001, 17777].includes(extraPort)) {
    base.push({ port: extraPort, protocol: "udp" });
  }
  return base;
}

/**
 * Snapshot for game ports. Uses `ss -tuanp` (all socket states).
 *
 * **Important:** Do not use `ss -l` for UDP — kernels often report bound UDP as UNCONN, which `-l` omits.
 */
export async function fetchSsSnapshotForPorts(): Promise<string> {
  const r = await sshExec(
    `echo '===ss_tuanp==='; ss -tuanp 2>/dev/null || true`,
  );
  if (r.code !== 0 && !r.stdout.trim()) {
    return r.stderr || "";
  }
  return r.stdout;
}

export type GamePortCheckResult = {
  checks: PortCheck[];
  /** Raw `ss` output used for parsing (debug / Advanced panel). */
  ssRaw: string;
};

export async function getGamePortChecks(checkPortExtra?: number): Promise<GamePortCheckResult> {
  try {
    const raw = await fetchSsSnapshotForPorts();
    if (!raw.trim()) {
      return {
        ssRaw: raw,
        checks: defaultGamePortsToCheck(checkPortExtra).map((s) => ({
          ...s,
          status: "unknown" as const,
          detail: "No socket data from host",
        })),
      };
    }
    return {
      ssRaw: raw,
      checks: parsePortChecksFromSs(raw, defaultGamePortsToCheck(checkPortExtra)),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ssRaw: msg.slice(0, 500),
      checks: defaultGamePortsToCheck(checkPortExtra).map((s) => ({
        ...s,
        status: "unknown" as const,
        detail: msg.slice(0, 120),
      })),
    };
  }
}
