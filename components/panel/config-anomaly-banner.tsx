"use client";

import { AlertTriangle, Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { ConfigNormalizationIssue } from "@/lib/reforger/types";

export function ConfigAnomalyBanner({
  issues,
  className,
}: {
  issues: ConfigNormalizationIssue[];
  className?: string;
}) {
  if (!issues.length) return null;
  const hasErr = issues.some((i) => i.severity === "error");
  const Icon = hasErr ? AlertTriangle : Info;
  return (
    <Alert
      variant={hasErr ? "destructive" : "default"}
      className={cn(
        "rounded-2xl border-amber-500/50 bg-amber-500/[0.07]",
        hasErr && "border-destructive/50 bg-destructive/[0.08]",
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <AlertTitle>Config anomaly detected</AlertTitle>
      <AlertDescription>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-foreground">
          {issues.map((i, idx) => (
            <li key={`${i.key}-${idx}`}>
              <span className="text-muted-foreground">[{i.severity}]</span> {i.message}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
