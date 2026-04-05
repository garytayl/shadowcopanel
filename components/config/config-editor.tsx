"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileDown, Images, Loader2, Save, Download, Wrench } from "lucide-react";
import { toast } from "sonner";

import {
  exportRemoteConfigAction,
  loadRemoteConfigAction,
  repairRemoteConfigAction,
  saveRawConfigAction,
  saveRemoteConfigAction,
} from "@/lib/actions/config";
import {
  isConfigDiffEmpty,
  previewFormSaveDiff,
  previewRawSaveDiff,
  type ConfigDiffResult,
} from "@/lib/reforger/config-diff";
import { useOnActiveServerChanged } from "@/lib/client/active-server-events";
import { Hint } from "@/components/dashboard/hint";
import { ConfigAnomalyBanner } from "@/components/panel/config-anomaly-banner";
import { ConfigDiffDialog } from "@/components/panel/config-diff-dialog";
import { LabelWithHint, TitleWithHint } from "@/components/panel/label-with-hint";
import { downloadTextFile } from "@/lib/utils/download";
import { normalizeReforgerConfig } from "@/lib/reforger/config-normalize";
import type { ConfigNormalizationIssue } from "@/lib/reforger/types";
import {
  configToFormValues,
  defaultFormValues,
  parseConfigJson,
  type ReforgerConfig,
  type ReforgerFormValues,
} from "@/lib/types/reforger-config";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type PendingSaveKind = "form" | "raw";

