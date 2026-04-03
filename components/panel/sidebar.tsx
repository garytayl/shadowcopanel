"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FileJson,
  Package,
  ScrollText,
  Settings,
  Menu,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/config", label: "Config", icon: FileJson },
  { href: "/mods", label: "Mods", icon: Package },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" aria-label="Open menu" />}
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="border-b border-border/60 p-4 text-left">
          <SheetTitle>Reforger Control</SheetTitle>
        </SheetHeader>
        <NavList onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0 opacity-80" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <>
      <aside className="hidden w-56 shrink-0 border-r border-border/60 bg-sidebar lg:block">
        <div className="flex h-14 items-center border-b border-border/60 px-4">
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-semibold tracking-tight"
          >
            Reforger Control
          </motion.div>
        </div>
        <NavList />
        <div className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          v1 · EC2 / SSH
        </div>
      </aside>

      <div className="flex h-14 items-center border-b border-border/60 px-4 lg:hidden">
        <MobileNav />
        <span className="ml-2 font-semibold tracking-tight">Reforger Control</span>
      </div>
    </>
  );
}
