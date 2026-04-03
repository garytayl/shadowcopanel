import { PageHeader } from "@/components/panel/page-header";
import { getPublicServerSettings } from "@/lib/env/server";
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
              <p>SSH credentials appear configured. Restart <code className="text-xs">next dev</code> after editing <code className="text-xs">.env.local</code>.</p>
            ) : (
              <p>Copy <code className="text-xs">.env.example</code> to <code className="text-xs">.env.local</code> and set host, user, and a private key.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
