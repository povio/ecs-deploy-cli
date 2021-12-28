/*
 Build the Docker image and deploy it to ECR
  - Skip building if the release (git version) already exists
 */

import yargs from "yargs";
import cli, { variable } from "./cli.helper";

import { getGitChanges, getRelease } from "./git.helper";
import { version as dockerVersion } from "./docker.helper";
import { Options, Option, getYargsOptions } from "./yargs.helper";
import { ecrGetDockerCredentials, ecrImageExists } from "./aws.helper";
import docker from "./docker.helper";

class EcsBuildOptions extends Options {
  @Option({ envAlias: "PWD", demandOption: true })
  pwd: string;

  @Option({ envAlias: "STAGE" })
  stage: string;

  @Option({ envAlias: "RELEASE", demandOption: true })
  release: string;

  @Option({
    envAlias: "RELEASE_STRATEGY",
    default: "gitsha",
    choices: ["gitsha", "gitsha-stage"],
    type: "string",
  })
  releaseStrategy: "gitsha" | "gitsha-stage";

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
  describe: "Build and Push the ECR Image",
  builder: async (y) => {
    return y
      .options(getYargsOptions(EcsBuildOptions))
      .middleware(async (_argv) => {
        const argv = new EcsBuildOptions(await _argv, true);
        if (!argv.release) {
          argv.release =
            argv.releaseStrategy === "gitsha-stage"
              ? `${await getRelease(argv.pwd)}-${argv.stage}`
              : await getRelease(argv.pwd);
        }
        return argv;
      }, true);
  },
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcsBuildOptions;

    await cli.printEnvironment(argv);

    variable("DOCKER_VERSION", await dockerVersion());

    cli.banner("Build Environment");

    const gitChanges = await getGitChanges(argv.pwd);
    if (gitChanges !== "") {
      if (argv.ignoreGitChanges) {
        cli.warning("Changes detected in .git");
      } else {
        if (gitChanges === undefined) {
          cli.error("Error detecting Git");
        } else {
          cli.banner("Detected Changes in Git - Stage must be clean to build!");
          console.log(gitChanges);
        }
        process.exit(1);
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
        `Done! Deploy the service with yarn ecs-deploy-cli --stage ${argv.stage}`
      );
    } catch (e) {
      throw e;
    } finally {
      await docker.logout(ecrCredentials.endpoint);
    }
  },
};
