import { NextResponse } from "next/server";

import { getDroplet } from "@/lib/provision/digitalocean-client";
import { isDigitalOceanProvisionEnabled } from "@/lib/provision/digitalocean-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function publicIpv4(d: { networks?: { v4?: { ip_address: string; type: string }[] } }): string | null {
  const v4 = d.networks?.v4;
  if (!v4?.length) return null;
  const pub = v4.find((n) => n.type === "public");
  return pub?.ip_address ?? null;
}

export async function GET(_req: Request, ctx: Ctx) {
  if (!isDigitalOceanProvisionEnabled()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const { id: raw } = await ctx.params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const d = await getDroplet(id);
    return NextResponse.json({
      id: d.id,
      name: d.name,
      status: d.status,
      ipv4: publicIpv4(d),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
