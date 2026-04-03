import "server-only";

import { requireServerEnv } from "@/lib/env/server";
import { sshExec } from "@/lib/ssh/client";

/** Safe for embedding in `bash -lc '...'`. */
export function shSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

const PROCESS_LINE_RE = /ArmaReforger|enfMain|EnforceMain/i;

const PGREP_CMD =
  "pgrep -af ArmaReforgerServer 2>/dev/null; pgrep -af ArmaReforger 2>/dev/null; pgrep -af enfMain 2>/dev/null; pgrep -af EnforceMain 2>/dev/null; true";

export async function probeRefogerProcessRunning(): Promise<boolean> {
  try {
    const pg = await sshExec(PGREP_CMD);
    return PROCESS_LINE_RE.test(pg.stdout);
  } catch {
    return false;
  }
}

export async function probeTmuxSession(session: string): Promise<boolean> {
  try {
    const has = await sshExec(`tmux has-session -t ${shSingleQuote(session)} 2>/dev/null`);
    return has.code === 0;
  } catch {
    return false;
  }
}

/**
 * True when both the game UDP port and A2S (17777) appear in `ss -u -lpn`.
 */
export async function snapshotUdpPortsBound(checkPort: number): Promise<{
  game: boolean;
  a2s: boolean;
  bothOk: boolean;
}> {
  const portPat = `:${checkPort}([^0-9]|$)|:17777([^0-9]|$)`;
  try {
    const r = await sshExec(`ss -u -lpn 2>/dev/null | grep -E ${shSingleQuote(portPat)} || true`);
    const out = r.stdout;
    const game = new RegExp(`:${checkPort}([^0-9]|$)`).test(out);
    const a2s = /:17777([^0-9]|$)/.test(out);
    return { game, a2s, bothOk: game && a2s };
  } catch {
    return { game: false, a2s: false, bothOk: false };
  }
}

export function parseKillPidCount(stdout: string): number {
  const m = stdout.match(/REFORGER_KILL_PCOUNT=(\d+)/m);
  if (!m) return 0;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * pkill Reforger-related processes; prints REFORGER_KILL_PCOUNT for observability.
 */
export async function killRefogerProcessesPgrep(): Promise<{ stdout: string; pidCount: number }> {
  const killScript = [
    "set +e",
    "UC=$( (pgrep -f ArmaReforgerServer 2>/dev/null; pgrep -f enfMain 2>/dev/null) | sort -u | wc -l | tr -d '[:space:]')",
    'printf "REFORGER_KILL_PCOUNT=%s\\n" "${UC:-0}"',
    "pkill -f ArmaReforgerServer 2>/dev/null || true",
    "pkill -f enfMain 2>/dev/null || true",
  ].join("\n");
  const r = await sshExec(killScript);
  return { stdout: r.stdout, pidCount: parseKillPidCount(r.stdout) };
}

export async function killTmuxSessionLoose(session: string): Promise<void> {
  await sshExec(`tmux kill-session -t ${shSingleQuote(session)} 2>/dev/null || true`);
}

/**
 * Wait until no Reforger-related process line is seen, or timeout.
 */
export async function waitUntilProcessesGone(opts?: {
  maxMs?: number;
  intervalMs?: number;
}): Promise<boolean> {
  const maxMs = opts?.maxMs ?? 18_000;
  const intervalMs = opts?.intervalMs ?? 500;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (!(await probeRefogerProcessRunning())) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return !(await probeRefogerProcessRunning());
}
