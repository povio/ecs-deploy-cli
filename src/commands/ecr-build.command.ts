/*
 Build the Docker image and deploy it to ECR
  - Skip building if the release (git version) already exists
 */

import yargs from "yargs";
import path from "path";

import { Config, ReleaseStrategy } from "node-stage";
import {
  Option,
  YargsOptions,
  loadYargsConfig,
  getYargsOptions,
} from "node-stage/yargs";
import {
  logBanner,
  getToolEnvironment,
  logVariable,
  logInfo,
  logWarning,
  logNotice,
  logError,
} from "node-stage/cli";
import { chk } from "node-stage/chalk";
import { getGitChanges } from "node-stage/git";

import { getVersion } from "../helpers/version.helper";

import {
  ecrGetDockerCredentials,
  ecrGetLatestImageTag,
  ecrImageExists,
  getAwsIdentity,
} from "../helpers/aws.helper";
import { Docker } from "../helpers/docker.helper";

class EcrBuildOptions implements YargsOptions {
  @Option({ envAlias: "PWD", demandOption: true })
  pwd!: string;

  @Option({ envAlias: "STAGE" })
  stage!: string;

  @Option({ envAlias: "RELEASE", demandOption: true })
  release!: string;

  @Option({
    envAlias: "RELEASE_STRATEGY",
    default: "gitsha",
    choices: ["gitsha", "gitsha-stage"],
    type: "string",
  })
  releaseStrategy!: ReleaseStrategy;

  @Option({
    envAlias: "AWS_REPO_NAME",
    demandOption: true,
    alias: ["awsRepoName"],
  })
  ecrRepoName!: string;

  @Option({ describe: "Pull image from ECR to use as a base" })
  ecrCache!: boolean;

  @Option({ envAlias: "AWS_REGION", demandOption: true })
  awsRegion!: string;

  @Option({ envAlias: "AWS_ACCOUNT_ID", demandOption: true })
  awsAccountId!: string;

  @Option({ envAlias: "IGNORE_GIT_CHANGES" })
  ignoreGitChanges!: boolean;

  @Option({ envAlias: "CI" })
  ci!: boolean;

  @Option({ envAlias: "SKIP_ECR_EXISTS_CHECK" })
  skipEcrExistsCheck!: boolean;

  @Option({ envAlias: "DOCKERFILE_PATH", default: "Dockerfile" })
  dockerfilePath!: string;

  @Option({ envAlias: "DOCKERFILE_CONTEXT" })
  dockerfileContext!: string;

  @Option({
    // requires Docker daemon API  version 1.38
    // default: "linux/amd64"
  })
  platform!: string;

  @Option({ default: false })
  buildx!: boolean;

  @Option({ default: false })
  skipPush!: boolean;

  @Option({ envAlias: "VERBOSE", default: false })
  verbose!: boolean;

  config!: Config;
}

