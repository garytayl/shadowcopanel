/**
 * Parse Reforger Workshop URLs into a hex mod id.
 * Examples:
 * - https://reforger.armaplatform.com/workshop/5965550F24A0C152-WhereAmI
 * - https://reforger.armaplatform.com/workshop/5965550F24A0C152
 */

const HEX = /^[0-9A-F]{16}$/i;

export type ParsedWorkshopUrl =
  | { ok: true; modId: string }
  | { ok: false; error: string };

export function parseWorkshopModUrl(input: string): ParsedWorkshopUrl {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, error: "URL is empty" };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Not a valid URL" };
  }
  if (!url.hostname.endsWith("armaplatform.com")) {
    return {
      ok: false,
      error: "Only reforger.armaplatform.com workshop links are supported (not Steam Workshop)",
    };
  }
  const path = url.pathname.replace(/\/+$/, "");
  const workshop = path.match(/^\/workshop\/([^/]+)$/);
  if (!workshop) {
    return { ok: false, error: "Path must be /workshop/{modId} or /workshop/{modId}-{slug}" };
  }
  const segment = workshop[1]!;
  const modId = segment.includes("-") ? segment.split("-")[0]! : segment;
  if (!HEX.test(modId)) {
    return { ok: false, error: "Could not read 16-character mod id from URL" };
  }
  return { ok: true, modId: modId.toUpperCase() };
}
