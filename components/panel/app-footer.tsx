import packageJson from "../../package.json";

export function AppFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-border/60 bg-gradient-to-t from-muted/30 to-transparent px-4 py-3 text-center text-[11px] text-muted-foreground motion-safe:shadow-[0_-12px_40px_-20px_color-mix(in_oklch,var(--primary),transparent_70%)] md:px-8">
      <div
        aria-hidden
        className="ui-shimmer-border pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"
      />
      <p className="relative">
        Reforger Control · v{packageJson.version} · Uptime checks:{" "}
        <span className="whitespace-nowrap font-mono text-[10px] text-primary/90">/api/health</span>
      </p>
    </footer>
  );
}
