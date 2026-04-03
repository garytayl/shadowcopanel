import type {
  JoinabilityCheckItem,
  JoinabilityOverall,
  JoinabilityResult,
  PortCheck,
} from "@/lib/types/connectivity";

/** Snapshot of runtime fields needed for joinability (panel + SSH checks). */
export type JoinabilityStatusSlice = {
  sshReachable: boolean;
  sshError?: string;
  tmuxSessionExists: boolean;
  processRunning: boolean;
  serverLikelyUp: boolean;
};

export type JoinabilityBuildInput = {
  status: JoinabilityStatusSlice;
  controlRoundTripMs?: number;
  portChecks: PortCheck[];
  publicAddressMatch: boolean | null;
  configPublicAddress: string | null;
  panelHost: string;
  logWarnings?: string[];
};

/** Loose host/IP equality (panel host vs config string). */
export function hostsEffectivelyMatch(
  configAddr: string,
  panelHost: string,
): boolean {
  const a = configAddr.trim().toLowerCase();
  const b = panelHost.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const strip = (s: string) => s.replace(/^\[|\]$/g, "");
  return strip(a) === strip(b);
}

export function buildJoinabilityResult(input: JoinabilityBuildInput): JoinabilityResult {
  const checks: JoinabilityCheckItem[] = [];
  const suggestions: string[] = [];

  const { status, portChecks, publicAddressMatch, configPublicAddress, panelHost } =
    input;

  if (!status.sshReachable) {
    checks.push({
      key: "ssh",
      label: "Control link (SSH)",
      status: "fail",
      message: status.sshError ?? "Unreachable",
    });
    suggestions.push(
      "Confirm this app can reach the instance on the SSH port (security group, VPN, correct host).",
    );
    return { overall: "broken", checks, suggestions };
  }

  const ms = input.controlRoundTripMs;
  checks.push({
    key: "ssh",
    label: "Control link (SSH)",
    status: "pass",
    message:
      ms != null && Number.isFinite(ms)
        ? `Reachable · control round-trip ~${Math.round(ms)} ms`
        : "Reachable",
  });

  checks.push({
    key: "tmux",
    label: "tmux session",
    status: status.tmuxSessionExists ? "pass" : status.processRunning ? "warn" : "fail",
    message: status.tmuxSessionExists
      ? "Session present"
      : "No session (server may not be managed via tmux here)",
  });

  checks.push({
    key: "process",
    label: "Game process",
    status: status.processRunning ? "pass" : "warn",
    message: status.processRunning
      ? "Arma Reforger process seen"
      : "Process not seen in pgrep sample",
  });

  const p2001 = portChecks.find((p) => p.port === 2001);
  if (p2001) {
    const st =
      p2001.status === "listening"
        ? "pass"
        : p2001.status === "unknown"
          ? "unknown"
          : "fail";
    checks.push({
      key: "port2001",
      label: "Game port (UDP 2001)",
      status: st,
      message:
        p2001.status === "listening"
          ? "Socket present (ss)"
          : p2001.status === "not_listening"
            ? "Not seen listening (game may be down or port differs)"
            : p2001.detail ?? "Could not determine",
    });
  }

  const p17777 = portChecks.find((p) => p.port === 17777);
  if (p17777) {
    checks.push({
      key: "port17777",
      label: "Port 17777 (UDP)",
      status:
        p17777.status === "listening"
          ? "pass"
          : p17777.status === "unknown"
            ? "unknown"
            : "warn",
      message:
        p17777.status === "listening"
          ? "Socket present"
          : "Not seen (may be normal depending on build / query setup)",
    });
  }

  if (publicAddressMatch === false) {
    checks.push({
      key: "publicIp",
      label: "config.json publicAddress",
      status: "fail",
      message: `Expected panel host ${panelHost}; config has “${configPublicAddress ?? "empty"}”. Wrong address can block joins.`,
    });
    suggestions.push(
      "Set publicAddress to this instance’s public IP or DNS, or use “Sync public address” on the dashboard.",
    );
  } else if (publicAddressMatch === true) {
    checks.push({
      key: "publicIp",
      label: "config.json publicAddress",
      status: "pass",
      message: `Matches panel host (${panelHost})`,
    });
  } else {
    checks.push({
      key: "publicIp",
      label: "config.json publicAddress",
      status: "unknown",
      message: "Could not compare (missing config value)",
    });
  }

  if (input.logWarnings?.length) {
    checks.push({
      key: "logs",
      label: "Recent log signals",
      status: "warn",
      message: input.logWarnings.slice(0, 3).join(" · ") || "See logs page",
    });
    suggestions.push("Open Logs and review recent errors/fatal lines.");
  }

  let overall: JoinabilityOverall = "healthy";
  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");
  const hasUnknown = checks.some((c) => c.status === "unknown");

  if (hasFail) overall = "broken";
  else if (hasWarn || hasUnknown) overall = "warning";

  if (
    !status.serverLikelyUp &&
    !status.processRunning &&
    p2001?.status === "not_listening"
  ) {
    overall = "broken";
    if (!suggestions.some((s) => s.includes("Start"))) {
      suggestions.push("Start the server from the dashboard, then re-run this check.");
    }
  }

  return { overall, checks, suggestions };
}

export function computeJoinabilityPreview(input: JoinabilityBuildInput): JoinabilityResult {
  return buildJoinabilityResult({ ...input, logWarnings: undefined });
}
