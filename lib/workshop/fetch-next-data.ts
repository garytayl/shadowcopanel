import "server-only";

/**
 * Fetches HTML from the public Reforger Workshop site and extracts the embedded
 * Next.js `__NEXT_DATA__` JSON blob (same payload the in-browser app hydrates from).
 *
 * This is intentionally isolated so it can be replaced by a direct Bohemia API client later.
 */

export const REFORGER_WORKSHOP_ORIGIN = "https://reforger.armaplatform.com";

const USER_AGENT =
  "ReforgerControlPanel/1.0 (server-side catalog; +https://reforger.armaplatform.com/workshop)";

export async function fetchWorkshopHtml(pathWithQuery: string): Promise<string> {
  const url = new URL(pathWithQuery, REFORGER_WORKSHOP_ORIGIN);
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    next: { revalidate: 120 },
  });
  if (!res.ok) {
    throw new Error(`Workshop HTTP ${res.status} for ${url.pathname}`);
  }
  return res.text();
}

export function extractNextDataJson(html: string): unknown {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!m) {
    throw new Error(
      "Workshop page did not include __NEXT_DATA__ (layout may have changed)",
    );
  }
  try {
    return JSON.parse(m[1]!) as unknown;
  } catch {
    throw new Error("Failed to parse __NEXT_DATA__ JSON");
  }
}

export function pageProps<T>(nextData: unknown): T {
  const d = nextData as {
    props?: { pageProps?: unknown };
  };
  if (!d.props?.pageProps) {
    throw new Error("Invalid __NEXT_DATA__: missing props.pageProps");
  }
  return d.props.pageProps as T;
}
