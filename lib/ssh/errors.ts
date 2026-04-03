/**
 * User-facing hints for common ssh2 failures (esp. Vercel → EC2).
 */
export function describeSshFailure(message: string): string {
  const m = message.trim();
  if (/timed out while waiting for handshake|handshake.*timeout/i.test(m)) {
    return (
      `${m} ` +
      `Often this is AWS: inbound TCP 22 on the EC2 security group must allow the SSH client. ` +
      `Apps on Vercel connect from changing IPs — you cannot whitelist one IP. ` +
      `For testing, temporarily allow source 0.0.0.0/0 on inbound port 22 and rely on key-only auth; ` +
      `for production use a VPN/Tailscale to the instance, a bastion, or host the panel on a machine with a fixed IP.`
    );
  }
  if (/ECONNREFUSED|Connection refused/i.test(m)) {
    return `${m} Check the host, port, and that sshd is running on the instance.`;
  }
  if (/ENOTFOUND|getaddrinfo/i.test(m)) {
    return `${m} Check REFORGER_SSH_HOST (DNS or IP).`;
  }
  return m;
}
