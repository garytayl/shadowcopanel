"use client";

import { useId, useMemo } from "react";

const LEGACY_KEY = "reforger-panel-latency-ms";
const CONTROL_LINK_HISTORY_KEY = "reforger-panel-control-link-ms";
const MAX = 32;

export type ControlLinkTrend = "up" | "down" | "flat";

function migrateLegacyIfNeeded() {
  try {
    const cur = sessionStorage.getItem(CONTROL_LINK_HISTORY_KEY);
    if (cur) return;
    const old = sessionStorage.getItem(LEGACY_KEY);
    if (old) {
      sessionStorage.setItem(CONTROL_LINK_HISTORY_KEY, old);
    }
  } catch {
    /* ignore */
  }
}

/** Append a control-link (SSH) round-trip sample (ms). Not player ping. */
export function recordControlLinkSample(ms: number | undefined) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return;
  try {
    migrateLegacyIfNeeded();
    const raw = sessionStorage.getItem(CONTROL_LINK_HISTORY_KEY);
    const prev: number[] = raw ? (JSON.parse(raw) as number[]) : [];
    const next = [...prev, ms].slice(-MAX);
    sessionStorage.setItem(CONTROL_LINK_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** @deprecated use recordControlLinkSample */
export function recordLatencySample(ms: number | undefined) {
  recordControlLinkSample(ms);
}

export function readControlLinkHistory(): number[] {
  try {
    migrateLegacyIfNeeded();
    const raw = sessionStorage.getItem(CONTROL_LINK_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}

/** @deprecated use readControlLinkHistory */
export function readLatencyHistory(): number[] {
  return readControlLinkHistory();
}

function medianMs(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid]!;
  return (s[mid - 1]! + s[mid]!) / 2;
}

/** Rolling stats for control-plane (SSH) RTT — sparkline + badge context. */
export function getControlLinkStats(history: number[]): {
  current: number | null;
  avg: number | null;
  median: number | null;
  trend: ControlLinkTrend;
} {
  if (!history.length) {
    return { current: null, avg: null, median: null, trend: "flat" };
  }
  const current = history[history.length - 1] ?? null;
  const sum = history.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / history.length);
  const med = Math.round(medianMs(history));
  let trend: ControlLinkTrend = "flat";
  if (history.length >= 6) {
    const last3 = history.slice(-3);
    const prev3 = history.slice(-6, -3);
    const a = last3.reduce((x, y) => x + y, 0) / 3;
    const b = prev3.reduce((x, y) => x + y, 0) / 3;
    const delta = (a - b) / Math.max(b, 1);
    if (delta > 0.08) trend = "up";
    else if (delta < -0.08) trend = "down";
  }
  return { current, avg, median: Number.isFinite(med) ? med : null, trend };
}

export function LatencySparkline({
  values,
  width = 140,
  height = 36,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const gradId = useId().replace(/:/g, "");
  const path = useMemo(() => {
    if (values.length < 2) return null;
    const w = width;
    const h = height;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = Math.max(max - min, 1);
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - ((v - min) / span) * (h - 4) - 2;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [values, width, height]);

  if (!path) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }

  return (
    <svg
      width={width}
      height={height}
      className={className ?? "text-primary"}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L ${width} ${height} L 0 ${height} Z`}
        fill={`url(#${gradId})`}
        className="text-primary/30"
      />
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
    </svg>
  );
}
