import { NextResponse } from "next/server";

import { isHetznerProvisionEnabled } from "@/lib/provision/hetzner-env";
import { listHetznerLocations, listHetznerServerTypes } from "@/lib/provision/hetzner-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_IMAGE =
  process.env.HETZNER_DEFAULT_IMAGE?.trim() || "ubuntu-22.04";

export async function GET() {
  if (!isHetznerProvisionEnabled()) {
    return NextResponse.json({
      enabled: false,
      defaultImage: DEFAULT_IMAGE,
      locations: [] as { name: string; description: string }[],
      serverTypes: [] as { name: string; description: string; cores: number; memory: number }[],
    });
  }
  try {
    const [locations, serverTypes] = await Promise.all([
      listHetznerLocations(),
      listHetznerServerTypes(),
    ]);
    return NextResponse.json({
      enabled: true,
      defaultImage: DEFAULT_IMAGE,
      locations,
      serverTypes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { enabled: true, error: msg, defaultImage: DEFAULT_IMAGE, locations: [], serverTypes: [] },
      { status: 200 },
    );
  }
}
