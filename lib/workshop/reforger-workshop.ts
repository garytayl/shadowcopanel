import "server-only";

import {
  extractNextDataJson,
  fetchWorkshopHtml,
  pageProps,
  REFORGER_WORKSHOP_ORIGIN,
} from "@/lib/workshop/fetch-next-data";
import { parseWorkshopModUrl } from "@/lib/workshop/parse-url";
import type {
  WorkshopCatalogMod,
  WorkshopDependencyRef,
  WorkshopProvider,
  WorkshopSearchResult,
  WorkshopSort,
} from "@/lib/workshop/types";

/** Raw listing row from workshop __NEXT_DATA__ */
type WorkshopListRow = {
  id: string;
  name: string;
  summary?: string;
  currentVersionNumber?: string;
  previews?: Array<{
    url?: string;
    thumbnails?: { "image/jpeg"?: Array<{ url?: string }> };
  }>;
  author?: { username?: string };
  tags?: Array<{ name?: string }>;
};

type WorkshopListPageProps = {
  search: string;
  page: number;
  sort?: string;
  assets: { count: number; rows: WorkshopListRow[] };
};

/** Nested dependency node from workshop asset.dependencies */
type RawDepNode = {
  asset?: { id?: string; name?: string };
  version?: string;
  dependencies?: RawDepNode[];
};

type WorkshopAssetDetail = {
  id: string;
  name: string;
  summary?: string;
  description?: string;
  currentVersionNumber?: string;
  previews?: WorkshopListRow["previews"];
  author?: { username?: string };
  tags?: Array<{ name?: string }>;
  dependencies?: RawDepNode[];
};

type WorkshopDetailPageProps = {
  pathId?: string;
  asset: WorkshopAssetDetail;
};

function thumbUrl(row: WorkshopListRow): string | undefined {
  const p = row.previews?.[0];
  if (!p) return undefined;
  const thumb = p.thumbnails?.["image/jpeg"]?.[0]?.url;
  return thumb ?? p.url;
}

function workshopSourceUrl(modId: string): string {
  return `${REFORGER_WORKSHOP_ORIGIN}/workshop/${modId}`;
}

/**
 * Post-order flatten: dependency nodes first (deepest first), so load order tends to match
 * “depends-on before dependent” when appended left-to-right.
 */
export function flattenDependencyNodes(
  nodes: RawDepNode[] | undefined,
): WorkshopDependencyRef[] {
  const out: WorkshopDependencyRef[] = [];
  function walk(n: RawDepNode) {
    for (const c of n.dependencies ?? []) {
      walk(c);
    }
    if (n.asset?.id) {
      out.push({
        modId: n.asset.id,
        name: n.asset.name,
        version: n.version,
      });
    }
  }
  for (const n of nodes ?? []) {
    walk(n);
  }
  return out;
}

export function countDependencyNodes(nodes: RawDepNode[] | undefined): number {
  return flattenDependencyNodes(nodes).length;
}

function normalizeListRow(row: WorkshopListRow): WorkshopCatalogMod {
  const modId = row.id;
  return {
    modId,
    name: row.name,
    author: row.author?.username,
    version: row.currentVersionNumber,
    sourceUrl: workshopSourceUrl(modId),
    summary: row.summary,
    dependencies: [],
    dependencyCount: undefined,
    tags: row.tags?.map((t) => t.name).filter((x): x is string => Boolean(x)),
    imageUrl: thumbUrl(row),
  };
}

function normalizeDetailAsset(a: WorkshopAssetDetail): WorkshopCatalogMod {
  const flat = flattenDependencyNodes(a.dependencies);
  return {
    modId: a.id,
    name: a.name,
    author: a.author?.username,
    version: a.currentVersionNumber,
    sourceUrl: workshopSourceUrl(a.id),
    summary: a.summary ?? a.description?.slice(0, 500),
    dependencies: flat,
    dependencyCount: flat.length,
    tags: a.tags?.map((t) => t.name).filter((x): x is string => Boolean(x)),
    imageUrl: thumbUrl(a),
  };
}

function assertSort(s: string): WorkshopSort {
  const allowed: WorkshopSort[] = [
    "newest",
    "oldest",
    "popular",
    "rating",
    "subscribers",
    "updated",
    "name",
    "relevance",
  ];
  return (allowed.includes(s as WorkshopSort) ? s : "newest") as WorkshopSort;
}

export async function searchModsImpl(
  query: string,
  options: { page: number; sort: WorkshopSort; tag?: string | null },
): Promise<WorkshopSearchResult> {
  const sp = new URLSearchParams();
  const q = query.trim();
  if (q) sp.set("search", q);
  sp.set("page", String(Math.max(1, options.page)));
  sp.set("sort", options.sort);
  const tag = options.tag?.trim();
  if (tag) sp.set("tags", tag);

  const html = await fetchWorkshopHtml(`/workshop?${sp.toString()}`);
  const raw = extractNextDataJson(html);
  const pp = pageProps<WorkshopListPageProps>(raw);
  const mods = (pp.assets?.rows ?? []).map(normalizeListRow);
  const sort = assertSort(String(pp.sort ?? options.sort));
  /** Workshop lists 16 items per page today; kept constant for total page math. */
  const pageSize = 16;

  return {
    query: pp.search ?? q,
    page: pp.page ?? options.page,
    pageSize,
    totalCount: pp.assets?.count ?? mods.length,
    sort,
    tag: tag || undefined,
    mods,
  };
}

export async function getModByIdImpl(modId: string): Promise<WorkshopCatalogMod | null> {
  const id = modId.trim().toUpperCase();
  if (!/^[0-9A-F]{16}$/.test(id)) {
    return null;
  }
  const html = await fetchWorkshopHtml(`/workshop/${id}`);
  const raw = extractNextDataJson(html);
  const pp = pageProps<WorkshopDetailPageProps>(raw);
  if (!pp.asset?.id) {
    return null;
  }
  return normalizeDetailAsset(pp.asset);
}

export async function getModByUrlImpl(url: string): Promise<WorkshopCatalogMod | null> {
  const p = parseWorkshopModUrl(url);
  if (!p.ok) {
    throw new Error(p.error);
  }
  return getModByIdImpl(p.modId);
}

export const reforgerWorkshopProvider: WorkshopProvider = {
  searchMods: (query, options) => searchModsImpl(query, options),
  getModById: (id) => getModByIdImpl(id),
  getModByUrl: (url) => getModByUrlImpl(url),
  getDependencies: (id) => getDependenciesImpl(id),
};

export async function getDependenciesImpl(modId: string): Promise<WorkshopDependencyRef[]> {
  const mod = await getModByIdImpl(modId);
  return mod?.dependencies ?? [];
}
