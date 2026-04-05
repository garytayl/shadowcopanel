import { NextResponse } from "next/server";

import {
  listAwsInstanceTypesForUi,
  listAwsRegions,
} from "@/lib/provision/aws-ec2";
import { getAwsDefaultRegion, isAwsEc2ProvisionEnabled } from "@/lib/provision/aws-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAwsEc2ProvisionEnabled()) {
    return NextResponse.json({
      enabled: false,
      defaultRegion: getAwsDefaultRegion(),
      regions: [] as { id: string; name: string }[],
      instanceTypes: listAwsInstanceTypesForUi(),
    });
  }
  try {
    const regions = await listAwsRegions();
    return NextResponse.json({
      enabled: true,
      defaultRegion: getAwsDefaultRegion(),
      regions,
      instanceTypes: listAwsInstanceTypesForUi(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        enabled: true,
        error: msg,
        defaultRegion: getAwsDefaultRegion(),
        regions: [],
        instanceTypes: listAwsInstanceTypesForUi(),
      },
      { status: 200 },
    );
  }
}
