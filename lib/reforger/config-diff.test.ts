import { describe, expect, it } from "vitest";

import { diffReforgerConfig, isConfigDiffEmpty } from "@/lib/reforger/config-diff";
import type { ReforgerConfig } from "@/lib/types/reforger-config";

const base: ReforgerConfig = {
  bindPort: 2001,
  game: {
    name: "Test",
    maxPlayers: 64,
    mods: [
      { modId: "A", name: "Mod A", version: "1" },
      { modId: "B", name: "Mod B", version: "1" },
    ],
  },
};

describe("config-diff", () => {
  it("returns empty when identical", () => {
    const d = diffReforgerConfig(base, JSON.parse(JSON.stringify(base)));
    expect(isConfigDiffEmpty(d)).toBe(true);
  });

  it("detects maxPlayers change", () => {
    const next = JSON.parse(JSON.stringify(base)) as ReforgerConfig;
    next.game!.maxPlayers = 128;
    const d = diffReforgerConfig(base, next);
    expect(d.entries.some((e) => e.path.includes("maxPlayers"))).toBe(true);
    expect(d.riskNotes.some((n) => n.includes("128"))).toBe(true);
  });

  it("detects mod add/remove and stack note", () => {
    const next = JSON.parse(JSON.stringify(base)) as ReforgerConfig;
    next.game!.mods = [{ modId: "A", name: "Mod A", version: "1" }];
    const d = diffReforgerConfig(base, next);
    expect(d.entries.some((e) => e.kind === "removed" && String(e.path).includes("B"))).toBe(true);
    expect(d.riskNotes).toContain("Mod stack changed");
  });

  it("detects mod version change", () => {
    const next = JSON.parse(JSON.stringify(base)) as ReforgerConfig;
    next.game!.mods![0]!.version = "2";
    const d = diffReforgerConfig(base, next);
    expect(d.entries.some((e) => e.path.includes("A") && e.kind === "changed")).toBe(true);
  });
});
