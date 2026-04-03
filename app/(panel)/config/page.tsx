import { PageHeader } from "@/components/panel/page-header";
import { ConfigEditor } from "@/components/config/config-editor";

export default function ConfigPage() {
  return (
    <>
      <PageHeader
        title="Config"
        description="Load, edit, and write the remote Reforger config.json over SFTP."
      />
      <ConfigEditor />
    </>
  );
}
