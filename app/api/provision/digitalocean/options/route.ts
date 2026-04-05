import { NextResponse } from "next/server";

import {
  listDoRegions,
  listDoSizes,
} from "@/lib/provision/digitalocean-client";
import { isDigitalOceanProvisionEnabled } from "@/lib/provision/digitalocean-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_IMAGE =
  process.env.DIGITALOCEAN_DEFAULT_IMAGE?.trim() || "ubuntu-22-04-x64";

export async function GET() {
  if (!isDigitalOceanProvisionEnabled()) {
    return NextResponse.json({
      enabled: false,
      defaultImage: DEFAULT_IMAGE,
      regions: [] as { slug: string; name: string }[],
      sizes: [] as { slug: string; description: string; vcpus: number; memory: number }[],
    });
  }
  try {
    const [regions, sizes] = await Promise.all([listDoRegions(), listDoSizes()]);
    return NextResponse.json({
      enabled: true,
      defaultImage: DEFAULT_IMAGE,
      regions,
      sizes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        enabled: true,
        error: msg,
        defaultImage: DEFAULT_IMAGE,
        regions: [],
        sizes: [],
      },
      { status: 200 },
    );
  }
}
