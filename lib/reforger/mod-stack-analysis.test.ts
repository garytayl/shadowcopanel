import { describe, expect, it } from "vitest";

import {
  autoCleanModStack,
  detectDuplicateMods,
  detectMissingDependencies,
  validateModStack,
} from "@/lib/reforger/mod-stack-analysis";

describe("mod-stack-analysis", () => {
  it("flags duplicate enabled mod IDs", () => {
    const rows = [
      { modId: "AAA", name: "A", version: "1", enabled: true },
      { modId: "AAA", name: "A2", version: "1", enabled: true },
    ];
    const d = detectDuplicateMods(rows);
    expect(d.length).toBe(1);
    expect(d[0]!.severity).toBe("error");
  });

  it("flags missing dependency when catalog says so", () => {
    const rows = [{ modId: "ROOT", name: "R", version: "1", enabled: true }];
    const catalogByModId = new Map([
      [
        "ROOT",
        {
          modId: "ROOT",
          name: "Root",
          dependencies: [{ modId: "NEED", name: "Need" }],
        },
      ],
    ]);
    const m = detectMissingDependencies(rows, catalogByModId);
    expect(m.some((i) => i.relatedModIds?.includes("NEED"))).toBe(true);
  });

  it("validateModStack combines errors and maxPlayers warn", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      modId: `M${i}`,
      name: `M${i}`,
      version: "1",
      enabled: true,
    }));
    const r = validateModStack(rows, { maxPlayers: 128 });
    expect(r.issues.some((i) => i.key === "risk:players-vs-mods")).toBe(true);
  });

  it("autoCleanModStack dedupes by first occurrence", () => {
    const rows = [
      { modId: "A", name: "a", version: "1", enabled: true },
      { modId: "B", name: "b", version: "1", enabled: true },
      { modId: "A", name: "a2", version: "2", enabled: true },
    ];
    const { rows: out, removedDuplicateIds } = autoCleanModStack(rows);
    expect(out.map((r) => r.modId)).toEqual(["A", "B"]);
    expect(removedDuplicateIds).toEqual(["A"]);
  });
});
