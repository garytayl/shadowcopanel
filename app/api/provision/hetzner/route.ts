import { NextResponse } from "next/server";

import { buildReforgerBootstrapUserData } from "@/lib/provision/hetzner-bootstrap";
import {
  createHetznerServer,
  createHetznerSshKey,
} from "@/lib/provision/hetzner-client";
import { isHetznerProvisionEnabled } from "@/lib/provision/hetzner-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_IMAGE =
  process.env.HETZNER_DEFAULT_IMAGE?.trim() || "ubuntu-22.04";

function sanitizeName(s: string): string {
  return s
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63) || "reforger-server";
}

export async function POST(req: Request) {
  if (!isHetznerProvisionEnabled()) {
    return NextResponse.json(
      { error: "Hetzner provisioning is not configured. Set HETZNER_API_TOKEN on the server." },
      { status: 503 },
    );
  }

  let body: {
    label?: string;
    location?: string;
    serverType?: string;
    image?: string;
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
      { error: "publicKey must be an OpenSSH public key line (starts with ssh-ed25519, ssh-rsa, …)." },
      { status: 400 },
    );
  }

  const location = String(body.location ?? "").trim();
  const serverType = String(body.serverType ?? "").trim();
  if (!location || !serverType) {
    return NextResponse.json(
      { error: "location and serverType are required." },
      { status: 400 },
    );
  }

  const image = String(body.image ?? DEFAULT_IMAGE).trim() || DEFAULT_IMAGE;
  const label = sanitizeName(String(body.label ?? "reforger"));
  const stamp = Date.now().toString(36);
  const sshKeyName = `reforger-panel-${stamp}`;
  const serverName = `${label}-${stamp}`.slice(0, 63);

  try {
    const { id: sshKeyId } = await createHetznerSshKey({
      name: sshKeyName,
      publicKey,
    });

    const userData = buildReforgerBootstrapUserData();

    const created = await createHetznerServer({
      name: serverName,
      serverType,
      location,
      image,
      sshKeyIds: [sshKeyId],
      userData,
    });

    return NextResponse.json({
      hetznerServerId: created.id,
      hetznerSshKeyId: sshKeyId,
      serverName,
      status: created.status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
