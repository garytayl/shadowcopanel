import { InPlainEnglish } from "@/components/help/in-plain-english";
import { ModsManager } from "@/components/mods/mods-manager";
import { PageHeader } from "@/components/panel/page-header";

export default function ModsPage() {
  return (
    <>
      <PageHeader
        title="Mods"
        description="Choose which workshop mods the server loads and in what order."
      >
        <InPlainEnglish title="Why order matters">
          <p>
            Mods load <strong>top to bottom</strong>. Wrong order can cause crashes or missing content. Add
            a few at a time and check the Logs page if something breaks. Saving writes the list back to your
            server’s config file.
          </p>
        </InPlainEnglish>
      </PageHeader>
      <ModsManager />
    </>
  );
}
