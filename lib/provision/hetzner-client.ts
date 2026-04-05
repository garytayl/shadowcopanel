import "server-only";

import { getHetznerApiToken } from "@/lib/provision/hetzner-env";

const BASE = "https://api.hetzner.cloud/v1";

export type HetznerServerSummary = {
  id: number;
  name: string;
  status: string;
  public_net: {
    ipv4?: { ip: string; blocked?: boolean } | null;
  };
};

type ApiErrorBody = { error?: { message?: string; code?: string } };

async function parseErrorMessage(r: Response, bodyText: string): Promise<string> {
  try {
    const j = JSON.parse(bodyText) as ApiErrorBody;
    if (j.error?.message) return j.error.message;
  } catch {
    /* ignore */
  }
  return bodyText.slice(0, 400) || `HTTP ${r.status}`;
}

export async function hetznerFetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getHetznerApiToken();
  if (!token) {
    throw new Error("Hetzner is not configured (missing HETZNER_API_TOKEN).");
  }
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(await parseErrorMessage(r, text));
  }
  if (!text.trim()) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

export async function createHetznerSshKey(opts: {
  name: string;
  publicKey: string;
}): Promise<{ id: number }> {
  const res = await hetznerFetchJson<{ ssh_key: { id: number } }>("/ssh_keys", {
    method: "POST",
    body: JSON.stringify({
      name: opts.name.slice(0, 64),
      public_key: opts.publicKey.trim(),
    }),
  });
  return { id: res.ssh_key.id };
}

export async function deleteHetznerSshKey(id: number): Promise<void> {
  await hetznerFetchJson<unknown>(`/ssh_keys/${id}`, { method: "DELETE" });
}

export type CreateServerInput = {
  name: string;
  serverType: string;
  location: string;
  image: string;
  sshKeyIds: number[];
  userData: string;
};

export async function createHetznerServer(input: CreateServerInput): Promise<{
  id: number;
  status: string;
}> {
  const res = await hetznerFetchJson<{ server: HetznerServerSummary }>("/servers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.slice(0, 63),
      server_type: input.serverType,
      image: input.image,
      location: input.location,
      ssh_keys: input.sshKeyIds,
      user_data: input.userData,
      start_after_create: true,
    }),
  });
  return { id: res.server.id, status: res.server.status };
}

export async function getHetznerServer(id: number): Promise<HetznerServerSummary> {
  const res = await hetznerFetchJson<{ server: HetznerServerSummary }>(
    `/servers/${id}`,
    { method: "GET" },
  );
  return res.server;
}

export async function listHetznerLocations(): Promise<
  { name: string; description: string }[]
> {
  const res = await hetznerFetchJson<{
    locations: { name: string; description: string }[];
  }>("/locations", { method: "GET" });
  return res.locations.map((l) => ({
    name: l.name,
    description: l.description,
  }));
}

export async function listHetznerServerTypes(): Promise<
  { name: string; description: string; cores: number; memory: number }[]
> {
  const res = await hetznerFetchJson<{
    server_types: {
      name: string;
      description: string;
      cores: number;
      memory: number;
      deprecated: boolean;
      architecture: string;
    }[];
  }>("/server_types", { method: "GET" });
  const rows = res.server_types.filter((t) => !t.deprecated);
  return rows
    .map((t) => ({
      name: t.name,
      description: t.description,
      cores: t.cores,
      memory: t.memory,
    }))
    .sort((a, b) => a.memory - b.memory);
}
