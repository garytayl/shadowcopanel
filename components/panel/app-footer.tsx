import packageJson from "../../package.json";

export function AppFooter() {
  return (
    <footer className="border-t border-border/60 px-4 py-3 text-center text-[11px] text-muted-foreground md:px-8">
      Reforger Control · v{packageJson.version} · Uptime checks:{" "}
      <span className="whitespace-nowrap font-mono text-[10px]">/api/health</span>
    </footer>
  );
}
