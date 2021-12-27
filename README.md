# ECS Deploy CLI

## WIP

- [x] happy path build for ECR
- [ ] build/deploy for next.js
- [ ] mac m1 support for docker build
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

.env.${STAGE}
```dotenv
AWS_ACCOUNT_ID=
AWS_REGION=
AWS_REPO_NAME=
```

.env.${STAGE}.secrets
```dotenv
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```
