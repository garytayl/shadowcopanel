"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";

const PAGES = [
  { href: "/dashboard", label: "Home" },
  { href: "/config", label: "Server settings file" },
  { href: "/mods", label: "Mods" },
  { href: "/logs", label: "Logs" },
  { href: "/diagnostics", label: "Diagnostics" },
  { href: "/tools", label: "Tools" },
  { href: "/help", label: "Help & FAQ" },
  { href: "/settings", label: "Connection details" },
] as const;

export function GlobalAppChrome() {
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [q, setQ] = useState("");

  const openPalette = useCallback(() => {
    setQ("");
    setCmdOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
        return;
      }

      if (typing) return;

      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return PAGES;
    return PAGES.filter((p) => p.label.toLowerCase().includes(s));
  }, [q]);

  return (
    <>
      <Dialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <DialogContent className="gap-0 p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border/80 p-4 pb-3">
            <DialogTitle className="flex items-center gap-2">
              <Search className="size-4 opacity-70" />
              Jump to page
            </DialogTitle>
            <DialogDescription className="text-xs">
              Type to filter. Press Enter to open the first result.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3">
            <Input
              autoFocus
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered[0]) {
                  router.push(filtered[0].href);
                  setCmdOpen(false);
                }
              }}
              className="rounded-xl"
            />
            <ul className="mt-2 max-h-72 overflow-auto rounded-xl border border-border/60">
              {filtered.map((p) => (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    className="block px-3 py-2.5 text-sm hover:bg-muted/80"
                    onClick={() => setCmdOpen(false)}
                  >
                    {p.label}
                  </Link>
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-muted-foreground">No matches</li>
              ) : null}
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>When focus isn’t inside a text box.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-3 text-sm">
            <li className="flex flex-wrap items-center justify-between gap-4">
              <span>Jump menu</span>
              <span className="flex flex-wrap items-center gap-1">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
                <span className="text-muted-foreground">/</span>
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </span>
            </li>
            <li className="flex items-center justify-between gap-4">
              <span>This window</span>
              <Kbd>?</Kbd>
            </li>
          </ul>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setHelpOpen(false);
              router.push("/help");
            }}
          >
            Full help &amp; FAQ
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
