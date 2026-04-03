# Reforger Control Panel

Production-minded v1 web UI for managing an **Arma Reforger** dedicated server on **Ubuntu EC2** over **SSH**. The Next.js server runs privileged commands and SFTP; the browser never receives private keys.

## Stack

- Next.js (App Router), TypeScript, Tailwind CSS v4
- shadcn/ui, lucide-react, Framer Motion
- `ssh2` for server-side SSH/SFTP

## Security warnings

- **Do not expose this app to the public internet** without authentication, TLS, and network restrictions. Anyone who can use the UI can start/stop the game server and overwrite `config.json`.
- **v1 has no login.** Treat as a localhost / VPN / tailnet tool until you add auth (see `lib/auth/placeholder.ts`).
- Keep private keys **only** on the machine running Next.js (`REFORGER_SSH_PRIVATE_KEY_PATH` or inline `REFORGER_SSH_PRIVATE_KEY` in `.env.local`). Never import env or keys into client components.

## Setup

1. **Node.js 20+** recommended.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy environment template:

   ```bash
   cp .env.example .env.local
   ```

4. Edit `.env.local`:

   - Set `REFORGER_SSH_HOST` to your EC2 public IP or DNS.
   - Set `REFORGER_SSH_USER` (often `ubuntu`).
   - Set **`REFORGER_SSH_PRIVATE_KEY_PATH`** to an absolute path of your **local** PEM used to SSH to the instance (e.g. `~/.ssh/my-ec2.pem`). The control panel process reads this file; it is not uploaded to the repo.

5. **SSH key permissions** (macOS/Linux):

   ```bash
   chmod 600 /path/to/your.pem
   ```

6. Run the dev server:

   ```bash
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000) — you should land on **Dashboard**.

## Production build

```bash
npm run build
npm start
```

Run `npm start` on a host that has outbound SSH to EC2 and the key file path configured.

### Mac vs PC vs Vercel (where the PEM lives)

You are not “hosting” the PEM on a website — the browser never sees it. Only the **Node server** reads it.

| Environment | What to do |
|-------------|------------|
| **MacBook (local dev)** | Copy `arma-key.pem` to something like `~/.ssh/arma-reforger.pem`, `chmod 600`, set `REFORGER_SSH_PRIVATE_KEY_PATH` to that path. Avoid `Downloads/` long-term. |
| **BigEp PC** | Same idea: a fixed path under your user profile, not the repo. |
| **Vercel** | Add **`REFORGER_SSH_PRIVATE_KEY`** in **Project → Settings → Environment Variables** (paste the full key; mark as sensitive). Leave **`REFORGER_SSH_PRIVATE_KEY_PATH` empty**. There is no reliable file path in serverless. |

**EC2 security group:** SSH (port 22) must allow the **outbound IP** of whatever runs Next.js. Vercel’s egress IPs are not a single static address you can paste in “My IP,” so many people either (a) restrict `22` to a bastion/VPN/tailnet and run the panel only there, (b) use a non-Vercel host with a known IP, or (c) accept wider exposure and rely on key-only auth (still risky without app-level login). Plan this before exposing the panel.

## Features (v1)

| Area        | Behavior |
|------------|----------|
| **Dashboard** | SSH reachability, tmux/process heuristics, EC2 target, ports (`ss`), memory/process snippets, quick actions (start/stop/restart, health, ports, logs). |
| **Config**    | Load/save `config.json` over SFTP; form fields + raw JSON editor. |
| **Mods**      | Table with reorder, enable toggle, JSON preview; saves `mods` array to remote config. |
| **Logs**      | Tails discovered logs (or `REFORGER_LOG_GLOB`), search + filters, simple health hints. |
| **Settings**  | Read-only view of non-secret env-derived settings. |

## Remote server assumptions

- Ubuntu with tmux installed.
- Reforger deployed under `REFORGER_SERVER_PATH` (default `/home/ubuntu/arma-reforger`).
- Config at `REFORGER_CONFIG_PATH` (default `.../config.json`).
- Server started in a tmux session named `REFORGER_TMUX_SESSION` (default `reforger`).

Adjust `REFORGER_SERVER_CMD` if your launch line differs.

## Auth roadmap

Integrate session auth (e.g. Auth.js) and protect routes via `middleware.ts`. See `lib/auth/placeholder.ts` for a short checklist.

## License

Private / your use — add a license if you open-source the project.
