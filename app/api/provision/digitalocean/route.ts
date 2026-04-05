import { NextResponse } from "next/server";

import { buildReforgerBootstrapUserData } from "@/lib/provision/cloud-init";
import { createDoSshKey, createDroplet } from "@/lib/provision/digitalocean-client";
import { isDigitalOceanProvisionEnabled } from "@/lib/provision/digitalocean-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_IMAGE =
  process.env.DIGITALOCEAN_DEFAULT_IMAGE?.trim() || "ubuntu-22-04-x64";

function sanitizeName(s: string): string {
  return (
    s
      .trim()
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 253) || "reforger-server"
  );
}

export async function POST(req: Request) {
  if (!isDigitalOceanProvisionEnabled()) {
    return NextResponse.json(
      {
        error:
          "DigitalOcean provisioning is not configured. Set DIGITALOCEAN_TOKEN on the server.",
      },
      { status: 503 },
    );
  }

  let body: {
    label?: string;
    region?: string;
    size?: string;
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
      {
        error:
          "publicKey must be an OpenSSH public key line (starts with ssh-ed25519, ssh-rsa, …).",
      },
      { status: 400 },
    );
  }

  const region = String(body.region ?? "").trim();
  const size = String(body.size ?? "").trim();
  if (!region || !size) {
    return NextResponse.json(
      { error: "region and size are required." },
      { status: 400 },
    );
  }

  const image = String(body.image ?? DEFAULT_IMAGE).trim() || DEFAULT_IMAGE;
  const label = sanitizeName(String(body.label ?? "reforger"));
  const stamp = Date.now().toString(36);
  const sshKeyName = `reforger-panel-${stamp}`;
  const dropletName = `${label}-${stamp}`.slice(0, 253);

  try {
    const { id: sshKeyId } = await createDoSshKey({
      name: sshKeyName,
      publicKey,
    });

    const userData = buildReforgerBootstrapUserData("DigitalOcean", {
      user: "root",
      home: "/root",
    });

    const created = await createDroplet({
      name: dropletName,
      region,
      size,
      image,
      sshKeyIds: [sshKeyId],
      userData,
    });

    return NextResponse.json({
      digitaloceanDropletId: created.id,
      digitaloceanSshKeyId: sshKeyId,
      dropletName,
      status: created.status,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
