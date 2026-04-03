/**
 * Future hardening (v2+)
 * ----------------------
 * This control panel performs privileged SSH operations from the Next.js server.
 * Before exposing it beyond localhost:
 *
 * 1. Add authentication (e.g. NextAuth, Auth.js, or a reverse proxy with SSO).
 * 2. Enforce HTTPS (TLS termination at nginx, ALB, or Caddy).
 * 3. Restrict network access (VPN, security group allowlists, Tailscale).
 * 4. Rate-limit API routes and server actions.
 * 5. Audit log destructive actions (start/stop/write config).
 *
 * Middleware entry point: add `middleware.ts` with session checks on `/dashboard`, `/config`, etc.
 */

export const AUTH_PLACEHOLDER = true;
