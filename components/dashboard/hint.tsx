"use client";

import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

const sizeClass = {
  sm: "size-3.5",
  md: "size-4",
} as const;

/**
 * Inline ⓘ icon — the explanation uses the native `title` tooltip and only shows
 * on pointer hover over this small target (no Tab stop / no focus ring).
 */
export function Hint({
  label,
  className,
  size = "sm",
}: {
  label: string;
  className?: string;
  size?: keyof typeof sizeClass;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 cursor-help items-center justify-center text-muted-foreground transition-colors hover:text-foreground/85",
        sizeClass[size],
        className,
      )}
      title={label}
      role="img"
      aria-label={label}
    >
      <Info className="size-full" aria-hidden />
    </span>
  );
}
