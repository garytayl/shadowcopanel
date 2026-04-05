"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Filter, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { useOnActiveServerChanged } from "@/lib/client/active-server-events";
import { Hint } from "@/components/dashboard/hint";
import { LogAnalysisCard } from "@/components/panel/log-analysis-card";
import { fetchLogsAction, type LogHealthSummary } from "@/lib/actions/logs";
import type { LogAnalysisResult } from "@/lib/reforger/log-analysis";
import { downloadTextFile } from "@/lib/utils/download";
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
import { ScrollArea } from "@/components/ui/scroll-area";

const FILTERS = [
  { label: "ERROR", test: (l: string) => /error/i.test(l) },
  { label: "WARN", test: (l: string) => /\bwarn(ing)?\b/i.test(l) },
  { label: "OOM", test: (l: string) => /out of memory/i.test(l) },
  { label: "init", test: (l: string) => /unable to initialize/i.test(l) },
  { label: "deps", test: (l: string) => /dependency/i.test(l) },
] as const;

export function LogsViewer() {
  const [text, setText] = useState("");
  const [health, setHealth] = useState<LogHealthSummary | null>(null);
  const [analysis, setAnalysis] = useState<LogAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetchLogsAction(600);
    setLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setText(r.data.text);
    setHealth(r.data.health);
    setAnalysis(r.data.analysis);
  }, []);

  useOnActiveServerChanged(refresh);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  const displayLines = useMemo(() => {
    const lines = text.split(/\r?\n/);
    return lines.filter((line) => {
      if (query.trim() && !line.toLowerCase().includes(query.toLowerCase())) {
        return false;
      }
      if (activeFilters.size === 0) return true;
      for (const f of FILTERS) {
        if (activeFilters.has(f.label) && f.test(line)) return true;
      }
      return false;
    });
  }, [text, query, activeFilters]);

  const toggleFilter = (label: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void refresh()}
            disabled={loading}
            variant="outline"
            size="default"
            className="min-h-11 touch-manipulation sm:min-h-8"
          >
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Refresh logs
          </Button>
          <Hint label="Pulls the newest lines from your server’s log file again. Set a log path under Settings, or we auto-find one." />
          <Button
            type="button"
            variant="secondary"
            size="default"
            className="min-h-11 touch-manipulation sm:min-h-8"
            onClick={() => {
              const body = displayLines.join("\n");
              downloadTextFile(
                `reforger-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`,
                body,
              );
            }}
          >
            <Download className="mr-2 size-4" />
            Download view
          </Button>
        </div>
        <div className="relative flex min-w-0 flex-1 items-center gap-1.5 sm:min-w-[200px] sm:max-w-md">
          <Input
            placeholder="Search in output…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-11 rounded-xl text-base sm:h-8 sm:min-h-8 sm:text-sm"
            autoComplete="off"
            enterKeyHint="search"
          />
          <Hint label="Filters only what’s already on screen—fast, no extra trip to the server." />
        </div>
      </div>

      {health ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Lines with “error”: {health.errorCount}</Badge>
            <Badge variant="secondary">Lines with “warn”: {health.warnCount}</Badge>
          </div>
          {analysis ? (
            <LogAnalysisCard
              analysis={analysis}
              title="Detected issues"
              description="Rule-based signals from this log tail — read the raw log below for full context."
            />
          ) : null}
        </motion.div>
      ) : null}

      <Card className="rounded-2xl border-border/80">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Filter className="size-4" />
            Quick filters
            <Hint label="With buttons on, a line shows if it matches any of them (OR). Add the search box to narrow further." />
          </CardTitle>
          <CardDescription>
            Tap a keyword to show only lines that match. Use several at once. Clear to see everything again.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.label}
              type="button"
              size="sm"
              variant={activeFilters.has(f.label) ? "default" : "outline"}
              className="min-h-11 touch-manipulation sm:min-h-8"
              onClick={() => toggleFilter(f.label)}
            >
              {f.label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11 touch-manipulation sm:min-h-8"
            onClick={() => setActiveFilters(new Set())}
          >
            Clear filters
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Log text
            <Hint label="Download saves what you see after search and filters—not always the entire log file on disk." />
          </CardTitle>
          <CardDescription>
            Reads the newest log file we can find on your server (or a fixed path if your host set one)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[min(55dvh,640px)] max-h-[70vh] rounded-xl border border-border/80 bg-[#0a0a0b] sm:h-[min(70vh,640px)]">
            <pre className="touch-pan-y overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-zinc-200 sm:p-4 sm:text-[11px]">
              {displayLines.join("\n")}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
