"use client";

import { motion } from "framer-motion";
import { Loader2, Power } from "lucide-react";

import { cn } from "@/lib/utils";

export type PowerOrbPhase =
  | "loading"
  | "starting"
  | "stopping"
  | "restarting"
  | "running"
  | "stopped"
  | "degraded"
  | "unknown";

const LABEL: Record<PowerOrbPhase, string> = {
  loading: "Syncing…",
  starting: "Starting…",
  stopping: "Stopping…",
  restarting: "Restarting…",
  running: "Running",
  stopped: "Stopped",
  degraded: "Partial",
  unknown: "Unknown",
};

const SIZE = {
  default: "size-28 md:size-32",
  hero: "size-36 md:size-40",
} as const;

export function PowerOrb({
  phase,
  className,
  onClick,
  disabled = false,
  title: titleProp,
  actionLabel,
  size = "default",
}: {
  phase: PowerOrbPhase;
  className?: string;
  /** Primary power action: start / stop / restart depending on parent logic. */
  onClick?: () => void;
  disabled?: boolean;
  /** Tooltip (e.g. “Stop server”). */
  title?: string;
  /** Shown under the orb (e.g. “Start server”) — switch-style affordance. */
  actionLabel?: string;
  /** `hero`: larger control for dashboard hero. */
  size?: keyof typeof SIZE;
}) {
  const busy = phase === "loading" || phase === "starting" || phase === "stopping" || phase === "restarting";
  const interactive = Boolean(onClick) && !disabled && !busy;
  const glow =
    phase === "running"
      ? "shadow-[0_0_48px_-8px_color-mix(in_oklch,var(--primary)_55%,transparent),0_0_80px_-20px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
      : phase === "degraded"
        ? "shadow-[0_0_40px_-10px_rgba(245,158,11,0.35)]"
        : "shadow-lg shadow-black/20";

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled || busy || !onClick}
        title={titleProp}
        aria-label={titleProp ?? LABEL[phase]}
        className={cn(
          "relative flex items-center justify-center rounded-full border-2 border-border/80 bg-gradient-to-b from-card to-muted/30 outline-none transition-[box-shadow,transform]",
          SIZE[size],
          glow,
          interactive &&
            "cursor-pointer hover:border-primary/50 hover:ring-2 hover:ring-primary/20 focus-visible:ring-2 focus-visible:ring-ring",
          (disabled || busy || !onClick) && "cursor-default",
        )}
        animate={
          phase === "running"
            ? { scale: [1, 1.02, 1] }
            : phase === "degraded"
              ? { scale: [1, 1.01, 1] }
              : { scale: 1 }
        }
        whileTap={interactive ? { scale: 0.97 } : undefined}
        transition={{ duration: 2.4, repeat: phase === "running" || phase === "degraded" ? Infinity : 0, ease: "easeInOut" }}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-1 rounded-full opacity-90",
            phase === "running" && "bg-gradient-to-br from-emerald-500/25 via-primary/15 to-transparent",
            phase === "degraded" && "bg-gradient-to-br from-amber-500/25 via-amber-500/5 to-transparent",
            (phase === "stopped" || phase === "unknown") && "bg-muted/40",
            busy && "bg-primary/10",
          )}
        />
        <div className="relative z-10 flex flex-col items-center gap-1">
          {busy ? (
            <Loader2
              className={cn(
                "animate-spin text-primary",
                size === "hero" ? "size-12 md:size-14" : "size-10 md:size-11",
              )}
              aria-hidden
            />
          ) : (
            <Power
              className={cn(
                size === "hero" ? "size-12 md:size-14" : "size-10 md:size-11",
                phase === "running" && "text-emerald-400",
                phase === "degraded" && "text-amber-400",
                (phase === "stopped" || phase === "unknown") && "text-muted-foreground",
              )}
              strokeWidth={2}
              aria-hidden
            />
          )}
        </div>
      </motion.button>
      <div className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {actionLabel ?? LABEL[phase]}
        </p>
        {actionLabel ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground/80">{LABEL[phase]}</p>
        ) : null}
      </div>
    </div>
  );
}
