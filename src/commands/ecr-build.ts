import {
  logBanner,
  logInfo,
  logNotice,
  logVariable,
} from "../helpers/cli.helper";
import path from "path";
import {
  resolveZeConfigItem,
  safeLoadConfig,
  ZeConfigItemValues,
} from "../helpers/ze-config";
import { Docker } from "../helpers/docker.helper";
import { getAwsIdentity } from "../helpers/aws.helper";
import {
  ecrGetDockerCredentials,
  ecrImageExists,
} from "../helpers/aws-ecs.helper";
import { chk } from "../helpers/chalk.helper";
import { z } from "zod";

type EcrBuildArgv = {
  pwd: string;
  stage: string;
  container?: string;
  release?: string;
  skipEcrExistsCheck?: boolean;
  buildx?: boolean;
  skipPush?: boolean;
  verbose?: boolean;
};

const EcrBuildConfigBuildItem = z.object({
  name: z.string(),
  repoName: z.string(),
  region: z.string().optional(),
  accountId: z.string().optional(),
  context: z.string().optional(),
  dockerfile: z.string().optional(),
  platform: z.string().default("linux/amd64"),
  environment: z.record(z.string()).optional(),
  environmentValues: ZeConfigItemValues.optional(),
});

type EcrBuildConfigBuildItemType = z.infer<typeof EcrBuildConfigBuildItem>;

const EcrBuildConfig = z.object({
  accountId: z.string().optional(),
  region: z.string().optional(),
  build: z.array(EcrBuildConfigBuildItem),
});

export async function ecrBuild(argv: EcrBuildArgv) {
  const config = await safeLoadConfig(
    "ecs-deploy",
    argv.pwd,
    argv.stage,
    EcrBuildConfig,
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

  const container: EcrBuildConfigBuildItemType | undefined = config.build.find(
    (x) => x.name === argv.container,
  );

  if (!container) {
    throw new Error(`Container ${argv.container} not found`);
  }

  const accountId = container.accountId || config.accountId;

  if (!accountId) {
    throw new Error(`accountId not defined`);
  }

  const region = container.region || config.region;
  if (!region) {
    throw new Error(`region not defined`);
  }

  const buildargs = await resolveBuildargs(argv, region, container);

  logBanner(`Build Args`);
  for (const [key, value] of Object.entries(buildargs)) {
    logVariable(`${key}`, value);
  }

  logBanner(`Image Details`);

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

  const dockerfileContext = path.resolve(container.context || argv.pwd);
  const dockerfilePath = path.join(
    dockerfileContext,
    container.dockerfile || "Dockerfile",
  );
  if (container.context || container.dockerfile !== "Dockerfile") {
    logNotice(`Dockerfile context: ${dockerfileContext}`);
    logNotice(`Dockerfile path: ${dockerfilePath}`);
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

  // build image
  if (argv.buildx || !(await docker.imageExists(imageName)).data) {
    logInfo(
      argv.buildx && !argv.skipPush
        ? "Building and pushing docker image"
        : "Building docker image",
    );

    if (argv.buildx) {
      await loadDocker();
    }

    await docker.imageBuild(
      {
        imageName,
        src: [dockerfilePath],
        buildargs,
        context: dockerfileContext,
        buildx: argv.buildx,
        platform: container.platform,
        push: !!argv.buildx && !argv.skipPush,
      },
      { verbose: argv.verbose },
    );
  }

  if (!argv.skipPush) {
    if (!argv.buildx) {
      await loadDocker();
      logInfo("Pushing to ECR...");
      await docker.imagePush(imageName, { verbose: true });
    }

    logInfo(
      `Done! Deploy the service with  ${chk.magenta(
        `yarn ecs-deploy-cli deploy --stage ${argv.stage}`,
      )}`,
    );
  }
}
export async function resolveBuildargs(
  argv: EcrBuildArgv,
  region: string,
  container: EcrBuildConfigBuildItemType,
) {
  let buildargs: Record<string, any> = {};

  // legacy
  if (container.environment) {
    buildargs = { ...buildargs, ...container.environment };
  }

  if (container.environmentValues) {
    buildargs = {
      ...buildargs,
      ...(await resolveZeConfigItem(
        { values: container.environmentValues },
        { awsRegion: region, release: argv.release },
        argv.pwd,
        argv.stage,
      )),
    };
  }
  return buildargs;
}
