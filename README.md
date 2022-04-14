# ECS Deploy CLI

Use this tool to deploy a Docker image to ECR and ECS with CI or manually.

Features:

- Environment and SSM credentias storage conventions
- CircleCi pipeline example
- Cross-platform (made with TypeScript/Javascript, external requirements: `git`, `docker`)
- Uses the config.yaml structure

Examples:

- [NestJs](./examples/nestjs) Docker and Pipeline

# WIP

- [ ] mac m1 support for docker build

# Usage

```bash
yarn add ecs-deploy-cli@poviolabs/ecs-deploy-cli

# upgrade
yarn up ecs-deploy-cli@poviolabs/ecs-deploy-cli
```


## Configure

### config.yaml
```yaml

stages:
  myapp-dev:

    ecs_deploy:

      AWS_REPO_NAME: myapp
      ECS_TASK_FAMILY: myapp-dev-backend
      ECS_SERVICE_NAME: myapp-dev-backend
      ECS_CLUSTER_NAME: myapp-dev

      ## relative to PWD
      # DOCKER_PATH: ./Dockerfile

    ecs_env:
      ## variables can be injected directly into ECS
      ##  but one should stick with this file by default
      ##  to avoid the ECS task environment size limit
      # TYPEORM_DATABASE: myapp

    ecs_secrets:
      TYPEORM_PASSWORD: 'arn:aws:secretsmanager:eu-central-1:000000000000:....'
      app__auth__secret: 'arn:aws:ssm:eu-central-1:000000000000:/myapp-dev/secret'

    ## optionally, have a dot-env locally
    ##  remember to gitignore!
    # env_files: [ '.env.myapp-dev.secrets' ]
    ## or use config.local.yaml
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

#### --service

If the stage has multiple services, you can define the one you want to deploy here.

Example configuration

```yaml
stages:
  myapp-prd: &myapp-prd
    yaml_local_override: correct

  myapp-prd-worker:
    <<: *myapp-prd
    stage: myapp-prd
```

#### Overriding config and global prefix

CONFIG_PREFIX=app
CONFIG_FILE=config.yaml

## Development

### Test locally

Set up `./test/secrets.env` with credentials to do a E2E test.

```bash
# test with ts-node
yarn test:ts-node --help

# build new version
yarn build

# test build
yarn test --help
```

### Analyze package

```bash
npx webpack-bundle-analyzer ./dist/stats.json
```

