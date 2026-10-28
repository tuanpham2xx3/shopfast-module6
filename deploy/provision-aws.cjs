// Uses the user's temporary AWS CLI session. No long-lived AWS access key.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const aws =
  process.env.AWS_CLI_PATH || "C:/Program Files/Amazon/AWSCLIV2/aws.exe";
const region = "ap-southeast-2",
  account = "321323528839",
  instance = "i-05647e511e0e1780b";
const bucket = `shopfast-backups-${account}-${region}`;
function call(service, operation, body = {}) {
  const file = path.resolve(".secrets/aws-request.json");
  fs.writeFileSync(file, JSON.stringify(body));
  return JSON.parse(
    execFileSync(
      aws,
      [
        service,
        operation,
        "--cli-input-json",
        `file://${file.replace(/\\/g, "/")}`,
        "--profile",
        "shopfast",
        "--region",
        region,
        "--output",
        "json",
        "--no-cli-pager",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ) || "{}",
  );
}
function exists(fn) {
  try {
    return fn();
  } catch (e) {
    if (/NoSuchEntity|NoSuchBucket|404|not exist/.test(String(e.stderr)))
      return null;
    throw new Error("AWS preflight failed; inspect permissions");
  }
}
async function main() {
  const iamOnly = process.argv.includes("--iam-only");
  let plan;
  if (!iamOnly) {
    plan = call("freetier", "get-account-plan-state");
    if (
      !["FREE", "PAID"].includes(plan.accountPlanType) ||
      plan.accountPlanStatus !== "ACTIVE" ||
      Number(plan.accountPlanRemainingCredits?.amount) < 10
    )
      throw new Error(
        "Credit-only guard: active plan with >=10 USD credit required",
      );
    if (!exists(() => call("s3api", "head-bucket", { Bucket: bucket })))
      call("s3api", "create-bucket", {
        Bucket: bucket,
        CreateBucketConfiguration: { LocationConstraint: region },
      });
    call("s3api", "put-public-access-block", {
      Bucket: bucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      },
    });
    call("s3api", "put-bucket-encryption", {
      Bucket: bucket,
      ServerSideEncryptionConfiguration: {
        Rules: [
          { ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
        ],
      },
    });
    call("s3api", "put-bucket-versioning", {
      Bucket: bucket,
      VersioningConfiguration: { Status: "Enabled" },
    });
    call("s3api", "put-bucket-lifecycle-configuration", {
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: "shopfast-backup-retention",
            Filter: { Prefix: "backups/" },
            Status: "Enabled",
            Expiration: { Days: 30 },
            NoncurrentVersionExpiration: { NoncurrentDays: 30 },
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
          },
        ],
      },
    });
  }
  const ec2Role = "ShopFastInstanceRole";
  if (!exists(() => call("iam", "get-role", { RoleName: ec2Role })))
    call("iam", "create-role", {
      RoleName: ec2Role,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "ec2.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      }),
    });
  call("iam", "attach-role-policy", {
    RoleName: ec2Role,
    PolicyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
  });
  call("iam", "put-role-policy", {
    RoleName: ec2Role,
    PolicyName: "ShopFastBackup",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["s3:ListBucket"],
          Resource: `arn:aws:s3:::${bucket}`,
          Condition: { StringLike: { "s3:prefix": ["backups/*"] } },
        },
        {
          Effect: "Allow",
          Action: ["s3:PutObject", "s3:GetObject"],
          Resource: `arn:aws:s3:::${bucket}/backups/*`,
        },
      ],
    }),
  });
  if (
    !exists(() =>
      call("iam", "get-instance-profile", { InstanceProfileName: ec2Role }),
    )
  )
    call("iam", "create-instance-profile", { InstanceProfileName: ec2Role });
  const p = call("iam", "get-instance-profile", {
    InstanceProfileName: ec2Role,
  });
  if (!p.InstanceProfile.Roles.some((r) => r.RoleName === ec2Role))
    call("iam", "add-role-to-instance-profile", {
      InstanceProfileName: ec2Role,
      RoleName: ec2Role,
    });
  const current = call("ec2", "describe-iam-instance-profile-associations", {
    Filters: [{ Name: "instance-id", Values: [instance] }],
  });
  if (!current.IamInstanceProfileAssociations.length) {
    await new Promise((r) => setTimeout(r, 12000));
    call("ec2", "associate-iam-instance-profile", {
      InstanceId: instance,
      IamInstanceProfile: { Name: ec2Role },
    });
  }
  const document = {
    schemaVersion: "2.2",
    description: "ShopFast fixed-host release by verified commit",
    parameters: {
      Commit: {
        type: "String",
        allowedPattern: "^[0-9a-f]{40}$",
        description: "Approved GitHub commit SHA",
      },
    },
    mainSteps: [
      {
        action: "aws:runShellScript",
        name: "release",
        inputs: {
          timeoutSeconds: "600",
          runCommand: [
            '/bin/bash /opt/shopfast/deploy-release.sh "{{Commit}}"',
          ],
        },
      },
    ],
  };
  if (
    !exists(() => call("ssm", "describe-document", { Name: "ShopFastDeploy" }))
  )
    call("ssm", "create-document", {
      Name: "ShopFastDeploy",
      DocumentType: "Command",
      DocumentFormat: "JSON",
      Content: JSON.stringify(document),
    });
  const providers = call("iam", "list-open-id-connect-providers");
  let oidc = providers.OpenIDConnectProviderList.find((x) =>
    x.Arn.endsWith("/token.actions.githubusercontent.com"),
  )?.Arn;
  if (!oidc)
    oidc = call("iam", "create-open-id-connect-provider", {
      Url: "https://token.actions.githubusercontent.com",
      ClientIDList: ["sts.amazonaws.com"],
    }).OpenIDConnectProviderArn;
  const ghRole = "ShopFastGitHubDeploy";
  const trust = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Federated: oidc },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub":
              "repo:tuanpham2xx3/shopfast-module6:environment:production",
          },
        },
      },
    ],
  };
  if (!exists(() => call("iam", "get-role", { RoleName: ghRole })))
    call("iam", "create-role", {
      RoleName: ghRole,
      AssumeRolePolicyDocument: JSON.stringify(trust),
    });
  call("iam", "put-role-policy", {
    RoleName: ghRole,
    PolicyName: "ShopFastReleaseOnly",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "ssm:SendCommand",
          Resource: [
            `arn:aws:ssm:${region}:${account}:document/ShopFastDeploy`,
            `arn:aws:ec2:${region}:${account}:instance/${instance}`,
          ],
        },
        {
          Effect: "Allow",
          Action: ["ssm:GetCommandInvocation"],
          Resource: "*",
        },
      ],
    }),
  });
  console.log(
    JSON.stringify({
      accountPlan:
        plan?.accountPlanType ??
        "not queried (IAM-only, no new storage/compute)",
      creditRemaining: plan?.accountPlanRemainingCredits?.amount ?? null,
      bucket,
      instanceRole: ec2Role,
      deployRole: `arn:aws:iam::${account}:role/${ghRole}`,
    }),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
