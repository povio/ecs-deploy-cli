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
  cli.var("ECS_DEPLOY_CLI", ECS_DEPLOY_CLI);
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

  const DOCKER_PATH = env.DOCKER_PATH || "Dockerfile";
  if (DOCKER_PATH !== "Dockerfile") {
    cli.var("DOCKER_PATH", env.DOCKER_PATH, "Dockerfile");
  }

  // load AWS credentails
  await aws.init(env);

  // load ECR details
  const AWS_REGION = cli.promptVar("AWS_REGION", env.AWS_REGION);
  const AWS_ACCOUNT_ID = cli.promptVar("AWS_ACCOUNT_ID", env.AWS_ACCOUNT_ID);
  const AWS_REPO_NAME = cli.promptVar("AWS_REPO_NAME", env.AWS_REPO_NAME);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// if [ -z "$SKIP_ECR_EXISTS_CHECK" ]; then
// aws ecr describe-images --repository-name="${AWS_REPO_NAME}" --image-ids=imageTag="${RELEASE}" 2>/dev/null && has_image=1 || has_image=0
// if [[ $has_image == 1 ]]; then
// log info "Image already exists"
// exit 0
// fi
// fi
//
// IMAGE_NAME="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$AWS_REPO_NAME:$RELEASE"
// env_or_prompt "IMAGE_NAME" IMAGE_NAME
//
// log banner "DOCKER"
//
// if [[ $(docker images | grep "${RELEASE}") == "" ]]; then
// log info "Building docker image .."
// docker build --progress plain -t "$IMAGE_NAME" $DOCKER_PATH --build-arg RELEASE="$RELEASE"
// else
// log info "Reusing docker image .."
// fi
//
// log banner "Setup AWS Docker Auth"
// aws ecr get-login-password | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
//
// log confirm "Press enter to upload image to ECR..." "Pushing image to ECR..."
//
// docker push "$IMAGE_NAME"
//
// log info "Done! Deploy the service with yarn run ecs:deploy or ./tools/ecs-deploy.sh"
//
