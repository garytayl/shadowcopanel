import "server-only";

import { readAwsCredentialsFromDiskSync } from "@/lib/provision/aws-credentials-store";

/**
 * AWS credentials: environment variables win (good for Vercel/production).
 * If unset, credentials may be stored in data/aws-credentials.json via the app UI.
 */
export function getAwsCredentials(): {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
} | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (accessKeyId && secretAccessKey) {
    const sessionToken = process.env.AWS_SESSION_TOKEN?.trim();
    return {
      accessKeyId,
      secretAccessKey,
      sessionToken: sessionToken || undefined,
    };
  }

  const disk = readAwsCredentialsFromDiskSync();
  if (!disk) return null;
  return {
    accessKeyId: disk.accessKeyId.trim(),
    secretAccessKey: disk.secretAccessKey.trim(),
    sessionToken: disk.sessionToken?.trim() || undefined,
  };
}

export function hasAwsCredentialsInEnvironment(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  );
}

export function hasAwsCredentialsInFile(): boolean {
  return readAwsCredentialsFromDiskSync() !== null;
}

export function getAwsDefaultRegion(): string {
  const env = process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim();
  if (env) return env;
  const disk = readAwsCredentialsFromDiskSync();
  if (disk?.region?.trim()) return disk.region.trim();
  return "us-east-1";
}

/** Security group ingress CIDR for provisioned instances (SSH + game UDP). */
export function getAwsProvisionSgCidr(): string {
  const env = process.env.AWS_PROVISION_SG_CIDR?.trim();
  if (env) return env;
  const disk = readAwsCredentialsFromDiskSync();
  if (disk?.sgCidr?.trim()) return disk.sgCidr.trim();
  return "0.0.0.0/0";
}

export function isAwsEc2ProvisionEnabled(): boolean {
  return getAwsCredentials() !== null;
}
