/*
 Build the Docker image and deploy it to ECR
  - Skip building if the release (git version) already exists
 */

import yargs from "yargs";
import cli from "./cli.helper";

import { getIsPristine, getRelease } from "./git.helper";
import { Options, Option, getYargsOptions } from "./yargs.helper";
import { ecrGetDockerCredentials, ecrImageExists } from "./aws.helper";
import docker from "./docker.helper";

class EcsBuildOptions extends Options {
  @Option({ envAlias: "PWD" })
  pwd: string;

  @Option({ envAlias: "STAGE" })
  stage: string;

  @Option({ envAlias: "RELEASE" })
  release: string;

  @Option({ envAlias: "AWS_REPO_NAME", demandOption: true })
  ecrRepoName: string;

  @Option({ envAlias: "AWS_REGION", demandOption: true })
  awsRegion: string;

  @Option({ envAlias: "AWS_ACCOUNT_ID", demandOption: true })
  awsAccountId: string;

  @Option({ envAlias: "IGNORE_GIT_CHANGES" })
  ignoreGitChanges: boolean;

  @Option({ envAlias: "CI" })
  ci: boolean;

  @Option({ envAlias: "SKIP_ECR_EXISTS_CHECK" })
  skipEcrExistsCheck: boolean;

  @Option({ envAlias: "DOCKER_PATH", default: "Dockerfile" })
  dockerPath: string;

  @Option({ envAlias: "VERBOSE", default: false })
  verbose: boolean;
}

export const command: yargs.CommandModule = {
  command: "build",
  describe: "Build the ECS Image",
  builder: async (y) => {
    return y
      .options(getYargsOptions(EcsBuildOptions))
      .middleware(async (_argv) => {
        const argv = new EcsBuildOptions(await _argv, true);
        if (!argv.release) {
          argv.release = await getRelease(argv.pwd);
        }
        return argv;
      }, true);
  },
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcsBuildOptions;

    await cli.printEnvironment(argv);

    cli.banner("Build Environment");

    const isPristine = await getIsPristine(argv.pwd);
    if (isPristine) {
      if (argv.ignoreGitChanges) {
        cli.warning("Changes detected in .git");
      } else {
        throw new Error("Detected un-committed code in git");
      }
    }

    cli.variable("RELEASE", argv.release);

    // load ECR details
    const imageName = `${argv.awsAccountId}.dkr.ecr.${argv.awsRegion}.amazonaws.com/${argv.ecrRepoName}:${argv.release}`;

    cli.info(`Image name: ${imageName}`);

    if (!argv.skipEcrExistsCheck) {
      if (
        await ecrImageExists({
          region: argv.awsRegion,
          repositoryName: argv.ecrRepoName,
          imageIds: [{ imageTag: argv.release }],
        })
      ) {
        cli.info("Image already exists");
        return;
      }
    }

    cli.banner("Build Step");

    if (argv.dockerPath !== "Dockerfile") {
      cli.variable("DOCKER_PATH", argv.dockerPath, "Dockerfile");
    }

    cli.variable("DOCKER_VERSION", await docker.version());

    if (await docker.imageExists(imageName)) {
      cli.info("Reusing docker image");
    } else {
      cli.info("Building docker image");
      await docker.imageBuild(imageName, argv.release, argv.dockerPath);
    }

    cli.banner("Push step");
    cli.info("Setting up AWS Docker Auth...");
    const ecrCredentials = await ecrGetDockerCredentials({
      region: argv.awsRegion,
    });

    try {
      await docker.login(
        ecrCredentials.endpoint,
        "AWS",
        ecrCredentials.password
      );
      cli.info("AWS ECR Docker Login succeeded");

      if (!argv.ci) {
        if (!(await cli.confirm("Press enter to upload image to ECR..."))) {
          cli.info("Canceled");
          return;
        }
      }

      await docker.imagePush(imageName);

      cli.info(
        `Done! Deploy the service with yarn ecs:deploy --stage ${argv.stage}`
      );
    } catch (e) {
      throw e;
    } finally {
      await docker.logout(ecrCredentials.endpoint);
    }
  },
};
