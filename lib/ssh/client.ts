import "server-only";

import { readFileSync } from "node:fs";
import { Client } from "ssh2";

import { requireServerEnv } from "@/lib/env/server";
import { describeSshFailure } from "@/lib/ssh/errors";

export type ExecResult = {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
};

function loadPrivateKey(): Buffer | string {
  const env = requireServerEnv();
  if (env.REFORGER_SSH_PRIVATE_KEY_PATH) {
    return readFileSync(env.REFORGER_SSH_PRIVATE_KEY_PATH);
  }
  if (env.REFORGER_SSH_PRIVATE_KEY) {
    return env.REFORGER_SSH_PRIVATE_KEY;
  }
  throw new Error("No SSH private key configured");
}

function connectClient(): Promise<Client> {
  const env = requireServerEnv();
  const privateKey = loadPrivateKey();

  return new Promise((resolve, reject) => {
    const client = new Client();
    // Allow slow networks; handshake timeout is controlled by readyTimeout below.
    const outerMs = 55_000;
    const timer = setTimeout(() => {
      client.end();
      reject(
        new Error(
          describeSshFailure(
            `SSH connection timed out (${outerMs / 1000}s) before session was ready.`,
          ),
        ),
      );
    }, outerMs);

    client
      .on("ready", () => {
        clearTimeout(timer);
        resolve(client);
      })
      .on("error", (e: Error) => {
        clearTimeout(timer);
        reject(new Error(describeSshFailure(e.message)));
      })
      .connect({
        host: env.REFORGER_SSH_HOST,
        port: env.REFORGER_SSH_PORT,
        username: env.REFORGER_SSH_USER,
        privateKey,
        // Default ssh2 is 20s; Vercel → EC2 can be slow if SG/NACL delays packets.
        readyTimeout: 45_000,
        keepaliveInterval: 10_000,
        keepaliveCountMax: 3,
      });
  });
}

/**
 * Run a remote shell command. Uses `bash -lc` so operators can rely on PATH and `cd`.
 */
export async function sshExec(command: string): Promise<ExecResult> {
  const client = await connectClient();
  const wrapped = `bash -lc ${JSON.stringify(command)}`;

  try {
    return await new Promise<ExecResult>((resolve, reject) => {
      client.exec(wrapped, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        let stdout = "";
        let stderr = "";
        stream
          .on("close", (code: number | null, signal: string | null) => {
            resolve({ code, signal, stdout, stderr });
          })
          .on("data", (d: Buffer) => {
            stdout += d.toString("utf8");
          });
        stream.stderr.on("data", (d: Buffer) => {
          stderr += d.toString("utf8");
        });
      });
    });
  } finally {
    client.end();
  }
}

/**
 * Write UTF-8 text to a remote path via SFTP (avoids shell length limits for large JSON).
 */
export async function sshWriteFile(remotePath: string, body: string): Promise<void> {
  const client = await connectClient();
  const buf = Buffer.from(body, "utf8");

  try {
    await new Promise<void>((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }
        const stream = sftp.createWriteStream(remotePath, { flags: "w", mode: 0o644 });
        stream.on("error", reject);
        stream.on("close", () => resolve());
        stream.end(buf);
      });
    });
  } finally {
    client.end();
  }
}

/**
 * Read a remote file via SFTP (binary-safe).
 */
export async function sshReadFile(remotePath: string): Promise<string> {
  const client = await connectClient();

  try {
    return await new Promise<string>((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }
        const chunks: Buffer[] = [];
        const stream = sftp.createReadStream(remotePath);
        stream.on("error", reject);
        stream.on("data", (d: Buffer) => chunks.push(d));
        stream.on("close", () => {
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      });
    });
  } finally {
    client.end();
  }
}

/**
 * Test SSH connectivity without throwing on command failure.
 */
export async function sshPing(): Promise<
  { ok: true; latencyMs: number } | { ok: false; message: string }
> {
  const start = Date.now();
  try {
    const r = await sshExec("echo reforger-panel-ok");
    const latencyMs = Date.now() - start;
    if (r.code !== 0) {
      return { ok: false, message: r.stderr || r.stdout || "SSH echo failed" };
    }
    return { ok: true, latencyMs };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { ok: false, message: describeSshFailure(raw) };
  }
}
