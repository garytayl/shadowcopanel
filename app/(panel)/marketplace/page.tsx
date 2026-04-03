import Link from "next/link";
import { InPlainEnglish } from "@/components/help/in-plain-english";
import { MarketplaceClient } from "@/components/marketplace/marketplace-client";
import { PageHeader } from "@/components/panel/page-header";

export default function MarketplacePage() {
  return (
    <>
      <PageHeader
        title="Marketplace"
        description="Browse the official Reforger Workshop and compose your server mod stack in one place."
      >
        <InPlainEnglish>
          <p>
            This is the <strong>same public catalog</strong> as{" "}
            <Link
              className="font-medium text-foreground underline underline-offset-2"
              href="https://reforger.armaplatform.com/workshop"
              target="_blank"
              rel="noreferrer noopener"
            >
              reforger.armaplatform.com/workshop
            </Link>
            —not Steam. Searching runs on this app&apos;s server (your browser never talks to the workshop
            directly). For raw rows and JSON, use{" "}
            <Link className="font-medium text-foreground underline underline-offset-2" href="/mods">
              Mods
            </Link>
            .
          </p>
        </InPlainEnglish>
      </PageHeader>
      <MarketplaceClient />
    </>
  );
}
