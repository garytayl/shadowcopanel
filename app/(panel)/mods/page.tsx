import { PageHeader } from "@/components/panel/page-header";
import { ModsManager } from "@/components/mods/mods-manager";

export default function ModsPage() {
  return (
    <>
      <PageHeader
        title="Mods"
        description="Edit the mods array on the remote config. Reorder affects load order."
      />
      <ModsManager />
    </>
  );
}
