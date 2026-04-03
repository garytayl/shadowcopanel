import Link from "next/link";
import { InPlainEnglish } from "@/components/help/in-plain-english";
import { PageHeader } from "@/components/panel/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const faqs = [
  {
    q: "What is this website?",
    a: "A control panel that talks to your Arma Reforger server over SSH. You can start and stop the game, read logs, and adjust config without logging into a terminal by hand.",
  },
  {
    q: "Where do my SSH details go?",
    a: "Only on the machine that runs this app (your PC with .env.local, or your host like Vercel). Players never see them. Never paste private keys into the game or a public chat.",
  },
  {
    q: "Why does it say the server might be running when it is not?",
    a: "The dashboard guesses from a background session and process name. Rarely, another program can look similar. Use Logs and your game client to confirm.",
  },
  {
    q: "What is ⌘K / Ctrl+K?",
    a: "Opens the jump menu so you can go to any page quickly. Press ? (when not typing in a box) for a short list of shortcuts.",
  },
  {
    q: "What are Tools?",
    a: "Read-only commands on the cloud machine—disk space, a process sample, socket summary, and a quick outbound ping. They help troubleshoot without changing anything.",
  },
] as const;

export default function HelpPage() {
  return (
    <>
      <PageHeader
        title="Help & FAQ"
        description="Plain-language answers and links to the main areas of the panel."
      >
        <InPlainEnglish>
          <p>
            If something fails, check <strong>Connection details</strong> first, then <strong>Diagnostics</strong>{" "}
            for SSH errors. <Link className="underline underline-offset-2" href="/dashboard">Home</Link> shows
            whether the link to your server works.
          </p>
        </InPlainEnglish>
      </PageHeader>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base">Quick links</CardTitle>
            <CardDescription>Main pages</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Link className="text-primary underline-offset-2 hover:underline" href="/dashboard">
              Home
            </Link>
            <Link className="text-primary underline-offset-2 hover:underline" href="/config">
              Server settings file
            </Link>
            <Link className="text-primary underline-offset-2 hover:underline" href="/marketplace">
              Marketplace
            </Link>
            <Link className="text-primary underline-offset-2 hover:underline" href="/mods">
              Mods
            </Link>
            <Link className="text-primary underline-offset-2 hover:underline" href="/logs">
              Logs
            </Link>
            <Link className="text-primary underline-offset-2 hover:underline" href="/diagnostics">
              Diagnostics
            </Link>
            <Link className="text-primary underline-offset-2 hover:underline" href="/tools">
              Tools
            </Link>
            <Link className="text-primary underline-offset-2 hover:underline" href="/settings">
              Connection details
            </Link>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base">Keyboard</CardTitle>
            <CardDescription>When focus is not in a text field</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">⌘</kbd>{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">K</kbd> or{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">Ctrl</kbd>{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">K</kbd> — jump menu
            </p>
            <p>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">?</kbd> — shortcut help
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Questions</h2>
        {faqs.map(({ q, a }) => (
          <Card key={q} className="rounded-2xl border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{q}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{a}</CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
