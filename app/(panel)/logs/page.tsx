import { InPlainEnglish } from "@/components/help/in-plain-english";
import { LogsViewer } from "@/components/logs/logs-viewer";
import { PageHeader } from "@/components/panel/page-header";

export default function LogsPage() {
  return (
    <>
      <PageHeader
        title="Logs"
        description="Read recent text output from your server—useful when the game won’t start or players report issues."
      >
        <InPlainEnglish title="What am I looking at?">
          <p>
            These are <strong>messages the server printed</strong> while running—errors, warnings, and
            startup notes. Use search and the quick filters to zoom in. “Download view” saves what you see
            on screen (after filters) to a file you can share with friends or support.
          </p>
        </InPlainEnglish>
      </PageHeader>
      <LogsViewer />
    </>
  );
}
