import { NextResponse } from "next/server";

import { sshExec } from "@/lib/ssh/client";
import { profileToServerEnv } from "@/lib/server-profiles/resolve";
import { getProfileById } from "@/lib/server-profiles/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { profileId?: string };
  try {
    body = (await req.json()) as { profileId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = String(body.profileId ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "profileId required" }, { status: 400 });
  }
  const profile = await getProfileById(id);
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const env = profileToServerEnv(profile);
  if (!env) {
    return NextResponse.json(
      { error: "Profile is missing host, user, or a private key" },
      { status: 400 },
    );
  }
  const start = Date.now();
  try {
    const r = await sshExec("echo reforger-panel-ok", env);
    const roundTripMs = Date.now() - start;
    if (r.code !== 0) {
      return NextResponse.json({
        ok: false,
        message: r.stderr || r.stdout || "SSH command failed",
      });
    }
    return NextResponse.json({ ok: true, roundTripMs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg });
  }
}
