/**
 * Turns raw SSH library errors into short, actionable hints (especially for Vercel → cloud servers).
 */
export function describeSshFailure(message: string): string {
  const m = message.trim();
  if (/timed out while waiting for handshake|handshake.*timeout/i.test(m)) {
    return (
      `${m}\n\n` +
      `What this usually means: the app could not finish connecting to your rented server. ` +
      `If you use Amazon/AWS, open the firewall (security group) for that machine so inbound port 22 (SSH) is allowed from the internet for testing. ` +
      `Websites hosted on services like Vercel do not connect from your home IP—so “allow only my IP” will block them. ` +
      `Allow 0.0.0.0/0 on port 22 only while testing, use key login (not passwords), then tighten rules later.`
    );
  }
  if (/ECONNREFUSED|Connection refused/i.test(m)) {
    return `${m}\n\nCheck the server address and port, and that the machine is on and accepting connections.`;
  }
  if (/ENOTFOUND|getaddrinfo/i.test(m)) {
    return `${m}\n\nThe host name or IP in settings could not be found—check for typos.`;
  }
  return m;
}
