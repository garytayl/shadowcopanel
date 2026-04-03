"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";

import { listActivityEventsAction } from "@/lib/actions/activity";
import type { ActivityEvent } from "@/lib/activity/types";

export function ActivityLatestStrip({ refreshTick }: { refreshTick: number }) {
  const [latest, setLatest] = useState<ActivityEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await listActivityEventsAction(1);
      if (cancelled || !r.ok) return;
      setLatest(r.data[0] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  if (!latest) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <History className="size-3.5 shrink-0 text-primary" aria-hidden />
      <span className="font-medium text-foreground">Latest</span>
      <span className="min-w-0 truncate">{latest.title}</span>
      <span className="tabular-nums opacity-80">{new Date(latest.timestamp).toLocaleTimeString()}</span>
      <Link href="/activity" className="ml-auto shrink-0 font-medium text-primary underline-offset-2 hover:underline">
        View all
      </Link>
    </div>
  );
}
