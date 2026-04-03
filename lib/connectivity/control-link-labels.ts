import type { ControlLinkQuality } from "@/lib/types/connectivity";

export const CONTROL_LINK_GOOD_MAX_MS = 80;
export const CONTROL_LINK_MODERATE_MAX_MS = 180;

export function classifyControlLinkMs(
  ms: number | undefined | null,
): ControlLinkQuality {
  if (ms == null || !Number.isFinite(ms)) return "unknown";
  if (ms < CONTROL_LINK_GOOD_MAX_MS) return "good";
  if (ms <= CONTROL_LINK_MODERATE_MAX_MS) return "moderate";
  return "slow";
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
