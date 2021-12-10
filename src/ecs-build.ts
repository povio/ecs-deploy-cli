/*
 Build the Docker image and deploy it to ECR
  - Skip building if the release (git version) already exists
 Version: 0.1
 */

const ECS_DEPLOY_CLI = "0.1";

import cli from "./cli.helper";
import aws from "./aws.helper";
import git from "./git.helper";
import docker from "./docker.helper";
import * as process from "process";
import { getEnv } from "./env.helper";

(async function () {
  cli.banner(`ECS Build ${ECS_DEPLOY_CLI}`);

  cli.var("PWD", cli.pwd);
  cli.var("NODE_VERSION", process.version);

  await git.init();
  cli.var("GIT_CLI_VERSION", git.version);

  await docker.init();
  cli.var("DOCKER_VERSION", docker.version);
  cli.var("AWS_SDK_VERSION", aws.version);

  cli.banner("Build Environment");

  // get current STAGE if set
  // CI would not use this for builds
  if (process.env.STAGE) {
    cli.var("STAGE", process.env.STAGE);
  }
  // get env from .env.${STAGE}(?:.(${SERVICE}|secrets))
  const env = getEnv(cli.pwd, process.env.STAGE);

  if (git.enabled) {
    // prevent deploying uncommitted code
    await git.verifyPristine(!!env.IGNORE_GIT_CHANGES);
  }

  // release sha
  const GIT_RELEASE = await git.getRelease();
  const RELEASE = cli.promptVar(
    "RELEASE",
    env.RELEASE || GIT_RELEASE,
    GIT_RELEASE
  );

  // load ECR details
  const AWS_REGION = cli.promptVar("AWS_REGION", env.AWS_REGION);
  const AWS_ACCOUNT_ID = cli.promptVar("AWS_ACCOUNT_ID", env.AWS_ACCOUNT_ID);
  const AWS_REPO_NAME = cli.promptVar("AWS_REPO_NAME", env.AWS_REPO_NAME);

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
})().catch((e) => {
  cli.error(e);
  process.exit(1);
});
