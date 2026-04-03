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
            The game reads a file named <strong>config.json</strong> on your cloud machine. “Load”
            downloads the current file; “Save” uploads your changes. If you’re unsure, use the form—only
            switch to raw JSON if you know what you’re doing.
          </p>
        </InPlainEnglish>
      </PageHeader>
      <ConfigEditor />
    </>
  );
}
