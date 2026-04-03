/**
 * Workshop catalog provider. Swap `activeWorkshopProvider` when an official HTTP API is available.
 */

import "server-only";

import { reforgerWorkshopProvider } from "@/lib/workshop/reforger-workshop";
import type { WorkshopProvider } from "@/lib/workshop/types";

export const activeWorkshopProvider: WorkshopProvider = reforgerWorkshopProvider;
