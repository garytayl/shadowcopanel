import { NextResponse } from "next/server";

import { buildReforgerBootstrapUserData } from "@/lib/provision/cloud-init";
import { launchUbuntuWithSsh } from "@/lib/provision/aws-ec2";
import { isAwsEc2ProvisionEnabled } from "@/lib/provision/aws-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeToken(s: string): string {
  return s
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 240);
}

export async function POST(req: Request) {
  if (!isAwsEc2ProvisionEnabled()) {
    return NextResponse.json(
      {
        error:
          "AWS EC2 provisioning is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (and optional AWS_REGION) on the server.",
      },
      { status: 503 },
    );
  }

  let body: {
    label?: string;
    region?: string;
    instanceType?: string;
    publicKey?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const publicKey = String(body.publicKey ?? "").trim();
  if (!publicKey.startsWith("ssh-")) {
    return NextResponse.json(
      {
        error:
          "publicKey must be an OpenSSH public key line (starts with ssh-ed25519, ssh-rsa, …).",
      },
      { status: 400 },
    );
  }

  const region = String(body.region ?? "").trim();
  const instanceType = String(body.instanceType ?? "").trim();
  if (!region || !instanceType) {
    return NextResponse.json(
      { error: "region and instanceType are required." },
      { status: 400 },
    );
  }

  const label = sanitizeToken(String(body.label ?? "reforger")) || "reforger";
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const keyPairName = sanitizeToken(`reforger-key-${stamp}`).slice(0, 255);
  const sgName = sanitizeToken(`reforger-sg-${stamp}`).slice(0, 255);
  const instanceName = `${label}-${stamp}`.slice(0, 255);

  const userData = buildReforgerBootstrapUserData("Amazon EC2", {
    user: "ubuntu",
    home: "/home/ubuntu",
  });

  try {
    const launched = await launchUbuntuWithSsh({
      region,
      instanceType,
      publicKeyMaterial: publicKey,
      keyPairName,
      securityGroupName: sgName,
      userData,
      instanceName,
    });

    return NextResponse.json({
      awsInstanceId: launched.instanceId,
      awsRegion: region,
      status: launched.state,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
