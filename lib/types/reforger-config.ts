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

/**
 * Overrides under `game.gameProperties.missionHeader` (see Bohemia wiki: Server Config → missionHeader).
 * Image fields are Enfusion resource names (often `{GUID}path/file.edds`), not arbitrary URLs.
 */
export type ReforgerMissionHeader = {
  m_sName?: string;
  m_sAuthor?: string;
  m_sDescription?: string;
  m_sDetails?: string;
  /** Menu / server browser style icon */
  m_sIcon?: string;
  /** Loading screen texture */
  m_sLoadingScreen?: string;
  /** Preview when loading */
  m_sPreviewImage?: string;
  [key: string]: unknown;
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
    missionHeader?: ReforgerMissionHeader;
    [key: string]: unknown;
  };
};

export type ReforgerA2S = {
  address?: string;
  port?: number;
};

/** Shape we read/write; extra keys allowed at runtime */
export type ReforgerConfig = {
  /** Backend / server identity (optional) */
  dedicatedServerId?: string;
  region?: string;
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
  dedicatedServerId: string;
  region: string;
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
  /** game.gameProperties.missionHeader */
  missionDisplayName: string;
  missionAuthor: string;
  missionDescription: string;
  missionDetails: string;
  missionIcon: string;
  missionLoadingScreen: string;
  missionPreviewImage: string;
};

export function defaultFormValues(): ReforgerFormValues {
  return {
    serverName: "",
    password: "",
    adminPassword: "",
    dedicatedServerId: "",
    region: "",
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
    missionDisplayName: "",
    missionAuthor: "",
    missionDescription: "",
    missionDetails: "",
    missionIcon: "",
    missionLoadingScreen: "",
    missionPreviewImage: "",
  };
}

function readMissionHeader(c: ReforgerConfig): ReforgerMissionHeader {
  const gp = c.game?.gameProperties;
  if (!gp || typeof gp !== "object") return {};
  const mh = (gp as { missionHeader?: unknown }).missionHeader;
  if (!mh || typeof mh !== "object" || Array.isArray(mh)) return {};
  return { ...(mh as Record<string, unknown>) } as ReforgerMissionHeader;
}

function mergeMissionHeaderFromForm(
  base: ReforgerConfig,
  form: ReforgerFormValues,
): ReforgerMissionHeader {
  const next = { ...readMissionHeader(base) } as Record<string, unknown>;
  const pairs: [keyof ReforgerFormValues, string][] = [
    ["missionDisplayName", "m_sName"],
    ["missionAuthor", "m_sAuthor"],
    ["missionDescription", "m_sDescription"],
    ["missionDetails", "m_sDetails"],
    ["missionIcon", "m_sIcon"],
    ["missionLoadingScreen", "m_sLoadingScreen"],
    ["missionPreviewImage", "m_sPreviewImage"],
  ];
  for (const [fk, jk] of pairs) {
    const v = form[fk];
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) next[jk] = t;
    else delete next[jk];
  }
  return next as ReforgerMissionHeader;
}

export function configToFormValues(c: ReforgerConfig): ReforgerFormValues {
  const g = c.game ?? {};
  const gp = g.gameProperties ?? {};
  const a2s = c.a2s ?? {};
  const mh = readMissionHeader(c);
  return {
    serverName: String(g.name ?? ""),
    password: String(g.password ?? ""),
    adminPassword: String(g.passwordAdmin ?? ""),
    dedicatedServerId: String(c.dedicatedServerId ?? ""),
    region: String(c.region ?? ""),
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
    missionDisplayName: String(mh.m_sName ?? ""),
    missionAuthor: String(mh.m_sAuthor ?? ""),
    missionDescription: String(mh.m_sDescription ?? ""),
    missionDetails: String(mh.m_sDetails ?? ""),
    missionIcon: String(mh.m_sIcon ?? ""),
    missionLoadingScreen: String(mh.m_sLoadingScreen ?? ""),
    missionPreviewImage: String(mh.m_sPreviewImage ?? ""),
  };
}

export function applyFormToConfig(
  base: ReforgerConfig,
  form: ReforgerFormValues,
): ReforgerConfig {
  const mergedMissionHeader = mergeMissionHeaderFromForm(base, form);
  const prevGp =
    typeof base.game?.gameProperties === "object" && base.game.gameProperties
      ? { ...base.game.gameProperties }
      : {};
  const nextGp: Record<string, unknown> = { ...prevGp };
  nextGp.serverMaxViewDistance = form.serverMaxViewDistance;
  nextGp.networkViewDistance = form.networkViewDistance;
  if (Object.keys(mergedMissionHeader).length > 0) {
    nextGp.missionHeader = mergedMissionHeader;
  } else {
    delete nextGp.missionHeader;
  }

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
      gameProperties: nextGp as ReforgerGame["gameProperties"],
    },
  };

  const root = next as Record<string, unknown>;
  if (form.dedicatedServerId.trim()) {
    next.dedicatedServerId = form.dedicatedServerId.trim();
  } else {
    delete root.dedicatedServerId;
  }
  if (form.region.trim()) {
    next.region = form.region.trim();
  } else {
    delete root.region;
  }

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
