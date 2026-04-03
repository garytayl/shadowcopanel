import { describe, expect, it } from "vitest";

import { analyzeReforgerLogs, detectKnownIssues } from "@/lib/reforger/log-analysis";

describe("detectKnownIssues", () => {
  it("detects OOM", () => {
    const issues = detectKnownIssues("[ERROR] Out of memory in allocator");
    expect(issues.some((i) => i.key === "oom")).toBe(true);
    expect(issues.find((i) => i.key === "oom")?.severity).toBe("critical");
  });

  it("detects bind failure", () => {
    const issues = detectKnownIssues("bind failed: EADDRINUSE on 0.0.0.0:2001");
    expect(issues.some((i) => i.key === "bind-failed")).toBe(true);
  });

  it("dedupes by key (one entry per key)", () => {
    const issues = detectKnownIssues(
      "out of memory\nout of memory again\nstd::bad_alloc",
    );
    expect(issues.filter((i) => i.key === "oom")).toHaveLength(1);
  });
});

describe("analyzeReforgerLogs", () => {
  it("returns summary with highest severity", () => {
    const r = analyzeReforgerLogs("ERROR segfault in enfMain\nSIGSEGV");
    expect(r.issues.length).toBeGreaterThan(0);
    expect(["critical", "error", "warn", "info", "none"]).toContain(r.summary.highestSeverity);
    expect(r.summary.totalIssues).toBe(r.issues.length);
  });

  it("reports none for routine text", () => {
    const r = analyzeReforgerLogs("Server started\nListening on port\nAll good");
    expect(r.summary.highestSeverity).toBe("none");
    expect(r.summary.hasFatal).toBe(false);
  });

  it("flags high error line count", () => {
    const lines = Array.from({ length: 10 }, () => "ERROR something failed").join("\n");
    const r = analyzeReforgerLogs(lines);
    expect(r.issues.some((i) => i.key === "high-error-rate")).toBe(true);
  });
});
