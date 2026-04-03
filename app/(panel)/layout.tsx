import type { Metadata } from "next";

import { PanelShell } from "@/components/panel/panel-shell";

export const metadata: Metadata = {
  title: "Reforger Control",
  description:
    "Start, stop, and configure your Arma Reforger server from the browser—no AWS experience required.",
};

export const dynamic = "force-dynamic";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
