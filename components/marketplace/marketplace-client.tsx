"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ClipboardCopy,
  Download,
  ExternalLink,
  Filter,
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
import { Hint } from "@/components/dashboard/hint";
import { ConfigAnomalyBanner } from "@/components/panel/config-anomaly-banner";
import { TitleWithHint } from "@/components/panel/label-with-hint";
import { downloadTextFile } from "@/lib/utils/download";
import type { ConfigNormalizationIssue } from "@/lib/reforger/types";
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
  const [stackAnomalies, setStackAnomalies] = useState<ConfigNormalizationIssue[]>([]);
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
    setStackAnomalies(r.data.anomalies);
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
    const b = r.data.backupPath;
    const warn = r.data.normalizationIssues?.filter((i) => i.severity === "warn") ?? [];
    toast.success(
      `Saved (${r.data.bytes} bytes → game.mods)${b ? ` · backup ${b}` : r.data.backupNote ? ` · ${r.data.backupNote}` : ""}`,
    );
    if (warn.length) {
      toast.message("Normalization", { description: warn.slice(0, 3).map((i) => i.message).join(" · ") });
    }
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
    const mods = rowsToPayload(stack)
      .filter((m) => m.enabled !== false)
      .map(({ modId, name, version }) => ({ modId, name, version }));
    return JSON.stringify({ game: { mods } }, null, 2);
  }, [stack]);

  return (
    <div className="space-y-6" data-library-rev={libraryTick}>
      <ConfigAnomalyBanner issues={stackAnomalies} />
      {dirty ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/[0.07] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            <div>
              <p className="text-sm font-medium text-foreground">Unsaved stack</p>
              <p className="text-xs text-muted-foreground">
                Save writes <code className="text-[10px]">game.mods</code> in remote{" "}
                <code className="text-[10px]">config.json</code>, or restore below.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-10 shrink-0 touch-manipulation sm:h-9"
            onClick={() => void saveStack()}
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
            Save to server
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_min(100%,420px)] xl:gap-8 xl:items-start">
        <motion.div
          ref={catalogTopRef}
          className="order-2 min-w-0 space-y-4 xl:order-1"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-card/90 to-card/40 p-4 shadow-sm ring-1 ring-white/[0.04] md:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-semibold tracking-tight">Search catalog</h2>
                  <Hint label="We search the official Workshop through this website’s backend (not straight from your browser). If search acts weird, Bohemia’s site or rate limits are usually why." />
                </div>
                <p className="text-[11px] text-muted-foreground">Press <kbd className="rounded border border-border/80 bg-muted/50 px-1 font-mono text-[10px]">/</kbd> to focus</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-stretch">
                <Input
                  ref={searchInputRef}
                  id="mq"
                  placeholder="Keywords…"
                  value={draftQuery}
                  onChange={(e) => setDraftQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applySearch();
                  }}
                  className="h-11 min-h-11 flex-1 rounded-xl"
                />
                <Button
                  type="button"
                  className="h-11 min-h-11 shrink-0 touch-manipulation sm:px-6"
                  onClick={() => applySearch()}
                  disabled={catalogLoading}
                >
                  {catalogLoading ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 size-4" />
                  )}
                  Search
                </Button>
              </div>
              <div className="flex w-full flex-col gap-1.5 lg:w-[min(100%,260px)] lg:shrink-0">
                <Label htmlFor="sort" className="sr-only">
                  Sort
                </Label>
                <select
                  id="sort"
                  className="h-11 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
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

            <details className="group mt-4 border-t border-border/50 pt-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                <Filter className="size-3.5 shrink-0" aria-hidden />
                <span>Tag filter, quick tags, starred filter, import URL</span>
                <span className="text-[10px] font-normal text-muted-foreground/80">— optional</span>
              </summary>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tag" className="text-xs text-muted-foreground">
                    Tag
                  </Label>
                  <Input
                    id="tag"
                    placeholder="e.g. VEHICLE"
                    value={tagFilter}
                    onChange={(e) => {
                      setTagFilter(e.target.value);
                      setPage(1);
                    }}
                    className="h-10 rounded-xl"
                  />
                </div>
                {quickTags.length > 0 ? (
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Tags on this page
                    </p>
                    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                      {quickTags.map((t) => (
                        <Button
                          key={t}
                          type="button"
                          variant={
                            tagFilter.trim().toLowerCase() === t.toLowerCase() ? "secondary" : "outline"
                          }
                          size="sm"
                          className="h-8 shrink-0 rounded-full px-3 text-[11px] font-normal"
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
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/25 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="starred-only"
                      checked={starredOnly}
                      onCheckedChange={(v) => setStarredOnly(!!v)}
                      size="sm"
                    />
                    <Label htmlFor="starred-only" className="cursor-pointer text-xs font-normal">
                      Starred only · this page
                    </Label>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {starredEntries.length} starred · local only
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    placeholder="Paste workshop URL…"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void pasteImport();
                    }}
                    className="min-h-11 flex-1 rounded-xl"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 shrink-0 touch-manipulation"
                    disabled={importing}
                    onClick={() => void pasteImport()}
                  >
                    {importing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Add from URL
                  </Button>
                </div>
              </div>
            </details>

            {catalog ? (
              <p className="mt-4 border-t border-border/50 pt-3 text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">{catalog.totalCount.toLocaleString()}</span> mods
                total · page {catalog.page} of {totalPages}
                {catalogLoading ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-primary">
                    <Loader2 className="size-3 animate-spin" />
                    Loading…
                  </span>
                ) : null}
                <span className="mt-1 block text-[10px] opacity-90">
                  {sortOptionLabel(catalog.sort)}
                  {committedQuery.trim() ? ` · “${committedQuery.trim()}”` : ""}
                  {tagFilter.trim() ? ` · tag ${tagFilter.trim()}` : ""}
                  {inStackOnPage > 0 ? (
                    <>
                      {" "}
                      · <span className="text-foreground">{inStackOnPage}</span> on page in stack
                    </>
                  ) : null}
                </span>
              </p>
            ) : null}
          </section>

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
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold tracking-tight">Results</h3>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {displayMods.length} on this page
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
              {displayMods.map((m) => (
                <motion.div
                  key={m.modId}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="group flex flex-col rounded-2xl border border-border/70 bg-card/50 p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-primary/25 hover:bg-card hover:shadow-lg hover:shadow-primary/10 motion-reduce:hover:translate-y-0"
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
                    className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate text-[10px] text-muted-foreground transition-colors hover:text-primary"
                  >
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                    <span className="truncate underline-offset-2 hover:underline">Open on workshop</span>
                  </a>
                </motion.div>
              ))}
              </div>
            </div>
          ) : null}

          {catalog && catalog.totalCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/15 px-3 py-2">
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
          className="order-1 space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:self-start lg:pr-1 xl:order-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="rounded-2xl border-primary/15 bg-card/80 shadow-sm ring-1 ring-primary/10">
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="text-base">
                <TitleWithHint hint="This is your mod load order—the same list as the Mods page. When you save, it goes into your server config. Drag rows to reorder; Restore pulls what’s on the server right now.">
                  Server stack
                </TitleWithHint>
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Load order for <code className="text-[10px]">config.json</code> · same list as{" "}
                <Link className="font-medium text-primary underline underline-offset-2" href="/mods">
                  Mods
                </Link>
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
                  <Button
                    type="button"
                    className="h-11 w-full touch-manipulation"
                    onClick={() => void saveStack()}
                    disabled={saving || !dirty}
                  >
                    {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                    Save to server
                  </Button>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10 flex-1 touch-manipulation"
                      onClick={() => restoreRemote()}
                      disabled={stackLoading}
                    >
                      <RotateCcw className="mr-2 size-4" />
                      Restore
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-10 flex-1 touch-manipulation"
                      onClick={() => discardLocal()}
                      disabled={!dirty}
                    >
                      Discard
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{stack.length}</span> mod(s) ·{" "}
                    {remoteSig ? (
                      remoteSig === stackSig ? (
                        <span className="text-emerald-600 dark:text-emerald-400">matches server</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">differs from server</span>
                      )
                    ) : (
                      "—"
                    )}
                  </p>
                  <div className="flex gap-2 border-t border-border/60 pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10 flex-1"
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
                      className="min-h-10 flex-1"
                      onClick={() =>
                        downloadTextFile(
                          `reforger-marketplace-mods-${new Date().toISOString().slice(0, 10)}.json`,
                          jsonExport,
                        )
                      }
                    >
                      <Download className="mr-2 size-4" />
                      Export
                    </Button>
                  </div>
                  <MarketplaceStack rows={stack} onChange={setStack} />
                </>
              )}
            </CardContent>
          </Card>

          <details className="group rounded-2xl border border-border/70 bg-card/40 open:bg-card/60">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium outline-none [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <History className="size-4 text-muted-foreground" aria-hidden />
                  Browser library
                </span>
                <span className="text-[11px] font-normal text-muted-foreground group-open:hidden">Recent & starred</span>
              </span>
            </summary>
            <div className="space-y-4 border-t border-border/60 px-4 pb-4 pt-2">
              <p className="text-[11px] text-muted-foreground">Local only — not synced to the server.</p>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Recent</p>
                {recentEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Open a mod detail to populate.</p>
                ) : (
                  <ul className="max-h-32 space-y-0.5 overflow-y-auto text-sm">
                    {recentEntries.map((r) => (
                      <li key={r.modId}>
                        <button
                          type="button"
                          className="w-full truncate rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/80"
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
                <p className="mb-2 text-xs font-medium text-muted-foreground">Starred</p>
                {starredEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Star items from cards or detail.</p>
                ) : (
                  <ul className="max-h-32 space-y-0.5 overflow-y-auto text-sm">
                    {starredEntries.map((s) => (
                      <li key={s.modId}>
                        <button
                          type="button"
                          className="w-full truncate rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/80"
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
            </div>
          </details>
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
