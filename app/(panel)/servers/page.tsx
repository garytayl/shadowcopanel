import { PageHeader } from "@/components/panel/page-header";
import { InPlainEnglish } from "@/components/help/in-plain-english";
import { ServersClient } from "@/components/servers/servers-client";

export const runtime = "nodejs";

export default function ServersPage() {
  return (
    <>
      <PageHeader
        title="Servers"
        description="Save SSH connections and switch which machine the panel controls—without editing deployment env vars each time."
      >
        <InPlainEnglish title="What this is for">
          <p>
            Each entry is a <strong>full connection profile</strong>: where to SSH, which folder holds the
            game, and your private key. Pick one as <strong>active</strong> and every dashboard action uses
            it. Your key stays on the server that runs Next.js, not in the browser.
          </p>
        </InPlainEnglish>
      </PageHeader>
      <ServersClient />
    </>
  );
}
