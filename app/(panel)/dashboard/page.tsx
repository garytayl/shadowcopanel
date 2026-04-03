import { PageHeader } from "@/components/panel/page-header";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live status, SSH health, and quick controls for your Reforger instance."
      />
      <DashboardClient />
    </>
  );
}
