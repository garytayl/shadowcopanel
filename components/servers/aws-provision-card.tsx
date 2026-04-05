"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, ServerCog, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PowerOrb, type PowerOrbPhase } from "@/components/dashboard/power-orb";
import { Button } from "@/components/ui/button";
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

const MAX_LOG = 80;

function ActivityLog({
  lines,
  onClear,
  className,
}: {
  lines: string[];
  onClear: () => void;
  className?: string;
}) {
  const empty = lines.length === 0;
  return (
    <div className={cn("rounded-xl border border-border/80 bg-muted/30", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Log
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] text-muted-foreground"
          onClick={onClear}
          disabled={empty}
        >
          Clear
        </Button>
      </div>
      <ScrollArea className="h-[min(280px,42vh)] w-full">
        {empty ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No output yet. Tap the control — if cloud create isn’t configured, the log will list the{" "}
            <code className="font-mono text-[11px]">AWS_*</code> env vars your deployer should set on the host.
          </p>
        ) : (
          <pre
            className="whitespace-pre-wrap break-words px-3 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground"
            role="log"
            aria-live="polite"
          >
            {lines.join("\n")}
          </pre>
        )}
      </ScrollArea>
    </div>
  );
}

export function AwsProvisionCard({ onProvisioned }: Props) {
  const advId = useId();
  const awsKeysDetailsRef = useRef<HTMLDetailsElement>(null);

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
    if (!opts?.enabled) {
      const el = awsKeysDetailsRef.current;
      if (el) {
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      pushLog(
        "[Deployer] Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION to the host environment (e.g. Vercel → Settings → Environment Variables). For one-click launch, also set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. See .env.example.",
      );
      return;
    }
    const pk = publicKey.trim();
    const priv = privateKey.trim();

    if (!region || !instanceType) {
      pushLog("Pick a region and size in Advanced.");
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

  let orbPhase: PowerOrbPhase;
  if (loadingOpts) orbPhase = "loading";
  else if (busy) orbPhase = "provision_busy";
  else if (opts?.enabled) orbPhase = "provision_ready";
  else orbPhase = "provision_blocked";

  const hero = (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-zinc-900/90 via-card to-zinc-950/95 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_-24px_rgba(0,0,0,0.55)] ring-1 ring-primary/10 md:p-10",
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_-10%,rgba(56,189,248,0.09),transparent)]"
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-6 md:gap-8">
        <div className="text-center">
          <p className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            <ServerCog className="size-3.5 opacity-80" aria-hidden />
            New cloud server
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Tap the control when your host has enabled AWS — players don’t paste access keys here.
          </p>
        </div>

        {loadingOpts ? (
          <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="size-10 animate-spin" aria-hidden />
            <p className="text-sm">Loading regions…</p>
          </div>
        ) : (
          <PowerOrb
            phase={orbPhase}
            size="hero"
            disabled={busy}
            title={
              !opts?.enabled
                ? "Tap to open deployer instructions in the log"
                : busy
                  ? "Provisioning…"
                  : "Create new server on AWS"
            }
            actionLabel={
              !opts?.enabled
                ? "Unavailable"
                : busy
                  ? "Working…"
                  : "Create server"
            }
            phaseSubtitle={!opts?.enabled ? null : undefined}
            onClick={() => void runProvision()}
          />
        )}

        {!loadingOpts && !opts?.enabled ? (
          <div className="w-full max-w-xl space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-left text-sm">
            <p className="font-medium text-foreground">Deployer / hosting account</p>
            <p className="text-muted-foreground">
              Cloud create is off until <strong className="text-foreground">you</strong> set AWS credentials on
              the server that runs this app — not in the browser.
            </p>
            <p className="text-[13px] text-muted-foreground">
              In Vercel (or your host): add these environment variables:
            </p>
            <ul className="list-inside list-disc space-y-1 font-mono text-[11px] text-foreground/90">
              <li>AWS_ACCESS_KEY_ID</li>
              <li>AWS_SECRET_ACCESS_KEY</li>
              <li>AWS_REGION (e.g. us-east-1)</li>
            </ul>
            <p className="text-[13px] text-muted-foreground">
              For automatic SSH between steps on Vercel, also set:
            </p>
            <ul className="list-inside list-disc space-y-1 font-mono text-[11px] text-foreground/90">
              <li>UPSTASH_REDIS_REST_URL</li>
              <li>UPSTASH_REDIS_REST_TOKEN</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Optional fallback (not recommended vs env): expand <strong className="text-foreground">Paste keys</strong>{" "}
              below — only if you cannot use env vars.
            </p>
          </div>
        ) : null}

        {awsSettings?.envOverrides ? (
          <p className="max-w-lg rounded-lg border border-amber-500/35 bg-amber-500/[0.07] px-3 py-2 text-center text-xs text-amber-900 dark:text-amber-100">
            {awsSettings.envOverrides}
          </p>
        ) : null}

        {!loadingOpts && opts && !opts.enabled ? (
          <details ref={awsKeysDetailsRef} className="w-full max-w-lg rounded-xl border border-border/60 bg-muted/10">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
              Paste keys (fallback — prefer env vars above)
            </summary>
            <div className="space-y-3 border-t border-border/60 px-4 pb-4 pt-3">
              <p className="text-xs text-muted-foreground">
                Prefer setting <code className="font-mono">AWS_*</code> on the host. Use this only when env vars
                aren’t possible.
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

        {!loadingOpts && opts?.enabled ? (
          <details className="w-full max-w-2xl rounded-xl border border-border/60 bg-muted/10">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
              Advanced options
            </summary>
            <div className="space-y-4 border-t border-border/60 px-4 pb-4 pt-4">
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
                    {useManualKeys ? "Paste keys here." : "Off = generated on the server."}
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
                    <Label htmlFor={`${advId}-pub`}>SSH public key</Label>
                    <Textarea
                      id={`${advId}-pub`}
                      value={publicKey}
                      onChange={(e) => setPublicKey(e.target.value)}
                      rows={2}
                      placeholder="ssh-ed25519 AAAA…"
                      className="rounded-xl font-mono text-xs"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`${advId}-priv`}>SSH private key</Label>
                    <Textarea
                      id={`${advId}-priv`}
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      rows={4}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      className="rounded-xl font-mono text-xs"
                    />
                  </div>
                </>
              ) : null}
            </div>
          </details>
        ) : null}

        {opts?.error ? (
          <p className="text-center text-sm text-amber-600 dark:text-amber-400">{opts.error}</p>
        ) : null}

        <ActivityLog lines={logs} onClear={clearLogs} className="w-full max-w-2xl" />
      </div>
    </section>
  );

  return <div className="space-y-0">{hero}</div>;
}
