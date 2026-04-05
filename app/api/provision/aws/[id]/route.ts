import { NextResponse } from "next/server";

import { describeInstance } from "@/lib/provision/aws-ec2";
import { isAwsEc2ProvisionEnabled } from "@/lib/provision/aws-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  if (!isAwsEc2ProvisionEnabled()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { id: instanceId } = await ctx.params;
  if (!instanceId || !instanceId.startsWith("i-")) {
    return NextResponse.json({ error: "Invalid instance id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const region = url.searchParams.get("region")?.trim();
  if (!region) {
    return NextResponse.json(
      { error: "Query parameter region= is required (same region used when creating the instance)." },
      { status: 400 },
    );
  }

  try {
    const d = await describeInstance(region, instanceId);
    return NextResponse.json({
      id: instanceId,
      name: d.name,
      status: d.state,
      ipv4: d.publicIp,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
