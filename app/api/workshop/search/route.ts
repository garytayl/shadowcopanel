import { NextRequest, NextResponse } from "next/server";

import { activeWorkshopProvider } from "@/lib/workshop/provider";
import type { WorkshopSort } from "@/lib/workshop/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/workshop/search?q=&page=1&sort=newest&tag=VEHICLE
 * Server-side catalog search against the Reforger Workshop HTML payload.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  const sort = (req.nextUrl.searchParams.get("sort") ?? "newest") as WorkshopSort;
  const tag = req.nextUrl.searchParams.get("tag");

  try {
    const data = await activeWorkshopProvider.searchMods(q, {
      page,
      sort,
      tag: tag?.trim() || undefined,
    });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
