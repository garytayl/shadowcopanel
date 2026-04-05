import "server-only";

import {
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeRegionsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
  ImportKeyPairCommand,
  RunInstancesCommand,
  type RunInstancesCommandInput,
} from "@aws-sdk/client-ec2";

import {
  getAwsCredentials,
  getAwsDefaultRegion,
  getAwsProvisionSgCidr,
} from "@/lib/provision/aws-env";

export function ec2Client(region: string): EC2Client {
  const c = getAwsCredentials();
  if (!c) {
    throw new Error("AWS credentials are not configured.");
  }
  return new EC2Client({
    region,
    credentials: {
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
      sessionToken: c.sessionToken,
    },
  });
}

export async function listAwsRegions(): Promise<{ id: string; name: string }[]> {
  const client = ec2Client(getAwsDefaultRegion());
  const out = await client.send(new DescribeRegionsCommand({}));
  const regions = (out.Regions ?? [])
    .map((r) => ({ id: r.RegionName ?? "", name: r.RegionName ?? "" }))
    .filter((r) => r.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  return regions;
}

const INSTANCE_TYPES = [
  { id: "t3.micro", label: "t3.micro — 2 vCPU burstable, 1 GiB" },
  { id: "t3.small", label: "t3.small — 2 vCPU burstable, 2 GiB" },
  { id: "t3.medium", label: "t3.medium — 2 vCPU burstable, 4 GiB" },
  { id: "t3.large", label: "t3.large — 2 vCPU burstable, 8 GiB" },
  { id: "c6i.large", label: "c6i.large — 2 vCPU, 4 GiB (compute)" },
  { id: "m6i.large", label: "m6i.large — 2 vCPU, 8 GiB (balanced)" },
] as const;

export function listAwsInstanceTypesForUi(): typeof INSTANCE_TYPES {
  return INSTANCE_TYPES;
}

async function findUbuntuJammyAmi(client: EC2Client): Promise<string> {
  const out = await client.send(
    new DescribeImagesCommand({
      Owners: ["099720109477"],
      Filters: [
        {
          Name: "name",
          Values: ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"],
        },
        { Name: "state", Values: ["available"] },
        { Name: "architecture", Values: ["x86_64"] },
      ],
    }),
  );
  const images = [...(out.Images ?? [])];
  images.sort((a, b) => (b.CreationDate ?? "").localeCompare(a.CreationDate ?? ""));
  const id = images[0]?.ImageId;
  if (!id) {
    throw new Error(
      "No Ubuntu 22.04 (Jammy) x86_64 AMI found in this region. Try another region.",
    );
  }
  return id;
}

async function getDefaultVpcAndSubnet(client: EC2Client): Promise<{
  vpcId: string;
  subnetId: string;
}> {
  const vpcs = await client.send(
    new DescribeVpcsCommand({
      Filters: [{ Name: "isDefault", Values: ["true"] }],
    }),
  );
  const vpcId = vpcs.Vpcs?.[0]?.VpcId;
  if (!vpcId) {
    throw new Error(
      "No default VPC in this region. Create a default VPC (EC2 → Actions) or use another region.",
    );
  }
  const subs = await client.send(
    new DescribeSubnetsCommand({
      Filters: [{ Name: "vpc-id", Values: [vpcId] }],
    }),
  );
  const subnetId = subs.Subnets?.[0]?.SubnetId;
  if (!subnetId) {
    throw new Error("No subnets found in the default VPC.");
  }
  return { vpcId, subnetId };
}

export type LaunchEc2Input = {
  region: string;
  instanceType: string;
  publicKeyMaterial: string;
  keyPairName: string;
  securityGroupName: string;
  userData: string;
  instanceName: string;
};

export type LaunchEc2Result = {
  instanceId: string;
  state: string | undefined;
};

export async function launchUbuntuWithSsh(
  input: LaunchEc2Input,
): Promise<LaunchEc2Result> {
  const client = ec2Client(input.region);

  await client.send(
    new ImportKeyPairCommand({
      KeyName: input.keyPairName,
      PublicKeyMaterial: Buffer.from(input.publicKeyMaterial.trim(), "utf8"),
    }),
  );

  const { vpcId, subnetId } = await getDefaultVpcAndSubnet(client);
  const amiId = await findUbuntuJammyAmi(client);

  const sgOut = await client.send(
    new CreateSecurityGroupCommand({
      GroupName: input.securityGroupName,
      Description: "Reforger panel — SSH + game UDP (edit in AWS if needed)",
      VpcId: vpcId,
    }),
  );
  const sgId = sgOut.GroupId;
  if (!sgId) {
    throw new Error("CreateSecurityGroup did not return a group id.");
  }

  const cidr = getAwsProvisionSgCidr();

  await client.send(
    new AuthorizeSecurityGroupIngressCommand({
      GroupId: sgId,
      IpPermissions: [
        {
          IpProtocol: "tcp",
          FromPort: 22,
          ToPort: 22,
          IpRanges: [{ CidrIp: cidr, Description: "SSH" }],
        },
        {
          IpProtocol: "udp",
          FromPort: 2001,
          ToPort: 2001,
          IpRanges: [{ CidrIp: cidr, Description: "Game (default check port)" }],
        },
        {
          IpProtocol: "udp",
          FromPort: 17777,
          ToPort: 17777,
          IpRanges: [{ CidrIp: cidr, Description: "A2S" }],
        },
      ],
    }),
  );

  const userDataB64 = Buffer.from(input.userData, "utf8").toString("base64");

  const run = await client.send(
    new RunInstancesCommand({
      ImageId: amiId,
      MinCount: 1,
      MaxCount: 1,
      InstanceType: input.instanceType as RunInstancesCommandInput["InstanceType"],
      KeyName: input.keyPairName,
      SubnetId: subnetId,
      SecurityGroupIds: [sgId],
      UserData: userDataB64,
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [
            { Key: "Name", Value: input.instanceName },
            { Key: "reforger-panel", Value: "1" },
          ],
        },
      ],
    }),
  );

  const instanceId = run.Instances?.[0]?.InstanceId;
  const state = run.Instances?.[0]?.State?.Name;
  if (!instanceId) {
    throw new Error("RunInstances did not return an instance id.");
  }

  return { instanceId, state };
}

export async function describeInstance(
  region: string,
  instanceId: string,
): Promise<{
  state: string | undefined;
  publicIp: string | null;
  name: string | undefined;
}> {
  const client = ec2Client(region);
  const out = await client.send(
    new DescribeInstancesCommand({
      InstanceIds: [instanceId],
    }),
  );
  const inst = out.Reservations?.[0]?.Instances?.[0];
  const publicIp = inst?.PublicIpAddress ?? null;
  const name = inst?.Tags?.find((t) => t.Key === "Name")?.Value;
  return {
    state: inst?.State?.Name,
    publicIp,
    name,
  };
}
