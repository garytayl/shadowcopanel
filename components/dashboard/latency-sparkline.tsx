"use client";

import { useMemo } from "react";

const LATENCY_HISTORY_KEY = "reforger-panel-latency-ms";
const MAX = 24;

export function recordLatencySample(ms: number | undefined) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return;
  try {
    const raw = sessionStorage.getItem(LATENCY_HISTORY_KEY);
    const prev: number[] = raw ? (JSON.parse(raw) as number[]) : [];
    const next = [...prev, ms].slice(-MAX);
    sessionStorage.setItem(LATENCY_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function readLatencyHistory(): number[] {
  try {
    const raw = sessionStorage.getItem(LATENCY_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}

export function LatencySparkline({ values }: { values: number[] }) {
  const path = useMemo(() => {
    if (values.length < 2) return null;
    const w = 120;
    const h = 32;
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
  }, [values]);

  if (!path) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }

  return (
    <svg width={120} height={32} className="text-primary" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
    </svg>
  );
}
