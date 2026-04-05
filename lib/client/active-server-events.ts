"use client";

import { useEffect } from "react";

export const ACTIVE_SERVER_CHANGED = "reforger:active-server-changed";

export function dispatchActiveServerChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVE_SERVER_CHANGED));
}

/** Refetch remote data when the user switches active server (cookie) or finishes provisioning. */
export function useOnActiveServerChanged(callback: () => void): void {
  useEffect(() => {
    const handler = () => callback();
    window.addEventListener(ACTIVE_SERVER_CHANGED, handler);
    return () => window.removeEventListener(ACTIVE_SERVER_CHANGED, handler);
  }, [callback]);
}
