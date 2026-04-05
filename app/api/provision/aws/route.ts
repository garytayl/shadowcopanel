import { NextResponse } from "next/server";
import { utils } from "ssh2";

import { buildReforgerBootstrapUserData } from "@/lib/provision/cloud-init";
import { launchUbuntuWithSsh } from "@/lib/provision/aws-ec2";
import { isAwsEc2ProvisionEnabledAsync } from "@/lib/provision/aws-env";
import {
  canUseServerGeneratedKeysOnThisHost,
  storeLaunchPrivateKey,
} from "@/lib/provision/provision-launch-keys";

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
  if (!(await isAwsEc2ProvisionEnabledAsync())) {
    return NextResponse.json(
      {
        error:
          "AWS is not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY on this host (Vercel env), or save keys in Server setup.",
      },
      { status: 503 },
    );
  }

  let body: {
    label?: string;
    region?: string;
    instanceType?: string;
    publicKey?: string;
    /** If true (default when publicKey omitted), server generates SSH keys — no pasting. */
    autoGenerateKeys?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const region = String(body.region ?? "").trim();
  const instanceType = String(body.instanceType ?? "").trim();
  if (!region || !instanceType) {
    return NextResponse.json(
      { error: "region and instanceType are required." },
      { status: 400 },
    );
  }

  const publicKeyIn = String(body.publicKey ?? "").trim();
  if (publicKeyIn.length > 0 && !publicKeyIn.startsWith("ssh-")) {
    return NextResponse.json(
      {
        error:
          "Public key must be a full OpenSSH line starting with ssh-ed25519 or ssh-rsa — or leave empty for automatic keys.",
      },
      { status: 400 },
    );
  }

  const manualKey = publicKeyIn.startsWith("ssh-");

  let publicKeyMaterial: string;
  let privateKeyForLater: string | null = null;

  if (manualKey) {
    publicKeyMaterial = publicKeyIn;
  } else {
    if (!canUseServerGeneratedKeysOnThisHost()) {
      return NextResponse.json(
        {
          error:
            "One-click launch needs Upstash Redis on Vercel. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or paste your own SSH keys (advanced).",
        },
        { status: 503 },
      );
    }
    const keys = utils.generateKeyPairSync("ed25519");
    publicKeyMaterial = keys.public;
    privateKeyForLater = keys.private;
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
      publicKeyMaterial,
      keyPairName,
      securityGroupName: sgName,
      userData,
      instanceName,
    });

    if (privateKeyForLater) {
      await storeLaunchPrivateKey(launched.instanceId, privateKeyForLater);
    }

    return NextResponse.json({
      awsInstanceId: launched.instanceId,
      awsRegion: region,
      status: launched.state,
      usedAutoKeys: Boolean(privateKeyForLater),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
