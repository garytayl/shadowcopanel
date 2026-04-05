import "server-only";

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

/** Process + tmux + both UDP ports (game + A2S), one snapshot. */
export type RuntimeStateSnapshot = {
  processRunning: boolean;
  tmuxActive: boolean;
  portsBound: boolean;
};

export async function snapshotRuntimeState(
  checkPort: number,
  session: string,
): Promise<RuntimeStateSnapshot> {
  const [processRunning, tmuxActive, ports] = await Promise.all([
    probeRefogerProcessRunning(),
    probeTmuxSession(session),
    snapshotUdpPortsBound(checkPort),
  ]);
  return {
    processRunning,
    tmuxActive,
    portsBound: ports.bothOk,
  };
}

/** After `startServer`, wait briefly then poll until runtime converges or window expires. */
export const POST_RESTART_INITIAL_DELAY_MS = 3000;
export const POST_RESTART_RETRY_INTERVAL_MS = 2000;
export const POST_RESTART_MAX_ATTEMPTS = 5;

export type PostRestartConvergenceResult = {
  snapshot: RuntimeStateSnapshot;
  /** Checks performed (1–maxAttempts). */
  attempts: number;
  /** 1-based attempt when process+tmux+both UDP ports were all OK, or null. */
  succeededOnAttempt: number | null;
  /**
   * True when the first check already had process+tmux but not both UDP ports,
   * and a later check succeeded (typical Reforger slow bind).
   */
  portsBoundLate: boolean;
};

/**
 * Bounded post-start verification: initial delay, then up to `maxAttempts` snapshots
 * every `retryIntervalMs` using `ss -u -lpn` (UDP-aware, not TCP LISTEN).
 */
export async function waitForPostRestartConvergence(
  checkPort: number,
  session: string,
  opts?: {
    initialDelayMs?: number;
    retryIntervalMs?: number;
    maxAttempts?: number;
  },
): Promise<PostRestartConvergenceResult> {
  const initialDelayMs = opts?.initialDelayMs ?? POST_RESTART_INITIAL_DELAY_MS;
  const retryIntervalMs = opts?.retryIntervalMs ?? POST_RESTART_RETRY_INTERVAL_MS;
  const maxAttempts = opts?.maxAttempts ?? POST_RESTART_MAX_ATTEMPTS;

  await new Promise((r) => setTimeout(r, initialDelayMs));

  let first: RuntimeStateSnapshot | null = null;
  let lastSnapshot: RuntimeStateSnapshot = {
    processRunning: false,
    tmuxActive: false,
    portsBound: false,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastSnapshot = await snapshotRuntimeState(checkPort, session);
    if (attempt === 1) first = lastSnapshot;

    const ok =
      lastSnapshot.processRunning &&
      lastSnapshot.tmuxActive &&
      lastSnapshot.portsBound;

    if (ok) {
      const portsBoundLate = Boolean(
        attempt > 1 &&
          first?.processRunning &&
          first?.tmuxActive &&
          !first?.portsBound,
      );
      return {
        snapshot: lastSnapshot,
        attempts: attempt,
        succeededOnAttempt: attempt,
        portsBoundLate,
      };
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, retryIntervalMs));
    }
  }

  return {
    snapshot: lastSnapshot,
    attempts: maxAttempts,
    succeededOnAttempt: null,
    portsBoundLate: false,
  };
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
