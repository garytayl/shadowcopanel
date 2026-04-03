import "server-only";

import {
  buildJoinabilityResult,
  hostsEffectivelyMatch,
  type JoinabilityBuildInput,
} from "@/lib/connectivity/joinability-model";
import { requireServerEnv } from "@/lib/env/server";
import { measureControlLinkRoundTrip } from "@/lib/ssh/client";
import { defaultGamePortsToCheck, getGamePortChecks } from "@/lib/ssh/port-check";
import {
  getRecentLogs,
  getRemoteConfigParsed,
  getServerRuntimeStatus,
  type ServerRuntimeStatus,
} from "@/lib/ssh/reforger";
import type { JoinabilityResult } from "@/lib/types/connectivity";

export { buildJoinabilityResult, computeJoinabilityPreview, hostsEffectivelyMatch } from "@/lib/connectivity/joinability-model";
export type { JoinabilityBuildInput } from "@/lib/connectivity/joinability-model";

function scanLogForIssues(log: string): string[] {
  const lines = log.split(/\r?\n/).slice(-400);
  const hits: string[] = [];
  for (const line of lines) {
    if (line.length > 220) continue;
    if (
      /\bfatal\b|\bcrash\b|segmentation fault|exception caught|error:\s/i.test(
        line,
      ) &&
      !/error:\s*0\b/i.test(line)
    ) {
      hits.push(line.trim());
    }
  }
  return [...new Set(hits)].slice(-6);
}

function statusSlice(st: ServerRuntimeStatus): JoinabilityBuildInput["status"] {
  return {
    sshReachable: st.sshReachable,
    sshError: st.sshError,
    tmuxSessionExists: st.tmuxSessionExists,
    processRunning: st.processRunning,
    serverLikelyUp: st.serverLikelyUp,
  };
}

export async function runJoinabilityDiagnostics(): Promise<JoinabilityResult> {
  const control = await measureControlLinkRoundTrip();
  if (!control.ok) {
    return buildJoinabilityResult({
      status: {
        sshReachable: false,
        sshError: control.message,
        tmuxSessionExists: false,
        processRunning: false,
        serverLikelyUp: false,
      },
      portChecks: defaultGamePortsToCheck(undefined).map((s) => ({
        ...s,
        status: "unknown",
      })),
      publicAddressMatch: null,
      configPublicAddress: null,
      panelHost: requireServerEnv().REFORGER_SSH_HOST,
    });
  }

  const env = requireServerEnv();
  const sessionPort = Number(process.env.REFORGER_CHECK_PORT?.trim() || "2001") || 2001;

  const [status, portChecks, cfg] = await Promise.all([
    getServerRuntimeStatus({ control }),
    getGamePortChecks(sessionPort),
    getRemoteConfigParsed().catch(() => null),
  ]);

  const configPublicAddress = cfg?.publicAddress != null ? String(cfg.publicAddress).trim() : null;
  const panelHost = env.REFORGER_SSH_HOST;
  const publicAddressMatch =
    configPublicAddress && configPublicAddress.length > 0
      ? hostsEffectivelyMatch(configPublicAddress, panelHost)
      : null;

  let logWarnings: string[] | undefined;
  try {
    const log = await getRecentLogs(500);
    const issues = scanLogForIssues(log);
    if (issues.length) logWarnings = issues;
  } catch {
    /* ignore */
  }

  return buildJoinabilityResult({
    status: statusSlice(status),
    controlRoundTripMs: control.roundTripMs,
    portChecks,
    publicAddressMatch,
    configPublicAddress,
    panelHost,
    logWarnings,
  });
}
