/*
 Build the Docker image and deploy it to ECR
  - Skip building if the release (git version) already exists
 */

import yargs from "yargs";
import path from "path";

import cli, { chk } from "~cli.helper";
import { getGitChanges, getRelease } from "~git.helper";
import {
  Option,
  getYargsOptions,
  loadYargsConfig,
  Config,
  YargsOptions,
} from "~yargs.helper";
import {
  ecrGetDockerCredentials,
  ecrGetLatestImageTag,
  ecrImageExists,
  getAwsIdentity,
} from "~aws.helper";
import { Docker } from "~docker.helper";

class EcrBuildOptions extends YargsOptions {
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

  @Option({ describe: "Pull image from ECR to use as a base" })
  ecrCache: boolean;

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

  @Option({ envAlias: "DOCKERFILE_PATH", default: "Dockerfile" })
  dockerFilePath: string;

  @Option({ envAlias: "VERBOSE", default: false })
  verbose: boolean;

  config: Config;
}

export const command: yargs.CommandModule = {
  command: "build",
  describe: "Build and Push the ECR Image",
  builder: async (y) => {
    return y
      .options(getYargsOptions(EcrBuildOptions))
      .middleware(async (_argv) => {
        const argv = loadYargsConfig(EcrBuildOptions, _argv as any);
        argv.release =
          argv.release || (await getRelease(argv.pwd, argv.releaseStrategy));

        return argv as any;
      }, true);
  },
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcrBuildOptions;

    await cli.printEnvironment(argv);

    cli.banner("Build Environment");

    if (!argv.ci) {
      cli.info("Running Interactively");
    }

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

    const docker = new Docker({
      verbose: argv.verbose,
      cwd: argv.pwd,
      env: Object.entries(process.env)
        .filter((x) => x[0].startsWith("DOCKER_"))
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {} as Record<string, string>),
    });

    cli.variable("RELEASE", argv.release);

    cli.info(`Docker Version: ${(await docker.version()).data}`);

    // load ECR details
    const imageName = `${argv.awsAccountId}.dkr.ecr.${argv.awsRegion}.amazonaws.com/${argv.ecrRepoName}:${argv.release}`;

    cli.info(`Image name: ${imageName}`);

    let ecrCredentials;

    const runDockerLogin = async () => {
      if (ecrCredentials) return;

      cli.info("Setting up AWS Docker Auth...");

      const identity = await getAwsIdentity({ region: argv.awsRegion });
      cli.info(`AWS User Arn: ${identity.Arn}`);

      ecrCredentials = await ecrGetDockerCredentials({
        region: argv.awsRegion,
      });
      await docker.login({
        serveraddress: ecrCredentials.endpoint,
        username: "AWS",
        password: ecrCredentials.password,
      });
      cli.info("AWS ECR Docker Login succeeded");
    };

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

    let previousImageName;
    if (argv.ecrCache) {
      // use the previous image for cache
      await runDockerLogin();

      const previousImageTag = await ecrGetLatestImageTag({
        region: argv.awsRegion,
        repositoryName: argv.ecrRepoName,
      });
      previousImageName = `${argv.awsAccountId}.dkr.ecr.${argv.awsRegion}.amazonaws.com/${argv.ecrRepoName}:${previousImageTag}`;
      cli.info(`Using cache image: ${previousImageName}`);
      await docker.imagePull(imageName, { verbose: true });
    }

    cli.banner("Build Step");

    const dockerFilePath = path.join(argv.pwd, argv.dockerFilePath);
    cli.notice(`Dockerfile path: ${dockerFilePath}`);

    if ((await docker.imageExists(imageName)).data) {
      cli.info("Reusing docker image");
    } else {
      cli.info("Building docker image");

      await docker.imageBuild(
        {
          imageName,
          src: [argv.dockerFilePath],
          buildargs: { RELEASE: argv.release },
          context: argv.pwd,
          previousImageName,
        },
        { verbose: true }
      );
    }

    cli.banner("Push step");

    await runDockerLogin();

    if (!argv.ci) {
      if (!(await cli.confirm("Press enter to upload image to ECR..."))) {
        cli.info("Canceled");
        return;
      }
    }

    await docker.imagePush(imageName, { verbose: true });

    cli.info(
      `Done! Deploy the service with  ${chk.magenta(
        `yarn ecs-deploy-cli deploy --stage ${argv.stage}`
      )}`
    );
  },
};
