"use client";

import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

/** Inline info icon with native tooltip (no extra deps). */
export function Hint({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 text-muted-foreground", className)}
      title={label}
      role="img"
      aria-label={label}
    >
      <Info className="size-3.5" aria-hidden />
    </span>
  );
}
