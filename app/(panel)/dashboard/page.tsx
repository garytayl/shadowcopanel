import Link from "next/link";

import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { PageHeader } from "@/components/panel/page-header";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Live status and controls.</span>
            <Link href="/help" className="text-primary underline-offset-4 hover:underline">
              Help
            </Link>
          </span>
        }
      />
      <DashboardClient />
    </>
  );
}
