import type { LogAnalysisResult } from "@/lib/reforger/log-analysis";

export type FixServerStepStatus = "ok" | "warn" | "fail";

export type FixServerStep = {
  step: string;
  status: FixServerStepStatus;
  message?: string;
};

export type FixServerDiagnostics = {
  processesFound: number;
  processesCleaned: boolean;
  tmuxReset: boolean;
  processRunning: boolean;
  portsOpen: boolean;
  tmuxSessionPresent: boolean;
};

/** UI: success / warning / failure — use `success` false only for hard failures. */
export type FixServerResultLevel = "success" | "warning" | "failure";

export type FixServerResult = {
  success: boolean;
  level: FixServerResultLevel;
  summary: string;
  steps: FixServerStep[];
  diagnostics: FixServerDiagnostics;
  /** Human-readable fixes applied (normalization + defaults). */
  whatWasFixed?: string[];
  /** Tail of server logs analyzed after repair (optional). */
  logAnalysis?: LogAnalysisResult;
};
