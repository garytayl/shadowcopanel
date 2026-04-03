import { NextRequest, NextResponse } from "next/server";

import { activeWorkshopProvider } from "@/lib/workshop/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/workshop/mod?id={16-char hex}
 * Full mod detail including dependency tree (when present upstream).
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Missing id query parameter" },
      { status: 400 },
    );
  }

  try {
    const data = await activeWorkshopProvider.getModById(id);
    if (!data) {
      return NextResponse.json({ ok: false, error: "Mod not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
