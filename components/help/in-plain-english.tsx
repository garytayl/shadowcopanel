import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Props = {
  /** Default: "How this page works" */
  title?: string;
  children: ReactNode;
};

/**
 * Short, jargon-light explainer for people who don’t manage AWS daily.
 */
export function InPlainEnglish({ title = "How this page works", children }: Props) {
  return (
    <Alert className="mb-6 rounded-2xl border-sky-500/30 bg-sky-500/[0.06] text-foreground">
      <Info className="size-4 shrink-0 text-sky-500" aria-hidden />
      <AlertTitle className="font-medium text-foreground">{title}</AlertTitle>
      <AlertDescription className="text-sm leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </AlertDescription>
    </Alert>
  );
}
