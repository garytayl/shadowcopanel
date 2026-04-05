import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { ACTIVE_PROFILE_COOKIE } from "@/lib/server-profiles/resolve";
import { readProfilesFromDisk, upsertProfile } from "@/lib/server-profiles/store";
import type { ServerProfile } from "@/lib/server-profiles/types";
import { toPublicProfile } from "@/lib/server-profiles/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieOpts = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
  secure: process.env.NODE_ENV === "production",
};

function parseBody(body: unknown): Partial<ServerProfile> | null {
  if (body == null || typeof body !== "object") return null;
  return body as Partial<ServerProfile>;
}

function coerceProfile(
  input: Partial<ServerProfile>,
  id: string,
  now: string,
): ServerProfile | null {
  const name = String(input.name ?? "").trim();
  const host = String(input.host ?? "").trim();
  const user = String(input.user ?? "").trim();
  const port = Number(input.port ?? 22);
  if (!name || !host || !user || !Number.isFinite(port) || port < 1 || port > 65535) {
    return null;
  }
  const privateKeyPath =
    input.privateKeyPath != null && String(input.privateKeyPath).trim() !== ""
      ? String(input.privateKeyPath).trim()
      : null;
  const privateKeyInline =
    input.privateKeyInline != null && String(input.privateKeyInline).trim() !== ""
      ? String(input.privateKeyInline).trim()
      : null;
  if (!privateKeyPath && !privateKeyInline) {
    return null;
  }
  const serverPath = String(input.serverPath ?? "/home/ubuntu/arma-reforger").trim();
  const configPath = String(
    input.configPath ?? "/home/ubuntu/arma-reforger/config.json",
  ).trim();
  const tmuxSession = String(input.tmuxSession ?? "reforger").trim();
  const serverCommand = String(
    input.serverCommand ?? './ArmaReforgerServer -config ./config.json -maxFPS 60',
  ).trim();
  const instanceNotes = String(input.instanceNotes ?? "").trim();
  const logGlob =
    input.logGlob != null && String(input.logGlob).trim() !== ""
      ? String(input.logGlob).trim()
      : null;
  let checkPort: number | null = null;
  if (input.checkPort != null && String(input.checkPort).trim() !== "") {
    const n = Number(input.checkPort);
    if (Number.isFinite(n) && n > 0 && n < 65536) checkPort = n;
  }
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    host,
    port,
    user,
    privateKeyPath,
    privateKeyInline,
    serverPath,
    configPath,
    tmuxSession,
    serverCommand,
    instanceNotes,
    logGlob,
    checkPort,
  };
}

export async function GET() {
  const list = await readProfilesFromDisk();
  let activeProfileId: string | null = null;
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    activeProfileId = jar.get(ACTIVE_PROFILE_COOKIE)?.value?.trim() ?? null;
  } catch {
    activeProfileId = null;
  }

  const ids = new Set(list.map((p) => p.id));
  if (activeProfileId && !ids.has(activeProfileId)) {
    const res = NextResponse.json({
      profiles: list.map(toPublicProfile),
      activeProfileId: null,
    });
    res.cookies.set(ACTIVE_PROFILE_COOKIE, "", { ...cookieOpts, maxAge: 0 });
    return res;
  }

  return NextResponse.json({
    profiles: list.map(toPublicProfile),
    activeProfileId,
  });
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const partial = parseBody(json);
  if (!partial) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const id = randomUUID();
  const profile = coerceProfile(partial, id, now);
  if (!profile) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: name, host, user, port, and a private key (inline or path).",
      },
      { status: 400 },
    );
  }
  await upsertProfile(profile);
  return NextResponse.json({ profile: toPublicProfile(profile) });
}
