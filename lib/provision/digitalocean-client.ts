import "server-only";

import { getDigitalOceanToken } from "@/lib/provision/digitalocean-env";

const BASE = "https://api.digitalocean.com/v2";

type DoError = { id?: string; message?: string };

async function parseDoError(r: Response, text: string): Promise<string> {
  try {
    const j = JSON.parse(text) as DoError | { message?: string };
    if (typeof j.message === "string") return j.message;
  } catch {
    /* ignore */
  }
  return text.slice(0, 400) || `HTTP ${r.status}`;
}

export async function doFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getDigitalOceanToken();
  if (!token) {
    throw new Error("DigitalOcean is not configured (missing DIGITALOCEAN_TOKEN).");
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
    throw new Error(await parseDoError(r, text));
  }
  if (!text.trim()) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

export async function createDoSshKey(opts: {
  name: string;
  publicKey: string;
}): Promise<{ id: number }> {
  const res = await doFetchJson<{ ssh_key: { id: number } }>("/account/keys", {
    method: "POST",
    body: JSON.stringify({
      name: opts.name.slice(0, 255),
      public_key: opts.publicKey.trim(),
    }),
  });
  return { id: res.ssh_key.id };
}

export async function deleteDoSshKey(id: number): Promise<void> {
  await doFetchJson<unknown>(`/account/keys/${id}`, { method: "DELETE" });
}

export async function createDroplet(opts: {
  name: string;
  region: string;
  size: string;
  image: string;
  sshKeyIds: number[];
  userData: string;
}): Promise<{ id: number; status: string }> {
  const res = await doFetchJson<{ droplet: { id: number; status: string } }>(
    "/droplets",
    {
      method: "POST",
      body: JSON.stringify({
        name: opts.name.slice(0, 255),
        region: opts.region,
        size: opts.size,
        image: opts.image,
        ssh_keys: opts.sshKeyIds,
        user_data: opts.userData,
        monitoring: true,
        ipv6: false,
      }),
    },
  );
  return { id: res.droplet.id, status: res.droplet.status };
}

export type DoDroplet = {
  id: number;
  name: string;
  status: string;
  networks: {
    v4?: { ip_address: string; type: string }[];
  };
};

export async function getDroplet(id: number): Promise<DoDroplet> {
  const res = await doFetchJson<{ droplet: DoDroplet }>(`/droplets/${id}`, {
    method: "GET",
  });
  return res.droplet;
}

export async function listDoRegions(): Promise<{ slug: string; name: string }[]> {
  const res = await doFetchJson<{
    regions: { slug: string; name: string; available: boolean }[];
  }>("/regions?per_page=200", { method: "GET" });
  return res.regions
    .filter((r) => r.available)
    .map((r) => ({ slug: r.slug, name: r.name }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function listDoSizes(): Promise<
  { slug: string; description: string; vcpus: number; memory: number }[]
> {
  const res = await doFetchJson<{
    sizes: {
      slug: string;
      description: string;
      vcpus: number;
      memory: number;
      available: boolean;
    }[];
  }>("/sizes?per_page=200", { method: "GET" });
  return res.sizes
    .filter((s) => s.available)
    .map((s) => ({
      slug: s.slug,
      description: s.description,
      vcpus: s.vcpus,
      memory: s.memory,
    }))
    .sort((a, b) => a.memory - b.memory);
}
