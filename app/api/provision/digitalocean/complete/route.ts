import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { deleteDoSshKey, getDroplet } from "@/lib/provision/digitalocean-client";
import { isDigitalOceanProvisionEnabled } from "@/lib/provision/digitalocean-env";
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

function publicIpv4(d: { networks?: { v4?: { ip_address: string; type: string }[] } }): string | null {
  const v4 = d.networks?.v4;
  if (!v4?.length) return null;
  const pub = v4.find((n) => n.type === "public");
  return pub?.ip_address ?? null;
}

export async function POST(req: Request) {
  if (!isDigitalOceanProvisionEnabled()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  let body: {
    digitaloceanDropletId?: number;
    digitaloceanSshKeyId?: number;
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

  const dropletId = Number(body.digitaloceanDropletId);
  if (!Number.isFinite(dropletId)) {
    return NextResponse.json({ error: "digitaloceanDropletId required" }, { status: 400 });
  }

  const privateKey = String(body.privateKey ?? "").trim();
  if (!validatePrivateKey(privateKey)) {
    return NextResponse.json(
      { error: "privateKey must be a PEM / OpenSSH private key block." },
      { status: 400 },
    );
  }

  const profileName =
    String(body.profileName ?? "DigitalOcean droplet").trim() || "DigitalOcean droplet";
  const sshKeyId =
    body.digitaloceanSshKeyId != null && Number.isFinite(body.digitaloceanSshKeyId)
      ? Number(body.digitaloceanSshKeyId)
      : null;

  let droplet;
  try {
    droplet = await getDroplet(dropletId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (droplet.status !== "active") {
    return NextResponse.json(
      {
        error: `Droplet is not active yet (status: ${droplet.status}). Wait and try again.`,
      },
      { status: 409 },
    );
  }

  const ipv4 = publicIpv4(droplet);
  if (!ipv4) {
    return NextResponse.json(
      { error: "Droplet has no public IPv4 yet." },
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
    user: "root",
    privateKeyPath: null,
    privateKeyInline: privateKey,
    serverPath: "/root/arma-reforger",
    configPath: "/root/arma-reforger/config.json",
    tmuxSession: "reforger",
    serverCommand: './ArmaReforgerServer -config ./config.json -maxFPS 60',
    instanceNotes: `DigitalOcean · droplet #${dropletId} · ${droplet.name}`,
    logGlob: null,
    checkPort,
  };

  await upsertProfile(profile);

  if (sshKeyId != null) {
    try {
      await deleteDoSshKey(sshKeyId);
    } catch {
      /* non-fatal */
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
