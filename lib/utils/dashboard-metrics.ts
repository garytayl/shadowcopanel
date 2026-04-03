/**
 * Parse common `free -m`, `df -h /`, and `/proc/loadavg` snippets from SSH snapshots.
 */

export type MemParse = { usedPct: number; line: string };
export type DiskParse = { usedPct: number; line: string };
export type LoadParse = { pct: number; label: string };

export function parseFreeMemM(freeStdout: string): MemParse | null {
  const line = freeStdout.split(/\r?\n/).find((l) => /^Mem:\s+/i.test(l.trim()));
  if (!line) return null;
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const total = Number.parseInt(parts[1]!, 10);
  const used = Number.parseInt(parts[2]!, 10);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(used)) return null;
  const usedPct = Math.min(100, Math.max(0, Math.round((used / total) * 100)));
  return { usedPct, line: `${used} / ${total} MiB` };
}

export function parseDfRootLine(dfLine: string): DiskParse | null {
  const parts = dfLine.trim().split(/\s+/).filter(Boolean);
  const pctPart = parts.find((p) => /^\d+%$/.test(p));
  if (!pctPart) return null;
  const usedPct = Math.min(100, Math.max(0, Number.parseInt(pctPart.replace("%", ""), 10)));
  return { usedPct, line: parts.slice(0, 4).join(" ") };
}

export function parseLoad1m(loadavgLine: string): LoadParse | null {
  const first = loadavgLine.trim().split(/\s+/)[0];
  if (!first) return null;
  const v = Number.parseFloat(first);
  if (!Number.isFinite(v)) return null;
  /** Map 0–4 load to 0–100% for a simple bar (tunable) */
  const pct = Math.min(100, Math.round((v / 4) * 100));
  return { pct, label: `1m ${v.toFixed(2)}` };
}

export function portLineMentionsGamePort(ssOutput: string, gamePort: number): boolean {
  const s = ssOutput.toLowerCase();
  const p = String(gamePort);
  return s.includes(`:${p}`) || s.includes(`:${p} `) || s.includes(`:${p}\n`);
}
