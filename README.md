# ECS Deploy CLI

## WIP

- [x] happy path build for ECR
- [ ] build/deploy for next.js
- [ ] mac m1 support for docker build
- [ ] merge build and deploy into single bin
- [ ] `STAGE=app-dev yarn ecs:build`
- [ ] `STAGE=app-dev yarn ecs:deploy`
- [ ] yaml config


Use this tool to deploy a Docker image to ECR and ECS with CI or manually.

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