function NumberInput({
  label,
  hint,
  value,
  onChange,
  id,
}: {
  label: string;
  hint: string;
  id: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-2">
      <LabelWithHint htmlFor={id} label={label} hint={hint} />
      <Input
        id={id}
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function ConfigEditor() {
  const [form, setForm] = useState<ReforgerFormValues>(() => defaultFormValues());
  const [raw, setRaw] = useState("");
  const [anomalies, setAnomalies] = useState<ConfigNormalizationIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [baselineParsed, setBaselineParsed] = useState<ReforgerConfig | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<ConfigDiffResult | null>(null);
  const [diffRawBefore, setDiffRawBefore] = useState<string | undefined>();
  const [diffRawAfter, setDiffRawAfter] = useState<string | undefined>();
  const [pendingSaveKind, setPendingSaveKind] = useState<PendingSaveKind | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    setLoading(true);
    const r = await loadRemoteConfigAction();
    setLoading(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setForm(r.data.form);
    setRaw(r.data.raw);
    setAnomalies(r.data.anomalies);
    setBaselineParsed(r.data.parsed);
    if (!opts?.silent) {
      toast.success("Loaded remote config");
    }
  }, []);

  const reloadSilent = useCallback(() => void load({ silent: true }), [load]);
  useOnActiveServerChanged(reloadSilent);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void load({ silent: true });
    });
    return () => cancelAnimationFrame(id);
  }, [load]);

  const prepareSaveForm = () => {
    if (!baselineParsed) {
      toast.error("Load the remote config first.");
      return;
    }
    const { diff, rawBefore, rawAfter } = previewFormSaveDiff(baselineParsed, form);
    if (isConfigDiffEmpty(diff)) {
      toast.message("No changes to save");
      return;
    }
    setPendingDiff(diff);
    setDiffRawBefore(rawBefore);
    setDiffRawAfter(rawAfter);
    setPendingSaveKind("form");
    setDiffOpen(true);
  };

  const executeSaveForm = async () => {
    setDiffOpen(false);
    setSaving(true);
    const r = await saveRemoteConfigAction(form);
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const b = r.data.backupPath;
    toast.success(
      `Saved (${r.data.bytes} bytes)${b ? ` · backup: ${b}` : r.data.backupNote ? ` · ${r.data.backupNote}` : ""}`,
    );
    setPendingSaveKind(null);
    setPendingDiff(null);
    await load();
  };

  const repairConfig = async () => {
    setSaving(true);
    const r = await repairRemoteConfigAction();
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(
      `Config normalized on server (${r.data.bytes} bytes)${r.data.backupPath ? ` · backup ${r.data.backupPath}` : ""}`,
    );
    await load();
  };

  const prepareSaveRaw = () => {
    if (!baselineParsed) {
      toast.error("Load the remote config first.");
      return;
    }
    const preview = previewRawSaveDiff(baselineParsed, raw);
    if (!preview.ok) {
      toast.error(preview.error);
      return;
    }
    if (isConfigDiffEmpty(preview.diff)) {
      toast.message("No changes to save");
      return;
    }
    setPendingDiff(preview.diff);
    setDiffRawBefore(preview.rawBefore);
    setDiffRawAfter(preview.rawAfter);
    setPendingSaveKind("raw");
    setDiffOpen(true);
  };

  const executeSaveRaw = async () => {
    setDiffOpen(false);
    setSaving(true);
    const r = await saveRawConfigAction(raw);
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const b = r.data.backupPath;
    toast.success(
      `Saved raw JSON (${r.data.bytes} bytes)${b ? ` · backup: ${b}` : r.data.backupNote ? ` · ${r.data.backupNote}` : ""}`,
    );
    setPendingSaveKind(null);
    setPendingDiff(null);
    await load();
  };

  const downloadExport = async () => {
    setSaving(true);
    const r = await exportRemoteConfigAction();
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    downloadTextFile(r.data.filename, r.data.content, "application/json;charset=utf-8");
    toast.success("Download started");
  };

  const applyRawToForm = () => {
    const p = parseConfigJson(raw);
    if (!p.ok) {
      toast.error(p.error);
      return;
    }
    const norm = normalizeReforgerConfig(p.value);
    setForm(configToFormValues(norm.config));
    setAnomalies(norm.issues);
    if (norm.issues.length) {
      toast.message("Normalized JSON into form", {
        description: norm.issues
          .slice(0, 4)
          .map((i) => i.message)
          .join(" · "),
      });
    } else {
      toast.success("Parsed JSON into form");
    }
  };

  return (
    <div className="space-y-6">
      <ConfigDiffDialog
        open={diffOpen}
        onOpenChange={setDiffOpen}
        diff={pendingDiff}
        title="Review config changes"
        description="Comparison of normalized JSON: last loaded from the server vs what you’re about to save."
        rawBefore={diffRawBefore}
        rawAfter={diffRawAfter}
        confirmLabel="Save to server"
        onConfirm={() => {
          if (pendingSaveKind === "form") void executeSaveForm();
          else if (pendingSaveKind === "raw") void executeSaveRaw();
        }}
      />
      <ConfigAnomalyBanner issues={anomalies} />
      <Alert className="rounded-2xl border-amber-500/40 bg-amber-500/5">
        <AlertTitle className="flex items-center gap-2">
          Passwords &amp; privacy
          <Hint
            label="Whatever you save gets written straight onto your server’s settings file as normal text—not locked or hidden. Treat this screen like a password manager: don’t share screenshots."
            size="md"
          />
        </AlertTitle>
        <AlertDescription>
          Server passwords you type here are saved to your cloud machine when you click Save. Don’t share
          screenshots of this page publicly. Only people you trust should have access to this website.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void load()} disabled={loading || saving}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
          Load current file from server
        </Button>
        <Hint label="Grabs the newest settings file from your server and refreshes everything you see here." />
        <Button
          type="button"
          variant="secondary"
          onClick={() => void repairConfig()}
          disabled={saving || loading}
        >
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wrench className="mr-2 size-4" />}
          Repair / normalize config
        </Button>
        <Hint label="Cleans up bad mod layout (fixes duplicates, puts mods where the game expects them), saves, and backs up the old file first if one was there." />
        <Button type="button" variant="outline" onClick={() => void downloadExport()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4" />}
          Download a backup copy
        </Button>
        <Hint label="Downloads a copy to your PC—do this before you experiment so you can undo." />
      </div>

      <Tabs defaultValue="form" className="w-full">
        <TabsList className="rounded-xl">
          <TabsTrigger value="form">Form</TabsTrigger>
          <TabsTrigger value="raw">Raw JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="mt-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="rounded-2xl border-border/80">
              <CardHeader>
                <CardTitle className="text-base">
                  <TitleWithHint hint="The main server name, ports, and passwords. When you hit Save, we always pull the latest file from your machine first so nothing gets overwritten by mistake.">
                    Server &amp; network
                  </TitleWithHint>
                </CardTitle>
                <CardDescription>
                  Common options in plain language—other advanced fields stay in the file when you save
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <LabelWithHint
                    htmlFor="serverName"
                    label="Server name"
                    hint="The name players see in the server list and in-game."
                  />
                  <Input
                    id="serverName"
                    value={form.serverName}
                    onChange={(e) => setForm((f) => ({ ...f, serverName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithHint
                    htmlFor="password"
                    label="Password"
                    hint="The password players join with. It’s stored in plain text on the server—same as most game configs."
                  />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="off"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithHint
                    htmlFor="admin"
                    label="Admin password"
                    hint="Your admin password (whoever runs the server uses this). Keep it private."
                  />
                  <Input
                    id="admin"
                    type="password"
                    autoComplete="off"
                    value={form.adminPassword}
                    onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithHint
                    htmlFor="bindAddress"
                    label="Bind address"
                    hint="Which network card the game listens on. 0.0.0.0 means “listen on all networks”—usually what you want."
                  />
                  <Input
                    id="bindAddress"
                    value={form.bindAddress}
                    onChange={(e) => setForm((f) => ({ ...f, bindAddress: e.target.value }))}
                  />
                </div>
                <NumberInput
                  id="bindPort"
                  label="Bind port"
                  hint="The game’s main UDP port. Open this port in your cloud firewall (security group) for players. This panel’s “check port” setting should match this number."
                  value={form.bindPort}
                  onChange={(n) => setForm((f) => ({ ...f, bindPort: n }))}
                />
                <div className="space-y-2">
                  <LabelWithHint
                    htmlFor="pubAddr"
                    label="Public address"
                    hint="The address you tell friends to use—your server’s public IP or hostname. It should match what your cloud provider shows you."
                  />
                  <Input
                    id="pubAddr"
                    value={form.publicAddress}
                    onChange={(e) => setForm((f) => ({ ...f, publicAddress: e.target.value }))}
                  />
                </div>
                <NumberInput
                  id="pubPort"
                  label="Public port"
                  hint="The port players connect to. Usually the same as bind port; only different if you’re port-forwarding through a router."
                  value={form.publicPort}
                  onChange={(n) => setForm((f) => ({ ...f, publicPort: n }))}
                />
                <div className="space-y-2">
                  <LabelWithHint
                    htmlFor="a2sAddr"
                    label="A2S address"
                    hint="Where the server answers Steam’s “server list” queries. Usually leave 0.0.0.0 unless you know you need something else."
                  />
                  <Input
                    id="a2sAddr"
                    value={form.a2sAddress}
                    onChange={(e) => setForm((f) => ({ ...f, a2sAddress: e.target.value }))}
                  />
                </div>
                <NumberInput
                  id="a2sPort"
                  label="A2S port"
                  hint="Extra UDP port for Steam/ server-browser tools. Open it in the firewall if you care about showing up in lists."
                  value={form.a2sPort}
                  onChange={(n) => setForm((f) => ({ ...f, a2sPort: n }))}
                />
                <NumberInput
                  id="maxPl"
                  label="Max players"
                  hint="Max players allowed on the server at once."
                  value={form.maxPlayers}
                  onChange={(n) => setForm((f) => ({ ...f, maxPlayers: n }))}
                />
                <div className="flex items-center justify-between rounded-xl border border-border/80 p-4 md:col-span-2">
                  <div className="flex items-start gap-2">
                    <div>
                      <p className="text-sm font-medium">Visible in server browser</p>
                      <p className="text-xs text-muted-foreground">game.visible</p>
                    </div>
                    <Hint label="If off, your server might not show in the public browser list (depends on the game). On = easier to find." />
                  </div>
                  <Switch
                    checked={form.visible}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, visible: v }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/80 p-4 md:col-span-2">
                  <div className="flex items-start gap-2">
                    <div>
                      <p className="text-sm font-medium">Cross-platform</p>
                      <p className="text-xs text-muted-foreground">game.crossPlatform</p>
                    </div>
                    <Hint label="Lets PC and console players play together when the game supports it." />
                  </div>
                  <Switch
                    checked={form.crossPlatform}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, crossPlatform: v }))}
                  />
                </div>
                <NumberInput
                  id="smvd"
                  label="Server max view distance"
                  hint="How far the server simulates in meters—bigger numbers cost more CPU."
                  value={form.serverMaxViewDistance}
                  onChange={(n) => setForm((f) => ({ ...f, serverMaxViewDistance: n }))}
                />
                <NumberInput
                  id="nvd"
                  label="Network view distance"
                  hint="How far the server sends world detail to players (meters). Lower can help performance."
                  value={form.networkViewDistance}
                  onChange={(n) => setForm((f) => ({ ...f, networkViewDistance: n }))}
                />
              </CardContent>
            </Card>

            <Card className="mt-6 rounded-2xl border-border/80">
              <CardHeader>
                <CardTitle className="text-base">
                  <TitleWithHint hint="Extra IDs for Bohemia’s backend / matchmaking. Most home servers leave these blank.">
                    Server identity
                  </TitleWithHint>
                </CardTitle>
                <CardDescription>
                  Optional backend fields (see Bohemia server config wiki). Leave blank to keep defaults.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <LabelWithHint
                    htmlFor="dedicatedServerId"
                    label="Dedicated server ID"
                    hint="A stable ID for Bohemia’s cloud tools. Skip unless your host told you to fill it in."
                  />
                  <Input
                    id="dedicatedServerId"
                    placeholder="e.g. ar-gm-myserver"
                    value={form.dedicatedServerId}
                    onChange={(e) => setForm((f) => ({ ...f, dedicatedServerId: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <LabelWithHint
                    htmlFor="region"
                    label="Region"
                    hint="Rough region code (US, EU, etc.) — only if your hosting setup asks for it."
                  />
                  <Input
                    id="region"
                    placeholder="US, EU, AS, AU, SA, AF"
                    value={form.region}
                    onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6 rounded-2xl border-border/80">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <Images className="size-4 text-primary" aria-hidden />
                  <TitleWithHint hint="How your session looks in menus and loading screens. Pictures aren’t normal web links—they’re special game asset paths (the .edds stuff). Copy them from the editor or another config if you’re unsure.">
                    Presentation &amp; images
                  </TitleWithHint>
                </CardTitle>
                <CardDescription>
                  Written to <code className="text-xs">game.gameProperties.missionHeader</code>. Text
                  fields set how the session is described in-game. Image fields are{" "}
                  <strong>Enfusion resource names</strong> (GUID paths to <code className="text-xs">.edds</code>{" "}
                  assets), not regular web URLs—copy them from Workbench or an existing scenario config.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <LabelWithHint
                    htmlFor="mname"
                    label="Mission display name"
                    hint="Title players see in the browser and loading screens."
                  />
                  <Input
                    id="mname"
                    placeholder="m_sName"
                    value={form.missionDisplayName}
                    onChange={(e) => setForm((f) => ({ ...f, missionDisplayName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <LabelWithHint htmlFor="mauth" label="Mission author" hint="Who made the mission—shown in UI." />
                  <Input
                    id="mauth"
                    placeholder="m_sAuthor"
                    value={form.missionAuthor}
                    onChange={(e) => setForm((f) => ({ ...f, missionAuthor: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <LabelWithHint
                    htmlFor="mdesc"
                    label="Short description"
                    hint="Short one-line description for the server browser."
                  />
                  <Input
                    id="mdesc"
                    placeholder="m_sDescription"
                    value={form.missionDescription}
                    onChange={(e) => setForm((f) => ({ ...f, missionDescription: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <LabelWithHint
                    htmlFor="mdet"
                    label="Rules / long details"
                    hint="Longer rules or details—can be longer text than the short description."
                  />
                  <Textarea
                    id="mdet"
                    placeholder="m_sDetails"
                    rows={4}
                    value={form.missionDetails}
                    onChange={(e) => setForm((f) => ({ ...f, missionDetails: e.target.value }))}
                    className="min-h-[100px] resize-y rounded-xl"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <LabelWithHint
                    htmlFor="micon"
                    label="Icon (resource name)"
                    hint="Small icon for the server list. Paste the game’s asset path (weird path with .edds, not a website URL)."
                  />
                  <Input
                    id="micon"
                    className="font-mono text-xs"
                    placeholder="{…}path/to/icon.edds — m_sIcon"
                    value={form.missionIcon}
                    onChange={(e) => setForm((f) => ({ ...f, missionIcon: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <LabelWithHint
                    htmlFor="mload"
                    label="Loading screen (resource name)"
                    hint="Full-screen picture while loading. Same kind of asset path as the icon."
                  />
                  <Input
                    id="mload"
                    className="font-mono text-xs"
                    placeholder="m_sLoadingScreen"
                    value={form.missionLoadingScreen}
                    onChange={(e) => setForm((f) => ({ ...f, missionLoadingScreen: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <LabelWithHint
                    htmlFor="mprev"
                    label="Preview image (resource name)"
                    hint="Preview image for the session in menus."
                  />
                  <Input
                    id="mprev"
                    className="font-mono text-xs"
                    placeholder="m_sPreviewImage"
                    value={form.missionPreviewImage}
                    onChange={(e) => setForm((f) => ({ ...f, missionPreviewImage: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <div className="mt-4 flex justify-end">
            <Button onClick={prepareSaveForm} disabled={saving}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              Save form to server
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="raw" className="mt-4">
          <Card className="rounded-2xl border-border/80">
            <CardHeader>
              <CardTitle className="text-base">
                <TitleWithHint hint="Edit the real file yourself. On save we clean up mods (right section of the file), double-check, then upload. If a file already existed, we make a dated backup copy first.">
                  Raw JSON
                </TitleWithHint>
              </CardTitle>
              <CardDescription>For advanced users—broken JSON will be rejected to protect your server</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ScrollArea className="h-[min(60vh,520px)] rounded-xl border border-border/80">
                <Textarea
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  className="min-h-[480px] resize-none border-0 font-mono text-xs leading-relaxed focus-visible:ring-0"
                  spellCheck={false}
                />
              </ScrollArea>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={applyRawToForm}>
                  Apply JSON to form
                </Button>
                <Button type="button" onClick={prepareSaveRaw} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                  Save raw to server
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
