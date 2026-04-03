import Link from "next/link";

import { MarketplaceClient } from "@/components/marketplace/marketplace-client";
import { PageHeader } from "@/components/panel/page-header";

export default function MarketplacePage() {
  return (
    <>
      <PageHeader
        title="Marketplace"
        description={
          <span className="text-muted-foreground">
            Official Reforger Workshop catalog — same data as{" "}
            <Link
              className="text-foreground underline underline-offset-4 hover:text-primary"
              href="https://reforger.armaplatform.com/workshop"
              target="_blank"
              rel="noreferrer noopener"
            >
              reforger.armaplatform.com
            </Link>
            . Search runs on this app; edit your server stack on the right. For raw JSON use{" "}
            <Link className="text-foreground underline underline-offset-4 hover:text-primary" href="/mods">
              Mods
            </Link>
            .
          </span>
        }
      />
      <MarketplaceClient />
    </>
  );
}
