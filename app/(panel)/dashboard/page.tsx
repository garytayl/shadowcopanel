import { InPlainEnglish } from "@/components/help/in-plain-english";
import { PageHeader } from "@/components/panel/page-header";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Home"
        description="See whether your Reforger server is running and run common tasks from the browser."
      >
        <InPlainEnglish>
          <p>
            Your game runs on a <strong>rented computer in the cloud</strong> (often called a “server” or
            “instance”). This website sends instructions to that machine so you don’t have to use a black
            terminal window. You don’t need to know Amazon or AWS names to use the buttons here.
          </p>
        </InPlainEnglish>
      </PageHeader>
      <DashboardClient />
    </>
  );
}
