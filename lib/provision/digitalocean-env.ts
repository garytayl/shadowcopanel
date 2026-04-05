import "server-only";

/** DigitalOcean API token (never exposed to the client). */
export function getDigitalOceanToken(): string | null {
  const t = process.env.DIGITALOCEAN_TOKEN?.trim();
  return t || null;
}

export function isDigitalOceanProvisionEnabled(): boolean {
  return getDigitalOceanToken() !== null;
}
