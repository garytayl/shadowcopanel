import "server-only";

import { requireServerEnv } from "@/lib/env/server";
import { sshExec } from "@/lib/ssh/client";

function shSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export type ConfigBackupResult =
  | { ok: true; remotePath: string; skipped: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; message: string };

/**
 * Copies the remote config file to `config.json.bak.<ISO timestamp>` before overwrite.
 * If the file does not exist yet, returns `skipped` (first deploy) instead of failing.
 */
export async function backupRemoteConfigBeforeWrite(): Promise<ConfigBackupResult> {
  const env = requireServerEnv();
  const path = env.REFORGER_CONFIG_PATH;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${path}.bak.${ts}`;
  const r = await sshExec(
    `if [ -f ${shSingleQuote(path)} ]; then cp -a ${shSingleQuote(path)} ${shSingleQuote(backupPath)} && echo OK; else echo SKIP; fi`,
  );
  if (r.code !== 0) {
    return { ok: false, message: r.stderr.trim() || r.stdout.trim() || "cp failed" };
  }
  const out = r.stdout.trim();
  if (out === "SKIP") {
    return {
      ok: true,
      skipped: true,
      reason: "No existing config file on remote — nothing to snapshot before first write.",
    };
  }
  return { ok: true, remotePath: backupPath, skipped: false };
}
