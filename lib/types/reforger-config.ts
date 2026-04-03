/**
 * Typed view over Arma Reforger dedicated server `config.json`.
 * Unknown keys are preserved when round-tripping via the merge helpers.
 */

export type ReforgerMod = {
  modId: string;
  name?: string;
  version?: string;
  /** Panel-specific; Reforger may ignore this field */
  enabled?: boolean;
};

export type ReforgerGame = {
  name?: string;
  password?: string;
  passwordAdmin?: string;
  maxPlayers?: number;
  visible?: boolean;
  crossPlatform?: boolean;
  scenarioId?: string;
  gameProperties?: {
    serverMaxViewDistance?: number;
    networkViewDistance?: number;
  };
};

export type ReforgerA2S = {
  address?: string;
  port?: number;
};

/** Shape we read/write; extra keys allowed at runtime */
export type ReforgerConfig = {
  bindAddress?: string;
  bindPort?: number;
  publicAddress?: string;
  publicPort?: number;
  a2s?: ReforgerA2S;
  game?: ReforgerGame;
  mods?: ReforgerMod[];
  [key: string]: unknown;
};

export type ReforgerFormValues = {
  serverName: string;
  password: string;
  adminPassword: string;
  bindAddress: string;
  bindPort: number;
  publicAddress: string;
  publicPort: number;
  a2sAddress: string;
  a2sPort: number;
  maxPlayers: number;
  visible: boolean;
  crossPlatform: boolean;
  serverMaxViewDistance: number;
  networkViewDistance: number;
};

export function defaultFormValues(): ReforgerFormValues {
  return {
    serverName: "",
    password: "",
    adminPassword: "",
    bindAddress: "0.0.0.0",
    bindPort: 2001,
    publicAddress: "",
    publicPort: 2001,
    a2sAddress: "0.0.0.0",
    a2sPort: 17777,
    maxPlayers: 64,
    visible: true,
    crossPlatform: true,
    serverMaxViewDistance: 2000,
    networkViewDistance: 2000,
  };
}

export function configToFormValues(c: ReforgerConfig): ReforgerFormValues {
  const g = c.game ?? {};
  const gp = g.gameProperties ?? {};
  const a2s = c.a2s ?? {};
  return {
    serverName: String(g.name ?? ""),
    password: String(g.password ?? ""),
    adminPassword: String(g.passwordAdmin ?? ""),
    bindAddress: String(c.bindAddress ?? "0.0.0.0"),
    bindPort: Number(c.bindPort ?? 2001),
    publicAddress: String(c.publicAddress ?? ""),
    publicPort: Number(c.publicPort ?? c.bindPort ?? 2001),
    a2sAddress: String(a2s.address ?? "0.0.0.0"),
    a2sPort: Number(a2s.port ?? 17777),
    maxPlayers: Number(g.maxPlayers ?? 64),
    visible: Boolean(g.visible ?? true),
    crossPlatform: Boolean(g.crossPlatform ?? true),
    serverMaxViewDistance: Number(gp.serverMaxViewDistance ?? 2000),
    networkViewDistance: Number(gp.networkViewDistance ?? 2000),
  };
}

export function applyFormToConfig(
  base: ReforgerConfig,
  form: ReforgerFormValues,
): ReforgerConfig {
  const next: ReforgerConfig = {
    ...base,
    bindAddress: form.bindAddress,
    bindPort: form.bindPort,
    publicAddress: form.publicAddress,
    publicPort: form.publicPort,
    a2s: {
      ...(typeof base.a2s === "object" && base.a2s ? base.a2s : {}),
      address: form.a2sAddress,
      port: form.a2sPort,
    },
    game: {
      ...(typeof base.game === "object" && base.game ? base.game : {}),
      name: form.serverName,
      password: form.password,
      passwordAdmin: form.adminPassword,
      maxPlayers: form.maxPlayers,
      visible: form.visible,
      crossPlatform: form.crossPlatform,
      gameProperties: {
        ...(typeof base.game === "object" &&
        base.game &&
        typeof base.game.gameProperties === "object" &&
        base.game.gameProperties
          ? base.game.gameProperties
          : {}),
        serverMaxViewDistance: form.serverMaxViewDistance,
        networkViewDistance: form.networkViewDistance,
      },
    },
  };
  return next;
}

export function parseConfigJson(raw: string): { ok: true; value: ReforgerConfig } | { ok: false; error: string } {
  try {
    const v = JSON.parse(raw) as unknown;
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      return { ok: false, error: "config.json must be a JSON object" };
    }
    return { ok: true, value: v as ReforgerConfig };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON";
    return { ok: false, error: msg };
  }
}

export function stringifyConfig(config: ReforgerConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
