import { PageHeader } from "@/components/panel/page-header";
import { InPlainEnglish } from "@/components/help/in-plain-english";
import { ServersClient } from "@/components/servers/servers-client";

export const runtime = "nodejs";

export default function ServersPage() {
  return (
    <>
      <PageHeader
        title="Server setup"
        description="Connect this panel to your game machine, or launch a new one from here—no cloud console required for day-to-day use."
      >
        <InPlainEnglish title="How it works">
          <p>
            Choose which machine the panel controls, then use Dashboard and Config as usual. Connection
            details are stored on the server that runs this app—not in visitors&apos; browsers.
          </p>
        </InPlainEnglish>
      </PageHeader>
      <ServersClient />
    </>
  );
}
