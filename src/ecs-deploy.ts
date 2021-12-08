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
//
// # load RELEASE from .git
// load_release
//
// # load environment from .env.$STAGE
// load_stage_env
//
// # load credentials from env or aws profile
// load_aws_credentials
//
// log banner DEPLOYMENT
//
// env_or_prompt "AWS_REPO_NAME" AWS_REPO_NAME
// env_or_prompt "ECS_TASK_FAMILY" ECS_TASK_FAMILY
// env_or_prompt "ECS_CLUSTER_NAME" ECS_CLUSTER_NAME
// env_or_prompt "ECS_SERVICE_NAME" ECS_SERVICE_NAME
//
// IMAGE_NAME="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$AWS_REPO_NAME:$RELEASE"
// env_or_prompt "IMAGE_NAME" IMAGE_NAME
//
// ## Get secret env
// # while IFS='=' read -r name value ; do
// #   if [[ $name == *'__FROM' ]]; then
// #     __name=${name::${#name}-6}
// #     log var "$__name" ${!name}
// #   fi
// # done < <(env)
//
// # Check if image exists
// if [ -z "$SKIP_ECR_EXISTS_CHECK" ]; then
//   log info "Checking if image exists..."
//   aws ecr describe-images --repository-name="${AWS_REPO_NAME}" --image-ids=imageTag="${RELEASE}" >/dev/null
//
//   if [[ $? != 0 ]]; then
//     log error "Image not found"
//     exit 1
//   fi
// fi
//
// # Get the latest task definition
// log info "Getting latest task definition.."
//
// CURRENT_TASK_DEFINITION=$(aws ecs describe-task-definition --task-definition ${ECS_TASK_FAMILY})
//
// # suggest version from task definition
// SUGGESTED_VERSION=$(echo "$CURRENT_TASK_DEFINITION" | node -e "
//   try {
//     const taskDefinition = JSON.parse(require('fs').readFileSync(0, 'utf-8')).taskDefinition;
//     const versionEnv = taskDefinition.containerDefinitions[0].environment.find(x=>x.name === 'VERSION');
//     if (versionEnv) {
//       const version = versionEnv.value.split('.');
//       version[version.length-1] = +(version[version.length-1]) + 1;
//       console.log(version.join('.'));
//     }
//   }
//   catch (e) {}
// ")
//
// if [ -z "$VERSION" ]; then
//   if [ -z "$CI" ]; then
//     # we cant distinguish the version, suggest one
//     if [ -z "$SUGGESTED_VERSION" ]; then
//       GIT_TAG=$(git tag -l --points-at HEAD)
//       if [[ $GIT_TAG =~ v(.+) ]]; then
//         SUGGESTED_VERSION=${GIT_TAG}
//       fi
//     fi
//   else
//     # auto-incremented version
//     if [ -z "$SUGGESTED_VERSION" ]; then
//       log error "Version not supplied."
//       exit 1
//     fi
//       VERSION="$SUGGESTED_VERSION"
//   fi
// fi
//
// env_or_prompt "VERSION" VERSION "${SUGGESTED_VERSION}"
//
// NEW_TASK_DEFINITION=$(echo $CURRENT_TASK_DEFINITION | node -e "
//   const currentData = JSON.parse(require('fs').readFileSync(0, 'utf-8')).taskDefinition;
//
//   const environmentDict = currentData.containerDefinitions[0].environment.reduce((acc, cur) => {
//     acc[cur.name] = cur.value;
//     return acc;
//   }, {});
//
//   environmentDict.VERSION = process.env.VERSION;
//
//   const secretsDict = currentData.containerDefinitions[0].secrets.reduce((acc, cur) => {
//     acc[cur.name] = cur.valueFrom;
//     return acc;
//   }, {});
//
//   // inject secret SSM/SM from ENV
//   for (const [k,v] of Object.entries(process.env).filter(([k,v])=>{
//     return k.endsWith('__FROM')
//   })) {
//     secretsDict[k.replace(/__FROM$/, '')] = v;
//   }
//
//   const newData = {
//     containerDefinitions: [{
//       ...currentData.containerDefinitions[0],
//       image: '${IMAGE_NAME}',
//       environment: Object.entries(environmentDict).map(([k,v]) => ({ name: k, value: v })),
//       secrets: Object.entries(secretsDict).map(([k,v]) => ({ name: k, valueFrom: v }))
//     }],
//     family: currentData.family,
//     taskRoleArn: currentData.taskRoleArn,
//     executionRoleArn: currentData.executionRoleArn,
//     networkMode: currentData.networkMode,
//     volumes: currentData.volumes,
//     placementConstraints: currentData.placementConstraints,
//     requiresCompatibilities: currentData.requiresCompatibilities,
//     cpu: currentData.cpu,
//     memory: currentData.memory,
//   }
//   console.log(JSON.stringify(newData));
// ")
//
// if [ -n "$VERBOSE" ]; then
//   log banner "TASK DEFINITION"
//   echo "$NEW_TASK_DEFINITION"
//   log banner "END TASK DEFINITION"
// fi
//
// # Update task definition & service
// log confirm "Press enter to deploy..." "Deploying..."
//
// log info "Creating new task.."
//
// TASK_DEFINITION=$(aws ecs register-task-definition --family ${ECS_TASK_FAMILY} --cli-input-json "${NEW_TASK_DEFINITION}")
// TASK_REVISION=$(echo "$TASK_DEFINITION" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).taskDefinition.revision);")
// TASK_DEFINITION_ARN_UPDATED=$(echo "$TASK_DEFINITION" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).taskDefinition.taskDefinitionArn);")
//
// log info "Updating service task to revision $TASK_REVISION..."
//
// aws ecs update-service --cluster "${ECS_CLUSTER_NAME}" --service "${ECS_SERVICE_NAME}" --task-definition ${TASK_DEFINITION_ARN_UPDATED} >/dev/null
//
// if [ -z "$CI" ]; then
//   log info "Waiting for service to deploy ..."
//   aws ecs wait services-stable --cluster "${ECS_CLUSTER_NAME}" --services "${ECS_SERVICE_NAME}"
//   log info "Deployed"
// fi
//
