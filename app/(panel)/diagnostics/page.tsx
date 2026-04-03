import { InPlainEnglish } from "@/components/help/in-plain-english";
import { DiagnosticsClient } from "@/components/diagnostics/diagnostics-client";
import { PageHeader } from "@/components/panel/page-header";

export default function DiagnosticsPage() {
  return (
    <>
      <PageHeader
        title="Diagnostics"
        description="Extra technical details from your cloud machine—use this when something’s wrong or someone asks for a “screenshot of the stats.”"
      >
        <InPlainEnglish title="Do I need this page?">
          <p>
            Most days you can stay on <strong>Home</strong>. Use Diagnostics when you need proof the link to
            your server works, or when you’re troubleshooting with a friend. You don’t need to understand
            every line—just whether things look healthy or errors appear at the top.
          </p>
        </InPlainEnglish>
      </PageHeader>
      <DiagnosticsClient />
    </>
  );
}
