/**
 * Structured detection over Reforger dedicated server logs (console.log, error.log, script.log, etc.).
 * Rule-based, deterministic — not ML.
 */

export type DetectedIssueSeverity = "info" | "warn" | "error" | "critical";

export type DetectedIssue = {
  key: string;
  title: string;
  severity: DetectedIssueSeverity;
  /** Short excerpt from the log that triggered this rule (truncated). */
  matchedText?: string;
  explanation: string;
  likelyCause?: string;
  suggestedFix?: string;
};

export type LogAnalysisSummary = {
  highestSeverity: DetectedIssueSeverity | "none";
  totalIssues: number;
  /** True when a crash-level or unrecoverable pattern appears (OOM, segfault, assert in engine, etc.). */
  hasFatal: boolean;
};

export type LogAnalysisResult = {
  issues: DetectedIssue[];
  summary: LogAnalysisSummary;
};

const SEVERITY_RANK: Record<DetectedIssueSeverity | "none", number> = {
  none: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4,
};

const FATAL_KEYS = new Set([
  "oom",
  "segfault",
  "sigsegv",
  "abort",
  "fatal-engine",
  "disk-full",
  "heap-corruption",
]);

type RuleDef = {
  key: string;
  severity: DetectedIssueSeverity;
  title: string;
  /** First match wins for this key. */
  test: (full: string) => boolean;
  /** Optional: extract a line sample when test passes. */
  sample?: (full: string) => string | undefined;
  explanation: string;
  likelyCause?: string;
  suggestedFix?: string;
};

function truncateLine(s: string, max = 220): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function firstLineMatching(full: string, re: RegExp): string | undefined {
  for (const line of full.split(/\r?\n/)) {
    if (re.test(line)) return truncateLine(line);
  }
  return undefined;
}

