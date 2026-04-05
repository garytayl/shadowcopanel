import { NextResponse } from "next/server";

import {
  deleteStoredAwsCredentialsAsync,
  maskAccessKeyId,
  readStoredAwsCredentialsAsync,
  writeStoredAwsCredentialsAsync,
} from "@/lib/provision/aws-credentials-store";
import {
  getAwsDefaultRegionAsync,
  getAwsProvisionSgCidrAsync,
  hasAwsCredentialsInEnvironment,
  hasAwsCredentialsStoredAsync,
  isAwsEc2ProvisionEnabledAsync,
} from "@/lib/provision/aws-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const env = hasAwsCredentialsInEnvironment();
  const stored = await hasAwsCredentialsStoredAsync();
  const disk = await readStoredAwsCredentialsAsync();
  const configured = await isAwsEc2ProvisionEnabledAsync();
  const source: "env" | "file" | "none" = env ? "env" : stored ? "file" : "none";

  let maskedAccessKeyId: string | null = null;
  if (env) {
    const id = process.env.AWS_ACCESS_KEY_ID?.trim();
    maskedAccessKeyId = id ? maskAccessKeyId(id) : null;
  } else if (disk) {
    maskedAccessKeyId = maskAccessKeyId(disk.accessKeyId);
  }

  return NextResponse.json({
    configured,
    source,
    region: await getAwsDefaultRegionAsync(),
    sgCidr: await getAwsProvisionSgCidrAsync(),
    maskedAccessKeyId,
    /** True when credentials are not coming from process env — app may save to Redis/disk. */
    canSaveCredentialsInApp: !env,
    hasSavedFile: stored,
    envOverrides:
      env && stored
        ? "Environment variables are in use; saved credentials also exist but are ignored until env vars are removed."
        : null,
  });
}

export async function POST(req: Request) {
  if (hasAwsCredentialsInEnvironment()) {
    return NextResponse.json(
      {
        error:
          "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in the environment. Remove them to use in-app credentials, or keep using env vars.",
      },
      { status: 409 },
    );
  }

  let body: {
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    sessionToken?: string | null;
    sgCidr?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accessKeyId = String(body.accessKeyId ?? "").trim();
  const secretAccessKey = String(body.secretAccessKey ?? "").trim();
  const region = String(body.region ?? "").trim();
  if (!accessKeyId || !secretAccessKey || !region) {
    return NextResponse.json(
      { error: "accessKeyId, secretAccessKey, and region are required." },
      { status: 400 },
    );
  }

  const sessionToken =
    body.sessionToken != null && String(body.sessionToken).trim() !== ""
      ? String(body.sessionToken).trim()
      : null;
  const sgCidr =
    body.sgCidr != null && String(body.sgCidr).trim() !== ""
      ? String(body.sgCidr).trim()
      : null;

  await writeStoredAwsCredentialsAsync({
    accessKeyId,
    secretAccessKey,
    region,
    sessionToken,
    sgCidr,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  if (hasAwsCredentialsInEnvironment()) {
    return NextResponse.json(
      {
        error:
          "Cannot clear saved credentials while environment credentials are set. Remove AWS_* from the environment first.",
      },
      { status: 409 },
    );
  }
  const ok = await deleteStoredAwsCredentialsAsync();
  return NextResponse.json({ ok, removed: ok });
}
