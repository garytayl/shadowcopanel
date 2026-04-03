import { Skeleton } from "@/components/ui/skeleton";

export function MarketplaceCatalogSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col rounded-2xl border border-border/50 bg-card/30 p-4"
        >
          <div className="mb-3 flex gap-3">
            <Skeleton className="size-16 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-[85%]" />
              <Skeleton className="h-3 w-[60%]" />
              <Skeleton className="h-3 w-[40%]" />
            </div>
          </div>
          <Skeleton className="mb-2 h-3 w-full" />
          <Skeleton className="mb-3 h-3 w-[90%]" />
          <div className="mt-auto flex gap-2">
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="ml-auto h-8 w-14 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
