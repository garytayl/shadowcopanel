"use server";

import { ensureConfigured } from "@/lib/actions/guard";
import {
  getDiskReportFull,
  getPingExternal,
  getProcessSample,
  getSocketSummary,
} from "@/lib/ssh/reforger";
import { err, ok, type ApiResult } from "@/lib/types/api";

export type ToolKind = "disk" | "processes" | "sockets" | "ping";

export async function runServerToolAction(
  kind: ToolKind,
): Promise<ApiResult<{ text: string }>> {
  const g = ensureConfigured();
  if (g !== true) return g;
  try {
    let text: string;
    switch (kind) {
      case "disk":
        text = await getDiskReportFull();
        break;
      case "processes":
        text = await getProcessSample();
        break;
      case "sockets":
        text = await getSocketSummary();
        break;
      case "ping":
        text = await getPingExternal();
        break;
      default:
        return err("Unknown tool");
    }
    return ok({ text });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
