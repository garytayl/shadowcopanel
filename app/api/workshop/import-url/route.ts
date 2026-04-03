import { NextResponse } from "next/server";

import { activeWorkshopProvider } from "@/lib/workshop/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = { url?: string };

/**
 * POST /api/workshop/import-url  { "url": "https://reforger.armaplatform.com/workshop/..." }
 * Resolves a pasted workshop link to a normalized catalog mod (detail tier).
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
  }

  try {
    const data = await activeWorkshopProvider.getModByUrl(url);
    if (!data) {
      return NextResponse.json({ ok: false, error: "Could not resolve mod from URL" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
