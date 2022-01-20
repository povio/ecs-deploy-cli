# ECS Deploy CLI

## WIP

- [x] happy path build for ECR
- [ ] build/deploy for next.js
- [ ] mac m1 support for docker build
- [ ] CI/CD Examples 
- [x] merge build and deploy into single bin
- [x] `STAGE=app-dev yarn ecs:build`
- [x] `STAGE=app-dev yarn ecs:deploy`


Use this tool to deploy a Docker image to ECR and ECS with CI or manually.

## Goals and features of this tool

- Use the common config structure `.${STAGE}.secrets`

## Install

```
yarn add ecs-deploy-cli@poviolabs/ecs-deploy-cli
```

## Configure

.env.${STAGE}
```dotenv
AWS_ACCOUNT_ID=
AWS_REGION=eu-central-1
AWS_REPO_NAME=my-app
ECS_TASK_FAMILY=my-app-backend
ECS_CLUSTER_NAME=my-app
ECS_SERVICE_NAME=my-app-backend
```

.env.${STAGE}.secrets
```dotenv
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

## Usage

```bash
yarn ecs-deploy-cli --help

yarn ecs-deploy-cli build --stage my-stage
yarn ecs-deploy-cli deploy --stage my-stage
```

## Development

```
# test tools with test env
yarn test build
yarn test deploy
yarn test watch

# build new version
yarn build
```
