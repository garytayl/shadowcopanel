"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Filter, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { fetchLogsAction, type LogHealthSummary } from "@/lib/actions/logs";
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
  }, []);

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
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void refresh()} disabled={loading} variant="outline" size="sm">
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Refresh logs
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
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
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Input
            placeholder="Search in output…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-xl"
          />
        </div>
      </div>

      {health ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-2xl border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Health summary</CardTitle>
              <CardDescription>Heuristic counts from the current buffer</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant="secondary">ERROR-ish lines: {health.errorCount}</Badge>
              <Badge variant="secondary">WARN-ish lines: {health.warnCount}</Badge>
              {health.hints.map((h) => (
                <Badge key={h} variant="outline" className="text-amber-200">
                  {h}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      <Card className="rounded-2xl border-border/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="size-4" />
            Quick filters
          </CardTitle>
          <CardDescription>
            Toggle one or more; lines matching any selected filter pass. Clear all to show full log.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.label}
              type="button"
              size="sm"
              variant={activeFilters.has(f.label) ? "default" : "outline"}
              onClick={() => toggleFilter(f.label)}
            >
              {f.label}
            </Button>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => setActiveFilters(new Set())}>
            Clear filters
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/80">
        <CardHeader>
          <CardTitle className="text-base">Remote output</CardTitle>
          <CardDescription>Terminal-style view — latest discovered log file or REFORGER_LOG_GLOB</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[min(70vh,640px)] rounded-xl border border-border/80 bg-[#0a0a0b]">
            <pre className="p-4 font-mono text-[11px] leading-relaxed text-zinc-200">
              {displayLines.join("\n")}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
