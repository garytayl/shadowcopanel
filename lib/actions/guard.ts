import "server-only";

import { tryGetServerEnv } from "@/lib/env/server";
import { err, type ApiErr } from "@/lib/types/api";

export function notConfiguredError(): ApiErr {
  return err(
    "SSH is not configured. Add .env.local from .env.example and restart the dev server.",
    "NOT_CONFIGURED",
  );
}

export function ensureConfigured(): true | ApiErr {
  if (!tryGetServerEnv()) {
    return notConfiguredError();
  }
  return true;
}
