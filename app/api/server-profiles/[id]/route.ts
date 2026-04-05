import { NextResponse } from "next/server";

import { deleteProfile, getProfileById, upsertProfile } from "@/lib/server-profiles/store";
import type { ServerProfile } from "@/lib/server-profiles/types";
import { toPublicProfile } from "@/lib/server-profiles/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const p = await getProfileById(id);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ profile: toPublicProfile(p) });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const existing = await getProfileById(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name != null ? String(body.name).trim() : existing.name;
  const host = body.host != null ? String(body.host).trim() : existing.host;
  const user = body.user != null ? String(body.user).trim() : existing.user;
  const port = body.port != null ? Number(body.port) : existing.port;
  if (!name || !host || !user || !Number.isFinite(port) || port < 1 || port > 65535) {
    return NextResponse.json({ error: "Invalid name, host, user, or port" }, { status: 400 });
  }

  let privateKeyPath =
    body.privateKeyPath !== undefined
      ? body.privateKeyPath != null && String(body.privateKeyPath).trim() !== ""
        ? String(body.privateKeyPath).trim()
        : null
      : existing.privateKeyPath;
  let privateKeyInline =
    body.privateKeyInline !== undefined
      ? body.privateKeyInline != null && String(body.privateKeyInline).trim() !== ""
        ? String(body.privateKeyInline).trim()
        : null
      : existing.privateKeyInline;

  if (!privateKeyPath && !privateKeyInline) {
    return NextResponse.json(
      { error: "A private key path or inline key is required" },
      { status: 400 },
    );
  }

  const serverPath =
    body.serverPath != null ? String(body.serverPath).trim() : existing.serverPath;
  const configPath =
    body.configPath != null ? String(body.configPath).trim() : existing.configPath;
  const tmuxSession =
    body.tmuxSession != null ? String(body.tmuxSession).trim() : existing.tmuxSession;
  const serverCommand =
    body.serverCommand != null ? String(body.serverCommand).trim() : existing.serverCommand;
  const instanceNotes =
    body.instanceNotes != null ? String(body.instanceNotes).trim() : existing.instanceNotes;
  const logGlob =
    body.logGlob !== undefined
      ? body.logGlob != null && String(body.logGlob).trim() !== ""
        ? String(body.logGlob).trim()
        : null
      : existing.logGlob;

  let checkPort: number | null = existing.checkPort;
  if (body.checkPort !== undefined) {
    if (body.checkPort === null || body.checkPort === "") {
      checkPort = null;
    } else {
      const n = Number(body.checkPort);
      if (Number.isFinite(n) && n > 0 && n < 65536) checkPort = n;
    }
  }

  const next: ServerProfile = {
    ...existing,
    name,
    host,
    user,
    port,
    privateKeyPath,
    privateKeyInline,
    serverPath,
    configPath,
    tmuxSession,
    serverCommand,
    instanceNotes,
    logGlob,
    checkPort,
    updatedAt: new Date().toISOString(),
  };

  await upsertProfile(next);
  return NextResponse.json({ profile: toPublicProfile(next) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const ok = await deleteProfile(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
