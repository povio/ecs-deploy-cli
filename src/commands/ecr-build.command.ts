/*
 Build the Docker image and deploy it to ECR
  - Skip building if the release (git version) already exists
 */

import yargs from "yargs";
import path from "path";
import fs from "fs";

import { YargOption, YargsOptions, getBuilder } from "../helpers/yargs.helper";
import {
  logBanner,
  logVariable,
  logInfo,
  logWarning,
  logNotice,
  logError,
} from "../helpers/cli.helper";
import { chk } from "../helpers/chalk.helper";
import { getGitChanges, getGitVersion } from "../helpers/git.helper";

import { getVersion } from "../helpers/version.helper";

import {
  ecrGetDockerCredentials,
  ecrImageExists,
  getAwsIdentity,
} from "../helpers/aws.helper";
import { Docker } from "../helpers/docker.helper";
import { loadConfig } from "../helpers/config.helper";
import { BuildConfig } from "../types/ecs-deploy.dto";

class EcrBuildOptions implements YargsOptions {
  @YargOption({ demandOption: true })
  pwd!: string;

  @YargOption({ envAlias: "STAGE" })
  stage!: string;

  @YargOption({ envAlias: "CONTAINER" })
  container!: string;

  @YargOption({ envAlias: "RELEASE", demandOption: true })
  release!: string;

  @YargOption({})
  ignoreGitChanges!: boolean;

  @YargOption({ envAlias: "CI" })
  ci!: boolean;

  @YargOption({})
  skipEcrExistsCheck!: boolean;

  @YargOption({ default: false })
  skipPush!: boolean;

  @YargOption({ default: false })
  buildx!: boolean;

  @YargOption({ default: false })
  verbose!: boolean;
}

export const command: yargs.CommandModule = {
  command: "build <container>",
  describe: "Build and Push the ECR Image",
  builder: getBuilder(EcrBuildOptions),
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcrBuildOptions;

    logBanner(`EcsDeploy ${getVersion()}`);
    logInfo(`NodeJS Version: ${process.version}`);

    if (!argv.ci) {
      // check for git changes
      if (fs.existsSync(path.join(argv.pwd, ".git"))) {
        logVariable("Git Version", await getGitVersion(argv.pwd));
        const gitChanges = await getGitChanges(argv.pwd);
        if (gitChanges !== "") {
          if (argv.ignoreGitChanges) {
            logWarning("Changes detected in .git");
          } else {
            if (gitChanges === undefined) {
              logError("Error detecting Git");
            } else {
              logBanner(
                "Detected Changes in Git - Stage must be clean to build!",
              );
              console.log(gitChanges);
            }
            process.exit(1);
          }
        }
      }
    } else {
      logInfo("Running Interactively");
    }

    logBanner("Build Environment");
    logVariable("pwd", argv.pwd);
    logVariable("release", argv.release);
    logVariable("stage", argv.stage);

    const config = await loadConfig(
      BuildConfig,
      argv.pwd,
      argv.stage,
      argv.verbose,
    );

    const docker = new Docker({
      verbose: argv.verbose,
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

    const container = config.build.find((x) => x.name === argv.container);
    if (!container) {
      throw new Error(`Container ${argv.container} not found`);
    }

    // load ECR details
    const imageName = `${config.accountId}.dkr.ecr.${config.region}.amazonaws.com/${container.repoName}:${argv.release}`;
    logVariable(`image`, imageName);

    logInfo("Setting up AWS Docker Auth...");

    const identity = await getAwsIdentity({ region: config.region });
    logInfo(`AWS User Arn: ${identity.Arn}`);

    const ecrCredentials = await ecrGetDockerCredentials({
      region: config.region,
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
          region: config.region,
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

    // build image
    if (argv.buildx || !(await docker.imageExists(imageName)).data) {
      logInfo(
        argv.buildx && !argv.skipPush
          ? "Building and pushing docker image"
          : "Building docker image",
      );

      await docker.imageBuild(
        {
          imageName,
          src: [dockerfilePath],
          buildargs: {
            RELEASE: argv.release,
            ...(container.environment ? container.environment : {}),
          },
          context: dockerfileContext,
          buildx: argv.buildx,
          platform: container.platform,
          push: argv.buildx && !argv.skipPush,
        },
        { verbose: argv.verbose },
      );
    }

    if (!argv.skipPush) {
      if (!argv.buildx) {
        logInfo("Pushing to ECR...");
        await docker.imagePush(imageName, { verbose: true });
      }

      logInfo(
        `Done! Deploy the service with  ${chk.magenta(
          `yarn ecs-deploy-cli deploy --stage ${argv.stage}`,
        )}`,
      );
    }
  },
};
