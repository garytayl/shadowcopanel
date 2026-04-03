import type { Metadata } from "next";

import { PanelShell } from "@/components/panel/panel-shell";

export const metadata: Metadata = {
  title: "Reforger Control Panel",
  description: "Manage your Arma Reforger dedicated server over SSH",
};

export const dynamic = "force-dynamic";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
