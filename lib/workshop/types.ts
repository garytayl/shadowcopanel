/**
 * Normalized catalog models for the Arma Reforger Workshop (reforger.armaplatform.com).
 * Upstream data is read from embedded Next.js __NEXT_DATA__ on listing/detail pages until an official API exists.
 */

export type WorkshopDependencyRef = {
  modId: string;
  name?: string;
  /** Declared version on the dependency edge when present */
  version?: string;
};

/** Published version row from workshop detail payload */
export type WorkshopVersionInfo = {
  version: string;
  published?: boolean;
  gameVersion?: string;
  createdAt?: string;
  totalFileSize?: number;
  dependenciesCount?: number;
};

export type WorkshopScreenshot = {
  url: string;
  width?: number;
  height?: number;
};

/**
 * Normalized mod: listing rows include metrics; detail adds description, gallery, versions, etc.
 */
export type WorkshopCatalogMod = {
  modId: string;
  name: string;
  author?: string;
  version?: string;
  sourceUrl: string;
  summary?: string;
  dependencies?: WorkshopDependencyRef[];
  /** Recursive count of dependency nodes (excluding the root mod) */
  dependencyCount?: number;
  tags?: string[];
  imageUrl?: string;
  /** 0–1 average; display as percent */
  averageRating?: number;
  ratingCount?: number;
  subscriberCount?: number;
  fileSizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
  type?: string;
  /** Full description (detail only; can be long) */
  description?: string;
  license?: string;
  licenseText?: string | null;
  gameVersion?: string;
  obsolete?: boolean;
  blocked?: boolean;
  /** Extra preview + screenshot URLs for gallery (detail) */
  galleryUrls?: string[];
  screenshots?: WorkshopScreenshot[];
  versions?: WorkshopVersionInfo[];
  /** Display names from contributors array */
  contributors?: string[];
};

export type WorkshopSort =
  | "newest"
  | "oldest"
  | "popular"
  | "rating"
  | "subscribers"
  | "updated"
  | "name"
  | "relevance";

export type WorkshopSearchResult = {
  query: string;
  page: number;
  pageSize: number;
  totalCount: number;
  sort: WorkshopSort;
  tag?: string;
  mods: WorkshopCatalogMod[];
};

export type WorkshopProvider = {
  searchMods(
    query: string,
    options: { page: number; sort: WorkshopSort; tag?: string | null },
  ): Promise<WorkshopSearchResult>;
  getModById(modId: string): Promise<WorkshopCatalogMod | null>;
  getModByUrl(url: string): Promise<WorkshopCatalogMod | null>;
  /** Convenience: dependency list from detail payload (empty if unknown). */
  getDependencies(modId: string): Promise<WorkshopDependencyRef[]>;
};
