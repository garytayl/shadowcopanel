"use client";

import { Loader2, ShieldCheck, Wrench } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = {
  disabled: boolean;
  repairLoading: boolean;
  syncLoading: boolean;
  onRepair: () => void | Promise<void>;
  onSyncOnly: () => void | Promise<void>;
};

/**
 * Shown when runtime truth says the server is not joinable but SSH works — primary path to recover without a shell.
 */
export function JoinRepairBanner({
  disabled,
  repairLoading,
  syncLoading,
  onRepair,
  onSyncOnly,
}: Props) {
  return (
    <Alert className="rounded-2xl border-sky-500/35 bg-sky-500/[0.07] dark:border-sky-400/30">
      <ShieldCheck className="size-4 text-sky-600 dark:text-sky-400" aria-hidden />
      <AlertTitle className="text-foreground">Fix joinability from this panel</AlertTitle>
      <AlertDescription className="space-y-3 text-muted-foreground">
        <p>
          Sync your public IP into <code className="font-mono text-[11px] text-foreground">config.json</code>, apply
          safe network defaults, reset the session, and start the game server — no SSH required. If UDP ports stay
          closed, whoever runs the machine must open <strong className="text-foreground">UDP {2001}</strong> (and often{" "}
          <strong className="text-foreground">17777</strong>) in the firewall or router—this panel can&apos;t change
          that for you.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="rounded-xl"
            disabled={disabled || repairLoading}
            onClick={() => void onRepair()}
          >
            {repairLoading ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <Wrench className="mr-2 size-4" aria-hidden />
            )}
            Repair &amp; start server
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl border-border/80"
            disabled={disabled || syncLoading || repairLoading}
            onClick={() => void onSyncOnly()}
          >
            {syncLoading ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
            Sync public IP only
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
