"use client";

import { useCallback, useEffect, useState } from "react";
import { Droplets, Loader2 } from "lucide-react";
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
  regions: { slug: string; name: string }[];
  sizes: { slug: string; description: string; vcpus: number; memory: number }[];
};

type Props = {
  onProvisioned: () => void;
};

export function DigitalOceanProvisionCard({ onProvisioned }: Props) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [busy, setBusy] = useState(false);

  const [label, setLabel] = useState("reforger");
  const [region, setRegion] = useState("");
  const [size, setSize] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [checkPort, setCheckPort] = useState("2001");

  const loadOpts = useCallback(async () => {
    setLoadingOpts(true);
    try {
      const r = await fetch("/api/provision/digitalocean/options", { cache: "no-store" });
      const j = (await r.json()) as Options;
      setOpts(j);
      setRegion((prev) => {
        if (prev) return prev;
        return j.regions[0]?.slug ?? "";
      });
      setSize((prev) => {
        if (prev) return prev;
        const pick =
          j.sizes.find((s) => /s-2vcpu-4gb|s-1vcpu-2gb|s-1vcpu-1gb/i.test(s.slug)) ??
          j.sizes[0];
        return pick?.slug ?? "";
      });
    } catch {
      setOpts({
        enabled: false,
        defaultImage: "ubuntu-22-04-x64",
        regions: [],
        sizes: [],
      });
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
      toast.error("Paste the matching private key so this panel can SSH to the new droplet.");
      return;
    }
    if (!region || !size) {
      toast.error("Choose a region and droplet size.");
      return;
    }

    setBusy(true);
    const t = toast.loading("Creating DigitalOcean droplet…");
    try {
      const create = await fetch("/api/provision/digitalocean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          region,
          size,
          image: opts.defaultImage,
          publicKey: pk,
        }),
      });
      const cj = (await create.json()) as {
        error?: string;
        digitaloceanDropletId?: number;
        digitaloceanSshKeyId?: number;
      };
      if (!create.ok) {
        throw new Error(cj.error ?? "Create failed");
      }
      const dropletId = cj.digitaloceanDropletId;
      const sshKeyId = cj.digitaloceanSshKeyId;
      if (dropletId == null) throw new Error("No droplet id returned");

      toast.loading("Waiting for public IP and active status…", { id: t });

      let ipv4: string | null = null;
      let status = "";
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await fetch(`/api/provision/digitalocean/${dropletId}`, {
          cache: "no-store",
        });
        const sj = (await st.json()) as { status?: string; ipv4?: string | null; error?: string };
        if (!st.ok) throw new Error(sj.error ?? "Status check failed");
        status = sj.status ?? "";
        ipv4 = sj.ipv4 ?? null;
        if (status === "active" && ipv4) break;
      }

      if (!ipv4 || status !== "active") {
        throw new Error(
          "Droplet is still starting. Check the DigitalOcean dashboard, wait for a public IP, then add a manual server profile.",
        );
      }

      toast.loading("Saving panel profile…", { id: t });

      const fin = await fetch("/api/provision/digitalocean/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          digitaloceanDropletId: dropletId,
          digitaloceanSshKeyId: sshKeyId ?? undefined,
          profileName: label.trim() || "DigitalOcean droplet",
          privateKey: priv,
          activate: true,
          checkPort: checkPort.trim() ? Number(checkPort) : null,
        }),
      });
      const fj = (await fin.json()) as { error?: string; ok?: boolean; host?: string };
      if (!fin.ok) throw new Error(fj.error ?? "Finalize failed");

      toast.success(`Ready — ${fj.host ?? ipv4}. Profile is active (SSH user root).`, { id: t });
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
          Loading DigitalOcean options…
        </CardContent>
      </Card>
    );
  }

  if (!opts?.enabled) {
    return (
      <Card className="rounded-2xl border-border/80 border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Droplets className="size-4" aria-hidden />
            New VPS (DigitalOcean)
          </CardTitle>
          <CardDescription>
            Create a Droplet from this app (no AWS). Add{" "}
            <code className="text-xs">DIGITALOCEAN_TOKEN</code> to the environment that runs this Next.js
            app. Create a token under API → Tokens in DigitalOcean. Billing is with DigitalOcean.
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
          <Droplets className="size-4" aria-hidden />
          New VPS (DigitalOcean)
        </CardTitle>
        <CardDescription>
          Ubuntu image, base packages, and{" "}
          <code className="text-xs">/root/arma-reforger</code> (SSH user <strong>root</strong> — standard
          for DO Ubuntu images). Install the Reforger dedicated binary afterward. No AWS.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {opts.error ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">{opts.error}</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="do-label">Name prefix</Label>
            <Input
              id="do-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="do-port">Game port (panel checks)</Label>
            <Input
              id="do-port"
              value={checkPort}
              onChange={(e) => setCheckPort(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="do-region">Region</Label>
            <select
              id="do-region"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              {opts.regions.map((l) => (
                <option key={l.slug} value={l.slug}>
                  {l.slug} — {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="do-size">Size</Label>
            <select
              id="do-size"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={size}
              onChange={(e) => setSize(e.target.value)}
            >
              {opts.sizes.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.slug} · {s.vcpus} vCPU · {Math.round(s.memory / 1024)} GB — {s.description}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="do-pub">SSH public key</Label>
          <Textarea
            id="do-pub"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            rows={2}
            placeholder="ssh-ed25519 AAAA…"
            className="rounded-xl font-mono text-xs"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="do-priv">SSH private key (same pair — stored for this panel only)</Label>
          <Textarea
            id="do-priv"
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
          disabled={busy || opts.regions.length === 0 || opts.sizes.length === 0}
          onClick={() => void runProvision()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              Working…
            </>
          ) : (
            "Create droplet & connect panel"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
