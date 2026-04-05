/**
 * Ubuntu cloud-init for new VPS: base packages + game directory.
 * Arma Reforger binaries still need to be installed (SteamCMD or manual upload).
 */
export type CloudInitAccount = {
  /** Linux user (e.g. ubuntu on EC2 Ubuntu AMIs). */
  user: string;
  /** Home directory (e.g. /home/ubuntu or /root). */
  home: string;
};

const DEFAULT_ACCOUNT: CloudInitAccount = { user: "ubuntu", home: "/home/ubuntu" };

export function buildReforgerBootstrapUserData(
  providerLabel = "cloud",
  account: CloudInitAccount = DEFAULT_ACCOUNT,
): string {
  const { user, home } = account;
  const gameDir = `${home}/arma-reforger`;
  const owner = `${user}:${user}`;
  return `#cloud-config
package_update: true
packages:
  - tmux
  - curl
  - ca-certificates
write_files:
  - path: ${gameDir}/README-panel.txt
    content: |
      This folder was created by Reforger Control Panel (${providerLabel} provision).
      Install the Arma Reforger dedicated server here (e.g. SteamCMD), then point
      REFORGER_SERVER_PATH / config in the panel to this directory.
    owner: ${owner}
    permissions: '0644'
runcmd:
  - mkdir -p ${gameDir}
  - chown -R ${owner} ${gameDir}
`;
}
