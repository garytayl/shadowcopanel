"use client";

import { useCallback, useEffect, useState } from "react";
import { Cloud, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";

type Options = {
  enabled: boolean;
  error?: string;
  defaultImage: string;
  locations: { name: string; description: string }[];
  serverTypes: { name: string; description: string; cores: number; memory: number }[];
};

type Props = {
  onProvisioned: () => void;
};

export function HetznerProvisionCard({ onProvisioned }: Props) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [busy, setBusy] = useState(false);

  const [label, setLabel] = useState("reforger");
  const [location, setLocation] = useState("");
  const [serverType, setServerType] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [checkPort, setCheckPort] = useState("2001");

  const loadOpts = useCallback(async () => {
    setLoadingOpts(true);
    try {
      const r = await fetch("/api/provision/hetzner/options", { cache: "no-store" });
      const j = (await r.json()) as Options;
      setOpts(j);
      setLocation((prev) => {
        if (prev) return prev;
        return j.locations[0]?.name ?? "";
      });
      setServerType((prev) => {
        if (prev) return prev;
        const pick =
          j.serverTypes.find((t) => /cx22|cx21|cp?x21/i.test(t.name)) ?? j.serverTypes[0];
        return pick?.name ?? "";
      });
    } catch {
      setOpts({ enabled: false, defaultImage: "ubuntu-22.04", locations: [], serverTypes: [] });
    } finally {
      setLoadingOpts(false);
    }
  }, []);

  useEffect(() => {
    void loadOpts();
  }, [loadOpts]);

  async function runProvision() {
    if (!opts?.enabled) return;
    const pk = publicKey.trim();
    const priv = privateKey.trim();
    if (!pk.startsWith("ssh-")) {
      toast.error("Paste your SSH public key (starts with ssh-ed25519 or ssh-rsa).");
      return;
    }
    if (!priv.includes("BEGIN") || !priv.includes("PRIVATE KEY")) {
      toast.error("Paste the matching private key so this panel can SSH to the new server.");
      return;
    }
    if (!location || !serverType) {
      toast.error("Choose a location and server type.");
      return;
    }

    setBusy(true);
    const t = toast.loading("Creating Hetzner server…");
    try {
      const create = await fetch("/api/provision/hetzner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          location,
          serverType,
          image: opts.defaultImage,
          publicKey: pk,
        }),
      });
      const cj = (await create.json()) as {
        error?: string;
        hetznerServerId?: number;
        hetznerSshKeyId?: number;
      };
      if (!create.ok) {
        throw new Error(cj.error ?? "Create failed");
      }
      const serverId = cj.hetznerServerId;
      const sshKeyId = cj.hetznerSshKeyId;
      if (serverId == null) throw new Error("No server id returned");

      toast.loading("Waiting for public IP and running state…", { id: t });

      let ipv4: string | null = null;
      let status = "";
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await fetch(`/api/provision/hetzner/${serverId}`, { cache: "no-store" });
        const sj = (await st.json()) as { status?: string; ipv4?: string | null; error?: string };
        if (!st.ok) throw new Error(sj.error ?? "Status check failed");
        status = sj.status ?? "";
        ipv4 = sj.ipv4 ?? null;
        if (status === "running" && ipv4) break;
      }

      if (!ipv4 || status !== "running") {
        throw new Error(
          "Server is still starting. Note the server id from Hetzner, wait a few minutes, then add a manual server profile with the same IP and keys.",
        );
      }

      toast.loading("Saving panel profile…", { id: t });

      const fin = await fetch("/api/provision/hetzner/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hetznerServerId: serverId,
          hetznerSshKeyId: sshKeyId ?? undefined,
          profileName: label.trim() || "Hetzner server",
          privateKey: priv,
          activate: true,
          checkPort: checkPort.trim() ? Number(checkPort) : null,
        }),
      });
      const fj = (await fin.json()) as { error?: string; ok?: boolean; host?: string };
      if (!fin.ok) throw new Error(fj.error ?? "Finalize failed");

      toast.success(`Ready — ${fj.host ?? ipv4}. Profile is active.`, { id: t });
      setPrivateKey("");
      onProvisioned();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Provisioning failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  if (loadingOpts) {
    return (
      <Card className="rounded-2xl border-border/80">
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading provisioning options…
        </CardContent>
      </Card>
    );
  }

  if (!opts?.enabled) {
    return (
      <Card className="rounded-2xl border-border/80 border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="size-4" aria-hidden />
            New VPS (Hetzner Cloud)
          </CardTitle>
          <CardDescription>
            Create a Linux server from this app without using AWS. Add{" "}
            <code className="text-xs">HETZNER_API_TOKEN</code> to the environment that runs this Next.js
            app (never commit it). Billing is with Hetzner, not this project.
          </CardDescription>
        </CardHeader>
        {opts?.error ? (
          <CardContent className="text-sm text-destructive">{opts.error}</CardContent>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-border/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="size-4" aria-hidden />
          New VPS (Hetzner Cloud)
        </CardTitle>
        <CardDescription>
          Spins up an Ubuntu server, installs base packages, creates{" "}
          <code className="text-xs">/home/ubuntu/arma-reforger</code>, and adds a panel profile. You still
          need to install the Reforger dedicated server binary on the machine (SteamCMD or upload). No AWS
          console — only a Hetzner API token on this host.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {opts.error ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">{opts.error}</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="hz-label">Name prefix</Label>
            <Input
              id="hz-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hz-port">Game port (panel checks)</Label>
            <Input
              id="hz-port"
              value={checkPort}
              onChange={(e) => setCheckPort(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="hz-loc">Location</Label>
            <select
              id="hz-loc"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              {opts.locations.map((l) => (
                <option key={l.name} value={l.name}>
                  {l.name} — {l.description}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hz-type">Server type</Label>
            <select
              id="hz-type"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={serverType}
              onChange={(e) => setServerType(e.target.value)}
            >
              {opts.serverTypes.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} · {s.cores} vCPU · {s.memory} MB — {s.description}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hz-pub">SSH public key</Label>
          <Textarea
            id="hz-pub"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            rows={2}
            placeholder="ssh-ed25519 AAAA…"
            className="rounded-xl font-mono text-xs"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hz-priv">SSH private key (same pair — stored for this panel only)</Label>
          <Textarea
            id="hz-priv"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            rows={5}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            className="rounded-xl font-mono text-xs"
          />
        </div>
        <Button
          type="button"
          className="w-full rounded-xl sm:w-auto"
          disabled={busy || opts.locations.length === 0 || opts.serverTypes.length === 0}
          onClick={() => void runProvision()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              Working…
            </>
          ) : (
            "Create server & connect panel"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
