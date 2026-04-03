import type { ReforgerConfig } from "@/lib/types/reforger-config";

export type ApplyFixServerDefaultsOptions = {
  /** Used when `publicAddress` is missing (usually panel SSH host). */
  publicHostHint: string;
  /** Default bind/game port when missing or invalid. */
  defaultBindPort: number;
};

/**
 * Ensures required network fields exist after normalization so the server can bind and advertise.
 */
export function applyFixServerDefaults(
  config: ReforgerConfig,
  opts: ApplyFixServerDefaultsOptions,
): { config: ReforgerConfig; filled: string[] } {
  const filled: string[] = [];
  const c = JSON.parse(JSON.stringify(config)) as ReforgerConfig;
  const root = c as Record<string, unknown>;

  const bindStr = typeof c.bindAddress === "string" ? c.bindAddress.trim() : "";
  if (!bindStr) {
    c.bindAddress = "0.0.0.0";
    filled.push("bindAddress → 0.0.0.0");
  }

  const bp = c.bindPort;
  if (typeof bp !== "number" || !Number.isFinite(bp) || bp < 1 || bp > 65535) {
    c.bindPort = opts.defaultBindPort;
    filled.push(`bindPort → ${opts.defaultBindPort}`);
  }

  const pub = typeof c.publicAddress === "string" ? c.publicAddress.trim() : "";
  if (!pub) {
    const hint = opts.publicHostHint.trim();
    c.publicAddress = hint;
    filled.push(hint ? `publicAddress → ${hint}` : "publicAddress (empty — set SSH host in env)");
  }

  const pp = c.publicPort;
  if (typeof pp !== "number" || !Number.isFinite(pp) || pp < 1 || pp > 65535) {
    const fb = typeof c.bindPort === "number" ? c.bindPort : opts.defaultBindPort;
    c.publicPort = fb;
    filled.push(`publicPort → ${fb}`);
  }

  return { config: c, filled };
}
