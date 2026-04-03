"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import type { WorkshopCatalogMod } from "@/lib/workshop/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  modId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (mod: WorkshopCatalogMod) => void;
  onAddWithDependencies: (mod: WorkshopCatalogMod) => void;
};

export function ModDetailDialog({
  modId,
  open,
  onOpenChange,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/80 p-6 pb-4">
          <DialogTitle className="pr-8 text-left leading-snug">
            {loading ? "Loading…" : mod?.name ?? "Mod"}
          </DialogTitle>
          <DialogDescription className="text-left">
            {mod ? (
              <span className="font-mono text-xs text-muted-foreground">{mod.modId}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Fetching workshop details…
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive" className="rounded-xl">
              <AlertTitle>Could not load mod</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {mod && !loading ? (
            <>
              {mod.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mod.imageUrl}
                  alt=""
                  className="aspect-video w-full rounded-xl border border-border/60 object-cover"
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
                {typeof mod.dependencyCount === "number" ? (
                  <Badge variant="outline" className="font-normal">
                    {mod.dependencyCount} dependenc{mod.dependencyCount === 1 ? "y" : "ies"}
                  </Badge>
                ) : null}
              </div>

              {mod.summary ? (
                <p className="text-sm leading-relaxed text-muted-foreground">{mod.summary}</p>
              ) : null}

              {deps.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Dependencies
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {deps.map((d) => (
                      <li
                        key={d.modId}
                        className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"
                      >
                        <span className="font-medium">{d.name ?? d.modId}</span>
                        <span className="font-mono text-xs text-muted-foreground">{d.modId}</span>
                        {d.version ? (
                          <span className="w-full text-xs text-muted-foreground">v{d.version}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <Alert className="rounded-xl border-amber-500/35 bg-amber-500/[0.06]">
                  <AlertTitle className="text-sm">No dependency metadata</AlertTitle>
                  <AlertDescription className="text-xs">
                    This mod may still require other mods in-game. Check the workshop description and load
                    order on the server stack.
                  </AlertDescription>
                </Alert>
              )}

              <a
                href={mod.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
              >
                <ExternalLink className="mr-2 size-3.5" />
                Open on Reforger Workshop
              </a>
            </>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border/80 p-4">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
