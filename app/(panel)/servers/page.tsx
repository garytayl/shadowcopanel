import { PageHeader } from "@/components/panel/page-header";
import { InPlainEnglish } from "@/components/help/in-plain-english";
import { ServersClient } from "@/components/servers/servers-client";

export const runtime = "nodejs";

export default function ServersPage() {
  return (
    <>
      <PageHeader
        title="Server setup"
        description="Point this panel at the machine where Reforger runs—an old PC at home, a small game host, or anything you can SSH into. AWS is optional."
      >
        <InPlainEnglish title="How it works">
          <p>
            You only need an IP or hostname and an SSH key for <strong className="text-foreground">your</strong>{" "}
            server—same as if a friend helped you over Discord. The <strong className="text-foreground">active server</strong>{" "}
            in the sidebar controls Home, Config, Mods, Marketplace, and Logs for everyone using this site. Details stay
            on the computer that runs this app, not in players&apos; browsers. Scroll down only if your host offers
            one-click cloud servers.
          </p>
        </InPlainEnglish>
      </PageHeader>
      <ServersClient />
    </>
  );
}
