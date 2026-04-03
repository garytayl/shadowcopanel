import { describe, expect, it } from "vitest";

import { normalizeReforgerConfig, uiModsToServerEntries } from "@/lib/reforger/config-normalize";
import { applyFixServerDefaults } from "@/lib/reforger/fix-server-defaults";
import {
  validateReforgerConfigForFixServer,
  validateReforgerConfigForWrite,
} from "@/lib/reforger/config-validate";
import { applyModsMutation } from "@/lib/reforger/mods";
import type { ReforgerConfig } from "@/lib/types/reforger-config";

describe("normalizeReforgerConfig", () => {
  it("removes top-level mods and merges into game.mods", () => {
    const raw = {
      bindPort: 2001,
      mods: [{ modId: "A", name: "a", version: "1" }],
      game: { name: "srv", mods: [{ modId: "B", name: "b", version: "2" }] },
    } as ReforgerConfig;

    const { config, issues } = normalizeReforgerConfig(raw);
    expect((config as Record<string, unknown>).mods).toBeUndefined();
    expect(config.game?.mods?.map((m) => m.modId)).toEqual(["B", "A"]);
    expect(issues.some((i) => i.key === "mods")).toBe(true);
  });

  it("dedupes duplicate modIds (first wins)", () => {
    const raw = {
      game: {
        mods: [
          { modId: "X", name: "one", version: "1" },
          { modId: "X", name: "two", version: "2" },
        ],
      },
    } as ReforgerConfig;
    const { config, issues } = normalizeReforgerConfig(raw);
    expect(config.game?.mods).toHaveLength(1);
    expect(config.game?.mods?.[0]?.name).toBe("one");
    expect(issues.some((i) => i.message.includes("Duplicate modId"))).toBe(true);
  });

  it("strips unsupported mod fields", () => {
    const raw = {
      game: {
        mods: [
          {
            modId: "Z",
            name: "n",
            version: "v",
            enabled: false,
            source: "ui",
            extra: 1,
          },
        ],
      },
    } as ReforgerConfig;
    const { config, issues } = normalizeReforgerConfig(raw);
    const m = config.game?.mods?.[0] as Record<string, unknown>;
    expect(m?.source).toBeUndefined();
    expect(m?.enabled).toBeUndefined();
    expect(issues.some((i) => i.message.includes("unsupported"))).toBe(true);
  });
});

describe("applyFixServerDefaults", () => {
  it("fills missing bind and public fields", () => {
    const raw = { game: { mods: [] } } as ReforgerConfig;
    const n = normalizeReforgerConfig(raw);
    const { config, filled } = applyFixServerDefaults(n.config, {
      publicHostHint: "203.0.113.10",
      defaultBindPort: 2001,
    });
    expect(config.bindAddress).toBe("0.0.0.0");
    expect(config.bindPort).toBe(2001);
    expect(config.publicAddress).toBe("203.0.113.10");
    expect(config.publicPort).toBe(2001);
    expect(filled.length).toBeGreaterThan(0);
  });
});

describe("validateReforgerConfigForFixServer", () => {
  it("accepts normalized config with defaults", () => {
    const raw = {
      game: { mods: [{ modId: "a", name: "n", version: "1" }] },
    } as ReforgerConfig;
    const n = normalizeReforgerConfig(raw);
    const { config } = applyFixServerDefaults(n.config, {
      publicHostHint: "203.0.113.10",
      defaultBindPort: 2001,
    });
    const v = validateReforgerConfigForFixServer(config);
    expect(v.ok).toBe(true);
  });

  it("rejects missing public when SSH hint empty", () => {
    const raw = {
      bindAddress: "0.0.0.0",
      bindPort: 2001,
      publicPort: 2001,
      game: { mods: [{ modId: "a", name: "n", version: "1" }] },
    } as ReforgerConfig;
    const n = normalizeReforgerConfig(raw);
    const { config } = applyFixServerDefaults(n.config, {
      publicHostHint: "   ",
      defaultBindPort: 2001,
    });
    const v = validateReforgerConfigForFixServer(config);
    expect(v.ok).toBe(false);
  });
});

describe("validateReforgerConfigForWrite", () => {
  it("rejects top-level mods", () => {
    const c = { mods: [], game: { mods: [] } } as unknown as ReforgerConfig;
    const v = validateReforgerConfigForWrite(c);
    expect(v.ok).toBe(false);
  });

  it("rejects UI-only fields on mods", () => {
    const c = {
      game: { mods: [{ modId: "a", name: "n", version: "1", enabled: true }] },
    } as ReforgerConfig;
    const v = validateReforgerConfigForWrite(c);
    expect(v.ok).toBe(false);
  });

  it("accepts clean canonical config", () => {
    const n = normalizeReforgerConfig({
      game: { mods: [{ modId: "a", name: "n", version: "1" }] },
    } as ReforgerConfig);
    const v = validateReforgerConfigForWrite(n.config);
    expect(v.ok).toBe(true);
  });
});

describe("applyModsMutation", () => {
  it("rejects enabled rows missing name/version", () => {
    const base = { game: { mods: [] } } as ReforgerConfig;
    const { issues } = applyModsMutation(base, [
      { modId: "k", name: "", version: "", enabled: true },
    ]);
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("dedupes duplicate modIds from UI rows", () => {
    const base = { game: { mods: [] } } as ReforgerConfig;
    const { config, issues } = applyModsMutation(base, [
      { modId: "d", name: "a", version: "1", enabled: true },
      { modId: "d", name: "b", version: "2", enabled: true },
    ]);
    expect(config.game?.mods).toHaveLength(1);
    expect(issues.some((i) => i.message.includes("Duplicate modId"))).toBe(true);
  });
});

describe("uiModsToServerEntries", () => {
  it("filters disabled rows", () => {
    const issues: import("@/lib/reforger/types").ConfigNormalizationIssue[] = [];
    const rows = uiModsToServerEntries(
      [
        { modId: "a", name: "n", version: "v", enabled: false },
        { modId: "b", name: "n2", version: "v2", enabled: true },
      ],
      issues,
    );
    expect(rows.map((r) => r.modId)).toEqual(["b"]);
  });
});
