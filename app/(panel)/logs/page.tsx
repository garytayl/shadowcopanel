import { PageHeader } from "@/components/panel/page-header";
import { LogsViewer } from "@/components/logs/logs-viewer";

export default function LogsPage() {
  return (
    <>
      <PageHeader
        title="Logs"
        description="Tail recent server logs over SSH and filter for common failure signatures."
      />
      <LogsViewer />
    </>
  );
}
