import { AppFooter } from "@/components/panel/app-footer";
import { GlobalAppChrome } from "@/components/panel/global-app-chrome";
import { Sidebar } from "@/components/panel/sidebar";

export function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-background lg:flex-row">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="app-bg-mesh absolute inset-0 opacity-90 dark:opacity-100" />
        <div className="app-bg-grid absolute inset-0" />
        <div className="app-bg-scanline absolute inset-0 hidden md:block" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background dark:from-background/60" />
        <div className="app-noise absolute inset-0 hidden md:block" />
      </div>
      <GlobalAppChrome />
      <Sidebar />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <a
          href="#main-content"
          className="fixed top-0 left-[max(0.75rem,env(safe-area-inset-left))] z-[100] -translate-y-full rounded-b-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-md transition-transform focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Skip to main content
        </a>
        <main
          id="main-content"
          tabIndex={-1}
          className="app-main-frame relative flex-1 pt-4 outline-none safe-area-x safe-area-b md:pt-6 md:pb-6 lg:px-8 lg:pt-8 xl:p-10"
        >
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
