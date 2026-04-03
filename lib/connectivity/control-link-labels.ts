import type { ControlLinkQuality } from "@/lib/types/connectivity";

export const CONTROL_LINK_GOOD_MAX_MS = 80;
export const CONTROL_LINK_MODERATE_MAX_MS = 180;

/** Spike: latest sample is unusually high vs rolling average (transient; not the baseline). */
export const SPIKE_RATIO_MIN = 1.4;
export const SPIKE_ABSOLUTE_MIN_MS = 60;

export function classifyControlLinkMs(
  ms: number | undefined | null,
): ControlLinkQuality {
  if (ms == null || !Number.isFinite(ms)) return "unknown";
  if (ms < CONTROL_LINK_GOOD_MAX_MS) return "good";
  if (ms <= CONTROL_LINK_MODERATE_MAX_MS) return "moderate";
  return "slow";
}

/**
 * Primary status for UI: prefer rolling average when enough samples exist,
 * so one bad sample does not dominate the badge.
 */
export function classifyControlLinkForBadge(
  latestSample: number | undefined | null,
  rollingAvg: number | null,
  historyLength: number,
): ControlLinkQuality {
  if (historyLength >= 2 && rollingAvg != null && Number.isFinite(rollingAvg)) {
    return classifyControlLinkMs(rollingAvg);
  }
  return classifyControlLinkMs(latestSample);
}

/** True when the latest measurement looks like a spike vs typical (rolling avg). */
export function isTransientSpike(
  latestSample: number | null | undefined,
  rollingAvg: number | null,
  historyLength: number,
): boolean {
  if (
    latestSample == null ||
    !Number.isFinite(latestSample) ||
    rollingAvg == null ||
    !Number.isFinite(rollingAvg) ||
    historyLength < 3
  ) {
    return false;
  }
  if (rollingAvg <= 0) return false;
  return (
    latestSample >= rollingAvg * SPIKE_RATIO_MIN &&
    latestSample - rollingAvg >= SPIKE_ABSOLUTE_MIN_MS
  );
}

export function controlLinkQualityLabel(q: ControlLinkQuality): string {
  switch (q) {
    case "good":
      return "Good";
    case "moderate":
      return "Moderate";
    case "slow":
      return "Slow";
    default:
      return "Unknown";
  }
}
