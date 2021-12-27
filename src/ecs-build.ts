/*
 Build the Docker image and deploy it to ECR
  - Skip building if the release (git version) already exists
 */

import yargs from "yargs";
import cli from "./cli.helper";

import { getIsPristine, getRelease } from "./git.helper";
import { Options, Option, getOptions } from "./yargs.helper";

import aws from "./aws.helper";
import docker from "./docker.helper";

class EcsBuildOptions extends Options {
  @Option({ envAlias: "PWD", default: process.cwd() })
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
}

export const command: yargs.CommandModule = {
  command: "build",
  describe: "Build the ECS Image",
  builder: async (y) => {
    return y.options(getOptions(EcsBuildOptions)).middleware(async (_argv) => {
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
    cli.variable("AWS_REGION", argv.awsRegion);
    cli.variable("AWS_ACCOUNT_ID", argv.awsAccountId);
    cli.variable("AWS_REPO_NAME", argv.ecrRepoName);
  },
};

/*
export async function build(argv: Arguments<{}>) {
  // load AWS credentials
  await aws.init({
    AWS_PROFILE: env.AWS_PROFILE,
    AWS_REGION: env.AWS_REGION,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SESSION_TOKEN: env.AWS_SESSION_TOKEN,
  });

  if (!env.SKIP_ECR_EXISTS_CHECK) {
    if (
      await aws.ecrImageExists({
        repositoryName: AWS_REPO_NAME,
        imageIds: [{ imageTag: RELEASE }],
      })
    ) {
      cli.info("Image already exists");
      return;
    }
  }

  const DOCKER_PATH = env.DOCKER_PATH || "Dockerfile";
  if (DOCKER_PATH !== "Dockerfile") {
    cli.var("DOCKER_PATH", env.DOCKER_PATH, "Dockerfile");
  }

  const IMAGE_NAME = `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${AWS_REPO_NAME}:${RELEASE}`;

  cli.banner("Build Step");

  if (await docker.imageExists(IMAGE_NAME)) {
    cli.info("Reusing docker image");
  } else {
    cli.info("Building docker image");
    await docker.imageBuild(IMAGE_NAME, RELEASE, DOCKER_PATH);
  }

  cli.banner("Push step");
  cli.info("Setting up AWS Docker Auth...");
  const ecrCredentials = await aws.ecrGetDockerCredentials();

  try {
    await docker.login(ecrCredentials.endpoint, "AWS", ecrCredentials.password);
    cli.info("AWS ECR Docker Login succeeded");

    if (!cli.nonInteractive) {
      if (!(await cli.confirm("Press enter to upload image to ECR..."))) {
        cli.info("Canceled");
        return;
      }
    }

    await docker.imagePush(IMAGE_NAME);

    cli.info("Done! Deploy the service with yarn run ecs:deploy");
  } catch (e) {
    throw e;
  } finally {
    await docker.logout(ecrCredentials.endpoint);
  }
}
*/
