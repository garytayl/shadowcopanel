/**
 * Parse `ss` output for bound ports. UDP often shows state UNCONN, not LISTEN — do not require "LISTEN".
 *
 * Example healthy UDP line:
 * `udp   UNCONN 0      0               0.0.0.0:2001       0.0.0.0:*    users:(("enfMain",pid=2430,fd=14))`
 */

import type { PortCheck } from "@/lib/types/connectivity";

/** Match local port in ss local-address column (avoids false positives like :12001 containing :2001). */
export function lineHasBoundPort(line: string, port: number): boolean {
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return false;
  const re = new RegExp(`:\\b${port}\\b`);
  return re.test(line);
}

export function extractSsProcessName(line: string): string | undefined {
  const m = line.match(/users:\(\("([^"]+)"/);
  return m?.[1];
}

function lineMatchesProtocol(line: string, protocol: "udp" | "tcp"): boolean {
  const t = line.trimStart();
  if (protocol === "udp") return /^udp\s/i.test(t);
  return /^tcp\s/i.test(t);
}

export type PortSpec = { port: number; protocol: "udp" | "tcp" };

/**
 * Match each spec against ss lines. UDP UNCONN / ESTAB / etc. all count as "listening" (bound) when port+protocol match.
 */
export function parsePortChecksFromSs(ssOutput: string, specs: PortSpec[]): PortCheck[] {
  const lines = ssOutput.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return specs.map(({ port, protocol }) => {
    const hit = lines.find(
      (line) => lineHasBoundPort(line, port) && lineMatchesProtocol(line, protocol),
    );
    if (hit) {
      const trimmed = hit.slice(0, 400);
      return {
        port,
        protocol,
        status: "listening" as const,
        detail: trimmed,
        processName: extractSsProcessName(hit),
      };
    }
    const anyProto = lines.find((line) => lineHasBoundPort(line, port));
    if (anyProto) {
      return {
        port,
        protocol,
        status: "listening" as const,
        detail: anyProto.slice(0, 400),
        processName: extractSsProcessName(anyProto),
      };
    }
    return {
      port,
      protocol,
      status: "not_listening" as const,
    };
  });
}
