import "server-only";

/** Hetzner Cloud API token (never exposed to the client). */
export function getHetznerApiToken(): string | null {
  const t = process.env.HETZNER_API_TOKEN?.trim();
  return t || null;
}

export function isHetznerProvisionEnabled(): boolean {
  return getHetznerApiToken() !== null;
}
