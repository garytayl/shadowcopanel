"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ServerCog } from "lucide-react";
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
  defaultRegion: string;
  regions: { id: string; name: string }[];
  instanceTypes: { id: string; label: string }[];
};

type AwsSettings = {
  configured: boolean;
  source: "env" | "file" | "none";
  region: string;
  sgCidr: string;
  maskedAccessKeyId: string | null;
  canSaveCredentialsInApp: boolean;
  hasSavedFile: boolean;
  envOverrides: string | null;
};

type Props = {
  onProvisioned: () => void;
};

export function AwsProvisionCard({ onProvisioned }: Props) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [awsSettings, setAwsSettings] = useState<AwsSettings | null>(null);
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);

  const [label, setLabel] = useState("reforger");
  const [region, setRegion] = useState("");
  const [instanceType, setInstanceType] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [checkPort, setCheckPort] = useState("2001");

  const [connectAccessKeyId, setConnectAccessKeyId] = useState("");
  const [connectSecretKey, setConnectSecretKey] = useState("");
  const [connectRegion, setConnectRegion] = useState("us-east-1");
  const [connectSessionToken, setConnectSessionToken] = useState("");
  const [connectSgCidr, setConnectSgCidr] = useState("0.0.0.0/0");

  const loadAll = useCallback(async () => {
    setLoadingOpts(true);
    try {
      const [rOpts, rSet] = await Promise.all([
        fetch("/api/provision/aws/options", { cache: "no-store" }),
        fetch("/api/provision/aws/settings", { cache: "no-store" }),
      ]);
      const j = (await rOpts.json()) as Options;
      const s = (await rSet.json()) as AwsSettings;
      setOpts(j);
      setAwsSettings(s);
      setRegion((prev) => {
        if (prev) return prev;
        const def = j.defaultRegion;
        const match = j.regions.find((x) => x.id === def);
        return match?.id ?? j.regions[0]?.id ?? "";
      });
      setInstanceType((prev) => {
        if (prev) return prev;
        return j.instanceTypes.find((t) => t.id === "t3.medium")?.id ?? j.instanceTypes[0]?.id ?? "";
      });
    } catch {
      setOpts({
        enabled: false,
        defaultRegion: "us-east-1",
        regions: [],
        instanceTypes: [],
      });
      setAwsSettings(null);
    } finally {
      setLoadingOpts(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function saveAwsCredentials() {
    const accessKeyId = connectAccessKeyId.trim();
    const secretAccessKey = connectSecretKey.trim();
    const reg = connectRegion.trim();
    if (!accessKeyId || !secretAccessKey || !reg) {
      toast.error("Access key ID, secret access key, and region are required.");
      return;
    }
    setSavingCreds(true);
    try {
      const r = await fetch("/api/provision/aws/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKeyId,
          secretAccessKey,
          region: reg,
          sessionToken: connectSessionToken.trim() || null,
          sgCidr: connectSgCidr.trim() || null,
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Save failed");
      toast.success("AWS credentials saved on this server.");
      setConnectSecretKey("");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingCreds(false);
    }
  }

  async function removeAwsCredentialsFile() {
    if (!confirm("Remove saved AWS credentials from this server?")) return;
    try {
      const r = await fetch("/api/provision/aws/settings", { method: "DELETE" });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Remove failed");
      toast.success("Saved credentials removed.");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
  }

  async function runProvision() {
    if (!opts?.enabled) return;
    const pk = publicKey.trim();
    const priv = privateKey.trim();
    if (!pk.startsWith("ssh-")) {
      toast.error("Paste your SSH public key (starts with ssh-ed25519 or ssh-rsa).");
      return;
    }
    if (!priv.includes("BEGIN") || !priv.includes("PRIVATE KEY")) {
      toast.error("Paste the matching private key so this panel can SSH to the instance.");
      return;
    }
    if (!region || !instanceType) {
      toast.error("Choose a region and instance type.");
      return;
    }

    setBusy(true);
    const t = toast.loading("Launching EC2 instance…");
    try {
      const create = await fetch("/api/provision/aws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          region,
          instanceType,
          publicKey: pk,
        }),
      });
      const cj = (await create.json()) as {
        error?: string;
        awsInstanceId?: string;
        awsRegion?: string;
      };
      if (!create.ok) throw new Error(cj.error ?? "Create failed");
      const instanceId = cj.awsInstanceId;
      const awsRegion = cj.awsRegion ?? region;
      if (!instanceId) throw new Error("No instance id returned");

      toast.loading("Waiting for public IP and running state…", { id: t });

      let ipv4: string | null = null;
      let status = "";
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await fetch(
          `/api/provision/aws/${encodeURIComponent(instanceId)}?region=${encodeURIComponent(awsRegion)}`,
          { cache: "no-store" },
        );
        const sj = (await st.json()) as { status?: string; ipv4?: string | null; error?: string };
        if (!st.ok) throw new Error(sj.error ?? "Status check failed");
        status = sj.status ?? "";
        ipv4 = sj.ipv4 ?? null;
        if (status === "running" && ipv4) break;
      }

      if (!ipv4 || status !== "running") {
        throw new Error(
          "Instance is still starting or has no public IP. Check the EC2 console, then add a manual server profile with the elastic IP or public IP.",
        );
      }

      toast.loading("Saving panel profile…", { id: t });

      const fin = await fetch("/api/provision/aws/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awsInstanceId: instanceId,
          awsRegion,
          profileName: label.trim() || "EC2 instance",
          privateKey: priv,
          activate: true,
          checkPort: checkPort.trim() ? Number(checkPort) : null,
        }),
      });
      const fj = (await fin.json()) as { error?: string; ok?: boolean; host?: string };
      if (!fin.ok) throw new Error(fj.error ?? "Finalize failed");

      toast.success(`Ready — ${fj.host ?? ipv4}. Profile is active (SSH user ubuntu).`, { id: t });
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
          Loading AWS…
        </CardContent>
      </Card>
    );
  }

  if (!opts?.enabled) {
    const credentialsLockedByEnv = awsSettings?.canSaveCredentialsInApp === false;
    return (
      <Card className="rounded-2xl border-border/80 border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ServerCog className="size-4" aria-hidden />
            New EC2 (Amazon API)
          </CardTitle>
          <CardDescription>
            Connect your AWS account here so you do not have to edit <code className="text-xs">.env</code>{" "}
            or hosting env vars for keys. Launching instances still uses the API—no EC2 click-through for
            create.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          {awsSettings?.envOverrides ? (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              {awsSettings.envOverrides}
            </p>
          ) : null}

          {credentialsLockedByEnv ? (
            <div className="space-y-2">
              <p>
                This host already has <code className="text-xs text-foreground">AWS_ACCESS_KEY_ID</code> and{" "}
                <code className="text-xs text-foreground">AWS_SECRET_ACCESS_KEY</code> in the environment.
                EC2 provisioning is enabled from those values. To use the form below instead, remove those
                env vars and reload.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs">
                One-time outside the app: create an AWS account and an IAM user with EC2 permissions, then
                create <strong>access keys</strong> (you can use the AWS CLI or the IAM page once). Paste
                them here—keys are stored only on this server in{" "}
                <code className="text-foreground">data/aws-credentials.json</code> (gitignored).
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="aws-ak">Access key ID</Label>
                  <Input
                    id="aws-ak"
                    value={connectAccessKeyId}
                    onChange={(e) => setConnectAccessKeyId(e.target.value)}
                    autoComplete="off"
                    className="rounded-xl font-mono text-xs"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="aws-region-conn">Default region</Label>
                  <Input
                    id="aws-region-conn"
                    value={connectRegion}
                    onChange={(e) => setConnectRegion(e.target.value)}
                    placeholder="us-east-1"
                    className="rounded-xl font-mono text-xs"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="aws-sk">Secret access key</Label>
                <Input
                  id="aws-sk"
                  type="password"
                  value={connectSecretKey}
                  onChange={(e) => setConnectSecretKey(e.target.value)}
                  autoComplete="off"
                  className="rounded-xl font-mono text-xs"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="aws-st">Session token (optional)</Label>
                  <Input
                    id="aws-st"
                    value={connectSessionToken}
                    onChange={(e) => setConnectSessionToken(e.target.value)}
                    className="rounded-xl font-mono text-xs"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="aws-sg">SSH / game CIDR (optional)</Label>
                  <Input
                    id="aws-sg"
                    value={connectSgCidr}
                    onChange={(e) => setConnectSgCidr(e.target.value)}
                    placeholder="0.0.0.0/0"
                    className="rounded-xl font-mono text-xs"
                  />
                </div>
              </div>
              <Button
                type="button"
                className="rounded-xl"
                disabled={savingCreds}
                onClick={() => void saveAwsCredentials()}
              >
                {savingCreds ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save & enable EC2"
                )}
              </Button>
            </>
          )}
          {opts?.error ? <p className="text-sm text-destructive">{opts.error}</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-border/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ServerCog className="size-4" aria-hidden />
          New EC2 (Amazon API)
        </CardTitle>
        <CardDescription>
          Launches Ubuntu 22.04 in your default VPC, opens SSH + UDP 2001/17777 (CIDR from your saved
          settings or env), cloud-init creates <code className="text-xs">/home/ubuntu/arma-reforger</code>.
          SSH user <strong>ubuntu</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {awsSettings ? (
          <div className="space-y-2 rounded-xl border border-border/80 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">AWS credentials:</span>{" "}
              {awsSettings.source === "env" ? (
                <>environment variables on this host</>
              ) : (
                <>
                  saved on this server (
                  <code className="text-[11px]">data/aws-credentials.json</code>)
                </>
              )}
              {awsSettings.maskedAccessKeyId ? (
                <>
                  {" "}
                  · access key <span className="font-mono">{awsSettings.maskedAccessKeyId}</span>
                </>
              ) : null}
            </p>
            {awsSettings.source === "file" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg text-xs"
                onClick={() => void removeAwsCredentialsFile()}
              >
                Remove saved credentials
              </Button>
            ) : null}
            {awsSettings.envOverrides ? (
              <p className="text-amber-700 dark:text-amber-300">{awsSettings.envOverrides}</p>
            ) : null}
          </div>
        ) : null}
        {opts.error ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">{opts.error}</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="aws-label">Name prefix</Label>
            <Input
              id="aws-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="aws-port">Game port (panel checks)</Label>
            <Input
              id="aws-port"
              value={checkPort}
              onChange={(e) => setCheckPort(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="aws-region">Region</Label>
            <select
              id="aws-region"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              {opts.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="aws-type">Instance type</Label>
            <select
              id="aws-type"
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={instanceType}
              onChange={(e) => setInstanceType(e.target.value)}
            >
              {opts.instanceTypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="aws-pub">SSH public key</Label>
          <Textarea
            id="aws-pub"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            rows={2}
            placeholder="ssh-ed25519 AAAA…"
            className="rounded-xl font-mono text-xs"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="aws-priv">SSH private key (same pair — stored for this panel only)</Label>
          <Textarea
            id="aws-priv"
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
          disabled={busy || opts.regions.length === 0 || opts.instanceTypes.length === 0}
          onClick={() => void runProvision()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              Working…
            </>
          ) : (
            "Launch EC2 & connect panel"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
