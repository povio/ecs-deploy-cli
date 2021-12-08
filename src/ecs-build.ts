/*
 Build the Docker image and deploy it to ECR
  - Skip building if the release (git version) already exists
 Version: 0.1
 */

const ECS_DEPLOY_CLI = "0.1";

import cli from "./cli.helper";
import { AWS_SDK_VERSION } from "./aws.helper";
import git from "./git.helper";
import docker from "./docker.helper";
import * as process from "process";
import { getEnv } from "./env.helper";

(async function () {
  const CI = process.env.CI;

  // display tooling versions for debugging purposes
  cli.banner("Build Environment");
  cli.var("ECS_DEPLOY_CLI", ECS_DEPLOY_CLI);
  cli.var("PWD", cli.pwd);
  cli.var("AWS_SDK_VERSION", AWS_SDK_VERSION);
  cli.var("GIT_CLI_VERSION", await git.version());
  cli.var("NODE_VERSION", process.version);
  cli.var("DOCKER_VERSION", await docker.version());

  // todo, print out some circleci details
  if (CI) {
    cli.var("CI", process.env.CI);
  }

  cli.banner("Build Variables");

  if (process.env.STAGE) {
    cli.var("STAGE", process.env.STAGE);
    // get env from .env.${STAGE}(?:.(${SERVICE}|secrets))
    const env = getEnv(cli.pwd, process.env.STAGE);
  }

  if (git.enabled) {
    await git.verifyPristine();
  }

  // prevent deploying uncommitted code
  // check_git_changes
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// # load environment from .env.$STAGE
// #  AWS_REGION=
// #  AWS_ACCOUNT_ID=
// #  AWS_REPO_NAME=
//
// load_dockerfile
//
// # load RELEASE from .git
// load_release
//
// # load credentials from env or aws profile
// load_aws_credentials
//
// # ECR repository name
// env_or_prompt "AWS_REPO_NAME" AWS_REPO_NAME
//
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
