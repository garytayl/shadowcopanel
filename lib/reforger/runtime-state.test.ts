import { describe, expect, it } from "vitest";

import { analyzeReforgerLogs } from "@/lib/reforger/log-analysis";
import { deriveRuntimeState } from "@/lib/reforger/runtime-state";

const base = {
  sshReachable: true,
  configured: true,
  checkPort: 2001,
};

describe("deriveRuntimeState", () => {
  it("idle when no process and no tmux", () => {
    const r = deriveRuntimeState({
      ...base,
      processRunning: false,
      tmuxActive: false,
      gamePortBound: false,
      a2sPortBound: false,
      logTail: "",
      logAnalysis: analyzeReforgerLogs(""),
    });
    expect(r.state).toBe("idle");
  });

  it("ready when process tmux and both ports and clean logs", () => {
    const r = deriveRuntimeState({
      ...base,
      processRunning: true,
      tmuxActive: true,
      gamePortBound: true,
      a2sPortBound: true,
      logTail: "Server ready to accept connections",
      logAnalysis: analyzeReforgerLogs(""),
    });
    expect(r.state).toBe("ready");
  });

  it("binding_network when process+tmux but ports not yet bound", () => {
    const r = deriveRuntimeState({
      ...base,
      processRunning: true,
      tmuxActive: true,
      gamePortBound: false,
      a2sPortBound: false,
      logTail: "Starting RPL replication on port 2001",
      logAnalysis: analyzeReforgerLogs(""),
    });
    expect(r.state).toBe("binding_network");
  });

  it("failed when fatal pattern in tail", () => {
    const tail = "FATAL: unable to initialize the game";
    const r = deriveRuntimeState({
      ...base,
      processRunning: true,
      tmuxActive: true,
      gamePortBound: false,
      a2sPortBound: false,
      logTail: tail,
      logAnalysis: analyzeReforgerLogs(tail),
    });
    expect(r.state).toBe("failed");
  });
});
