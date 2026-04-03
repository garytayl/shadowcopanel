import { describe, expect, it } from "vitest";

import { analyzeReforgerLogs } from "@/lib/reforger/log-analysis";
import type { HealthScoreResult } from "@/lib/reforger/health-score";
import {
  evaluateRuntimeTruth,
  mergeHealthScoreWithRuntimeTruth,
  parseLogAdvertisedRegistration,
} from "@/lib/reforger/runtime-truth";

describe("parseLogAdvertisedRegistration", () => {
  it("parses 0.0.0.0:2001 (broken public advertisement)", () => {
    const r = parseLogAdvertisedRegistration(
      "blah\nServer registered with address: 0.0.0.0:2001\n",
    );
    expect(r).toEqual({ full: "0.0.0.0:2001", host: "0.0.0.0", port: 2001 });
  });

  it("uses the last matching line in the tail", () => {
    const r = parseLogAdvertisedRegistration(
      "Server registered with address: 1.2.3.4:2001\nlater\nServer registered with address: 0.0.0.0:2001\n",
    );
    expect(r?.host).toBe("0.0.0.0");
    expect(r?.port).toBe(2001);
  });

  it("parses bracketed IPv6 with port", () => {
    const r = parseLogAdvertisedRegistration(
      'Server registered with address: [2001:db8::1]:2001',
    );
    expect(r?.full).toBe("[2001:db8::1]:2001");
    expect(r?.host).toBe("[2001:db8::1]");
    expect(r?.port).toBe(2001);
  });

  it("returns null when no registration line", () => {
    expect(parseLogAdvertisedRegistration("no match here")).toBeNull();
  });
});

const healthyBase = {
  logTail: "",
  logAnalysis: analyzeReforgerLogs(""),
  sshReachable: true,
  configured: true,
  processRunning: true,
  tmuxActive: true,
  serverLikelyUp: true,
  gamePortBound: true,
  a2sPortBound: true,
  checkPort: 2001,
  configPublicAddress: "203.0.113.1",
  panelHost: "203.0.113.1",
};

describe("evaluateRuntimeTruth", () => {
  it("marks not_joinable and degraded when log shows 0.0.0.0 registration despite open ports", () => {
    const tail = "Server registered with address: 0.0.0.0:2001";
    const r = evaluateRuntimeTruth({
      ...healthyBase,
      logTail: tail,
      logAnalysis: analyzeReforgerLogs(tail),
    });
    expect(r.joinability).toBe("not_joinable");
    expect(r.startupState).toBe("degraded");
    expect(r.advertisedAddress).toBe("0.0.0.0:2001");
    expect(r.findings.find((f) => f.key === "log_registration")?.status).toBe("fail");
  });

  it("marks likely_joinable when registration uses a public host and ports are bound", () => {
    const tail = "Server registered with address: 203.0.113.1:2001";
    const r = evaluateRuntimeTruth({
      ...healthyBase,
      logTail: tail,
      logAnalysis: analyzeReforgerLogs(tail),
    });
    expect(r.joinability).toBe("likely_joinable");
    expect(r.startupState).toBe("running");
    expect(r.findings.find((f) => f.key === "log_registration")?.status).toBe("pass");
  });

  it("returns failed when not configured", () => {
    const r = evaluateRuntimeTruth({
      ...healthyBase,
      configured: false,
    });
    expect(r.startupState).toBe("failed");
    expect(r.joinability).toBe("not_joinable");
  });
});

describe("mergeHealthScoreWithRuntimeTruth", () => {
  const baseHealth: HealthScoreResult = {
    score: 92,
    status: "Healthy",
    summary: "Looks good",
    factors: {
      process: true,
      ports: { game: true, a2s: true },
      logs: { critical: 0, errors: 0, warnings: 0 },
    },
    penalties: [],
  };

  it("caps score when joinability is not_joinable", () => {
    const truth = evaluateRuntimeTruth({
      ...healthyBase,
      logTail: "Server registered with address: 0.0.0.0:2001",
      logAnalysis: analyzeReforgerLogs("Server registered with address: 0.0.0.0:2001"),
    });
    const merged = mergeHealthScoreWithRuntimeTruth(baseHealth, truth);
    expect(merged.score).toBeLessThanOrEqual(49);
    expect(merged.penalties.some((p) => p.includes("Joinability"))).toBe(true);
  });

  it("leaves score unchanged when joinability is not not_joinable", () => {
    const truth = evaluateRuntimeTruth({
      ...healthyBase,
      logTail: "Server registered with address: 203.0.113.1:2001",
      logAnalysis: analyzeReforgerLogs("Server registered with address: 203.0.113.1:2001"),
    });
    const merged = mergeHealthScoreWithRuntimeTruth(baseHealth, truth);
    expect(merged.score).toBe(92);
    expect(merged.status).toBe("Healthy");
  });
});
