"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ServerCog, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

const MAX_LOG = 40;

function ErrorLog({
  lines,
  onClear,
  className,
}: {
  lines: string[];
  onClear: () => void;
  className?: string;
}) {
  if (lines.length === 0) return null;
  return (
    <div className={cn("rounded-xl border border-border/80 bg-muted/40", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Log
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] text-muted-foreground"
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
      <ScrollArea className="h-[min(160px,28vh)] w-full">
        <pre
          className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
          role="log"
          aria-live="polite"
        >
          {lines.join("\n")}
        </pre>
      </ScrollArea>
    </div>
  );
}

export function AwsProvisionCard({ onProvisioned }: Props) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [awsSettings, setAwsSettings] = useState<AwsSettings | null>(null);
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const [label, setLabel] = useState("reforger");
  const [region, setRegion] = useState("");
  const [instanceType, setInstanceType] = useState("");
  const [useManualKeys, setUseManualKeys] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [checkPort, setCheckPort] = useState("2001");

  const [connectAccessKeyId, setConnectAccessKeyId] = useState("");
  const [connectSecretKey, setConnectSecretKey] = useState("");
  const [connectRegion, setConnectRegion] = useState("us-east-1");
  const [connectSessionToken, setConnectSessionToken] = useState("");
  const [connectSgCidr, setConnectSgCidr] = useState("0.0.0.0/0");

  const pushLog = useCallback((message: string) => {
    const ts = new Date().toISOString().slice(11, 19);
    setLogs((prev) => [`[${ts}] ${message}`, ...prev].slice(0, MAX_LOG));
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

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
      if (j.error) pushLog(j.error);
    } catch {
      setOpts({
        enabled: false,
        defaultRegion: "us-east-1",
        regions: [],
        instanceTypes: [],
      });
      setAwsSettings(null);
      pushLog("Could not load cloud options.");
    } finally {
      setLoadingOpts(false);
    }
  }, [pushLog]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function saveAwsCredentials() {
    const accessKeyId = connectAccessKeyId.trim();
    const secretAccessKey = connectSecretKey.trim();
    const reg = connectRegion.trim();
    if (!accessKeyId || !secretAccessKey || !reg) {
      pushLog("Need access key ID, secret key, and region.");
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
      toast.success("Saved.");
      setConnectSecretKey("");
      clearLogs();
      await loadAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      pushLog(msg);
    } finally {
      setSavingCreds(false);
    }
  }

  async function removeAwsCredentialsFile() {
    if (!confirm("Remove saved cloud keys?")) return;
    try {
      const r = await fetch("/api/provision/aws/settings", { method: "DELETE" });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Remove failed");
      toast.success("Removed.");
      await loadAll();
    } catch (e) {
      pushLog(e instanceof Error ? e.message : "Remove failed");
    }
  }

  async function runProvision() {
    if (!opts?.enabled) return;
    const pk = publicKey.trim();
    const priv = privateKey.trim();

    if (!region || !instanceType) {
      pushLog("Pick a region and size.");
      return;
    }

    if (useManualKeys) {
      if (!pk.startsWith("ssh-")) {
        pushLog("Public key must start with ssh-ed25519 or ssh-rsa.");
        return;
      }
      if (!priv.includes("BEGIN") || !priv.includes("PRIVATE KEY")) {
        pushLog("Private key must be a PEM block.");
        return;
      }
    }

    setBusy(true);
    pushLog(useManualKeys ? "Starting (your keys)…" : "Starting (automatic SSH keys)…");
    try {
      const create = await fetch("/api/provision/aws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          useManualKeys
            ? { label, region, instanceType, publicKey: pk }
            : { label, region, instanceType, autoGenerateKeys: true },
        ),
      });
      const cj = (await create.json()) as {
        error?: string;
        awsInstanceId?: string;
        awsRegion?: string;
        usedAutoKeys?: boolean;
      };
      if (!create.ok) throw new Error(cj.error ?? "Create failed");
      const instanceId = cj.awsInstanceId;
      const awsRegion = cj.awsRegion ?? region;
      if (!instanceId) throw new Error("No instance id returned");

      pushLog(`Instance ${instanceId} — waiting for running + public IP…`);

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
        if (i % 5 === 0) pushLog(`Status: ${status || "…"} · IP: ${ipv4 ?? "—"}`);
      }

      if (!ipv4 || status !== "running") {
        throw new Error(
          "Still starting or no public IP. Add the server manually under “Add server” or retry.",
        );
      }

      pushLog(`Connecting panel to ${ipv4}…`);

      const fin = await fetch("/api/provision/aws/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          useManualKeys
            ? {
                awsInstanceId: instanceId,
                awsRegion,
                profileName: label.trim() || "Game server",
                privateKey: priv,
                activate: true,
                checkPort: checkPort.trim() ? Number(checkPort) : null,
              }
            : {
                awsInstanceId: instanceId,
                awsRegion,
                profileName: label.trim() || "Game server",
                useStoredKey: true,
                activate: true,
                checkPort: checkPort.trim() ? Number(checkPort) : null,
              },
        ),
      });
      const fj = (await fin.json()) as { error?: string; ok?: boolean; host?: string };
      if (!fin.ok) throw new Error(fj.error ?? "Finalize failed");

      pushLog(`Done — ${fj.host ?? ipv4}`);
      toast.success(`Ready — ${fj.host ?? ipv4}`);
      setPrivateKey("");
      onProvisioned();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Provisioning failed";
      pushLog(msg);
    } finally {
      setBusy(false);
    }
  }

  if (loadingOpts) {
    return (
      <Card className="rounded-2xl border-border/80">
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading…
        </CardContent>
      </Card>
    );
  }

  if (!opts?.enabled) {
    const credentialsLockedByEnv = awsSettings?.canSaveCredentialsInApp === false;
    return (
      <Card className="rounded-2xl border-border/80 border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ServerCog className="size-4" aria-hidden />
            New cloud server
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {credentialsLockedByEnv
              ? "AWS keys are set on the host. Open this section only if you need to change them."
              : "The host needs AWS API access once (environment variables or paste below)."}
          </p>
          {awsSettings?.envOverrides ? (
            <p className="rounded-lg border border-amber-500/35 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              {awsSettings.envOverrides}
            </p>
          ) : null}

          {!credentialsLockedByEnv ? (
            <details className="rounded-xl border border-border/60 bg-muted/15">
              <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-foreground">
                AWS keys (operator)
              </summary>
              <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-3">
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
                    <Label htmlFor="aws-region-conn">Region</Label>
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
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">More options</summary>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="aws-st">Session token</Label>
                      <Input
                        id="aws-st"
                        value={connectSessionToken}
                        onChange={(e) => setConnectSessionToken(e.target.value)}
                        className="rounded-xl font-mono text-xs"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="aws-sg">Ingress CIDR</Label>
                      <Input
                        id="aws-sg"
                        value={connectSgCidr}
                        onChange={(e) => setConnectSgCidr(e.target.value)}
                        placeholder="0.0.0.0/0"
                        className="rounded-xl font-mono text-xs"
                      />
                    </div>
                  </div>
                </details>
                <Button
                  type="button"
                  className="w-full rounded-xl"
                  disabled={savingCreds}
                  onClick={() => void saveAwsCredentials()}
                >
                  {savingCreds ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                      Saving…
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </details>
          ) : null}
          {opts?.error ? <p className="text-sm text-destructive">{opts.error}</p> : null}
          <ErrorLog lines={logs} onClear={clearLogs} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ServerCog className="size-4" aria-hidden />
          New cloud server
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {awsSettings ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {awsSettings.source === "env" ? (
                <>Keys from environment{awsSettings.maskedAccessKeyId ? ` · ${awsSettings.maskedAccessKeyId}` : ""}</>
              ) : (
                <>
                  Keys saved for this app
                  {awsSettings.maskedAccessKeyId ? ` · ${awsSettings.maskedAccessKeyId}` : ""}
                </>
              )}
            </span>
            {awsSettings.source === "file" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-muted-foreground"
                onClick={() => void removeAwsCredentialsFile()}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remove
              </Button>
            ) : null}
          </div>
        ) : null}
        {awsSettings?.envOverrides ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">{awsSettings.envOverrides}</p>
        ) : null}
        {opts.error ? <p className="text-sm text-amber-600 dark:text-amber-400">{opts.error}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="aws-label">Name</Label>
            <Input
              id="aws-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="aws-port">Game port</Label>
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
              className="h-9 w-full rounded-xl border border-input bg-transparent px-2.5 text-sm"
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
            <Label htmlFor="aws-type">Size</Label>
            <select
              id="aws-type"
              className="h-9 w-full rounded-xl border border-input bg-transparent px-2.5 text-sm"
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

        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Use my own SSH key pair</p>
            <p className="text-xs text-muted-foreground">
              {useManualKeys
                ? "Paste the keys EC2 should use."
                : "Leave off — keys are generated on the server for this launch."}
            </p>
          </div>
          <Switch
            checked={useManualKeys}
            onCheckedChange={(v) => setUseManualKeys(Boolean(v))}
            aria-label="Use my own SSH key pair"
          />
        </div>

        {useManualKeys ? (
          <>
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
              <Label htmlFor="aws-priv">SSH private key</Label>
              <Textarea
                id="aws-priv"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                rows={4}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                className="rounded-xl font-mono text-xs"
              />
            </div>
          </>
        ) : null}

        <Button
          type="button"
          className="w-full rounded-xl"
          size="lg"
          disabled={busy || opts.regions.length === 0 || opts.instanceTypes.length === 0}
          onClick={() => void runProvision()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              Working…
            </>
          ) : (
            "Launch server"
          )}
        </Button>

        <ErrorLog lines={logs} onClear={clearLogs} />
      </CardContent>
    </Card>
  );
}
