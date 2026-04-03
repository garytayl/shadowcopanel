import { InPlainEnglish } from "@/components/help/in-plain-english";
import { ConfigEditor } from "@/components/config/config-editor";
import { PageHeader } from "@/components/panel/page-header";

export default function ConfigPage() {
  return (
    <>
      <PageHeader
        title="Server settings file"
        description="Change how your Reforger server behaves—name, passwords, ports, and more."
      >
        <InPlainEnglish title="What you’re editing">
          <p>
            The game reads a file named <strong>config.json</strong> on your cloud machine. This page
            loads that file automatically when you open it; use “Load current file from server” to refresh
            after changes elsewhere. “Save” uploads your edits. If you’re unsure, use the form—only switch
            to raw JSON if you know what you’re doing.
          </p>
        </InPlainEnglish>
      </PageHeader>
      <ConfigEditor />
    </>
  );
}
