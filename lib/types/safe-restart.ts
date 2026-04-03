import type { LogAnalysisResult } from "@/lib/reforger/log-analysis";

export type SafeRestartReason =
  | "manual"
  | "after_config_save"
  | "after_mod_change"
  | "after_repair";

export type SafeRestartStep = {
  step: string;
  status: "ok" | "warn" | "fail";
  message?: string;
};

/** Whether both expected UDP ports show in `ss -u -lpn` (game + A2S). */
export type SafeRestartStateSnapshot = {
  processRunning: boolean;
  tmuxActive: boolean;
  portsBound: boolean;
};

export type SafeRestartLevel = "success" | "warning" | "failure";

export type SafeRestartResult = {
  success: boolean;
  level: SafeRestartLevel;
  summary: string;
  steps: SafeRestartStep[];
  before: SafeRestartStateSnapshot;
  after: SafeRestartStateSnapshot;
  /** True if normalization wrote changes to disk (or defaults applied and saved). */
  configRepaired?: boolean;
  /** Human-readable normalization / default notes when config was written. */
  normalizationNotes?: string[];
  /** Issue titles from post-restart log analysis (if any). */
  detectedIssues?: string[];
  logAnalysis?: LogAnalysisResult;
  reason?: SafeRestartReason;
};
