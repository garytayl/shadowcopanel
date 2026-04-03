"use client";

import { cn } from "@/lib/utils";

export function MetricBar({
  value,
  label,
  tone = "default",
  className,
}: {
  value: number;
  label?: string;
  tone?: "default" | "warn" | "danger";
  className?: string;
}) {
  const v = Math.min(100, Math.max(0, value));
  const bar =
    tone === "danger"
      ? "bg-gradient-to-r from-rose-600 to-rose-400"
      : tone === "warn"
        ? "bg-gradient-to-r from-amber-600 to-amber-400"
        : "bg-gradient-to-r from-primary/80 to-primary/40";
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted/80 ring-1 ring-border/60">
        <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", bar)} style={{ width: `${v}%` }} />
      </div>
      {label ? <p className="text-[10px] tabular-nums text-muted-foreground">{label}</p> : null}
    </div>
  );
}
