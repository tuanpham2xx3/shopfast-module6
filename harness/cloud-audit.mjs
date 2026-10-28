import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const aws =
  process.env.AWS_CLI_PATH ??
  (process.platform === "win32"
    ? "C:/Program Files/Amazon/AWSCLIV2/aws.exe"
    : "aws");
const region = "ap-southeast-2",
  account = "321323528839",
  instance = "i-05647e511e0e1780b",
  bucket = `shopfast-backups-${account}-${region}`;
const assertions = [];
const check = (id, expected, actual, passed) =>
  assertions.push({ id, expected, actual, passed });
function call(service, operation, args = [], auditRegion = region) {
  return JSON.parse(
    execFileSync(
      aws,
      [
        service,
        operation,
        ...args,
        "--profile",
        "shopfast",
        "--region",
        auditRegion,
        "--output",
        "json",
        "--no-cli-pager",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 25000 },
    ) || "{}",
  );
}
let status = "FAIL";
try {
  const identity = call("sts", "get-caller-identity");
  check("AWS-account", account, identity.Account, identity.Account === account);
  const host = call("ec2", "describe-instances", ["--instance-ids", instance])
    .Reservations[0].Instances[0];
  check(
    "IMDSv2",
    "required",
    host.MetadataOptions.HttpTokens,
    host.MetadataOptions.HttpTokens === "required",
  );
  const volumes = call("ec2", "describe-volumes", [
    "--volume-ids",
    ...host.BlockDeviceMappings.map((x) => x.Ebs.VolumeId),
  ]).Volumes;
  check(
    "EBS-encrypted",
    true,
    volumes.every((v) => v.Encrypted),
    volumes.every((v) => v.Encrypted),
  );
  const groups = call("ec2", "describe-security-groups", [
    "--group-ids",
    ...host.SecurityGroups.map((x) => x.GroupId),
  ]).SecurityGroups;
  const publicRules = groups.flatMap((g) =>
    g.IpPermissions.flatMap((p) =>
      [
        ...p.IpRanges.map((r) => ({ cidr: r.CidrIp, version: 4 })),
        ...(p.Ipv6Ranges ?? []).map((r) => ({ cidr: r.CidrIpv6, version: 6 })),
      ].map((r) => ({
        ...r,
        protocol: p.IpProtocol,
        from: p.FromPort,
        to: p.ToPort,
      })),
    ),
  );
  const bad = publicRules.filter(
    (r) =>
      !(
        r.protocol === "tcp" &&
        ((r.from === 80 && r.to === 80) ||
          (r.from === 443 && r.to === 443) ||
          (r.from === 22 &&
            r.to === 22 &&
            r.cidr.endsWith(r.version === 4 ? "/32" : "/128")))
      ),
  );
  check(
    "SG-only-web-and-admin-SSH",
    "80/443;22 only /32 or /128",
    bad,
    bad.length === 0,
  );
  for (const port of [80, 443])
    check(
      `SG-public-${port}`,
      true,
      publicRules.some(
        (r) => r.from === port && r.to === port && r.cidr === "0.0.0.0/0",
      ),
      publicRules.some(
        (r) => r.from === port && r.to === port && r.cidr === "0.0.0.0/0",
      ),
    );
  const block = call("s3api", "get-public-access-block", [
    "--bucket",
    bucket,
  ]).PublicAccessBlockConfiguration;
  check(
    "S3-block-public",
    true,
    Object.values(block).every(Boolean),
    Object.values(block).every(Boolean),
  );
  const encryption = call("s3api", "get-bucket-encryption", [
    "--bucket",
    bucket,
  ]);
  check(
    "S3-encryption",
    true,
    encryption.ServerSideEncryptionConfiguration.Rules.length > 0,
    encryption.ServerSideEncryptionConfiguration.Rules.length > 0,
  );
  const version = call("s3api", "get-bucket-versioning", ["--bucket", bucket]);
  check(
    "S3-versioning",
    "Enabled",
    version.Status,
    version.Status === "Enabled",
  );
  const lifecycle = call("s3api", "get-bucket-lifecycle-configuration", [
    "--bucket",
    bucket,
  ]);
  check(
    "S3-retention",
    30,
    lifecycle.Rules[0].Expiration.Days,
    lifecycle.Rules[0].Expiration.Days === 30,
  );
  const github = call("iam", "get-role", [
    "--role-name",
    "ShopFastGitHubDeploy",
  ]).Role;
  const trust = github.AssumeRolePolicyDocument.Statement;
  const sub = `repo:tuanpham2xx3@134152079/shopfast-module6@1424291781:environment:production`;
  check(
    "OIDC-restricted-subject",
    sub,
    trust.map(
      (s) =>
        s.Condition?.StringEquals?.["token.actions.githubusercontent.com:sub"],
    ),
    trust.length === 1 &&
      trust[0].Condition?.StringEquals?.[
        "token.actions.githubusercontent.com:sub"
      ] === sub &&
      trust[0].Condition?.StringEquals?.[
        "token.actions.githubusercontent.com:aud"
      ] === "sts.amazonaws.com",
  );
  const policy = call("iam", "get-role-policy", [
    "--role-name",
    "ShopFastGitHubDeploy",
    "--policy-name",
    "ShopFastReleaseOnly",
  ]).PolicyDocument;
  check(
    "Deploy-role-actions",
    "SendCommand/GetCommandInvocation only",
    policy.Statement.map((s) => s.Action),
    policy.Statement.every((s) =>
      (Array.isArray(s.Action) ? s.Action : [s.Action]).every((a) =>
        ["ssm:SendCommand", "ssm:GetCommandInvocation"].includes(a),
      ),
    ),
  );
  const backup = call("iam", "get-role-policy", [
    "--role-name",
    "ShopFastInstanceRole",
    "--policy-name",
    "ShopFastBackup",
  ]).PolicyDocument;
  check(
    "Backup-role-scope",
    "bucket and backups/* only",
    backup.Statement.map((s) => s.Resource),
    backup.Statement.every((s) =>
      [...(Array.isArray(s.Resource) ? s.Resource : [s.Resource])].every((r) =>
        [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/backups/*`].includes(
          r,
        ),
      ),
    ),
  );
  const summary = call("iam", "get-account-summary").SummaryMap;
  const identityInstances = call(
    "sso-admin",
    "list-instances",
    [],
    "us-east-1",
  ).Instances;
  const identityInstance = identityInstances.find(
    (i) => i.InstanceArn === "arn:aws:sso:::instance/ssoins-7223f71ace11d438",
  );
  let groupMemberCount = 0;
  if (identityInstance) {
    const groups = call(
      "identitystore",
      "list-groups",
      ["--identity-store-id", identityInstance.IdentityStoreId],
      "us-east-1",
    ).Groups;
    const group = groups.find(
      (g) => g.DisplayName === `${account}-AdministratorAccess`,
    );
    if (group)
      groupMemberCount = call(
        "identitystore",
        "list-group-memberships",
        [
          "--identity-store-id",
          identityInstance.IdentityStoreId,
          "--group-id",
          group.GroupId,
        ],
        "us-east-1",
      ).GroupMemberships.length;
  }
  check(
    "IdentityCenter-group-membership",
    "ShopFast account group has at least one member",
    groupMemberCount,
    groupMemberCount > 0,
  );
  const humanPolicies = call("iam", "list-attached-role-policies", [
    "--role-name",
    "AccountFullAccessRole",
  ]).AttachedPolicies.map((p) => p.PolicyName);
  const identityEvidence = {
    rootMfaEnabled: summary.AccountMFAEnabled === 1,
    iamUsers: summary.Users,
    iamGroups: summary.Groups,
    identityCenterHomeRegion: "us-east-1",
    identityCenterInstanceFound: !!identityInstance,
    shopfastGroupMemberCount: groupMemberCount,
    humanRolePolicies: humanPolicies,
    builderIdMfa:
      "User-provided screenshots show prior registered TOTP; this API cannot attest current enforcement",
    emailVerification:
      "User reports verified 28/10/2026; not independently attested by this API",
  };
  const technicalPass = assertions.every((a) => a.passed);
  status = technicalPass ? "BLOCKED" : "FAIL";
  await mkdir("harness/reports", { recursive: true });
  await writeFile(
    "harness/reports/cloud-audit.json",
    JSON.stringify(
      {
        status,
        executedAt: new Date().toISOString(),
        assertions,
        identityEvidence,
        remaining:
          "Verify administrative identity MFA and group/permission-set grants independently; IAM account summary cannot attest Builder ID MFA.",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      status,
      technicalChecks: assertions.length,
      passed: assertions.filter((a) => a.passed).length,
      identityEvidence,
    }),
  );
} catch (e) {
  console.error("Cloud audit failed:", e.name);
}
if (status !== "PASS") process.exitCode = 1;
