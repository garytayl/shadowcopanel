import { InPlainEnglish } from "@/components/help/in-plain-english";
import { PageHeader } from "@/components/panel/page-header";
import { ToolsClient } from "@/components/tools/tools-client";

export default function ToolsPage() {
  return (
    <>
      <PageHeader
        title="Tools"
        description="Run read-only checks on your cloud server (disk, processes, network)."
      >
        <InPlainEnglish>
          <p>
            These buttons ask the rented machine for harmless reports—like checking how full the hard drive is.
            They do not change your game settings.
          </p>
        </InPlainEnglish>
      </PageHeader>
      <ToolsClient />
    </>
  );
}
