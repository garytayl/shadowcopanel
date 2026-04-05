import { NextResponse } from "next/server";

import { getHetznerServer } from "@/lib/provision/hetzner-client";
import { isHetznerProvisionEnabled } from "@/lib/provision/hetzner-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  if (!isHetznerProvisionEnabled()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const { id: raw } = await ctx.params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const s = await getHetznerServer(id);
    const ipv4 = s.public_net?.ipv4?.blocked
      ? null
      : (s.public_net?.ipv4?.ip ?? null);
    return NextResponse.json({
      id: s.id,
      name: s.name,
      status: s.status,
      ipv4,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
