# ECS Deploy CLI

Use this tool to deploy a Docker image to ECR and ECS with CI or manually.

Features:

- Environment and SSM credentias storage conventions
- CircleCi pipeline example
- Cross-platform (made with TypeScript/Javascript, external requirements: `git`, `docker`)
- Uses the config structure `.env.${STAGE}`

Examples:

- [NestJs](./examples/nestjs) Docker and Pipeline

# WIP

- [ ] build/deploy for next.js
- [ ] mac m1 support for docker build

# Usage

```bash
yarn add ecs-deploy-cli@poviolabs/ecs-deploy-cli

# upgrade
yarn up ecs-deploy-cli@poviolabs/ecs-deploy-cli
```


## Configure

### .env.${STAGE}
```dotenv
AWS_ACCOUNT_ID=
AWS_REGION=eu-central-1
AWS_REPO_NAME=my-app
ECS_TASK_FAMILY=my-app-backend
ECS_CLUSTER_NAME=my-app
ECS_SERVICE_NAME=my-app-backend
```

### .env.${STAGE}.secrets

For local running (do not commit to git, use ENV within CI)

```dotenv
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

## Run

```bash
yarn ecs-deploy-cli --help

# Build a new image from the current git commit and push to ECR 
yarn ecs-deploy-cli build --stage my-stage

# Deploy the image built from the current git commit to ECS
yarn ecs-deploy-cli deploy --stage my-stage
```

## Run Options

Descriptions for useful flags. Use `--help` for a comprehensive list.

#### --releaseStrategy 

 - `gitsha` - make the same build for all stages
 - `gitsha-stage` - make a build based on the stage and git sha in cases where the build is different per stage

#### --ecrCache

Pull the previous image from ECR before starting the build. (build only)

#### --ignoreGitChanges

Use this flag while debugging the build. This might have unintended consequences - never deploy a build made using this flag. (build only)

#### --skipEcrExistsCheck

Speed up builds if you know the ECR image does not exist. (build only)

#### --ecsBaseTaskVersion

If the ECS task got corrupted, you can use this flag to deploy a new one based on a sane version. Defaults to the latest one. (deploy only)

## Development

The tool can be run locally when a deploy target is set up within .env.test.secrets

```bash
# test with ts-node
yarn test:ts-node --help

# build new version
yarn build

# test build
yarn test --help
```
