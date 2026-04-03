import { AppFooter } from "@/components/panel/app-footer";
import { GlobalAppChrome } from "@/components/panel/global-app-chrome";
import { Sidebar } from "@/components/panel/sidebar";

export function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-background lg:flex-row">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="app-bg-mesh absolute inset-0 opacity-90 dark:opacity-100" />
        <div className="app-bg-grid absolute inset-0" />
        <div className="app-bg-scanline absolute inset-0 hidden md:block" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background dark:from-background/60" />
      </div>
      <GlobalAppChrome />
      <Sidebar />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <main className="relative flex-1 p-4 md:p-6 lg:p-8">{children}</main>
        <AppFooter />
      </div>
    </div>
  );
}
