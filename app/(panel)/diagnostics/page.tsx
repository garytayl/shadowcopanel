import { PageHeader } from "@/components/panel/page-header";
import { DiagnosticsClient } from "@/components/diagnostics/diagnostics-client";

export default function DiagnosticsPage() {
  return (
    <>
      <PageHeader
        title="Diagnostics"
        description="Remote kernel, uptime, disk, load, tmux, and SSH latency in one place."
      />
      <DiagnosticsClient />
    </>
  );
}
