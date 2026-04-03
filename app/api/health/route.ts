import { NextResponse } from "next/server";

import { tryGetServerEnv } from "@/lib/env/server";
import { sshPing } from "@/lib/ssh/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lightweight JSON for uptime monitors (no secrets).
 * GET /api/health
 */
export async function GET() {
  const configured = tryGetServerEnv() !== null;
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

  const ping = await sshPing();
  if (!ping.ok) {
    return NextResponse.json({
      status: "degraded",
      sshConfigured: true,
      sshReachable: false,
      error: ping.message,
    });
  }

  return NextResponse.json({
    status: "ok",
    sshConfigured: true,
    sshReachable: true,
    latencyMs: ping.latencyMs,
  });
}
