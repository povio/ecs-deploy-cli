// #!/bin/bash
//
// ## Build the Docker image and deploy it to ECR
// ## Skip building if the release (git version) already exists
// ## Version: 1.1
//
// set -e
// # shellcheck source=./shell-helpers.sh
// source "$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)/shell-helpers.sh"
//
// log var PWD "$(pwd)"
// log var AWS_CLI_VERSION "$(aws --version)"
// log var GIT_VERSION "$(git --version)"
// log var NODE_VERSION "$(node --version)"
// log var DOCKER_VERSION "$(docker --version)"
//
// # prevent deploying uncommitted code
// check_git_changes
//
// # load environment from .env.$STAGE
// #  AWS_REGION=
// #  AWS_ACCOUNT_ID=
// #  AWS_REPO_NAME=
//   load_stage_env false
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
