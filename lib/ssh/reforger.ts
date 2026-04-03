import "server-only";

import { requireServerEnv } from "@/lib/env/server";
import { measureControlLinkRoundTrip, sshExec, sshReadFile, sshWriteFile } from "@/lib/ssh/client";
import { backupRemoteConfigBeforeWrite } from "@/lib/reforger/config-backup";
import { normalizeReforgerConfig } from "@/lib/reforger/config-normalize";
import { validateReforgerConfigForWrite } from "@/lib/reforger/config-validate";
import type { ConfigNormalizationIssue } from "@/lib/reforger/types";
import {
  applyFormToConfig,
  configToFormValues,
  parseConfigJson,
  stringifyConfig,
  type ReforgerConfig,
  type ReforgerFormValues,
} from "@/lib/types/reforger-config";

export type ServerRuntimeStatus = {
  sshReachable: boolean;
  sshError?: string;
  /** Panel → instance control-plane round-trip over SSH (not player ping). */
  controlLinkRoundTripMs?: number;
  tmuxSessionExists: boolean;
  processRunning: boolean;
  /** Combined heuristic */
  serverLikelyUp: boolean;
};

type ControlMeasure = Awaited<ReturnType<typeof measureControlLinkRoundTrip>>;

/** Dedicated server process often appears as enfMain / EnforceMain in ps, not ArmaReforger in argv. */
const REFORGER_PGREP_CMD =
  "pgrep -af ArmaReforgerServer 2>/dev/null; pgrep -af ArmaReforger 2>/dev/null; pgrep -af enfMain 2>/dev/null; pgrep -af EnforceMain 2>/dev/null; true";
const REFORGER_PROCESS_LINE_RE = /ArmaReforger|enfMain|EnforceMain/i;

export async function getServerRuntimeStatus(opts?: {
  /** When provided, skips a second SSH measurement (e.g. joinability run). */
  control?: ControlMeasure;
}): Promise<ServerRuntimeStatus> {
  const ping = opts?.control ?? (await measureControlLinkRoundTrip());
  if (!ping.ok) {
    return {
      sshReachable: false,
      sshError: ping.message,
      tmuxSessionExists: false,
      processRunning: false,
      serverLikelyUp: false,
    };
  }

  const env = requireServerEnv();
  const session = env.REFORGER_TMUX_SESSION;
  let tmuxSessionExists = false;
  let processRunning = false;

  try {
    const has = await sshExec(`tmux has-session -t ${shSingleQuote(session)}`);
    tmuxSessionExists = has.code === 0;
  } catch {
    tmuxSessionExists = false;
  }

  try {
    const pg = await sshExec(REFORGER_PGREP_CMD);
    processRunning = REFORGER_PROCESS_LINE_RE.test(pg.stdout);
  } catch {
    processRunning = false;
  }

  const serverLikelyUp = tmuxSessionExists && processRunning;

  return {
    sshReachable: true,
    controlLinkRoundTripMs: ping.roundTripMs,
    tmuxSessionExists,
    processRunning,
    serverLikelyUp,
  };
}

function shSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export async function startServer(): Promise<{ message: string }> {
  const env = requireServerEnv();
  const session = env.REFORGER_TMUX_SESSION;
  const inner = `cd ${shSingleQuote(env.REFORGER_SERVER_PATH)} && ${env.REFORGER_SERVER_CMD}`;
  const has = await sshExec(`tmux has-session -t ${shSingleQuote(session)}`);
  if (has.code === 0) {
    return {
      message:
        "tmux session already exists. Stop or restart if you need a clean start.",
    };
  }
  const start = await sshExec(
    `tmux new-session -d -s ${shSingleQuote(session)} bash -lc ${JSON.stringify(inner)}`,
  );
  if (start.code !== 0) {
    throw new Error(start.stderr || start.stdout || "Failed to start tmux session");
  }
  return { message: "Start command issued (new tmux session)." };
}

export async function stopServer(): Promise<{ message: string }> {
  const env = requireServerEnv();
  const session = env.REFORGER_TMUX_SESSION;
  const script = [
    `tmux send-keys -t ${shSingleQuote(session)} C-c`,
    "sleep 2",
    `tmux has-session -t ${shSingleQuote(session)} 2>/dev/null && tmux kill-session -t ${shSingleQuote(session)} || true`,
  ].join("; ");
  const r = await sshExec(script);
  if (r.code !== 0 && r.stderr && !/can't find session|no server running/i.test(r.stderr)) {
    throw new Error(r.stderr || "Stop command failed");
  }
  return {
    message:
      "Stop sequence completed (SIGINT via tmux, then kill-session if still present).",
  };
}

export async function restartServer(): Promise<{ message: string }> {
  await stopServer();
  await new Promise((r) => setTimeout(r, 1500));
  return startServer();
}

export async function getListeningPorts(): Promise<{ stdout: string; stderr: string }> {
  const port = process.env.REFORGER_CHECK_PORT?.trim() || "2001";
  /** `-tuanp`: all states — UDP bound sockets are often UNCONN, not LISTEN (avoid `-l`-only views). */
  const r = await sshExec(
    `ss -tuanp 2>/dev/null | grep -E ${shSingleQuote(`:${port}([^0-9]|$)`)} || true`,
  );
  return { stdout: r.stdout.trim(), stderr: r.stderr.trim() };
}

export async function getHealthSnapshot(): Promise<{
  free: string;
  pgrep: string;
}> {
  const free = await sshExec("free -m || true");
  const pg = await sshExec(REFORGER_PGREP_CMD);
  return {
    free: free.stdout.trim(),
    pgrep: pg.stdout.trim(),
  };
}

