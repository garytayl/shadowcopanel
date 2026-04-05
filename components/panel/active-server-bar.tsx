"use client";

import Link from "next/link";
import { AlertCircle, ChevronRight, Server } from "lucide-react";

import type { ActiveServerPanelContext } from "@/lib/types/active-server";
import { cn } from "@/lib/utils";

export function ActiveServerBar({ server }: { server: ActiveServerPanelContext }) {
  const subtitle =
    server.connectionSource === "profile" && server.activeProfileName
      ? server.activeProfileName
      : server.connectionSource === "env"
        ? "From host environment"
        : null;

  if (!server.configured) {
    return (
      <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-snug shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-950 dark:text-amber-100">No server connected</p>
            <p className="mt-0.5 text-amber-900/85 dark:text-amber-200/90">
              Add any machine that runs Reforger (home PC, rented server, or cloud). Go to{" "}
              <Link
                href="/servers"
                className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
              >
                Server setup
              </Link>{" "}
              — you don&apos;t need AWS.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      href="/servers"
      className={cn(
        "group flex items-center gap-2 rounded-xl border border-border/60 bg-card/80 px-3 py-2.5 text-left text-[11px] leading-snug shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors",
        "hover:border-primary/35 hover:bg-primary/5",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/20">
        <Server className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">Active server</span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
          {server.host}
          {server.port !== 22 ? `:${server.port}` : ""}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground opacity-60 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
