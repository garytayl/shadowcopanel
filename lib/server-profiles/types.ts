export type ServerProfileId = string;

/**
 * A saved SSH + Reforger layout. Private key material is stored on the Next.js host
 * (see `data/server-profiles.json`); never exposed to the browser in API responses.
 */
export type ServerProfile = {
  id: ServerProfileId;
  name: string;
  createdAt: string;
  updatedAt: string;
  host: string;
  port: number;
  user: string;
  privateKeyPath: string | null;
  privateKeyInline: string | null;
  serverPath: string;
  configPath: string;
  tmuxSession: string;
  serverCommand: string;
  instanceNotes: string;
  logGlob: string | null;
  /** When set, overrides REFORGER_CHECK_PORT for this profile. */
  checkPort: number | null;
};

export type ServerProfilePublic = Omit<
  ServerProfile,
  "privateKeyInline" | "privateKeyPath"
> & {
  privateKeyConfigured: boolean;
  privateKeyPathHint: string | null;
};
