"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Filter,
  Loader2,
  RefreshCw,
  Server,
  Settings2,
  ShieldAlert,
  ShoppingBag,
  Stethoscope,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import {
  clearActivityEventsAction,
  listActivityEventsAction,
} from "@/lib/actions/activity";
import { activityCategory } from "@/lib/activity/categories";
import type { ActivityEvent, ActivityEventSeverity, ActivityEventType } from "@/lib/activity/types";
import { Hint } from "@/components/dashboard/hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FilterKey = "all" | "server" | "config" | "mods" | "diagnostics" | "issues" | "warnings";

function severityBadge(sev: ActivityEventSeverity) {
  switch (sev) {
    case "success":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
    case "warn":
      return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100";
    case "error":
      return "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200";
    default:
      return "border-border/60 bg-muted/40 text-muted-foreground";
  }
}

function typeIcon(t: ActivityEventType) {
  switch (t) {
    case "config_saved":
    case "config_repaired":
      return Settings2;
    case "mods_saved":
    case "marketplace_import":
      return ShoppingBag;
    case "server_started":
    case "server_stopped":
    case "server_restarted":
    case "safe_restart":
      return Server;
    case "fix_server":
      return Wrench;
    case "joinability_check":
    case "diagnostic_run":
      return Stethoscope;
    default:
      return Activity;
  }
}

function matchesFilter(ev: ActivityEvent, f: FilterKey): boolean {
  if (f === "all") return true;
  if (f === "warnings") return ev.severity === "warn" || ev.severity === "error";
  if (f === "issues") {
    return ev.type === "critical_issue_detected" || ev.type === "health_warning";
  }
  return activityCategory(ev.type) === f;
}

export function ActivityClient() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const r = await listActivityEventsAction(400);
    setLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setEvents(r.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => events.filter((e) => matchesFilter(e, filter)),
    [events, filter],
  );

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearAll = async () => {
    const r = await clearActivityEventsAction();
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Activity log cleared");
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span>Recent control-panel and server events (stored on this app host).</span>
            <Hint label="Events are saved in a JSON file under data/ on the machine running this Next.js app—not on your game server. Clear anytime for a fresh log." />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Refresh
          </Button>
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void clearAll()}>
            <Trash2 className="mr-2 size-4" />
            Clear log
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/20 p-2">
        <Filter className="ml-1 size-4 text-muted-foreground" aria-hidden />
        {(
          [
            ["all", "All"],
            ["server", "Server actions"],
            ["config", "Config"],
            ["mods", "Mods"],
            ["diagnostics", "Diagnostics"],
            ["issues", "Issues"],
            ["warnings", "Errors / warnings"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={filter === key ? "secondary" : "ghost"}
            size="sm"
            className="h-8 rounded-full text-xs"
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading && events.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/40 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading activity…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/15 px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">No activity yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Saves, restarts, and checks will appear here as you use the panel.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((ev) => {
            const Icon = typeIcon(ev.type);
            const meta = ev.metadata && Object.keys(ev.metadata).length > 0;
            const open = expanded.has(ev.id);
            return (
              <li
                key={ev.id}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card/50 shadow-sm ring-1 ring-white/[0.03]"
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  onClick={() => meta && toggleExpand(ev.id)}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/30",
                      ev.severity === "success" && "border-emerald-500/25 bg-emerald-500/10",
                      ev.severity === "error" && "border-red-500/25 bg-red-500/10",
                      ev.severity === "warn" && "border-amber-500/25 bg-amber-500/10",
                    )}
                  >
                    {ev.type === "critical_issue_detected" ? (
                      <ShieldAlert className="size-4 text-red-500" aria-hidden />
                    ) : ev.type === "health_warning" ? (
                      <AlertTriangle className="size-4 text-amber-500" aria-hidden />
                    ) : ev.severity === "success" ? (
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    ) : (
                      <Icon className="size-4 text-muted-foreground" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium leading-snug">{ev.title}</span>
                      <Badge variant="outline" className={cn("text-[10px] font-normal", severityBadge(ev.severity))}>
                        {ev.severity}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">{ev.type}</span>
                    </div>
                    {ev.message ? (
                      <p className="text-xs leading-relaxed text-muted-foreground">{ev.message}</p>
                    ) : null}
                    <p className="text-[10px] tabular-nums text-muted-foreground">
                      {new Date(ev.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {meta ? (
                    <ChevronDown
                      className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                    />
                  ) : null}
                </button>
                {meta && open ? (
                  <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
                    <pre className="max-h-48 overflow-auto rounded-lg bg-background/80 p-3 font-mono text-[10px] leading-relaxed">
                      {JSON.stringify(ev.metadata, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
