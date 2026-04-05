import type { ServerProfile, ServerProfilePublic } from "@/lib/server-profiles/types";

function maskPath(p: string | null): string | null {
  if (!p) return null;
  if (p.length <= 24) return p;
  return `${p.slice(0, 10)}…${p.slice(-8)}`;
}

export function toPublicProfile(p: ServerProfile): ServerProfilePublic {
  const hasKey = Boolean(p.privateKeyInline || p.privateKeyPath);
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    host: p.host,
    port: p.port,
    user: p.user,
    serverPath: p.serverPath,
    configPath: p.configPath,
    tmuxSession: p.tmuxSession,
    serverCommand: p.serverCommand,
    instanceNotes: p.instanceNotes,
    logGlob: p.logGlob,
    checkPort: p.checkPort,
    privateKeyConfigured: hasKey,
    privateKeyPathHint: maskPath(p.privateKeyPath),
  };
}
