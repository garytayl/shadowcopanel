"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

const sizeClass = {
  sm: "size-3.5",
  md: "size-4",
} as const;

/**
 * Sleek contextual help: glass-style panel on hover/focus (not the browser’s default title box).
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
    <Tooltip.Root>
      <Tooltip.Trigger
        type="button"
        delay={180}
        closeDelay={40}
        className={cn(
          "inline-flex shrink-0 cursor-help items-center justify-center rounded-md border-0 bg-transparent p-0",
          "text-muted-foreground outline-none transition-[color,transform] duration-200 ease-out",
          "hover:scale-110 hover:text-primary",
          "focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          sizeClass[size],
          className,
        )}
        aria-label={label}
      >
        <Info className="size-full" aria-hidden />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner
          side="top"
          sideOffset={10}
          align="center"
          className="z-[300] max-w-[min(22rem,calc(100vw-1.25rem))]"
        >
          <Tooltip.Popup
            className={cn(
              "rounded-xl border border-border/50 px-3.5 py-2.5 text-[13px] leading-[1.45] text-foreground shadow-[0_12px_40px_-8px_rgba(0,0,0,0.45)]",
              "bg-background/95 backdrop-blur-xl backdrop-saturate-150",
              "dark:border-white/10 dark:bg-zinc-950/90 dark:text-zinc-100 dark:shadow-[0_16px_50px_-12px_rgba(0,0,0,0.75)]",
              "ring-1 ring-black/5 dark:ring-white/10",
              "origin-[var(--transform-origin)] transition-[opacity,transform] duration-200 ease-out",
              "data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0",
            )}
          >
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
