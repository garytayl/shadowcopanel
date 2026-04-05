import { NextResponse } from "next/server";

import { tryGetResolvedServerEnv } from "@/lib/server-profiles/resolve";
import { measureControlLinkRoundTrip } from "@/lib/ssh/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lightweight JSON for uptime monitors (no secrets).
 * GET /api/health
 */
export async function GET() {
  const configured = (await tryGetResolvedServerEnv()) !== null;
  if (!configured) {
    return NextResponse.json(
      {
        status: "degraded",
        sshConfigured: false,
        message: "SSH env not set",
      },
      { status: 200 },
    );
  }

  const control = await measureControlLinkRoundTrip();
  if (!control.ok) {
    return NextResponse.json({
      status: "degraded",
      sshConfigured: true,
      sshReachable: false,
      error: control.message,
    });
  }

  return NextResponse.json({
    status: "ok",
    sshConfigured: true,
    sshReachable: true,
    /** Panel → instance SSH control round-trip (not player ping). */
    controlLinkRoundTripMs: control.roundTripMs,
    /** @deprecated alias for monitors; use controlLinkRoundTripMs */
    latencyMs: control.roundTripMs,
  });
}
