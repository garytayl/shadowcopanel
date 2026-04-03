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
  WorkshopScreenshot,
  WorkshopVersionInfo,
} from "@/lib/workshop/types";

/** Raw listing row from workshop __NEXT_DATA__ */
type WorkshopListRow = {
  id: string;
  name: string;
  type?: string;
  summary?: string;
  currentVersionNumber?: string;
  currentVersionSize?: number;
  averageRating?: number;
  ratingCount?: number;
  subscriberCount?: number;
  createdAt?: string;
  updatedAt?: string;
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
  type?: string;
  summary?: string;
  description?: string;
  currentVersionNumber?: string;
  currentVersionSize?: number;
  averageRating?: number;
  ratingCount?: number;
  subscriberCount?: number;
  createdAt?: string;
  updatedAt?: string;
  license?: string;
  licenseText?: string | null;
  gameVersion?: string;
  obsolete?: boolean;
  blocked?: boolean;
  previews?: WorkshopListRow["previews"];
  screenshots?: Array<{ url?: string; width?: number; height?: number }>;
  author?: { username?: string };
  tags?: Array<{ name?: string }>;
  dependencies?: RawDepNode[];
  versions?: Array<{
    version: string;
    published?: boolean;
    gameVersion?: string | number;
    createdAt?: string;
    totalFileSize?: number;
    dependenciesCount?: number;
  }>;
  contributors?: Array<{ username?: string }>;
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

function collectGalleryUrls(a: WorkshopAssetDetail): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string | undefined) => {
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  };
  for (const p of a.previews ?? []) {
    push(p.url);
    for (const t of p.thumbnails?.["image/jpeg"] ?? []) {
      push(t.url);
    }
  }
  for (const s of a.screenshots ?? []) {
    push(s.url);
  }
  return out;
}

function mapVersions(raw: WorkshopAssetDetail["versions"]): WorkshopVersionInfo[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map((v) => ({
    version: v.version,
    published: v.published,
    gameVersion:
      v.gameVersion === undefined || v.gameVersion === null
        ? undefined
        : String(v.gameVersion),
    createdAt: v.createdAt,
    totalFileSize: v.totalFileSize,
    dependenciesCount: v.dependenciesCount,
  }));
}

function mapScreenshots(
  raw: WorkshopAssetDetail["screenshots"],
): WorkshopScreenshot[] | undefined {
  if (!raw?.length) return undefined;
  const out: WorkshopScreenshot[] = [];
  for (const s of raw) {
    if (s.url) out.push({ url: s.url, width: s.width, height: s.height });
  }
  return out.length ? out : undefined;
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
    averageRating: row.averageRating,
    ratingCount: row.ratingCount,
    subscriberCount: row.subscriberCount,
    fileSizeBytes: row.currentVersionSize,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    type: row.type,
  };
}

function normalizeDetailAsset(a: WorkshopAssetDetail): WorkshopCatalogMod {
  const flat = flattenDependencyNodes(a.dependencies);
  const gallery = collectGalleryUrls(a);
  const contributors = a.contributors
    ?.map((c) => c.username)
    .filter((x): x is string => typeof x === "string" && Boolean(x.trim()));

  return {
    modId: a.id,
    name: a.name,
    author: a.author?.username,
    version: a.currentVersionNumber,
    sourceUrl: workshopSourceUrl(a.id),
    summary: a.summary,
    description: a.description,
    dependencies: flat,
    dependencyCount: flat.length,
    tags: a.tags?.map((t) => t.name).filter((x): x is string => Boolean(x)),
    imageUrl: thumbUrl(a),
    galleryUrls: gallery.length > 0 ? gallery : undefined,
    screenshots: mapScreenshots(a.screenshots),
    averageRating: a.averageRating,
    ratingCount: a.ratingCount,
    subscriberCount: a.subscriberCount,
    fileSizeBytes: a.currentVersionSize,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    type: a.type,
    license: a.license,
    licenseText: a.licenseText ?? null,
    gameVersion: a.gameVersion,
    obsolete: a.obsolete,
    blocked: a.blocked,
    versions: mapVersions(a.versions),
    contributors: contributors?.length ? contributors : undefined,
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
