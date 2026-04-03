"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ClipboardCopy,
  Download,
  History,
  Link2,
  Loader2,
  RotateCcw,
  Save,
  Search,
  Star,
} from "lucide-react";
import { toast } from "sonner";

import {
  loadModsAction,
  saveModsAction,
  type ModRowPayload,
} from "@/lib/actions/mods";
import { downloadTextFile } from "@/lib/utils/download";
import type { WorkshopCatalogMod, WorkshopSearchResult, WorkshopSort } from "@/lib/workshop/types";
import { formatSubscriberCount, formatWorkshopRating } from "@/lib/utils/format";
import {
  isStarred,
  pushRecent,
  readRecent,
  readStarred,
  toggleStarred,
} from "@/lib/marketplace/storage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarketplaceCatalogSkeleton } from "@/components/marketplace/marketplace-catalog-skeleton";
import { ModDetailDialog } from "@/components/marketplace/mod-detail-dialog";
import { MarketplaceStack } from "@/components/marketplace/marketplace-stack";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

function uid() {
  return `row_${Math.random().toString(36).slice(2, 11)}`;
}

function rowsToPayload(rows: (ModRowPayload & { key: string })[]): ModRowPayload[] {
  return rows.map(({ modId, name, version, enabled }) => ({
    modId,
    name,
    version,
    enabled,
  }));
}

function signature(payload: ModRowPayload[]): string {
  return JSON.stringify(
    payload.map((m) => ({
      modId: m.modId,
      name: m.name,
      version: m.version,
      enabled: m.enabled,
    })),
  );
}

const SORT_GROUPS: {
  label: string;
  options: { value: WorkshopSort; label: string }[];
}[] = [
  {
    label: "Engagement",
    options: [
      { value: "popular", label: "Most popular (workshop default)" },
      { value: "subscribers", label: "Most subscribed" },
      { value: "rating", label: "Highest rated %" },
    ],
  },
  {
    label: "Date",
    options: [
      { value: "newest", label: "Newest published" },
      { value: "updated", label: "Recently updated" },
      { value: "oldest", label: "Oldest" },
    ],
  },
  {
    label: "Other",
    options: [
      { value: "name", label: "Name A–Z" },
      { value: "relevance", label: "Relevance (with search text)" },
    ],
  },
];

function sortOptionLabel(value: WorkshopSort): string {
  for (const g of SORT_GROUPS) {
    const o = g.options.find((x) => x.value === value);
    if (o) return o.label;
  }
  return value;
}

