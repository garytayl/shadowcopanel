import { Hint } from "@/components/dashboard/hint";
import { PageHeader } from "@/components/panel/page-header";
import { InPlainEnglish } from "@/components/help/in-plain-english";
import { getPublicServerSettings } from "@/lib/env/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const runtime = "nodejs";

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
        title="Connection details"
        description="A read-only checklist of how this website reaches your game server. Your host or a friend may have set this up already."
      >
        <InPlainEnglish title="Why this looks technical">
          <p>
            Behind the scenes the app uses a <strong>secure login file</strong> (a “key”) to talk to your
            rented machine. You normally set this once in your hosting provider’s dashboard (e.g. Vercel
            environment variables) or in a local settings file—<strong>not</strong> inside the game. If
            something here is blank, the app can’t reach your server yet.
          </p>
        </InPlainEnglish>
      </PageHeader>

      <Alert className="mb-6 rounded-2xl border-amber-500/35 bg-amber-500/[0.07]">
        <AlertTitle className="text-foreground">Keep this panel private</AlertTitle>
        <AlertDescription className="text-sm leading-relaxed text-muted-foreground">
          Anyone who can open this site can start or stop your game server and change files. Don’t share the
          public link widely until you add a password or login (planned for a future version). Your key
          never appears in the browser—only on the server that runs this app.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base">How we log into your cloud PC</CardTitle>
            <CardDescription>
              Technical names (for support)—this is the address and account the app uses to connect.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <div>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                Internet address of your server
                <Hint label="Public IPv4/DNS of your EC2 or VPS—the same host you SSH to manually." />
              </p>
              <p className="font-mono">
                <span className="text-muted-foreground">REFORGER_SSH_HOST · </span>
                {s.host || "—"}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                Port (usually 22)
                <Hint label="SSH port. Almost always 22 unless you changed sshd_config or use a bastion." />
              </p>
              <p className="font-mono">
                <span className="text-muted-foreground">REFORGER_SSH_PORT · </span>
                {s.port}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                Username on that machine
                <Hint label="Linux login name for SSH (Ubuntu AMIs often use ubuntu). This app connects as this user." />
              </p>
              <p className="font-mono">
                <span className="text-muted-foreground">REFORGER_SSH_USER · </span>
                {s.user || "—"}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                Key file on this computer (dev only)
                <Hint label="Local PEM path when you run Next.js on your laptop. On Vercel use the inline key variable instead—no file path there." />
              </p>
              <p className="font-mono">
                <span className="text-muted-foreground">REFORGER_SSH_PRIVATE_KEY_PATH · </span>
                {maskPath(s.privateKeyPath)}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                Key pasted into hosting (e.g. Vercel)
                <Hint label="Full private key text in env—required for serverless hosts that have no persistent disk for a .pem file." />
              </p>
              <p className="font-mono">
                <span className="text-muted-foreground">Inline key · </span>
                {s.privateKeyConfigured && !s.privateKeyPath ? "set (hidden)" : "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base">Where the game files live on the server</CardTitle>
            <CardDescription>
              Folders on your rented machine—defaults work for typical Ubuntu setups.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <div>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                Game install folder
                <Hint label="Where Arma Reforger dedicated server binaries live on the instance; tmux start command cds here." />
              </p>
              <p className="break-all font-mono">
                <span className="text-muted-foreground">REFORGER_SERVER_PATH · </span>
                {s.serverPath}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                Main settings file
                <Hint label="Remote path to config.json—the Config and Mods pages edit this file over SFTP." />
              </p>
              <p className="break-all font-mono">
                <span className="text-muted-foreground">REFORGER_CONFIG_PATH · </span>
                {s.configPath}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                Background session name
                <Hint label="tmux session name so the panel can send keys (start/stop) to the right pane." />
              </p>
              <p className="font-mono">
                <span className="text-muted-foreground">REFORGER_TMUX_SESSION · </span>
                {s.tmuxSession}
              </p>
              <p className="mt-1 text-[11px] leading-snug">
                The server can run in a named “session” so it keeps going after you disconnect. You rarely
                need to change this.
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                Start command
                <Hint label="Shell command run inside tmux—usually ArmaReforgerServer with -config pointing at your JSON." />
              </p>
              <p className="break-all font-mono">
                <span className="text-muted-foreground">REFORGER_SERVER_CMD · </span>
                {s.serverCommand}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                Log file path (optional)
                <Hint label="If set, Logs page tails this path; otherwise the panel tries to find *.log under the game and XDG config dirs." />
              </p>
              <p className="font-mono">
                <span className="text-muted-foreground">REFORGER_LOG_GLOB · </span>
                {s.logGlob ?? "auto-discover"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/80 md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Is everything set up?
              <Hint label="Configured means host, user, and key are present in the server env—without that, no page can SSH to your machine." />
            </CardTitle>
            <CardDescription>Green means this app can reach your server.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            {s.configured ? (
              <p>
                Looks good—the app sees an address, username, and key. If you edit settings on your
                computer, restart the preview app; if you use a host like Vercel, redeploy after changing
                variables there.
              </p>
            ) : (
              <div className="space-y-3">
                <p>
                  <strong className="text-foreground">Not connected yet.</strong> The website needs three
                  things: the <strong>public address</strong> of your cloud machine, the{" "}
                  <strong>login name</strong> (often <code className="text-xs">ubuntu</code>), and your{" "}
                  <strong>private key</strong> (the secret file you got when you created the server).
                </p>
                <p className="font-medium text-foreground">If someone else hosts this site for you (e.g. Vercel)</p>
                <ul className="list-inside list-disc space-y-1 text-sm">
                  <li>Open your project → Environment variables.</li>
                  <li>
                    Add each setting with the <strong>exact</strong> names shown above (they start with{" "}
                    <code className="text-xs">REFORGER_</code>).
                  </li>
                  <li>
                    Turn them on for <strong>Production</strong> (and Preview if you use preview links).
                  </li>
                  <li>
                    Paste the <strong>whole key text</strong> into <code className="text-xs">REFORGER_SSH_PRIVATE_KEY</code> and leave the path empty.
                  </li>
                  <li>
                    Click <strong>Redeploy</strong> after saving—changes don’t apply until a new deploy runs.
                  </li>
                </ul>
                <p className="font-medium text-foreground">If you run the site on your own laptop</p>
                <p className="text-sm">
                  Copy <code className="text-xs">.env.example</code> to <code className="text-xs">.env.local</code> and fill in the same values. Point the key path at your <code className="text-xs">.pem</code> file.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
