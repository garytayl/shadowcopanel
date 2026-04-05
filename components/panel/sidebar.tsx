"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Server,
  FileJson,
  Package,
  ScrollText,
  Settings,
  Menu,
  Stethoscope,
  Wrench,
  CircleHelp,
  Store,
  History,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/panel/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const links = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/servers", label: "Server setup", icon: Server },
  { href: "/activity", label: "Activity", icon: History },
  { href: "/config", label: "Config", icon: FileJson },
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/mods", label: "Mods", icon: Package },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/diagnostics", label: "Diagnostics", icon: Stethoscope },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/help", label: "Help", icon: CircleHelp },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 touch-manipulation"
            aria-label="Open navigation menu"
          />
        }
      >
        <Menu className="size-5" aria-hidden />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(100vw-1rem,18rem)] max-w-[85vw] p-0 safe-area-t pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
      >
        <SheetHeader className="border-b border-border/60 p-4 text-left safe-area-x">
          <SheetTitle>Reforger Control</SheetTitle>
        </SheetHeader>
        <NavList onNavigate={() => setOpen(false)} layoutHighlight={false} />
      </SheetContent>
    </Sheet>
  );
}

function NavList({
  onNavigate,
  layoutHighlight = true,
}: {
  onNavigate?: () => void;
  /** Shared layout spring only on desktop nav (avoid duplicate layoutIds with mobile sheet). */
  layoutHighlight?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3 safe-area-x" aria-label="Primary">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "group relative flex min-h-11 items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 active:bg-sidebar-accent/40",
              active
                ? "text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
            )}
          >
            {active && layoutHighlight ? (
              <motion.span
                layoutId="sidebar-nav-pill"
                className="absolute inset-0 -z-10 rounded-xl bg-sidebar-accent shadow-[0_0_24px_-4px_color-mix(in_oklch,var(--sidebar-primary),transparent_40%)]"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            ) : null}
            {active && !layoutHighlight ? (
              <span className="absolute inset-0 -z-10 rounded-xl bg-sidebar-accent" />
            ) : null}
            <span className="relative z-0 flex items-center gap-3 transition-transform duration-200 ease-out group-hover:translate-x-1">
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                  active ? "opacity-100" : "opacity-75",
                )}
              />
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <>
      <aside className="hidden w-56 shrink-0 border-r border-primary/15 bg-sidebar/90 shadow-[4px_0_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl supports-[backdrop-filter]:bg-sidebar/75 lg:block">
        <div className="flex h-14 items-center justify-between gap-2 border-b border-border/60 px-3">
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="min-w-0 truncate bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text font-semibold tracking-tight text-transparent dark:from-teal-200 dark:to-amber-100/90"
          >
            Reforger Control
          </motion.div>
          <ThemeToggle />
        </div>
        <NavList />
        <div className="px-4 py-3 text-[10px] leading-snug text-muted-foreground">
          <span className="block uppercase tracking-wider">v0.3</span>
          <span className="mt-1 block normal-case">Cloud server control</span>
        </div>
      </aside>

      <div className="flex min-h-14 items-center justify-between border-b border-border/60 bg-background/80 px-2 backdrop-blur-md safe-area-t safe-area-x lg:hidden">
        <div className="flex min-w-0 items-center gap-1">
          <MobileNav />
          <span className="truncate bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text font-semibold tracking-tight text-transparent dark:from-teal-200 dark:to-amber-100/90">
            Reforger Control
          </span>
        </div>
        <ThemeToggle />
      </div>
    </>
  );
}
