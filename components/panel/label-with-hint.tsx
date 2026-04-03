"use client";

import type { ReactNode } from "react";

import { Hint } from "@/components/dashboard/hint";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Form label paired with an info icon (hover / focus for full text). */
export function LabelWithHint({
  htmlFor,
  label,
  hint,
  className,
}: {
  htmlFor?: string;
  label: ReactNode;
  hint: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <Hint label={hint} />
    </div>
  );
}

/** Card or section title with trailing info icon. */
export function TitleWithHint({
  children,
  hint,
  className,
}: {
  children: ReactNode;
  hint: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span>{children}</span>
      <Hint label={hint} />
    </span>
  );
}
