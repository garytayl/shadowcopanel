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
import { actionValidateModStackFull } from "@/lib/actions/mod-stack-validation";
import {
  isConfigDiffEmpty,
  previewModsSaveDiff,
  type ConfigDiffResult,
} from "@/lib/reforger/config-diff";
import {
  autoCleanModStack,
  validateModStack,
  type ModStackValidationResult,
} from "@/lib/reforger/mod-stack-analysis";
import { useOnActiveServerChanged } from "@/lib/client/active-server-events";
import { Hint } from "@/components/dashboard/hint";
import { ConfigAnomalyBanner } from "@/components/panel/config-anomaly-banner";
import { ConfigDiffDialog } from "@/components/panel/config-diff-dialog";
import {
  ModStackValidationPanel,
  formatModStackSummaryLine,
} from "@/components/panel/mod-stack-validation-panel";
import { TitleWithHint } from "@/components/panel/label-with-hint";
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
  const [maxPlayers, setMaxPlayers] = useState(64);
  const [enrichedValidation, setEnrichedValidation] = useState<ModStackValidationResult | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [allowSaveDespiteStackErrors, setAllowSaveDespiteStackErrors] = useState(false);
  const [remoteRawConfig, setRemoteRawConfig] = useState("");
  const [diffOpen, setDiffOpen] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<ConfigDiffResult | null>(null);
  const [diffRawBefore, setDiffRawBefore] = useState<string | undefined>();
  const [diffRawAfter, setDiffRawAfter] = useState<string | undefined>();

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
    setMaxPlayers(r.data.maxPlayers);
    setEnrichedValidation(null);
    setRemoteRawConfig(r.data.rawConfig);
  }, []);

  const liveValidation = useMemo(() => {
    const payload = rows.map(({ modId, name, version, enabled }) => ({
      modId,
      name,
      version,
      enabled,
    }));
    return validateModStack(payload, { maxPlayers });
  }, [rows, maxPlayers]);

  const displayValidation = enrichedValidation ?? liveValidation;

  useOnActiveServerChanged(load);

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

  const prepareSave = () => {
    if (liveValidation.summary.errors > 0 && !allowSaveDespiteStackErrors) {
      toast.error("Fix stack validation errors or enable the override checkbox.");
      return;
    }
    const preview = previewModsSaveDiff(
      remoteRawConfig,
      rows.map(({ modId, name, version, enabled }) => ({ modId, name, version, enabled })),
    );
    if (!preview.ok) {
      if ("parseError" in preview) {
        toast.error(preview.parseError);
        return;
      }
      toast.error(preview.mutationErrors.map((i) => i.message).join(" "));
      return;
    }
    if (isConfigDiffEmpty(preview.diff)) {
      toast.message("No changes to save");
      return;
    }
    setPendingDiff(preview.diff);
    setDiffRawBefore(preview.rawBefore);
    setDiffRawAfter(preview.rawAfter);
    setDiffOpen(true);
  };

  const executeSave = async () => {
    setDiffOpen(false);
    setSaving(true);
    const r = await saveModsAction(
      rows.map(({ modId, name, version, enabled }) => ({
        modId,
        name,
        version,
        enabled,
      })),
      {
        allowStackValidationErrors: allowSaveDespiteStackErrors,
      },
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
    setAllowSaveDespiteStackErrors(false);
    setPendingDiff(null);
    await load();
  };

  const runDeepCheck = async () => {
    setEnriching(true);
    try {
      const r = await actionValidateModStackFull(
        rows.map(({ modId, name, version, enabled }) => ({ modId, name, version, enabled })),
      );
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setEnrichedValidation(r.data);
      toast.success(`Workshop check: ${formatModStackSummaryLine(r.data)}`);
    } finally {
      setEnriching(false);
    }
  };

  return (
    <div className="space-y-6">
      <ConfigDiffDialog
        open={diffOpen}
        onOpenChange={setDiffOpen}
        diff={pendingDiff}
        title="Review mod list changes"
        description="Normalized diff vs the last loaded remote config. Confirm to write game.mods."
        rawBefore={diffRawBefore}
        rawAfter={diffRawAfter}
        confirmLabel="Save to server"
        onConfirm={() => void executeSave()}
      />
      <ConfigAnomalyBanner issues={anomalies} />

      <ModStackValidationPanel
        result={displayValidation}
        loading={loading}
        title="Mod stack validation"
        extraActions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={enriching || loading}
            onClick={() => void runDeepCheck()}
          >
            {enriching ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
            Deep workshop check
          </Button>
        }
      />

      {liveValidation.summary.errors > 0 ? (
        <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/[0.06] px-3 py-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={allowSaveDespiteStackErrors}
            onChange={(e) => setAllowSaveDespiteStackErrors(e.target.checked)}
          />
          <span>
            Allow saving anyway (server will still reject rows with empty name/version). Only use if you understand
            the risk.
          </span>
        </label>
      ) : null}

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
          disabled={saving || loading}
          onClick={() => {
            const { rows: cleaned, removedDuplicateIds, removedEmptyRows } = autoCleanModStack(rows);
            setRows(cleaned);
            setEnrichedValidation(null);
            const parts: string[] = [];
            if (removedDuplicateIds.length) parts.push(`removed ${removedDuplicateIds.length} duplicate ID(s)`);
            if (removedEmptyRows) parts.push(`removed ${removedEmptyRows} empty row(s)`);
            toast.message(parts.length ? `Auto-clean: ${parts.join(", ")}` : "Nothing to clean");
          }}
        >
          Auto-clean stack
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
        <Button onClick={prepareSave} disabled={saving || loading}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          Save to config
        </Button>
      </div>

      <Card className="rounded-2xl border-border/80">
        <CardHeader>
          <CardTitle className="text-base">
            <TitleWithHint hint="Top loads first, bottom loads last. We only save each mod’s ID, name, and version into your server file—that’s what Reforger expects.">
              Mods
            </TitleWithHint>
          </CardTitle>
          <CardDescription>
            “Enabled” is UI-only: disabled rows are not written to the server. The panel saves workshop mods only
            under <code className="text-xs">game.mods</code> (canonical Reforger shape).
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28%]">
                  <span className="inline-flex items-center gap-1">
                    modId
                    <Hint label="The mod’s Workshop ID (long GUID)—must match the mod on Steam." />
                  </span>
                </TableHead>
                <TableHead className="w-[22%]">
                  <span className="inline-flex items-center gap-1">
                    name
                    <Hint label="Display name for you and the file—can’t be empty or we won’t save the row." />
                  </span>
                </TableHead>
                <TableHead className="w-[14%]">
                  <span className="inline-flex items-center gap-1">
                    version
                    <Hint label="Exact version string from the Workshop page for this mod—required so the server loads the right build." />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    enabled
                    <Hint label="Off = we keep the row here but don’t put it in the saved list, so the mod won’t load." />
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    order / remove
                    <Hint label="Move up/down to change load order. Trash removes the mod from your next save." />
                  </span>
                </TableHead>
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
            <CardTitle className="text-base">
              <TitleWithHint hint="What actually gets saved for enabled mods. Turned-off mods don’t appear here at all.">
                JSON preview (mods block)
              </TitleWithHint>
            </CardTitle>
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
