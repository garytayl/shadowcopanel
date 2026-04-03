import { PageHeader } from "@/components/panel/page-header";
import { getPublicServerSettings } from "@/lib/env/server";

export const runtime = "nodejs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function maskPath(p: string | null): string {
  if (!p) return "—";
  if (p.length <= 24) return p;
  return `${p.slice(0, 10)}…${p.slice(-8)}`;
}

export default function SettingsPage() {
  const s = getPublicServerSettings();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Values come from environment variables on the machine running this Next.js server."
      />

      <Alert className="mb-6 rounded-2xl border-destructive/40 bg-destructive/5">
        <AlertTitle>Secrets stay server-side</AlertTitle>
        <AlertDescription>
          SSH keys and passwords must never be imported into client components. This page only renders
          non-secret metadata resolved on the server. Do not expose this panel to the public internet
          without authentication and TLS.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base">SSH</CardTitle>
            <CardDescription>Connection target</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 font-mono text-xs text-muted-foreground">
            <div>
              <span className="text-foreground">REFORGER_SSH_HOST</span> · {s.host || "—"}
            </div>
            <div>
              <span className="text-foreground">REFORGER_SSH_PORT</span> · {s.port}
            </div>
            <div>
              <span className="text-foreground">REFORGER_SSH_USER</span> · {s.user || "—"}
            </div>
            <div>
              <span className="text-foreground">REFORGER_SSH_PRIVATE_KEY_PATH</span> ·{" "}
              {maskPath(s.privateKeyPath)}
            </div>
            <div>
              <span className="text-foreground">Inline key</span> ·{" "}
              {s.privateKeyConfigured && !s.privateKeyPath ? "set (hidden)" : "—"}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base">Reforger paths</CardTitle>
            <CardDescription>Remote filesystem</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 font-mono text-xs text-muted-foreground">
            <div className="break-all">
              <span className="text-foreground">REFORGER_SERVER_PATH</span> · {s.serverPath}
            </div>
            <div className="break-all">
              <span className="text-foreground">REFORGER_CONFIG_PATH</span> · {s.configPath}
            </div>
            <div>
              <span className="text-foreground">REFORGER_TMUX_SESSION</span> · {s.tmuxSession}
            </div>
            <div className="break-all">
              <span className="text-foreground">REFORGER_SERVER_CMD</span> · {s.serverCommand}
            </div>
            <div>
              <span className="text-foreground">REFORGER_LOG_GLOB</span> · {s.logGlob ?? "auto-discover"}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/80 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Configuration status</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {s.configured ? (
              <p>
                SSH env looks good on the server. For local dev, restart{" "}
                <code className="text-xs">next dev</code> after editing{" "}
                <code className="text-xs">.env.local</code>.
              </p>
            ) : (
              <div className="space-y-2">
                <p>
                  The server does not see all required SSH variables:{" "}
                  <code className="text-xs">REFORGER_SSH_HOST</code>,{" "}
                  <code className="text-xs">REFORGER_SSH_USER</code>, and either{" "}
                  <code className="text-xs">REFORGER_SSH_PRIVATE_KEY_PATH</code> or{" "}
                  <code className="text-xs">REFORGER_SSH_PRIVATE_KEY</code>.
                </p>
                <p className="font-medium text-foreground">On Vercel</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>
                    Names must match exactly (including the <code className="text-xs">REFORGER_</code> prefix).
                  </li>
                  <li>
                    Enable each variable for <strong>Production</strong> (and Preview if you use preview URLs).
                  </li>
                  <li>
                    After adding or changing secrets, trigger a new <strong>Redeploy</strong> — env is applied on deploy.
                  </li>
                  <li>
                    Use <code className="text-xs">REFORGER_SSH_PRIVATE_KEY</code> with the full PEM pasted in; leave path empty.
                  </li>
                </ul>
                <p className="font-medium text-foreground">Local dev</p>
                <p>
                  Copy <code className="text-xs">.env.example</code> to <code className="text-xs">.env.local</code> and set the same variables.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