export async function getRemoteConfigText(): Promise<string> {
  const env = requireServerEnv();
  const path = env.REFORGER_CONFIG_PATH;
  try {
    return await sshReadFile(path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to read remote config: ${msg}`);
  }
}

export async function getRemoteConfigParsed(): Promise<ReforgerConfig> {
  const raw = await getRemoteConfigText();
  const p = parseConfigJson(raw);
  if (!p.ok) throw new Error(p.error);
  return normalizeReforgerConfig(p.value).config;
}

export type RemoteConfigSaveResult = {
  bytes: number;
  /** Remote path of the timestamped backup, or null if first write / no prior file. */
  backupPath: string | null;
  backupNote?: string;
  normalizationIssues: ConfigNormalizationIssue[];
};

/**
 * Writes `config.json` after normalization + validation, with a remote backup when a prior file exists.
 */
export async function saveRemoteConfig(config: ReforgerConfig): Promise<RemoteConfigSaveResult> {
  const norm = normalizeReforgerConfig(config);
  const v = validateReforgerConfigForWrite(norm.config);
  if (!v.ok) {
    throw new Error(v.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  }

  const backup = await backupRemoteConfigBeforeWrite();
  if (!backup.ok) {
    throw new Error(
      `Config backup failed (${backup.message}). Save aborted so your previous file is not lost without a snapshot.`,
    );
  }

  const env = requireServerEnv();
  const path = env.REFORGER_CONFIG_PATH;
  const body = stringifyConfig(norm.config);
  await sshWriteFile(path, body);

  return {
    bytes: Buffer.byteLength(body, "utf8"),
    backupPath: backup.skipped ? null : backup.remotePath,
    backupNote: backup.skipped ? backup.reason : undefined,
    normalizationIssues: norm.issues,
  };
}

export async function saveRemoteConfigFromForm(
  base: ReforgerConfig,
  form: ReforgerFormValues,
): Promise<RemoteConfigSaveResult> {
  const merged = applyFormToConfig(base, form);
  return saveRemoteConfig(merged);
}

export { configToFormValues, applyFormToConfig };

const SYS_SPLIT = "<<<REFORGER_SYS_SPLIT>>>";

export type SystemSnapshot = {
  uname: string;
  uptime: string;
  diskRoot: string;
  loadavg: string;
  tmuxSessions: string;
};

/** One SSH round-trip: kernel, uptime, root disk, load, tmux list */
export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const r = await sshExec(
    `uname -a; echo "${SYS_SPLIT}"; uptime -p 2>/dev/null || uptime 2>/dev/null || true; echo "${SYS_SPLIT}"; df -h / 2>/dev/null | tail -1 || true; echo "${SYS_SPLIT}"; cat /proc/loadavg 2>/dev/null || echo n/a; echo "${SYS_SPLIT}"; tmux list-sessions 2>/dev/null | tr '\\n' ' ' || echo "(no tmux sessions)"`,
  );
  const parts = r.stdout
    .split(SYS_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
  const [uname = "", uptime = "", diskRoot = "", loadavg = "", tmuxSessions = ""] = parts;
  return { uname, uptime, diskRoot, loadavg, tmuxSessions };
}

export async function getDiskReportFull(): Promise<string> {
  const r = await sshExec("df -h 2>/dev/null || true");
  return r.stdout.trim() || r.stderr.trim();
}

export async function getProcessSample(): Promise<string> {
  const r = await sshExec(
    "ps aux --sort=-%mem 2>/dev/null | head -35 || ps aux 2>/dev/null | head -35 || true",
  );
  return r.stdout.trim() || r.stderr.trim();
}

export async function getSocketSummary(): Promise<string> {
  const r = await sshExec("ss -s 2>/dev/null || true");
  return r.stdout.trim() || r.stderr.trim();
}

/** Quick outbound connectivity check from the game server (ICMP may be blocked by some clouds). */
export async function getPingExternal(): Promise<string> {
  const r = await sshExec("ping -c 2 -W 4 8.8.8.8 2>&1 || true");
  return (r.stdout + r.stderr).trim();
}

export async function getRecentLogs(lines = 400): Promise<string> {
  const env = requireServerEnv();
  const glob = env.REFORGER_LOG_GLOB;
  const serverPath = env.REFORGER_SERVER_PATH;

  if (glob) {
    const r = await sshExec(`tail -n ${lines} ${glob} 2>/dev/null || true`);
    if (!r.stdout.trim()) {
      return `(no output from tail ${glob})`;
    }
    return r.stdout;
  }

  // Discovery: game install dir (REFORGER_SERVER_PATH) plus Linux/XDG logs under
  // ~/.config/ArmaReforger/logs (timestamped folders with console.log, error.log, …).
  const root = shSingleQuote(serverPath);
  const sshUser = env.REFORGER_SSH_USER || "ubuntu";
  const configLogs = shSingleQuote(`/home/${sshUser}/.config/ArmaReforger/logs`);
  const script = `set -euo pipefail; ROOT=${root}; CFG=${configLogs}; L=$(find "$ROOT" "$CFG" -maxdepth 10 -type f -name '*.log' 2>/dev/null | while read -r f; do printf '%s\\t%s\\n' "$(stat -c %Y "$f" 2>/dev/null || echo 0)" "$f"; done | sort -n | tail -1 | cut -f2- || true); if [ -z "$L" ]; then echo "(no *.log files found under $ROOT or $CFG — set REFORGER_LOG_GLOB in .env.local to a file path, e.g. $CFG/logs_*/console.log)"; else tail -n ${lines} "$L"; fi`;

  const r = await sshExec(script);
  return r.stdout || r.stderr;
}