const RULES: RuleDef[] = [
  {
    key: "oom",
    severity: "critical",
    title: "Out of memory",
    test: (t) =>
      /\b(out of memory|OOM|cannot allocate|std::bad_alloc|malloc.*failed)\b/i.test(t),
    sample: (full) => firstLineMatching(full, /\b(out of memory|OOM|bad_alloc|cannot allocate)\b/i),
    explanation:
      "The process or host ran out of RAM while loading or running. The server may exit or hang.",
    likelyCause: "Too many players, huge view distances, heavy mods, or too small an instance.",
    suggestedFix: "Upgrade RAM or lower server load (mods, view distance, max players). Restart after freeing memory.",
  },
  {
    key: "segfault",
    severity: "critical",
    title: "Crash (segmentation fault)",
    test: (t) => /\b(segfault|SIGSEGV|segmentation fault|core dumped)\b/i.test(t),
    sample: (full) => firstLineMatching(full, /\b(segfault|SIGSEGV|segmentation fault)\b/i),
    explanation: "The game process crashed at the native level — often a bug, bad mod, or corrupt asset.",
    likelyCause: "Incompatible mod version, engine bug, or corrupted workshop content.",
    suggestedFix: "Remove the last-added mod, verify versions, update Reforger server. Check error.log for a stack trace.",
  },
  {
    key: "bind-failed",
    severity: "error",
    title: "Port bind failed",
    test: (t) =>
      /\b(bind failed|address already in use|EADDRINUSE|failed to bind|could not bind)\b/i.test(t),
    sample: (full) =>
      firstLineMatching(full, /\b(bind failed|already in use|EADDRINUSE|could not bind)\b/i),
    explanation: "The server could not open its UDP/TCP port — something else may already be using it.",
    likelyCause: "Another Reforger instance, stale process, or wrong bind address/port in config.",
    suggestedFix: "Stop duplicate processes, fix bindPort/publicPort, open firewall only once per port.",
  },
  {
    key: "network-timeout",
    severity: "warn",
    title: "Network timeouts",
    test: (t) => /\b(timed out|timeout|ETIMEDOUT|connection timed out)\b/i.test(t),
    sample: (full) => firstLineMatching(full, /\b(timed out|ETIMEDOUT)\b/i),
    explanation: "Some connection attempts are timing out — Steam, workshop, or clients may be affected.",
    likelyCause: "Firewall, NAT, slow link, or Bohemia services temporarily unreachable.",
    suggestedFix: "Check security groups / UDP ports, DNS, and try again when the network is stable.",
  },
  {
    key: "steam-workshop",
    severity: "warn",
    title: "Steam / Workshop access problems",
    test: (t) =>
      /\b(steam.*(error|fail)|workshop.*(fail|error)|UGC.*(fail|error)|subscription.*fail)\b/i.test(
        t,
      ),
    sample: (full) =>
      firstLineMatching(full, /\b(steam|workshop|UGC|subscription).*\b(fail|error)\b/i),
    explanation: "The server had trouble talking to Steam or downloading workshop content.",
    likelyCause: "Steam maintenance, rate limits, wrong mod ID, or blocked outbound HTTPS.",
    suggestedFix: "Verify mod IDs and versions; ensure outbound internet from the host; retry later.",
  },
  {
    key: "mod-dependency",
    severity: "error",
    title: "Mod or dependency failure",
    test: (t) =>
      /\b(missing mod|dependency|failed to load.*mod|mod.*version|incompatible mod)\b/i.test(t),
    sample: (full) =>
      firstLineMatching(full, /\b(missing mod|dependency|failed to load|incompatible mod)\b/i),
    explanation: "A workshop mod failed to load or is missing a required dependency.",
    likelyCause: "Wrong load order, outdated version string in config, or removed workshop item.",
    suggestedFix: "Match mod versions to the workshop, add dependencies above dependents, repair config.",
  },
  {
    key: "config-parse",
    severity: "error",
    title: "Config or script parse error",
    test: (t) =>
      /\b(parse error|invalid json|JSON.*error|unexpected token|syntax error.*config)\b/i.test(t),
    sample: (full) =>
      firstLineMatching(full, /\b(parse error|invalid json|JSON|unexpected token)\b/i),
    explanation: "Something on disk could not be parsed — often config.json or a script file.",
    likelyCause: "Trailing commas, bad merge, or hand-edited JSON.",
    suggestedFix: "Validate config.json, use the panel Repair/normalize, restore from backup.",
  },
  {
    key: "permission-denied",
    severity: "error",
    title: "Permission denied",
    test: (t) => /\b(permission denied|EACCES|cannot open.*denied)\b/i.test(t),
    sample: (full) => firstLineMatching(full, /\b(permission denied|EACCES)\b/i),
    explanation: "The server process could not read or write a file or directory.",
    likelyCause: "Wrong Linux owner on game files, or running as a user without access.",
    suggestedFix: "Fix ownership (e.g. chown) or run from the correct user; check paths in env.",
  },
  {
    key: "file-missing",
    severity: "error",
    title: "Missing file or path",
    test: (t) =>
      /\b(no such file|not found|ENOENT|cannot find.*file|failed to open.*\.(json|conf|edds))\b/i.test(
        t,
      ),
    sample: (full) => firstLineMatching(full, /\b(no such file|ENOENT|not found)\b/i),
    explanation: "A required file path does not exist on the server.",
    likelyCause: "Wrong REFORGER_SERVER_PATH, deleted scenario, or bad mod path.",
    suggestedFix: "Verify paths on the host, reinstall scenario/mod, check config paths.",
  },
  {
    key: "script-error",
    severity: "warn",
    title: "Script error",
    test: (t) =>
      /\b(script error|script\.log|EnforceScript|compilation error|Runtime error)\b/i.test(t),
    sample: (full) =>
      firstLineMatching(full, /\b(script error|compilation error|Runtime error)\b/i),
    explanation: "Enforce script or mission logic reported an error — gameplay code may be broken.",
    likelyCause: "Bug in a mod’s scripts or incompatible game version.",
    suggestedFix: "Update the mod, check mission version against server build.",
  },
  {
    key: "assert-fail",
    severity: "critical",
    title: "Assertion or fatal error",
    test: (t) => /\b(assertion failed|Assertion failed|fatal error|FATAL)\b/i.test(t),
    sample: (full) => firstLineMatching(full, /\b(assertion failed|fatal error|FATAL)\b/i),
    explanation: "The engine hit an assertion or explicit fatal — usually not recoverable without a fix.",
    likelyCause: "Engine bug, bad data from a mod, or corrupted save/state.",
    suggestedFix: "Report with logs; try disabling recent mods; verify game server version.",
  },
  {
    key: "disk-full",
    severity: "critical",
    title: "Disk full",
    test: (t) => /\b(no space left|disk full|ENOSPC)\b/i.test(t),
    sample: (full) => firstLineMatching(full, /\b(no space left|ENOSPC|disk full)\b/i),
    explanation: "The disk ran out of space — logs or downloads may fail.",
    likelyCause: "Huge logs, workshop cache, or small root volume.",
    suggestedFix: "Free space under / and /home; rotate or truncate logs; expand disk.",
  },
  {
    key: "gpu-vulkan",
    severity: "warn",
    title: "Graphics / Vulkan (headless)",
    test: (t) => /\b(Vulkan|GPU|EGL|display.*fail|no display)\b/i.test(t),
    sample: (full) => firstLineMatching(full, /\b(Vulkan|EGL|no display)\b/i),
    explanation: "Messages about GPU or display on a dedicated server are often harmless noise.",
    likelyCause: "Engine probing for a GPU on a headless Linux host.",
    suggestedFix: "Usually safe to ignore for a headless server unless the server refuses to start.",
  },
  {
    key: "rpl-replication",
    severity: "info",
    title: "Replication layer messages",
    test: (t) => /\bRPL\b.*\b(ERROR|WARN|Warning)\b/i.test(t) || /\breplication\b.*\b(ERROR|WARN)\b/i.test(t),
    sample: (full) => firstLineMatching(full, /\bRPL\b.*\b(ERROR|WARN)\b/i),
    explanation: "The replication stack logged a warning or error — can be transient under load.",
    likelyCause: "Packet loss, join burst, or desync — not always fatal.",
    suggestedFix: "If players report rubber-banding, check UDP and server CPU; otherwise note and monitor.",
  },
  {
    key: "a2s-init-failed",
    severity: "error",
    title: "A2S / query init failed",
    test: (t) => /\[A2S\].*Init failed|A2S is now turned off|\[A2S\].*query.*fail/i.test(t),
    sample: (full) =>
      firstLineMatching(full, /\[A2S\].*Init failed|A2S is now turned off/i),
    explanation:
      "The Steam query (A2S) layer failed to initialize — server list / browser may not show this host even if the game port works.",
    likelyCause: "Port conflict, bind issue, or backend networking error.",
    suggestedFix: "Check UDP 17777, firewall, and logs above the A2S line; restart after fixing.",
  },
  {
    key: "heap-corruption",
    severity: "critical",
    title: "Heap corruption or native crash",
    test: (t) =>
      /\b(double free|corruption\s*\(|malloc\(\):.*corruption|malloc_consolidate|invalid next size|glibc detected|\*\*\* Error in)\b/i.test(
        t,
      ),
    sample: (full) =>
      firstLineMatching(
        full,
        /\b(double free|corruption|malloc\(\):|glibc detected|\*\*\* Error in)\b/i,
      ),
    explanation:
      "Memory corruption or allocator failure — the process may exit immediately after this line.",
    likelyCause: "Engine bug, bad mod, or host instability.",
    suggestedFix: "Capture full log; remove recent mods; verify server build; restart on a clean boot.",
  },
  {
    key: "init-failed",
    severity: "error",
    title: "Initialization failed",
    test: (t) =>
      !/\[A2S\].*Init failed|A2S is now turned off/i.test(t) &&
      /\b(unable to initialize|initialization failed|Init failed)\b/i.test(t),
    sample: (full) => firstLineMatching(full, /\b(unable to initialize|initialization failed)\b/i),
    explanation: "A subsystem failed to start — server may not reach “ready”.",
    likelyCause: "Bad config, missing scenario, or failed dependency load.",
    suggestedFix: "Read the lines above the error; fix config/mods; use Fix Server after correcting JSON.",
  },
  {
    key: "high-error-rate",
    severity: "warn",
    title: "Many ERROR lines",
    test: (t) => {
      let n = 0;
      for (const line of t.split(/\r?\n/)) {
        if (/\berror\b/i.test(line)) n++;
      }
      return n >= 8;
    },
    sample: () => "(count-based)",
    explanation: "A large number of lines contain the word “error” — worth reading, not just one glitch.",
    likelyCause: "Cascading failures after an initial problem, or verbose error logging.",
    suggestedFix: "Scroll to the first ERROR block, fix root cause, then restart cleanly.",
  },
];

/**
 * Run all detection rules; each `key` appears at most once (first matching rule wins).
 */
export function detectKnownIssues(rawLogs: string): DetectedIssue[] {
  const text = rawLogs ?? "";
  const seen = new Set<string>();
  const out: DetectedIssue[] = [];

  for (const rule of RULES) {
    if (seen.has(rule.key)) continue;
    if (!rule.test(text)) continue;
    seen.add(rule.key);
    const matchedText = rule.sample?.(text);
    out.push({
      key: rule.key,
      title: rule.title,
      severity: rule.severity,
      matchedText: matchedText && matchedText !== "(count-based)" ? matchedText : undefined,
      explanation: rule.explanation,
      likelyCause: rule.likelyCause,
      suggestedFix: rule.suggestedFix,
    });
  }

  return out;
}

function highestSeverity(issues: DetectedIssue[]): DetectedIssueSeverity | "none" {
  let hi: DetectedIssueSeverity | "none" = "none";
  for (const i of issues) {
    if (SEVERITY_RANK[i.severity] > SEVERITY_RANK[hi]) {
      hi = i.severity;
    }
  }
  return hi;
}

/**
 * Full analysis: detected issues + summary for dashboards and APIs.
 */
export function analyzeReforgerLogs(rawLogs: string): LogAnalysisResult {
  const issues = detectKnownIssues(rawLogs);
  const hi = highestSeverity(issues);
  const hasFatal =
    issues.some(
      (i) => i.severity === "critical" || (i.severity === "error" && FATAL_KEYS.has(i.key)),
    ) || issues.some((i) => FATAL_KEYS.has(i.key));

  return {
    issues,
    summary: {
      highestSeverity: hi,
      totalIssues: issues.length,
      hasFatal,
    },
  };
}

/** Line-level rough counts for legacy badges (not a substitute for structured issues). */
export function countErrorWarnLines(rawLogs: string): { errorLines: number; warnLines: number } {
  let errorLines = 0;
  let warnLines = 0;
  for (const line of (rawLogs ?? "").split(/\r?\n/)) {
    if (/\berror\b/i.test(line)) errorLines++;
    if (/\bwarn(ing)?\b/i.test(line)) warnLines++;
  }
  return { errorLines, warnLines };
}
