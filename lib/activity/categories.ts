import type { ActivityEvent, ActivityEventType } from "@/lib/activity/types";

/** Map event type to filter category for UI. */
export function activityCategory(
  t: ActivityEventType,
): "server" | "config" | "mods" | "diagnostics" | "issues" {
  switch (t) {
    case "server_started":
    case "server_stopped":
    case "server_restarted":
    case "safe_restart":
    case "fix_server":
      return "server";
    case "config_saved":
    case "config_repaired":
      return "config";
    case "mods_saved":
    case "marketplace_import":
      return "mods";
    case "diagnostic_run":
    case "joinability_check":
      return "diagnostics";
    default:
      return "issues";
  }
}

export function severityForFixServer(level: string): ActivityEvent["severity"] {
  if (level === "failure") return "error";
  if (level === "warning") return "warn";
  return "success";
}

export function severityForSafeRestart(level: string): ActivityEvent["severity"] {
  if (level === "failure") return "error";
  if (level === "warning") return "warn";
  return "success";
}
