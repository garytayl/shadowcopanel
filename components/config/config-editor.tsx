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
import { ConfigAnomalyBanner } from "@/components/panel/config-anomaly-banner";
import { downloadTextFile } from "@/lib/utils/download";
import { normalizeReforgerConfig } from "@/lib/reforger/config-normalize";
import type { ConfigNormalizationIssue } from "@/lib/reforger/types";
import {
  configToFormValues,
  defaultFormValues,
  parseConfigJson,
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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

function NumberInput({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  id: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
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
    if (!opts?.silent) {
      toast.success("Loaded remote config");
    }
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void load({ silent: true });
    });
    return () => cancelAnimationFrame(id);
  }, [load]);

  const saveForm = async () => {
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

  const saveRaw = async () => {
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
      <ConfigAnomalyBanner issues={anomalies} />
      <Alert className="rounded-2xl border-amber-500/40 bg-amber-500/5">
        <AlertTitle>Passwords &amp; privacy</AlertTitle>
        <AlertDescription>
          Server passwords you type here are saved to your cloud machine when you click Save. Don’t share
          screenshots of this page publicly. Only people you trust should have access to this website.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void load()} disabled={loading || saving}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
          Load current file from server
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void repairConfig()}
          disabled={saving || loading}
        >
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wrench className="mr-2 size-4" />}
          Repair / normalize config
        </Button>
        <Button type="button" variant="outline" onClick={() => void downloadExport()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4" />}
          Download a backup copy
        </Button>
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
                <CardTitle className="text-base">Server &amp; network</CardTitle>
                <CardDescription>
                  Common options in plain language—other advanced fields stay in the file when you save
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="serverName">Server name</Label>
                  <Input
                    id="serverName"
                    value={form.serverName}
                    onChange={(e) => setForm((f) => ({ ...f, serverName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="off"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin">Admin password</Label>
                  <Input
                    id="admin"
                    type="password"
                    autoComplete="off"
                    value={form.adminPassword}
                    onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bindAddress">Bind address</Label>
                  <Input
                    id="bindAddress"
                    value={form.bindAddress}
                    onChange={(e) => setForm((f) => ({ ...f, bindAddress: e.target.value }))}
                  />
                </div>
                <NumberInput
                  id="bindPort"
                  label="Bind port"
                  value={form.bindPort}
                  onChange={(n) => setForm((f) => ({ ...f, bindPort: n }))}
                />
                <div className="space-y-2">
                  <Label htmlFor="pubAddr">Public address</Label>
                  <Input
                    id="pubAddr"
                    value={form.publicAddress}
                    onChange={(e) => setForm((f) => ({ ...f, publicAddress: e.target.value }))}
                  />
                </div>
                <NumberInput
                  id="pubPort"
                  label="Public port"
                  value={form.publicPort}
                  onChange={(n) => setForm((f) => ({ ...f, publicPort: n }))}
                />
                <div className="space-y-2">
                  <Label htmlFor="a2sAddr">A2S address</Label>
                  <Input
                    id="a2sAddr"
                    value={form.a2sAddress}
                    onChange={(e) => setForm((f) => ({ ...f, a2sAddress: e.target.value }))}
                  />
                </div>
                <NumberInput
                  id="a2sPort"
                  label="A2S port"
                  value={form.a2sPort}
                  onChange={(n) => setForm((f) => ({ ...f, a2sPort: n }))}
                />
                <NumberInput
                  id="maxPl"
                  label="Max players"
                  value={form.maxPlayers}
                  onChange={(n) => setForm((f) => ({ ...f, maxPlayers: n }))}
                />
                <div className="flex items-center justify-between rounded-xl border border-border/80 p-4 md:col-span-2">
                  <div>
                    <p className="text-sm font-medium">Visible in server browser</p>
                    <p className="text-xs text-muted-foreground">game.visible</p>
                  </div>
                  <Switch
                    checked={form.visible}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, visible: v }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/80 p-4 md:col-span-2">
                  <div>
                    <p className="text-sm font-medium">Cross-platform</p>
                    <p className="text-xs text-muted-foreground">game.crossPlatform</p>
                  </div>
                  <Switch
                    checked={form.crossPlatform}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, crossPlatform: v }))}
                  />
                </div>
                <NumberInput
                  id="smvd"
                  label="Server max view distance"
                  value={form.serverMaxViewDistance}
                  onChange={(n) => setForm((f) => ({ ...f, serverMaxViewDistance: n }))}
                />
                <NumberInput
                  id="nvd"
                  label="Network view distance"
                  value={form.networkViewDistance}
                  onChange={(n) => setForm((f) => ({ ...f, networkViewDistance: n }))}
                />
              </CardContent>
            </Card>

            <Card className="mt-6 rounded-2xl border-border/80">
              <CardHeader>
                <CardTitle className="text-base">Server identity</CardTitle>
                <CardDescription>
                  Optional backend fields (see Bohemia server config wiki). Leave blank to keep defaults.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="dedicatedServerId">Dedicated server ID</Label>
                  <Input
                    id="dedicatedServerId"
                    placeholder="e.g. ar-gm-myserver"
                    value={form.dedicatedServerId}
                    onChange={(e) => setForm((f) => ({ ...f, dedicatedServerId: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="region">Region</Label>
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
                <CardTitle className="flex items-center gap-2 text-base">
                  <Images className="size-4 text-primary" aria-hidden />
                  Presentation &amp; images
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
                  <Label htmlFor="mname">Mission display name</Label>
                  <Input
                    id="mname"
                    placeholder="m_sName"
                    value={form.missionDisplayName}
                    onChange={(e) => setForm((f) => ({ ...f, missionDisplayName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mauth">Mission author</Label>
                  <Input
                    id="mauth"
                    placeholder="m_sAuthor"
                    value={form.missionAuthor}
                    onChange={(e) => setForm((f) => ({ ...f, missionAuthor: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mdesc">Short description</Label>
                  <Input
                    id="mdesc"
                    placeholder="m_sDescription"
                    value={form.missionDescription}
                    onChange={(e) => setForm((f) => ({ ...f, missionDescription: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mdet">Rules / long details</Label>
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
                  <Label htmlFor="micon">Icon (resource name)</Label>
                  <Input
                    id="micon"
                    className="font-mono text-xs"
                    placeholder="{…}path/to/icon.edds — m_sIcon"
                    value={form.missionIcon}
                    onChange={(e) => setForm((f) => ({ ...f, missionIcon: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mload">Loading screen (resource name)</Label>
                  <Input
                    id="mload"
                    className="font-mono text-xs"
                    placeholder="m_sLoadingScreen"
                    value={form.missionLoadingScreen}
                    onChange={(e) => setForm((f) => ({ ...f, missionLoadingScreen: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mprev">Preview image (resource name)</Label>
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
            <Button onClick={() => void saveForm()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              Save form to server
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="raw" className="mt-4">
          <Card className="rounded-2xl border-border/80">
            <CardHeader>
              <CardTitle className="text-base">Raw JSON</CardTitle>
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
                <Button type="button" onClick={() => void saveRaw()} disabled={saving}>
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
