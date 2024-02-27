import { z } from "zod";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

import {
  logBanner,
  logInfo,
  logNotice,
  logVariable,
} from "../helpers/cli.helper";

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
import { getVersion } from "../helpers/version.helper";

type EcrBuildArgv = {
  pwd: string;
  stage: string;
  container?: string;
  release?: string;
  skipEcrExistsCheck?: boolean;
  buildx?: boolean;
  skipPush?: boolean;
  verbose?: boolean;
  outputYml?: string;
  outputJson?: string;
  dryRun?: boolean;
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
  const debugOutput: Record<string, any> = {
    version: getVersion() || "unknown",
    argv: {
      pwd: argv.pwd,
      release: argv.release,
      stage: argv.stage,
      dryRun: argv.dryRun,
    },
    build: {},
  };

  try {
    // debugOutput["argv"] = argv;

    const config = await safeLoadConfig(
      "ecs-deploy",
      argv.pwd,
      argv.stage,
      EcrBuildConfig,
    );

    //debugOutput["config"] = config;

    const dockerEnv = Object.entries(process.env)
      .filter((x) => x[0].startsWith("DOCKER_"))
      .reduce(
        (acc, [key, value]) => {
          acc[key] = value as string;
          return acc;
        },
        {} as Record<string, string>,
      );

    debugOutput["build"]["env"] = dockerEnv;

    let docker: Docker | undefined = undefined;
    if (!argv.dryRun) {
      docker = new Docker({
        verbose: true,
        cwd: argv.pwd,
        // pass in variables meant for docker
        env: dockerEnv,
      });
      logBanner(`Docker ${(await docker.version()).data}`);
    }

    logVariable("container", argv.container);

    const container: EcrBuildConfigBuildItemType | undefined =
      config.build.find((x) => x.name === argv.container);

    if (!container) {
      throw new Error(`Container ${argv.container} not found`);
    }

    //debugOutput["build"]["container"] = container;

    const accountId = container.accountId || config.accountId;

    debugOutput["build"]["accountId"] = accountId;

    if (!accountId) {
      throw new Error(`accountId not defined`);
    }

    const region = container.region || config.region;
    if (!region) {
      throw new Error(`region not defined`);
    }

    debugOutput["build"]["region"] = accountId;

    const buildargs = await resolveBuildargs(argv, region, container);

    debugOutput["build"]["args"] = buildargs;

    logBanner(`Build Args`);
    for (const [key, value] of Object.entries(buildargs)) {
      logVariable(`${key}`, value);
    }

    logBanner(`Image Details`);

    // load ECR details
    const imageName = `${accountId}.dkr.ecr.${region}.amazonaws.com/${container.repoName}:${argv.release}`;
    logVariable(`image`, imageName);

    debugOutput["build"]["imageName"] = imageName;

    // check if image already exists
    if (!argv.dryRun && !argv.skipEcrExistsCheck) {
      const loadIdentity = async () => {
        logInfo("Setting up AWS Docker Auth...");
        const identity = await getAwsIdentity({ region });
        logInfo(`AWS User Arn: ${identity.Arn}`);
      };
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

    debugOutput["build"]["context"] = dockerfileContext;
    debugOutput["build"]["path"] = dockerfilePath;

    const loadDocker = argv.dryRun
      ? async () => {}
      : async () => {
          const ecrCredentials = await ecrGetDockerCredentials({
            region,
          });
          if (!docker) throw new Error("Docker not initialized");
          await docker.login({
            serveraddress: ecrCredentials.endpoint,
            username: "AWS",
            password: ecrCredentials.password,
          });
          logInfo("AWS ECR Docker Login succeeded");
        };

    if (!argv.dryRun) {
      if (!docker) throw new Error("Docker not initialized");

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
    }

    if (!argv.dryRun) {
      if (!argv.skipPush) {
        if (!argv.buildx) {
          await loadDocker();
          if (!docker) throw new Error("Docker not initialized");
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
  } finally {
    if (argv.outputYml) {
      const outputYaml = path.join(argv.pwd, argv.outputYml);
      logInfo(`Writing meta data to ${outputYaml}`);
      fs.writeFileSync(outputYaml, yaml.dump(debugOutput), "utf-8");
    }
    if (argv.outputJson) {
      const outputJson = path.join(argv.pwd, argv.outputJson);
      logInfo(`Writing meta data to ${outputJson}`);
      fs.writeFileSync(
        outputJson,
        JSON.stringify(debugOutput, null, 4),
        "utf-8",
      );
    }
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
