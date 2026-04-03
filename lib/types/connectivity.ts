/**
 * Connectivity & joinability models — panel-side diagnostics only.
 * Not player in-game ping; label honestly in UI.
 */

export type LatencySample = {
  at: string;
  ms: number;
};

export type ControlLinkQuality = "good" | "moderate" | "slow" | "unknown";

export type PortCheck = {
  port: number;
  protocol: "udp" | "tcp";
  /** Bound / accepting traffic — for UDP this includes UNCONN sockets (see ss output), not only TCP LISTEN. */
  status: "listening" | "not_listening" | "unknown";
  /** Full matched `ss` line (trimmed) for debugging. */
  detail?: string;
  /** From `users:(("name",pid=…))` when present. */
  processName?: string;
};

export type JoinabilityOverall = "healthy" | "warning" | "broken" | "unknown";

export type JoinabilityCheckStatus = "pass" | "warn" | "fail" | "unknown";

export type JoinabilityCheckItem = {
  key: string;
  label: string;
  status: JoinabilityCheckStatus;
  message: string;
};

export type JoinabilityResult = {
  overall: JoinabilityOverall;
  checks: JoinabilityCheckItem[];
  suggestions: string[];
};
