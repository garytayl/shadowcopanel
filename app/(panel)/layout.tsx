import type { Metadata } from "next";

import { PanelShell } from "@/components/panel/panel-shell";
import { getPublicServerSettingsResolved } from "@/lib/server-profiles/public-settings";
import type { ActiveServerPanelContext } from "@/lib/types/active-server";

export const metadata: Metadata = {
  title: "Reforger Control",
  description:
    "Start, stop, and configure your Arma Reforger server from the browser—built for friends, not cloud experts.",
};

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const s = await getPublicServerSettingsResolved();
  const activeServer: ActiveServerPanelContext = {
    configured: s.configured,
    host: s.host,
    port: s.port,
    user: s.user,
    activeProfileId: s.activeProfileId,
    activeProfileName: s.activeProfileName,
    connectionSource: s.connectionSource,
  };
  return <PanelShell activeServer={activeServer}>{children}</PanelShell>;
}