export const command: yargs.CommandModule = {
  command: "build",
  describe: "Build and Push the ECR Image",
  builder: async (y) => {
    return y
      .options(getYargsOptions(EcrBuildOptions))
      .middleware(async (_argv) => {
        return (await loadYargsConfig(
          EcrBuildOptions,
          _argv as any,
          "ecsDeploy"
        )) as any;
      }, true);
  },
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcrBuildOptions;

    logBanner(`EcsDeploy ${getVersion()}`);

    for (const [k, v] of Object.entries(await getToolEnvironment(argv))) {
      logVariable(k, v);
    }

    logBanner("Build Environment");

    if (!argv.ci) {
      logInfo("Running Interactively");
    }

    const gitChanges = await getGitChanges(argv.pwd);
    if (gitChanges !== "") {
      if (argv.ignoreGitChanges) {
        logWarning("Changes detected in .git");
      } else {
        if (gitChanges === undefined) {
          logError("Error detecting Git");
        } else {
          logBanner("Detected Changes in Git - Stage must be clean to build!");
          console.log(gitChanges);
        }
        process.exit(1);
      }
    }

    const docker = new Docker({
      verbose: argv.verbose,
      cwd: argv.pwd,
      env: Object.entries(process.env)
        .filter((x) => x[0].startsWith("DOCKER_"))
        .reduce((acc, [key, value]) => {
          acc[key] = value as string;
          return acc;
        }, {} as Record<string, string>),
    });

    logVariable("release", argv.release);

    logInfo(`Docker Version: ${(await docker.version()).data}`);

    // load ECR details
    const imageName = `${argv.awsAccountId}.dkr.ecr.${argv.awsRegion}.amazonaws.com/${argv.ecrRepoName}:${argv.release}`;

    logInfo(`Image name: ${imageName}`);

    logInfo("Setting up AWS Docker Auth...");

    const identity = await getAwsIdentity({ region: argv.awsRegion });
    logInfo(`AWS User Arn: ${identity.Arn}`);

    const ecrCredentials = await ecrGetDockerCredentials({
      region: argv.awsRegion,
    });
    await docker.login({
      serveraddress: ecrCredentials.endpoint,
      username: "AWS",
      password: ecrCredentials.password,
    });
    logInfo("AWS ECR Docker Login succeeded");

    // check if image already exists
    if (!argv.skipEcrExistsCheck) {
      if (
        await ecrImageExists({
          region: argv.awsRegion,
          repositoryName: argv.ecrRepoName,
          imageIds: [{ imageTag: argv.release }],
        })
      ) {
        logInfo("Image already exists");
        return;
      }
    }

    // load previous image to speed up build
    let previousImageName;
    if (argv.ecrCache) {
      if (!argv.buildx) {
        throw new Error("Buildx can not be used with ECR Cache");
      }
      // use the previous image for cache
      const previousImageTag = await ecrGetLatestImageTag({
        region: argv.awsRegion,
        repositoryName: argv.ecrRepoName,
      });
      previousImageName = `${argv.awsAccountId}.dkr.ecr.${argv.awsRegion}.amazonaws.com/${argv.ecrRepoName}:${previousImageTag}`;
      logInfo(`Using cache image: ${previousImageName}`);
      await docker.imagePull(imageName, { verbose: true });
    }

    const dockerfileContext = path.resolve(argv.dockerfileContext || argv.pwd);
    const dockerfilePath = path.join(dockerfileContext, argv.dockerfilePath);
    if (argv.dockerfileContext || argv.dockerfilePath !== "Dockerfile") {
      logNotice(`Dockerfile context: ${dockerfileContext}`);
      logNotice(`Dockerfile path: ${dockerfilePath}`);
    }

    // next.js needs to have per stage build time variables
    //  check that we are not reusing the image in multiple stages
    if (argv.config.ecsDockerEnv) {
      if (argv.releaseStrategy === "gitsha") {
        throw new Error(
          "Docker environment injection can not be used with releaseStrategy=gitsha"
        );
      }
    }

    // build image
    if (argv.buildx || !(await docker.imageExists(imageName)).data) {
      logInfo("Building docker image");

      await docker.imageBuild(
        {
          imageName,
          src: [dockerfilePath],
          buildargs: {
            RELEASE: argv.release,
            ...(argv.config.ecsDockerEnv ? argv.config.ecsDockerEnv : {}),
          },
          context: dockerfileContext,
          previousImageName,
          buildx: argv.buildx,
          platform: argv.platform,
          push: argv.buildx && !argv.skipPush,
        },
        { verbose: true }
      );
    }

    if (!argv.skipPush) {
      if (!argv.buildx) {
        logInfo("Pushing to ECR...");
        await docker.imagePush(imageName, { verbose: true });
      }

      logInfo(
        `Done! Deploy the service with  ${chk.magenta(
          `yarn ecs-deploy-cli deploy --stage ${argv.stage}`
        )}`
      );
    }
  },
};
