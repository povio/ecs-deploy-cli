# ECS Deploy CLI

Use this tool to deploy a Docker image to ECR and ECS with CI or manually.

Features:

- Environment and SSM credentias storage conventions
- CircleCi pipeline example
- Cross-platform (made with TypeScript/Javascript, external requirements: `git`, `docker`)
- Uses the [node-stage](https://github.com/poviolabs/node-stage) tool for configuration.


Examples:

- [NestJs](./examples/nestjs) Docker and Pipeline

# Usage

```bash
yarn add ecs-deploy-cli@poviolabs/ecs-deploy-cli#v3

# upgrade
yarn up ecs-deploy-cli@poviolabs/ecs-deploy-cli#v3
```

or install globally

```bash
npm i --location=global ecs-deploy-cli@poviolabs/ecs-deploy-cli#v3 --force
```

> Node 14 is incompatible with v3, please use [v2](https://github.com/poviolabs/ecs-deploy-cli/tree/v2) instead.

## Configure

### config.yaml
```yaml

stages:
  myapp-dev:

    ecsDeploy:

      ecrRepoName: myapp
      ecsTaskFamily: myapp-dev-backend
      ecsServiceName: myapp-dev-backend
      ecsClusterName: myapp-dev

      ## relative to PWD
      # dockerfilePath: ./Dockerfile

    ecsEnv:
      ## variables can be injected directly into ECS
      ##  but one should stick with this file by default
      ##  to avoid the ECS task environment size limit
      # TYPEORM_DATABASE: myapp

    ecsSecrets:
      TYPEORM_PASSWORD: 'arn:aws:secretsmanager:eu-central-1:000000000000:....'
      app__auth__secret: 'arn:aws:ssm:eu-central-1:000000000000:/myapp-dev/secret'
    
    ## Inject variable into docker build
    ##  This can be used for next.js along with `--releaseStrategy gitsha-stage`
    # ecsDockerEnv:
    #  app_module_key: "value"

    ## optionally, have a dot-env locally
    ##  remember to gitignore!
    # envFiles: [ '.env.myapp-dev.secrets' ]
    ## or use config.local.yaml
```

## Run

```bash
yarn ecs-deploy-cli --help

# Build a new image from the current git commit and push to ECR 
yarn ecs-deploy-cli build --stage my-stage

# Deploy the image built from the current git commit to ECS
yarn ecs-deploy-cli deploy --stage my-stage

# display a message into a slack channel with the current commit / release
yarn ecs-deploy-cli slack --messageType success
```

## Run Options

Descriptions for useful flags. Use `--help` for a comprehensive list.

#### --ecrCache

Pull the previous image from ECR before starting the build. (build only)

#### --ignoreGitChanges

Use this flag while debugging the build. This might have unintended consequences - never deploy a build made using this flag. (build only)

#### --skipEcrExistsCheck

Speed up builds if you know the ECR image does not exist. (build only)

#### --ecsBaseTaskVersion

If the ECS task got corrupted, you can use this flag to deploy a new one based on a sane version. Defaults to the latest one. (deploy only)

#### --skipPush

Only build the image. Useful for testing.

#### --platform

Set the platform explicitly, defaults to "linux/amd64"

#### --buildx

Use [docker buildx](https://docs.docker.com/buildx/working-with-buildx/) to build on ARM / Apple M1.

> More options can be found [here](https://github.com/poviolabs/node-stage#options).

## Development

### Test locally

Set up `./test/secrets.env` with credentials to do a E2E test.

```bash
# test with ts-node
yarn test:ts-node:cli --help

# build new version
yarn build

# test build
yarn test --help
```
