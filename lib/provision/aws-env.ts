import "server-only";

import { readStoredAwsCredentialsAsync } from "@/lib/provision/aws-credentials-store";

/**
 * AWS credentials: environment variables win (optional for operators).
 * Otherwise credentials come from Upstash Redis (hosted) or data/aws-credentials.json (local).
 */
export async function getAwsCredentialsAsync(): Promise<{
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
} | null> {
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

  const stored = await readStoredAwsCredentialsAsync();
  if (!stored) return null;
  return {
    accessKeyId: stored.accessKeyId.trim(),
    secretAccessKey: stored.secretAccessKey.trim(),
    sessionToken: stored.sessionToken?.trim() || undefined,
  };
}

export function hasAwsCredentialsInEnvironment(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  );
}

export async function hasAwsCredentialsStoredAsync(): Promise<boolean> {
  return (await readStoredAwsCredentialsAsync()) !== null;
}

export async function getAwsDefaultRegionAsync(): Promise<string> {
  const env = process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim();
  if (env) return env;
  const stored = await readStoredAwsCredentialsAsync();
  if (stored?.region?.trim()) return stored.region.trim();
  return "us-east-1";
}

/** Security group ingress CIDR for provisioned instances (SSH + game UDP). */
export async function getAwsProvisionSgCidrAsync(): Promise<string> {
  const env = process.env.AWS_PROVISION_SG_CIDR?.trim();
  if (env) return env;
  const stored = await readStoredAwsCredentialsAsync();
  if (stored?.sgCidr?.trim()) return stored.sgCidr.trim();
  return "0.0.0.0/0";
}

export async function isAwsEc2ProvisionEnabledAsync(): Promise<boolean> {
  return (await getAwsCredentialsAsync()) !== null;
}