export function MarketplaceClient() {
  const [draftQuery, setDraftQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState<WorkshopSort>("popular");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<WorkshopSearchResult | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [stack, setStack] = useState<(ModRowPayload & { key: string })[]>([]);
  const [remoteSig, setRemoteSig] = useState<string>("");
  const [stackLoading, setStackLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  /** Bumps when localStorage-backed lists (starred / recent) change */
  const [libraryTick, setLibraryTick] = useState(0);
  const [starredOnly, setStarredOnly] = useState(false);
  const [pageJump, setPageJump] = useState("");

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const catalogTopRef = useRef<HTMLDivElement | null>(null);

  const handleModLoaded = useCallback((mod: WorkshopCatalogMod) => {
    pushRecent({ modId: mod.modId, name: mod.name });
    setLibraryTick((t) => t + 1);
  }, []);

  const stackSig = useMemo(() => signature(rowsToPayload(stack)), [stack]);
  const dirty = stackSig !== remoteSig && !stackLoading;

  const loadStack = useCallback(async () => {
    setStackLoading(true);
    const r = await loadModsAction();
    setStackLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const rows = r.data.mods.map((m) => ({ ...m, key: uid() }));
    setStack(rows);
    setRemoteSig(signature(r.data.mods));
  }, []);

  useEffect(() => {
    void loadStack();
  }, [loadStack]);

  useEffect(() => {
    catalogTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runCatalogSearch = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const sp = new URLSearchParams({
        q: committedQuery.trim(),
        page: String(page),
        sort,
      });
      if (tagFilter.trim()) sp.set("tag", tagFilter.trim());
      const res = await fetch(`/api/workshop/search?${sp.toString()}`);
      const j = (await res.json()) as
        | { ok: true; data: WorkshopSearchResult }
        | { ok: false; error: string };
      if (!j.ok) {
        setCatalogError(j.error);
        setCatalog(null);
        return;
      }
      setCatalog(j.data);
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : String(e));
      setCatalog(null);
    } finally {
      setCatalogLoading(false);
    }
  }, [committedQuery, page, sort, tagFilter]);

  useEffect(() => {
    void runCatalogSearch();
  }, [runCatalogSearch]);

  function applySearch() {
    setCommittedQuery(draftQuery.trim());
    setPage(1);
  }

  function addMod(m: WorkshopCatalogMod) {
    if (stack.some((s) => s.modId === m.modId)) {
      toast.error("That mod is already in the server stack");
      return;
    }
    setStack((prev) => [
      ...prev,
      {
        key: uid(),
        modId: m.modId,
        name: m.name,
        version: m.version ?? "",
        enabled: true,
      },
    ]);
    toast.success("Added to stack");
  }

  function addWithDependencies(detail: WorkshopCatalogMod) {
    const deps = detail.dependencies ?? [];
    const toAppend: ModRowPayload[] = [];
    const seen = new Set(stack.map((s) => s.modId));
    for (const d of deps) {
      if (seen.has(d.modId)) continue;
      toAppend.push({
        modId: d.modId,
        name: d.name ?? "",
        version: d.version ?? "",
        enabled: true,
      });
      seen.add(d.modId);
    }
    if (!seen.has(detail.modId)) {
      toAppend.push({
        modId: detail.modId,
        name: detail.name,
        version: detail.version ?? "",
        enabled: true,
      });
    }
    if (toAppend.length === 0) {
      toast.message("Nothing new to add", {
        description: "Dependencies and mod were already in the stack.",
      });
      return;
    }
    setStack((prev) => [...prev, ...toAppend.map((m) => ({ ...m, key: uid() }))]);
    toast.success(`Added ${toAppend.length} mod(s) to stack`);
  }

  async function saveStack() {
    setSaving(true);
    const r = await saveModsAction(rowsToPayload(stack));
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(`Saved (${r.data.bytes} bytes written to config.json)`);
    await loadStack();
  }

  function restoreRemote() {
    void loadStack();
    toast.message("Reloaded mod list from server");
  }

  function discardLocal() {
    void loadStack();
  }

  async function pasteImport() {
    const url = importUrl.trim();
    if (!url) {
      toast.error("Paste a workshop URL first");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/workshop/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const j = (await res.json()) as
        | { ok: true; data: WorkshopCatalogMod }
        | { ok: false; error: string };
      if (!j.ok) {
        toast.error(j.error);
        return;
      }
      addMod(j.data);
      setImportUrl("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  const totalPages = catalog
    ? Math.max(1, Math.ceil(catalog.totalCount / Math.max(1, catalog.pageSize)))
    : 1;

  const stackSet = useMemo(() => new Set(stack.map((s) => s.modId)), [stack]);

  let displayMods: WorkshopCatalogMod[] = [];
  if (catalog) {
    if (!starredOnly) {
      displayMods = catalog.mods;
    } else {
      const ids = new Set(readStarred().map((s) => s.modId));
      displayMods = catalog.mods.filter((m) => ids.has(m.modId));
    }
  }

  const quickTags = useMemo(() => {
    if (!catalog) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of catalog.mods) {
      for (const t of m.tags ?? []) {
        if (!t || seen.has(t)) continue;
        seen.add(t);
        out.push(t);
        if (out.length >= 14) return out;
      }
    }
    return out;
  }, [catalog]);

  const inStackOnPage = useMemo(() => {
    if (!catalog) return 0;
    return catalog.mods.filter((m) => stackSet.has(m.modId)).length;
  }, [catalog, stackSet]);

  const recentEntries = readRecent();
  const starredEntries = readStarred();

  const jsonExport = useMemo(() => {
    return JSON.stringify({ mods: rowsToPayload(stack) }, null, 2);
  }, [stack]);

  return (
    <div className="space-y-8" data-library-rev={libraryTick}>
      {dirty ? (
        <Alert className="rounded-2xl border-amber-500/40 bg-amber-500/[0.07]">
          <AlertTriangle className="size-4 text-amber-500" />
          <AlertTitle>Unsaved changes</AlertTitle>
          <AlertDescription>
            Your stack differs from the last load from the server. Save to write{" "}
            <code className="text-xs">mods</code> to remote <code className="text-xs">config.json</code>, or
            restore.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_min(100%,380px)] xl:grid-cols-[1fr_400px]">
        <motion.div
          ref={catalogTopRef}
          className="min-w-0 space-y-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="rounded-2xl border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Workshop catalog</CardTitle>
              <CardDescription>
                Search the public Reforger Workshop (same catalog as reforger.armaplatform.com).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="mq">
                    Search
                  </label>
                  <Input
                    ref={searchInputRef}
                    id="mq"
                    placeholder="Mod name or keyword… (press / to focus)"
                    value={draftQuery}
                    onChange={(e) => setDraftQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applySearch();
                    }}
                    className="rounded-xl"
                  />
                </div>
                <div className="w-full space-y-2 sm:min-w-[220px] sm:max-w-xs">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="sort">
                    Sort results
                  </label>
                  <select
                    id="sort"
                    className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as WorkshopSort);
                      setPage(1);
                    }}
                  >
                    {SORT_GROUPS.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="tag">
                  Tag filter (optional)
                </label>
                <Input
                  id="tag"
                  placeholder="e.g. VEHICLE"
                  value={tagFilter}
                  onChange={(e) => {
                    setTagFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl"
                />
              </div>
              {quickTags.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Tags on this page</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickTags.map((t) => (
                      <Button
                        key={t}
                        type="button"
                        variant={tagFilter.trim().toLowerCase() === t.toLowerCase() ? "secondary" : "outline"}
                        size="sm"
                        className="h-7 rounded-full px-2.5 text-[11px] font-normal"
                        onClick={() => {
                          setTagFilter(t);
                          setPage(1);
                        }}
                      >
                        {t}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/15 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="starred-only"
                    checked={starredOnly}
                    onCheckedChange={(v) => setStarredOnly(!!v)}
                    size="sm"
                  />
                  <Label htmlFor="starred-only" className="cursor-pointer text-sm font-normal">
                    Starred only (this page)
                  </Label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {starredEntries.length} starred in browser · recents saved locally
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => applySearch()} disabled={catalogLoading}>
                  {catalogLoading ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 size-4" />
                  )}
                  Search
                </Button>
                <p className="max-w-md self-center text-xs leading-snug text-muted-foreground">
                  {catalog ? (
                    <>
                      <span className="font-medium text-foreground">{catalog.totalCount.toLocaleString()}</span>{" "}
                      mods · page {catalog.page} of {totalPages}
                      {catalogLoading ? (
                        <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-primary">
                          <Loader2 className="size-3 animate-spin" />
                          Refreshing…
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-[11px]">
                        Sorted by {sortOptionLabel(catalog.sort)}
                        {committedQuery.trim() ? ` · matching “${committedQuery.trim()}”` : ""}
                        {tagFilter.trim() ? ` · tag ${tagFilter.trim()}` : ""}
                        {inStackOnPage > 0 ? (
                          <>
                            {" "}
                            · <span className="text-foreground">{inStackOnPage}</span> on this page already in stack
                          </>
                        ) : null}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                <p className="w-full text-xs font-medium text-muted-foreground">Import by URL</p>
                <Input
                  placeholder="https://reforger.armaplatform.com/workshop/…"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="min-w-[200px] flex-1 rounded-xl"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={importing}
                  onClick={() => void pasteImport()}
                >
                  {importing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Add from URL
                </Button>
              </div>
            </CardContent>
          </Card>

          {catalogError ? (
            <Alert variant="destructive" className="rounded-2xl">
              <AlertTitle>Catalog unavailable</AlertTitle>
              <AlertDescription>{catalogError}</AlertDescription>
            </Alert>
          ) : null}

          {catalogLoading ? <MarketplaceCatalogSkeleton /> : null}

          {!catalogLoading && catalog && catalog.mods.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No mods match this search.</p>
          ) : null}

          {!catalogLoading &&
          catalog &&
          catalog.mods.length > 0 &&
          displayMods.length === 0 &&
          starredOnly ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No starred mods on this page. Turn off “Starred only”, run a search, or star items from cards or
              detail.
            </p>
          ) : null}

          {!catalogLoading && catalog && displayMods.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {displayMods.map((m) => (
                <motion.div
                  key={m.modId}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group flex flex-col rounded-2xl border border-border/70 bg-card/50 p-4 transition-colors hover:border-border hover:bg-card"
                >
                  <div className="mb-3 flex gap-3">
                    {m.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.imageUrl}
                        alt=""
                        className="size-16 shrink-0 rounded-lg border border-border/60 object-cover"
                      />
                    ) : (
                      <div className="size-16 shrink-0 rounded-lg bg-muted/50" />
                    )}
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="text-left font-medium leading-snug hover:text-primary hover:underline"
                        onClick={() => {
                          setDetailId(m.modId);
                          setDetailOpen(true);
                        }}
                      >
                        {m.name}
                      </button>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{m.modId}</p>
                      {m.author ? (
                        <p className="mt-1 text-xs text-muted-foreground">by {m.author}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {stackSet.has(m.modId) ? (
                          <Badge className="text-[10px] font-normal">In stack</Badge>
                        ) : null}
                        {isStarred(m.modId) ? (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            Starred
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="Copy workshop link"
                        onClick={() => {
                          void navigator.clipboard.writeText(m.sourceUrl);
                          toast.success("Copied workshop link");
                        }}
                      >
                        <Link2 className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title={isStarred(m.modId) ? "Remove star" : "Star mod"}
                        onClick={() => {
                          const now = toggleStarred({
                            modId: m.modId,
                            name: m.name,
                            sourceUrl: m.sourceUrl,
                          });
                          toast.message(now ? "Starred in this browser" : "Removed from starred");
                          setLibraryTick((t) => t + 1);
                        }}
                      >
                        <Star
                          className={cn(
                            "size-3.5",
                            isStarred(m.modId) && "fill-amber-400 text-amber-400",
                          )}
                        />
                      </Button>
                    </div>
                  </div>
                  {m.summary ? (
                    <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{m.summary}</p>
                  ) : null}
                  <div className="mb-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                    {m.averageRating != null ? (
                      <Badge variant="secondary" className="font-normal tabular-nums">
                        {formatWorkshopRating(m.averageRating)} rated
                      </Badge>
                    ) : null}
                    {m.subscriberCount != null ? (
                      <Badge variant="secondary" className="font-normal tabular-nums">
                        {formatSubscriberCount(m.subscriberCount)} subs
                      </Badge>
                    ) : null}
                    {m.ratingCount != null ? (
                      <span className="self-center tabular-nums">{m.ratingCount.toLocaleString()} votes</span>
                    ) : null}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    {m.version ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        v{m.version}
                      </Badge>
                    ) : null}
                    <Button size="sm" className="ml-auto" onClick={() => addMod(m)}>
                      Add
                    </Button>
                  </div>
                  <a
                    href={m.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 truncate text-[10px] text-primary underline-offset-2 hover:underline"
                  >
                    {m.sourceUrl}
                  </a>
                </motion.div>
              ))}
            </div>
          ) : null}

          {catalog && catalog.totalCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || catalogLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Page {page} / {totalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="page-jump" className="sr-only">
                    Jump to page
                  </Label>
                  <Input
                    id="page-jump"
                    inputMode="numeric"
                    placeholder="#"
                    value={pageJump}
                    onChange={(e) => setPageJump(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const n = Number.parseInt(pageJump, 10);
                      if (!Number.isFinite(n)) return;
                      const next = Math.min(totalPages, Math.max(1, n));
                      setPage(next);
                      setPageJump("");
                    }}
                    className="h-8 w-12 rounded-lg px-1 text-center text-xs"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || catalogLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </motion.div>

        <motion.aside
          className="space-y-4 lg:sticky lg:top-4 lg:self-start"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="rounded-2xl border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Library</CardTitle>
              <CardDescription>Stored in this browser only (not synced to the server).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <History className="size-3.5" />
                  Recent
                </p>
                {recentEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Open a mod detail to populate recents.</p>
                ) : (
                  <ul className="max-h-36 space-y-1 overflow-y-auto pr-1 text-sm">
                    {recentEntries.map((r) => (
                      <li key={r.modId}>
                        <button
                          type="button"
                          className="w-full truncate rounded-md px-2 py-1 text-left text-xs hover:bg-muted/80"
                          onClick={() => {
                            setDetailId(r.modId);
                            setDetailOpen(true);
                          }}
                        >
                          {r.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Star className="size-3.5" />
                  Starred
                </p>
                {starredEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Use the star icon on cards or in detail.</p>
                ) : (
                  <ul className="max-h-36 space-y-1 overflow-y-auto pr-1 text-sm">
                    {starredEntries.map((s) => (
                      <li key={s.modId}>
                        <button
                          type="button"
                          className="w-full truncate rounded-md px-2 py-1 text-left text-xs hover:bg-muted/80"
                          onClick={() => {
                            setDetailId(s.modId);
                            setDetailOpen(true);
                          }}
                        >
                          {s.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Server mod stack</CardTitle>
              <CardDescription>
                Order matters. This mirrors the <Link className="text-primary underline" href="/mods">Mods</Link>{" "}
                page but tuned for discovery.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stackLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading from server…
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void saveStack()} disabled={saving || !dirty}>
                      {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                      Save to server
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => restoreRemote()}
                      disabled={stackLoading}
                    >
                      <RotateCcw className="mr-2 size-4" />
                      Restore from server
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => discardLocal()}
                      disabled={!dirty}
                    >
                      Discard changes
                    </Button>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Compare:</span>{" "}
                    {stack.length} mod(s) in editor
                    {remoteSig ? (
                      <>
                        {" "}
                        · remote snapshot {remoteSig === stackSig ? "matches" : "differs"}
                      </>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(jsonExport);
                        toast.success("Copied mods JSON");
                      }}
                    >
                      <ClipboardCopy className="mr-2 size-4" />
                      Copy JSON
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadTextFile(
                          `reforger-marketplace-mods-${new Date().toISOString().slice(0, 10)}.json`,
                          jsonExport,
                        )
                      }
                    >
                      <Download className="mr-2 size-4" />
                      Export file
                    </Button>
                  </div>
                  <MarketplaceStack rows={stack} onChange={setStack} />
                </>
              )}
            </CardContent>
          </Card>
        </motion.aside>
      </div>

      <ModDetailDialog
        modId={detailId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onModIdChange={(id) => setDetailId(id)}
        onModLoaded={handleModLoaded}
        onAdd={(mod) => {
          addMod(mod);
          setDetailOpen(false);
        }}
        onAddWithDependencies={(mod) => {
          addWithDependencies(mod);
          setDetailOpen(false);
        }}
      />
    </div>
  );
}
