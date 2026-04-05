import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { isAwsEc2ProvisionEnabledAsync } from "@/lib/provision/aws-env";
import { describeInstance } from "@/lib/provision/aws-ec2";
import { takeLaunchPrivateKey } from "@/lib/provision/provision-launch-keys";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/server-profiles/resolve";
import { upsertProfile } from "@/lib/server-profiles/store";
import type { ServerProfile } from "@/lib/server-profiles/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieOpts = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
  secure: process.env.NODE_ENV === "production",
};

function validatePrivateKey(s: string): boolean {
  const t = s.trim();
  return (
    t.includes("BEGIN OPENSSH PRIVATE KEY") ||
    t.includes("BEGIN RSA PRIVATE KEY") ||
    t.includes("BEGIN EC PRIVATE KEY")
  );
}

export async function POST(req: Request) {
  if (!(await isAwsEc2ProvisionEnabledAsync())) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  let body: {
    awsInstanceId?: string;
    awsRegion?: string;
    profileName?: string;
    privateKey?: string;
    /** When true, use the server-stored key from one-click launch (Redis / memory). */
    useStoredKey?: boolean;
    activate?: boolean;
    checkPort?: number | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const instanceId = String(body.awsInstanceId ?? "").trim();
  if (!instanceId.startsWith("i-")) {
    return NextResponse.json({ error: "awsInstanceId required" }, { status: 400 });
  }

  const region = String(body.awsRegion ?? "").trim();
  if (!region) {
    return NextResponse.json({ error: "awsRegion required" }, { status: 400 });
  }

  let privateKey = String(body.privateKey ?? "").trim();
  if (!privateKey && body.useStoredKey === true) {
    const stored = await takeLaunchPrivateKey(instanceId);
    if (stored) privateKey = stored;
  }

  if (!validatePrivateKey(privateKey)) {
    return NextResponse.json(
      {
        error:
          "Missing private key. Use one-click launch, or paste a PEM private key in the request.",
      },
      { status: 400 },
    );
  }

  const profileName =
    String(body.profileName ?? "Game server").trim() || "Game server";

  let d;
  try {
    d = await describeInstance(region, instanceId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (d.state !== "running") {
    return NextResponse.json(
      {
        error: `Instance is not running yet (state: ${d.state ?? "unknown"}). Wait and try again.`,
      },
      { status: 409 },
    );
  }

  const ipv4 = d.publicIp;
  if (!ipv4) {
    return NextResponse.json(
      { error: "Instance has no public IPv4 yet (check subnet / Elastic IP)." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const checkPort =
    body.checkPort != null && Number.isFinite(body.checkPort) && body.checkPort > 0
      ? Math.floor(Number(body.checkPort))
      : null;

  const profile: ServerProfile = {
    id,
    name: profileName,
    createdAt: now,
    updatedAt: now,
    host: ipv4,
    port: 22,
    user: "ubuntu",
    privateKeyPath: null,
    privateKeyInline: privateKey,
    serverPath: "/home/ubuntu/arma-reforger",
    configPath: "/home/ubuntu/arma-reforger/config.json",
    tmuxSession: "reforger",
    serverCommand: './ArmaReforgerServer -config ./config.json -maxFPS 60',
    instanceNotes: `Amazon EC2 · ${instanceId} · ${region}`,
    logGlob: null,
    checkPort,
  };

  await upsertProfile(profile);

  const activate = body.activate !== false;
  const res = NextResponse.json({
    ok: true,
    profileId: id,
    host: ipv4,
    activated: activate,
  });

  if (activate) {
    res.cookies.set(ACTIVE_PROFILE_COOKIE, id, cookieOpts);
  }

  return res;
}
