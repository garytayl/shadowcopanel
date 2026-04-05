/**
 * Ubuntu cloud-init for new Hetzner servers: base packages + game directory.
 * Arma Reforger binaries still need to be installed (SteamCMD or manual upload).
 */
export function buildReforgerBootstrapUserData(): string {
  return `#cloud-config
package_update: true
packages:
  - tmux
  - curl
  - ca-certificates
write_files:
  - path: /home/ubuntu/arma-reforger/README-panel.txt
    content: |
      This folder was created by Reforger Control Panel (Hetzner provision).
      Install the Arma Reforger dedicated server here (e.g. SteamCMD), then point
      REFORGER_SERVER_PATH / config in the panel to this directory.
    owner: ubuntu:ubuntu
    permissions: '0644'
runcmd:
  - mkdir -p /home/ubuntu/arma-reforger
  - chown -R ubuntu:ubuntu /home/ubuntu/arma-reforger
`;
}
