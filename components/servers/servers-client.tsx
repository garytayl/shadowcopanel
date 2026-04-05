"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Server, Trash2, Pencil, PlugZap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ServerProfilePublic } from "@/lib/server-profiles/types";
import { AwsProvisionCard } from "@/components/servers/aws-provision-card";

type ListResponse = {
  profiles: ServerProfilePublic[];
  activeProfileId: string | null;
};

const defaultForm = {
  name: "",
  host: "",
  port: "22",
  user: "ubuntu",
  privateKeyInline: "",
  privateKeyPath: "",
  serverPath: "/home/ubuntu/arma-reforger",
  configPath: "/home/ubuntu/arma-reforger/config.json",
  tmuxSession: "reforger",
  serverCommand: './ArmaReforgerServer -config ./config.json -maxFPS 60',
  instanceNotes: "",
  logGlob: "",
  checkPort: "",
};

export function ServersClient() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ServerProfilePublic[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/server-profiles", { cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as ListResponse;
      setProfiles(data.profiles);
      setActiveProfileId(data.activeProfileId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load servers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(p: ServerProfilePublic) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      host: p.host,
      port: String(p.port),
      user: p.user,
      privateKeyInline: "",
      privateKeyPath: "",
      serverPath: p.serverPath,
      configPath: p.configPath,
      tmuxSession: p.tmuxSession,
      serverCommand: p.serverCommand,
      instanceNotes: p.instanceNotes,
      logGlob: p.logGlob ?? "",
      checkPort: p.checkPort != null ? String(p.checkPort) : "",
    });
    setDialogOpen(true);
  }

  async function setActive(id: string | null) {
    try {
      const r = await fetch("/api/server-profiles/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: id }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      setActiveProfileId(id);
      toast.success(
        id ? "This server is now active for the panel." : "Using the default connection from host settings.",
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to activate");
    }
  }

  async function testProfile(id: string) {
    const t = toast.loading("Testing SSH…");
    try {
      const r = await fetch("/api/server-profiles/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: id }),
      });
      const j = (await r.json()) as { ok?: boolean; message?: string; roundTripMs?: number };
      toast.dismiss(t);
      if (j.ok) {
        toast.success(`SSH OK (${j.roundTripMs ?? "?"} ms control round-trip)`);
      } else {
        toast.error(j.message ?? "SSH test failed");
      }
    } catch (e) {
      toast.dismiss(t);
      toast.error(e instanceof Error ? e.message : "SSH test failed");
    }
  }

  async function removeProfile(id: string) {
    if (!confirm("Delete this saved server? This cannot be undone.")) return;
    try {
      const r = await fetch(`/api/server-profiles/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Delete failed");
      toast.success("Server removed");
      if (activeProfileId === id) await setActive(null);
      await load();
    } catch {
      toast.error("Could not delete");
    }
  }

  async function submitForm() {
    setSaving(true);
    try {
      const pkPath = form.privateKeyPath.trim();
      const pkIn = form.privateKeyInline.trim();
      const base: Record<string, unknown> = {
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port),
        user: form.user.trim(),
        serverPath: form.serverPath.trim(),
        configPath: form.configPath.trim(),
        tmuxSession: form.tmuxSession.trim(),
        serverCommand: form.serverCommand.trim(),
        instanceNotes: form.instanceNotes.trim(),
        logGlob: form.logGlob.trim() || null,
        checkPort: form.checkPort.trim() ? Number(form.checkPort) : null,
      };

      if (editingId) {
        if (pkIn) base.privateKeyInline = pkIn;
        if (pkPath) base.privateKeyPath = pkPath;
        const r = await fetch(`/api/server-profiles/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(base),
        });
        if (!r.ok) {
          const errBody = (await r.json()) as { error?: string };
          throw new Error(errBody.error ?? "Save failed");
        }
        toast.success("Server updated");
      } else {
        if (!pkPath && !pkIn) {
          toast.error("Paste your private key or set a key file path on the Next.js host.");
          return;
        }
        if (pkIn) base.privateKeyInline = pkIn;
        if (pkPath) base.privateKeyPath = pkPath;
        const r = await fetch("/api/server-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(base),
        });
        if (!r.ok) {
          const errBody = (await r.json()) as { error?: string };
          throw new Error(errBody.error ?? "Create failed");
        }
        toast.success("Server saved — choose “Use this server” to connect.");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <AwsProvisionCard onProvisioned={() => void load()} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Saved servers are remembered on this host. Keys are not sent to browsers.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => void setActive(null)}
          >
            Use default connection
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-xl"
            onClick={openCreate}
          >
            <Plus className="mr-1.5 size-4" aria-hidden />
            Add server
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : profiles.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardHeader>
            <CardTitle className="text-base">No saved servers yet</CardTitle>
            <CardDescription>
              Add the IP or hostname and SSH key for your game server, then choose <strong>Use this server</strong>.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {profiles.map((p) => (
            <li key={p.id}>
              <Card
                className={cn(
                  "rounded-2xl border-border/80 transition-shadow",
                  activeProfileId === p.id && "border-primary/50 shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary),transparent_55%)]",
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Server className="size-4 text-muted-foreground" aria-hidden />
                      <CardTitle className="text-base">{p.name}</CardTitle>
                    </div>
                    {activeProfileId === p.id ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <CardDescription className="font-mono text-xs">
                    {p.user}@{p.host}:{p.port}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 pt-0">
                  <Button
                    type="button"
                    size="sm"
                    variant={activeProfileId === p.id ? "secondary" : "default"}
                    className="rounded-lg"
                    onClick={() => void setActive(p.id)}
                  >
                    Use this server
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => void testProfile(p.id)}
                  >
                    <PlugZap className="mr-1 size-3.5" aria-hidden />
                    Test SSH
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => openEdit(p)}
                  >
                    <Pencil className="mr-1 size-3.5" aria-hidden />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-lg text-destructive hover:text-destructive"
                    onClick={() => void removeProfile(p.id)}
                  >
                    <Trash2 className="mr-1 size-3.5" aria-hidden />
                    Delete
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit server" : "Add server"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="srv-name">Display name</Label>
              <Input
                id="srv-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="EU Main"
                className="rounded-xl"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="srv-host">Host</Label>
                <Input
                  id="srv-host"
                  value={form.host}
                  onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                  placeholder="203.0.113.10"
                  className="rounded-xl"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="srv-port">SSH port</Label>
                <Input
                  id="srv-port"
                  value={form.port}
                  onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="srv-user">SSH user</Label>
              <Input
                id="srv-user"
                value={form.user}
                onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="srv-pk">Private key (paste PEM)</Label>
              <Textarea
                id="srv-pk"
                value={form.privateKeyInline}
                onChange={(e) => setForm((f) => ({ ...f, privateKeyInline: e.target.value }))}
                placeholder={
                  editingId
                    ? "Leave empty to keep the saved key"
                    : "-----BEGIN OPENSSH PRIVATE KEY-----"
                }
                rows={5}
                className="rounded-xl font-mono text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="srv-pkpath">Or key path on the panel host (dev)</Label>
              <Input
                id="srv-pkpath"
                value={form.privateKeyPath}
                onChange={(e) => setForm((f) => ({ ...f, privateKeyPath: e.target.value }))}
                placeholder="/Users/you/.ssh/reforger.pem"
                className="rounded-xl font-mono text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="srv-sp">Game install path (remote)</Label>
              <Input
                id="srv-sp"
                value={form.serverPath}
                onChange={(e) => setForm((f) => ({ ...f, serverPath: e.target.value }))}
                className="rounded-xl font-mono text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="srv-cp">config.json path (remote)</Label>
              <Input
                id="srv-cp"
                value={form.configPath}
                onChange={(e) => setForm((f) => ({ ...f, configPath: e.target.value }))}
                className="rounded-xl font-mono text-xs"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="srv-tmux">tmux session name</Label>
                <Input
                  id="srv-tmux"
                  value={form.tmuxSession}
                  onChange={(e) => setForm((f) => ({ ...f, tmuxSession: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="srv-check">Game port (optional)</Label>
                <Input
                  id="srv-check"
                  value={form.checkPort}
                  onChange={(e) => setForm((f) => ({ ...f, checkPort: e.target.value }))}
                  placeholder="2001"
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="srv-cmd">Start command</Label>
              <Input
                id="srv-cmd"
                value={form.serverCommand}
                onChange={(e) => setForm((f) => ({ ...f, serverCommand: e.target.value }))}
                className="rounded-xl font-mono text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="srv-notes">Notes (optional)</Label>
              <Input
                id="srv-notes"
                value={form.instanceNotes}
                onChange={(e) => setForm((f) => ({ ...f, instanceNotes: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="srv-log">Log glob (optional)</Label>
              <Input
                id="srv-log"
                value={form.logGlob}
                onChange={(e) => setForm((f) => ({ ...f, logGlob: e.target.value }))}
                className="rounded-xl font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submitForm()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : editingId ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
