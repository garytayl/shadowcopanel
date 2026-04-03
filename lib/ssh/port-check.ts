import "server-only";

import { sshExec } from "@/lib/ssh/client";
import type { PortCheck } from "@/lib/types/connectivity";

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

function lineMentionsPort(line: string, port: number): boolean {
  const re = new RegExp(`:${port}([^0-9]|$)`);
  return re.test(line);
}

function lineMatchesProtocol(line: string, protocol: "udp" | "tcp"): boolean {
  const lower = line.toLowerCase();
  if (protocol === "udp") return /\budp\b/.test(lower);
  return /\btcp\b/.test(lower);
}

/**
 * Parse combined `ss -ulnp` + `ss -tulnp` output for listening-style rows.
 */
export function parsePortChecksFromSs(
  ssOutput: string,
  specs: { port: number; protocol: "udp" | "tcp" }[],
): PortCheck[] {
  const lines = ssOutput.split(/\r?\n/);
  return specs.map(({ port, protocol }) => {
    const hit = lines.find(
      (line) => lineMentionsPort(line, port) && lineMatchesProtocol(line, protocol),
    );
    if (hit) {
      const trimmed = hit.trim().slice(0, 200);
      return {
        port,
        protocol,
        status: "listening" as const,
        detail: trimmed,
      };
    }
    const anyProto = lines.find((line) => lineMentionsPort(line, port));
    if (anyProto) {
      return {
        port,
        protocol,
        status: "listening" as const,
        detail: anyProto.trim().slice(0, 200),
      };
    }
    return {
      port,
      protocol,
      status: "not_listening" as const,
    };
  });
}

export async function fetchSsSnapshotForPorts(): Promise<string> {
  const r = await sshExec(
    `echo '===UDP==='; ss -H -ulnp 2>/dev/null || true; echo '===TCP==='; ss -H -tulnp 2>/dev/null || true`,
  );
  if (r.code !== 0 && !r.stdout.trim()) {
    return r.stderr || "";
  }
  return r.stdout;
}

export async function getGamePortChecks(checkPortExtra?: number): Promise<PortCheck[]> {
  try {
    const raw = await fetchSsSnapshotForPorts();
    if (!raw.trim()) {
      return defaultGamePortsToCheck(checkPortExtra).map((s) => ({
        ...s,
        status: "unknown" as const,
        detail: "No socket data from host",
      }));
    }
    return parsePortChecksFromSs(raw, defaultGamePortsToCheck(checkPortExtra));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return defaultGamePortsToCheck(checkPortExtra).map((s) => ({
      ...s,
      status: "unknown" as const,
      detail: msg.slice(0, 120),
    }));
  }
}
