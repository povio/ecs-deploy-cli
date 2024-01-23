import { logBanner, logInfo, logVariable } from "../helpers/cli.helper";
import { safeLoadConfig } from "../helpers/ze-config";
import { Docker } from "../helpers/docker.helper";
import { getAwsIdentity } from "../helpers/aws.helper";
import {
  ecrGetDockerCredentials,
  ecrImageExists,
} from "../helpers/aws-ecs.helper";
import { chk } from "../helpers/chalk.helper";
import { z } from "zod";

export async function ecrPush(argv: {
  pwd: string;
  stage: string;
  container: string;
  release: string;
  skipEcrExistsCheck: boolean;
  verbose: boolean;
}) {
  const config2 = await safeLoadConfig(
    "ecs-deploy",
    argv.pwd,
    argv.stage,
    z.object({
      accountId: z.string().optional(),
      region: z.string().optional(),
      build: z.array(
        z.object({
          name: z.string(),
          repoName: z.string(),
          region: z.string().optional(),
          accountId: z.string().optional(),
        }),
      ),
    }),
  );

  const docker = new Docker({
    verbose: true,
    cwd: argv.pwd,
    // pass in variables meant for docker
    env: Object.entries(process.env)
      .filter((x) => x[0].startsWith("DOCKER_"))
      .reduce(
        (acc, [key, value]) => {
          acc[key] = value as string;
          return acc;
        },
        {} as Record<string, string>,
      ),
  });
  logBanner(`Docker ${(await docker.version()).data}`);

  logVariable("container", argv.container);

  const container = config2.build.find((x) => x.name === argv.container);
  if (!container) {
    throw new Error(`Container ${argv.container} not found`);
  }

  const accountId = container.accountId || config2.accountId;

  if (!accountId) {
    throw new Error(`accountId not defined`);
  }

  const region = container.region || config2.region;

  if (!region) {
    throw new Error(`region not defined`);
  }

  // load ECR details
  const imageName = `${accountId}.dkr.ecr.${region}.amazonaws.com/${container.repoName}:${argv.release}`;
  logVariable(`image`, imageName);

  const loadIdentity = async () => {
    logInfo("Setting up AWS Docker Auth...");
    const identity = await getAwsIdentity({ region });
    logInfo(`AWS User Arn: ${identity.Arn}`);
  };

  // check if image already exists
  if (!argv.skipEcrExistsCheck) {
    await loadIdentity();
    if (
      await ecrImageExists({
        region,
        repositoryName: container.repoName,
        imageIds: [{ imageTag: argv.release }],
      })
    ) {
      logInfo("Image already exists");
      return;
    }
  }

  const loadDocker = async () => {
    const ecrCredentials = await ecrGetDockerCredentials({
      region,
    });
    await docker.login({
      serveraddress: ecrCredentials.endpoint,
      username: "AWS",
      password: ecrCredentials.password,
    });
    logInfo("AWS ECR Docker Login succeeded");
  };

  await loadDocker();
  logInfo("Pushing to ECR...");
  await docker.imagePush(imageName, { verbose: true });

  logInfo(
    `Done! Deploy the service with  ${chk.magenta(
      `yarn ecs-deploy-cli deploy --stage ${argv.stage}`,
    )}`,
  );
}
