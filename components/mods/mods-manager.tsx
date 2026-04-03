"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  FileDown,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  loadModsAction,
  saveModsAction,
  type ModRowPayload,
} from "@/lib/actions/mods";
import { ConfigAnomalyBanner } from "@/components/panel/config-anomaly-banner";
import { downloadTextFile } from "@/lib/utils/download";
import type { ConfigNormalizationIssue } from "@/lib/reforger/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function uid() {
  return `row_${Math.random().toString(36).slice(2, 11)}`;
}

export function ModsManager() {
  const [rows, setRows] = useState<(ModRowPayload & { key: string })[]>([]);
  const [anomalies, setAnomalies] = useState<ConfigNormalizationIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await loadModsAction();
    setLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setRows(
      r.data.mods.map((m) => ({
        ...m,
        key: uid(),
      })),
    );
    setAnomalies(r.data.anomalies);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const jsonPreview = useMemo(() => {
    const mods = rows
      .filter((r) => r.modId.trim() && r.enabled !== false)
      .map(({ modId, name, version }) => ({
        modId: modId.trim(),
        name: name.trim(),
        version: version.trim(),
      }));
    return JSON.stringify({ game: { mods } }, null, 2);
  }, [rows]);

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      const t = next[index]!;
      next[index] = next[j]!;
      next[j] = t;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    const r = await saveModsAction(
      rows.map(({ modId, name, version, enabled }) => ({
        modId,
        name,
        version,
        enabled,
      })),
    );
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const b = r.data.backupPath;
    const warn = r.data.normalizationIssues?.filter((i) => i.severity === "warn") ?? [];
    toast.success(
      `Saved mods (${r.data.bytes} bytes → game.mods)${b ? ` · backup ${b}` : r.data.backupNote ? ` · ${r.data.backupNote}` : ""}`,
    );
    if (warn.length) {
      toast.message("Normalization", { description: warn.slice(0, 3).map((i) => i.message).join(" · ") });
    }
    await load();
  };

  return (
    <div className="space-y-6">
      <ConfigAnomalyBanner issues={anomalies} />
      <Alert className="rounded-2xl border-amber-500/40 bg-amber-500/5">
        <AlertTitle>Go easy when adding mods</AlertTitle>
        <AlertDescription>
          Dropping in lots of heavy mods at once can make the server slow to start or crash on load. Add a few
          at a time, save, then check the Logs page if something goes wrong.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void load()} disabled={loading || saving} variant="outline">
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Reload from server
        </Button>
        <Button
          onClick={() =>
            setRows((r) => [...r, { key: uid(), modId: "", name: "", version: "", enabled: true }])
          }
          variant="secondary"
          disabled={saving}
        >
          <Plus className="mr-2 size-4" />
          Add mod
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => {
            downloadTextFile(
              `reforger-mods-${new Date().toISOString().slice(0, 10)}.json`,
              jsonPreview,
              "application/json;charset=utf-8",
            );
          }}
        >
          <FileDown className="mr-2 size-4" />
          Export JSON
        </Button>
        <Button onClick={() => void save()} disabled={saving || loading}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          Save to config
        </Button>
      </div>

      <Card className="rounded-2xl border-border/80">
        <CardHeader>
          <CardTitle className="text-base">Mods</CardTitle>
          <CardDescription>
            “Enabled” is UI-only: disabled rows are not written to the server. The panel saves workshop mods only
            under <code className="text-xs">game.mods</code> (canonical Reforger shape).
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28%]">modId</TableHead>
                <TableHead className="w-[22%]">name</TableHead>
                <TableHead className="w-[14%]">version</TableHead>
                <TableHead>enabled</TableHead>
                <TableHead className="text-right">order / remove</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No mods loaded. Add a row or reload from server.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, i) => (
                  <TableRow key={row.key}>
                    <TableCell>
                      <Input
                        className="font-mono text-xs"
                        value={row.modId}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((p) =>
                              p.key === row.key ? { ...p, modId: e.target.value } : p,
                            ),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.name}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((p) =>
                              p.key === row.key ? { ...p, name: e.target.value } : p,
                            ),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="font-mono text-xs"
                        value={row.version}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((p) =>
                              p.key === row.key ? { ...p, version: e.target.value } : p,
                            ),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={row.enabled}
                        onCheckedChange={(v) =>
                          setRows((prev) =>
                            prev.map((p) => (p.key === row.key ? { ...p, enabled: v } : p)),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => move(i, -1)}
                          aria-label="Move up"
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => move(i, 1)}
                          aria-label="Move down"
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive"
                          onClick={() =>
                            setRows((prev) => prev.filter((p) => p.key !== row.key))
                          }
                          aria-label="Remove"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base">JSON preview (mods block)</CardTitle>
            <CardDescription>
              Approximation of <code className="text-xs">game.mods</code> (enabled rows only)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded-xl bg-muted/50 p-4 font-mono text-[11px] leading-relaxed">
              {jsonPreview}
            </pre>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
