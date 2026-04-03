"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Info,
  Layers,
  Loader2,
  Package,
  Tag,
} from "lucide-react";

import type { WorkshopCatalogMod } from "@/lib/workshop/types";
import {
  formatFileSize,
  formatIsoDate,
  formatSubscriberCount,
  formatWorkshopRating,
} from "@/lib/utils/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Props = {
  modId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open another mod in the same dialog (e.g. dependency drill-down) */
  onModIdChange?: (id: string) => void;
  onAdd: (mod: WorkshopCatalogMod) => void;
  onAddWithDependencies: (mod: WorkshopCatalogMod) => void;
};

export function ModDetailDialog({
  modId,
  open,
  onOpenChange,
  onModIdChange,
  onAdd,
  onAddWithDependencies,
}: Props) {
  const [mod, setMod] = useState<WorkshopCatalogMod | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !modId) {
      setMod(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const r = await fetch(`/api/workshop/mod?id=${encodeURIComponent(modId)}`);
        const j = (await r.json()) as
          | { ok: true; data: WorkshopCatalogMod }
          | { ok: false; error: string };
        if (cancelled) return;
        if (!j.ok) {
          setError(j.error);
          setMod(null);
          return;
        }
        setMod(j.data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setMod(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, modId]);

  const deps = mod?.dependencies ?? [];
  const canAddWithDeps = deps.length > 0;
  const gallery = mod?.galleryUrls?.length
    ? mod.galleryUrls
    : mod?.imageUrl
      ? [mod.imageUrl]
      : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,880px)] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b border-border/80 p-5 pb-3 text-left">
          <DialogTitle className="pr-10 text-left text-lg leading-snug">
            {loading ? "Loading…" : mod?.name ?? "Mod"}
          </DialogTitle>
          <DialogDescription className="text-left">
            {mod ? (
              <span className="font-mono text-xs text-muted-foreground">{mod.modId}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading workshop details…
            </div>
          ) : null}

          {error ? (
            <div className="p-6">
              <Alert variant="destructive" className="rounded-xl">
                <AlertTitle>Could not load mod</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {mod && !loading ? (
            <Tabs key={mod.modId} defaultValue="about" className="flex h-full min-h-[320px] flex-col gap-0">
              <div className="shrink-0 border-b border-border/60 px-4 pt-1">
                <TabsList className="mb-0 h-auto w-full flex-wrap justify-start gap-1 rounded-lg bg-transparent p-0">
                  <TabsTrigger value="about" className="gap-1 text-xs sm:text-sm">
                    <Info className="size-3.5" />
                    About
                  </TabsTrigger>
                  <TabsTrigger value="stats" className="gap-1 text-xs sm:text-sm">
                    <Package className="size-3.5" />
                    Stats
                  </TabsTrigger>
                  <TabsTrigger value="media" className="gap-1 text-xs sm:text-sm">
                    <ImageIcon className="size-3.5" />
                    Media
                  </TabsTrigger>
                  <TabsTrigger value="versions" className="gap-1 text-xs sm:text-sm">
                    <Layers className="size-3.5" />
                    Versions
                  </TabsTrigger>
                  <TabsTrigger value="deps" className="gap-1 text-xs sm:text-sm">
                    <Tag className="size-3.5" />
                    Deps
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="min-h-0 flex-1">
                <TabsContent value="about" className="m-0">
                  <ScrollArea className="max-h-[min(58vh,520px)] p-5 pt-4">
                  {gallery[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={gallery[0]}
                      alt=""
                      className="mb-4 aspect-video w-full rounded-xl border border-border/60 object-cover"
                    />
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {mod.author ? (
                      <Badge variant="secondary" className="font-normal">
                        {mod.author}
                      </Badge>
                    ) : null}
                    {mod.version ? (
                      <Badge variant="outline" className="font-mono text-xs font-normal">
                        v{mod.version}
                      </Badge>
                    ) : null}
                    {mod.type ? (
                      <Badge variant="outline" className="font-normal">
                        {mod.type}
                      </Badge>
                    ) : null}
                  </div>
                  {mod.summary ? (
                    <p className="mt-3 text-sm font-medium leading-relaxed text-foreground">{mod.summary}</p>
                  ) : null}
                  {mod.description ? (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Full description
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {mod.description}
                      </p>
                    </div>
                  ) : !mod.summary ? (
                    <p className="mt-3 text-sm text-muted-foreground">No extended description on file.</p>
                  ) : null}
                  {(mod.license || mod.licenseText) ? (
                    <div className="mt-6 rounded-xl border border-border/60 bg-muted/30 p-4">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        License
                      </p>
                      {mod.license ? (
                        <p className="text-sm font-medium">{mod.license}</p>
                      ) : null}
                      {mod.licenseText ? (
                        <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                          {mod.licenseText}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="stats" className="m-0">
                  <ScrollArea className="max-h-[min(58vh,520px)] space-y-4 p-5 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Stat label="Average rating" value={formatWorkshopRating(mod.averageRating)} hint="from workshop" />
                    <Stat label="Ratings count" value={mod.ratingCount != null ? String(mod.ratingCount) : "—"} />
                    <Stat label="Subscribers" value={formatSubscriberCount(mod.subscriberCount)} />
                    <Stat label="Current build size" value={formatFileSize(mod.fileSizeBytes)} />
                    <Stat label="Game version" value={mod.gameVersion ?? "—"} />
                    <Stat label="Created" value={formatIsoDate(mod.createdAt)} />
                    <Stat label="Updated" value={formatIsoDate(mod.updatedAt)} />
                  </div>
                  {mod.obsolete ? (
                    <Alert className="rounded-xl border-amber-500/40">
                      <AlertTitle className="text-sm">Marked obsolete upstream</AlertTitle>
                      <AlertDescription className="text-xs">
                        Check the workshop page for replacement or compatibility notes.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {mod.blocked ? (
                    <Alert variant="destructive" className="rounded-xl">
                      <AlertTitle className="text-sm">Blocked</AlertTitle>
                      <AlertDescription className="text-xs">
                        This asset is flagged blocked in the workshop catalog.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {mod.tags && mod.tags.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Tags
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {mod.tags.map((t) => (
                          <Badge key={t} variant="secondary" className="font-normal">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {mod.contributors && mod.contributors.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Contributors
                      </p>
                      <p className="text-sm text-muted-foreground">{mod.contributors.join(", ")}</p>
                    </div>
                  ) : null}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="media" className="m-0">
                  <ScrollArea className="max-h-[min(58vh,520px)] p-5 pt-4">
                  {gallery.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {gallery.map((url, i) => (
                        <a
                          key={`${url}-${i}`}
                          href={url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="group relative overflow-hidden rounded-lg border border-border/60"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt=""
                            className="aspect-video w-full object-cover transition-transform group-hover:scale-[1.02]"
                          />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No gallery images in the catalog payload.</p>
                  )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="versions" className="m-0">
                  <ScrollArea className="max-h-[min(58vh,520px)] p-5 pt-4">
                  {mod.versions && mod.versions.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Version</TableHead>
                          <TableHead className="hidden sm:table-cell">Game</TableHead>
                          <TableHead className="hidden md:table-cell">Size</TableHead>
                          <TableHead className="hidden lg:table-cell">Deps</TableHead>
                          <TableHead className="text-right">Published</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mod.versions.map((v) => (
                          <TableRow key={v.version}>
                            <TableCell className="font-mono text-xs">{v.version}</TableCell>
                            <TableCell className="hidden font-mono text-xs sm:table-cell">
                              {v.gameVersion ?? "—"}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {formatFileSize(v.totalFileSize)}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">
                              {v.dependenciesCount ?? "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {v.published ? "Yes" : "No"}
                              {v.createdAt ? (
                                <span className="mt-0.5 block text-[10px]">
                                  {formatIsoDate(v.createdAt)}
                                </span>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground">No version history in payload.</p>
                  )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="deps" className="m-0">
                  <ScrollArea className="max-h-[min(58vh,520px)] space-y-4 p-5 pt-4">
                  {deps.length > 0 ? (
                    <ul className="space-y-2">
                      {deps.map((d) => (
                        <li
                          key={d.modId}
                          className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="font-medium leading-tight">{d.name ?? d.modId}</p>
                            <p className="font-mono text-[11px] text-muted-foreground">{d.modId}</p>
                            {d.version ? (
                              <p className="text-xs text-muted-foreground">v{d.version}</p>
                            ) : null}
                          </div>
                          {onModIdChange ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="shrink-0 gap-1"
                              onClick={() => onModIdChange(d.modId)}
                            >
                              Open
                              <ChevronRight className="size-3.5" />
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Alert className="rounded-xl border-amber-500/35 bg-amber-500/[0.06]">
                      <AlertTitle className="text-sm">No dependency metadata</AlertTitle>
                      <AlertDescription className="text-xs">
                        The workshop may still list requirements in the description only—read the About tab and
                        confirm load order on your server.
                      </AlertDescription>
                    </Alert>
                  )}
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          ) : null}
        </div>

        <Separator />

        <div className="shrink-0 space-y-3 p-4">
          {mod && !loading ? (
            <a
              href={mod.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
            >
              <ExternalLink className="mr-2 size-3.5" />
              Open full page on Reforger Workshop
            </a>
          ) : null}
          <DialogFooter className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              disabled={!mod || loading}
              onClick={() => mod && onAdd(mod)}
            >
              Add to server stack
            </Button>
            <Button
              disabled={!mod || loading || !canAddWithDeps}
              title={
                !canAddWithDeps
                  ? "No dependencies listed for this mod upstream"
                  : "Adds dependencies first, then this mod"
              }
              onClick={() => mod && onAddWithDependencies(mod)}
            >
              Add with dependencies
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
