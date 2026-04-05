import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { deleteHetznerSshKey, getHetznerServer } from "@/lib/provision/hetzner-client";
import { isHetznerProvisionEnabled } from "@/lib/provision/hetzner-env";
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
  if (!isHetznerProvisionEnabled()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  let body: {
    hetznerServerId?: number;
    hetznerSshKeyId?: number;
    profileName?: string;
    privateKey?: string;
    activate?: boolean;
    checkPort?: number | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const serverId = Number(body.hetznerServerId);
  if (!Number.isFinite(serverId)) {
    return NextResponse.json({ error: "hetznerServerId required" }, { status: 400 });
  }

  const privateKey = String(body.privateKey ?? "").trim();
  if (!validatePrivateKey(privateKey)) {
    return NextResponse.json(
      { error: "privateKey must be a PEM / OpenSSH private key block." },
      { status: 400 },
    );
  }

  const profileName = String(body.profileName ?? "Hetzner server").trim() || "Hetzner server";
  const sshKeyId =
    body.hetznerSshKeyId != null && Number.isFinite(body.hetznerSshKeyId)
      ? Number(body.hetznerSshKeyId)
      : null;

  let server;
  try {
    server = await getHetznerServer(serverId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (server.status !== "running") {
    return NextResponse.json(
      {
        error: `Server is not running yet (status: ${server.status}). Wait and try again.`,
      },
      { status: 409 },
    );
  }

  const ipv4 = server.public_net?.ipv4?.blocked
    ? null
    : (server.public_net?.ipv4?.ip ?? null);
  if (!ipv4) {
    return NextResponse.json(
      { error: "Server has no public IPv4 yet." },
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
    instanceNotes: `Hetzner Cloud · server #${serverId} · ${server.name}`,
    logGlob: null,
    checkPort,
  };

  await upsertProfile(profile);

  if (sshKeyId != null) {
    try {
      await deleteHetznerSshKey(sshKeyId);
    } catch {
      /* key may already be deleted; non-fatal */
    }
  }

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
