/**
 * Minimal connection context shown in the shell (sidebar / mobile).
 * Mirrors fields from `getPublicServerSettingsResolved` for serialization into client components.
 */
export type ActiveServerPanelContext = {
  configured: boolean;
  host: string;
  port: number;
  user: string;
  activeProfileId: string | null;
  activeProfileName: string | null;
  connectionSource: "env" | "profile" | "none";
};
