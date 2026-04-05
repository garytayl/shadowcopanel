import "server-only";

import { tryGetResolvedServerEnv } from "@/lib/server-profiles/resolve";
import { err, type ApiErr } from "@/lib/types/api";

export function notConfiguredError(): ApiErr {
  return err(
    "SSH is not configured. Add a server on the Servers page, or add .env.local from .env.example and restart the dev server.",
    "NOT_CONFIGURED",
  );
}

export async function ensureConfigured(): Promise<true | ApiErr> {
  if (!(await tryGetResolvedServerEnv())) {
    return notConfiguredError();
  }
  return true;
}
