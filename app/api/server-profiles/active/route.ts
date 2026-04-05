import { NextResponse } from "next/server";

import { ACTIVE_PROFILE_COOKIE } from "@/lib/server-profiles/resolve";
import { getProfileById } from "@/lib/server-profiles/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieOpts = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
  secure: process.env.NODE_ENV === "production",
};

export async function POST(req: Request) {
  let body: { profileId?: string | null };
  try {
    body = (await req.json()) as { profileId?: string | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = body.profileId;
  if (raw === null || raw === undefined || raw === "") {
    const res = NextResponse.json({ ok: true, activeProfileId: null });
    res.cookies.set(ACTIVE_PROFILE_COOKIE, "", { ...cookieOpts, maxAge: 0 });
    return res;
  }

  const id = String(raw).trim();
  const profile = await getProfileById(id);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true, activeProfileId: id });
  res.cookies.set(ACTIVE_PROFILE_COOKIE, id, cookieOpts);
  return res;
}
