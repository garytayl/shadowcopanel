import "server-only";

import { requireServerEnv } from "@/lib/env/server";
import { sshExec, sshPing, sshReadFile, sshWriteFile } from "@/lib/ssh/client";
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
  sshLatencyMs?: number;
  tmuxSessionExists: boolean;
  processRunning: boolean;
  /** Combined heuristic */
  serverLikelyUp: boolean;
};

export async function getServerRuntimeStatus(): Promise<ServerRuntimeStatus> {
  const ping = await sshPing();
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
    const pg = await sshExec(
      "pgrep -af ArmaReforgerServer 2>/dev/null || pgrep -af ArmaReforger 2>/dev/null || true",
    );
    processRunning = /ArmaReforger/i.test(pg.stdout);
  } catch {
    processRunning = false;
  }

  const serverLikelyUp = tmuxSessionExists && processRunning;

  return {
    sshReachable: true,
    sshLatencyMs: ping.latencyMs,
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
  const r = await sshExec(
    `ss -tulnp 2>/dev/null | grep -F -- ${shSingleQuote(port)} || true`,
  );
  return { stdout: r.stdout.trim(), stderr: r.stderr.trim() };
}

export async function getHealthSnapshot(): Promise<{
  free: string;
  pgrep: string;
}> {
  const free = await sshExec("free -m || true");
  const pg = await sshExec(
    "pgrep -af ArmaReforgerServer 2>/dev/null || pgrep -af ArmaReforger 2>/dev/null || true",
  );
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
  return p.value;
}

export async function saveRemoteConfig(config: ReforgerConfig): Promise<{ bytes: number }> {
  const env = requireServerEnv();
  const path = env.REFORGER_CONFIG_PATH;
  const body = stringifyConfig(config);
  await sshWriteFile(path, body);
  return { bytes: Buffer.byteLength(body, "utf8") };
}

export async function saveRemoteConfigFromForm(
  base: ReforgerConfig,
  form: ReforgerFormValues,
): Promise<{ bytes: number }> {
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

  const script = `
set -euo pipefail
ROOT=${JSON.stringify(serverPath)}
L=$(find "$ROOT" -maxdepth 5 -type f \\( -name "*.log" -o -name "console.log" \\) 2>/dev/null | while read -r f; do
  printf '%s\\t%s\\n' "$(stat -c %Y "$f" 2>/dev/null || echo 0)" "$f"
done | sort -n | tail -1 | cut -f2- || true)
if [ -z "$L" ]; then
  echo "(no .log files discovered under $ROOT — set REFORGER_LOG_GLOB in .env.local)"
else
  tail -n ${lines} "$L"
fi
`.trim();

  const r = await sshExec(script);
  return r.stdout || r.stderr;
}
