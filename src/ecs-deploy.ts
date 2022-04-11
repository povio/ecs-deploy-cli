/*
 Deploy an image from ECR to ECS Fargate
 */

import yargs from "yargs";
import semver from "semver";
import { RegisterTaskDefinitionCommandInput } from "@aws-sdk/client-ecs";

import { getRelease } from "~git.helper";
import cli, { chk } from "./cli.helper";
import {
  Option,
  getYargsOptions,
  loadYargsConfig,
  Options,
} from "~yargs.helper";
import {
  ecrImageExists,
  ecsGetCurrentTaskDefinition,
  ecsRegisterTaskDefinition,
  ecsUpdateService,
  ecsWatch,
} from "~aws.helper";

class EcsDeployOptions extends Options {
  @Option({ envAlias: "PWD", demandOption: true })
  pwd: string;

  @Option({ envAlias: "STAGE", demandOption: true })
  stage: string;

  @Option({ envAlias: "RELEASE", demandOption: true })
  release: string;

  @Option({
    envAlias: "RELEASE_STRATEGY",
    default: "gitsha",
    choices: ["gitsha", "gitsha-stage"],
    type: "string",
  })
  releaseStrategy: "gitsha" | "gitsha-stage";

  @Option({ envAlias: "AWS_REPO_NAME", demandOption: true })
  ecrRepoName: string;

  @Option({ envAlias: "ECS_TASK_FAMILY", demandOption: true })
  ecsTaskFamily: string;

  @Option({ envAlias: "ECS_CLUSTER_NAME", demandOption: true })
  ecsClusterName: string;

  @Option({ envAlias: "ECS_SERVICE_NAME", demandOption: true })
  ecsServiceName: string;

  @Option({ envAlias: "AWS_REGION", demandOption: true })
  awsRegion: string;

  @Option({ envAlias: "AWS_ACCOUNT_ID", demandOption: true })
  awsAccountId: string;

  @Option({ envAlias: "CI" })
  ci: boolean;

  @Option({ envAlias: "SKIP_ECR_EXISTS_CHECK" })
  skipEcrExistsCheck: boolean;

  @Option({ envAlias: "VERBOSE", default: false })
  verbose: boolean;

  @Option({ envAlias: "VERSION", type: "string" })
  ecsVersion: string;

  @Option({
    type: "string",
    describe: "The version to base the next revision on",
  })
  ecsBaseTaskVersion: string;
}

export const command: yargs.CommandModule = {
  command: "deploy",
  describe: "Deploy the ECR Image to ECS",
  builder: async (y) => {
    return y
      .options(getYargsOptions(EcsDeployOptions))
      .middleware(async (_argv) => {
        const argv = loadYargsConfig(EcsDeployOptions, _argv as any);
        argv.release =
          argv.release || (await getRelease(argv.pwd, argv.releaseStrategy));

        return argv as any;
      }, true);
  },
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcsDeployOptions;

    await cli.printEnvironment(argv);

    cli.banner("Deploy Environment");

    cli.variable("AWS_REPO_NAME", argv.ecrRepoName);
    cli.variable("ECS_TASK_FAMILY", argv.ecsTaskFamily);
    cli.variable("ECS_CLUSTER_NAME", argv.ecsClusterName);
    cli.variable("ECS_SERVICE_NAME", argv.ecsServiceName);

    // load ECR details
    const imageName = `${argv.awsAccountId}.dkr.ecr.${argv.awsRegion}.amazonaws.com/${argv.ecrRepoName}:${argv.release}`;

    cli.info(`Image name: ${imageName}`);

    if (!argv.skipEcrExistsCheck) {
      if (
        !(await ecrImageExists({
          region: argv.awsRegion,
          repositoryName: argv.ecrRepoName,
          imageIds: [{ imageTag: argv.release }],
        }))
      ) {
        throw new Error("ECR image does not exist");
      }
    }

    cli.info("Getting latest task definition..");

    if (argv.ecsBaseTaskVersion) {
      cli.notice(
        `Basing next version on version ${argv.ecsTaskFamily}:${argv.ecsBaseTaskVersion}`
      );
    }

    const previousTaskDefinition = await ecsGetCurrentTaskDefinition({
      region: argv.awsRegion,
      taskDefinition: argv.ecsBaseTaskVersion
        ? `${argv.ecsTaskFamily}:${argv.ecsBaseTaskVersion}`
        : argv.ecsTaskFamily,
    });

    if (previousTaskDefinition.containerDefinitions.length != 1) {
      // this could be handled somehow
      throw new Error("Task definition contains none or more than 1 tasks");
    }

    const previousContainerDefinition =
      previousTaskDefinition.containerDefinitions[0];

    let version = argv.ecsVersion;
    if (!version) {
      const previousVersion = previousContainerDefinition.environment?.find(
        (x) => x.name === "VERSION"
      )?.value;
      if (previousVersion) {
        const cleanedVersion = semver.clean(
          previousVersion.replace(/^([^0-9]+)/, "")
        );
        if (!cleanedVersion) {
          cli.warning("Version could not be parsed");
        } else {
          // Make the version ${stage}-0.0.1
          version = `${argv.stage}-${semver.inc(cleanedVersion, "patch")}`;
          cli.info("Incrementing version");
        }
      } else {
        cli.notice("No version provided");
      }
    } else {
      cli.variable("VERSION", version);
    }

    //  Get previous environment
    const taskDefinitionContainerEnvironment =
      previousContainerDefinition.environment.reduce((acc, cur) => {
        acc[cur.name] = cur.value;
        return acc;
      }, {} as Record<string, string>);

    // override task container env from config.yaml
    if (argv.config.ecs_env && typeof argv.config.ecs_env === "object") {
      for (const [envKey, envValue] of Object.entries(
        argv.config.ecs_env as Record<string, string>
      )) {
        taskDefinitionContainerEnvironment[envKey] = envValue;
      }
    }

    // override version
    if (version) {
      taskDefinitionContainerEnvironment.VERSION = version;
    }

    // Get previous secret pointers
    const taskDefinitionContainerSecrets: Record<string, string> =
      previousContainerDefinition.secrets.reduce((acc, cur) => {
        acc[cur.name] = cur.valueFrom;
        return acc;
      }, {} as Record<string, string>);

    // override task container secrets from config.yaml
    if (
      argv.config.ecs_secrets &&
      typeof argv.config.ecs_secrets === "object"
    ) {
      for (const [secretKey, secretFrom] of Object.entries(
        argv.config.ecs_secrets as Record<string, string>
      )) {
        taskDefinitionContainerSecrets[secretKey] = secretFrom;
      }
    }

    const taskDefinitionRequest: RegisterTaskDefinitionCommandInput = {
      containerDefinitions: [
        {
          ...previousContainerDefinition,
          image: imageName,
          environment: Object.entries(taskDefinitionContainerEnvironment).map(
            ([k, v]) => ({
              name: k,
              value: v,
            })
          ),
          secrets: Object.entries(taskDefinitionContainerSecrets).map(
            ([k, v]) => ({
              name: k,
              valueFrom: v,
            })
          ),
        },
      ],
      family: previousTaskDefinition.family,
      taskRoleArn: previousTaskDefinition.taskRoleArn,
      executionRoleArn: previousTaskDefinition.executionRoleArn,
      networkMode: previousTaskDefinition.networkMode,
      volumes: previousTaskDefinition.volumes,
      placementConstraints: previousTaskDefinition.placementConstraints,
      requiresCompatibilities: previousTaskDefinition.requiresCompatibilities,
      cpu: previousTaskDefinition.cpu,
      memory: previousTaskDefinition.memory,
    };

    cli.banner("Container Definition Diff");
    cli.printDiff(
      previousContainerDefinition,
      taskDefinitionRequest.containerDefinitions[0]
    );

    cli.banner("Update task definition & service");

    if (!argv.ci) {
      if (!(await cli.confirm("Press enter to deploy task to ECS..."))) {
        cli.info("Canceled");
        return;
      }
    }

    cli.info("Creating new task..");

    const taskDefinition = await ecsRegisterTaskDefinition({
      region: argv.awsRegion,
      taskDefinitionRequest,
    });

    cli.banner("Task Definition Diff");
    cli.printDiff(taskDefinition, previousTaskDefinition);

    cli.info(`Updating service task to revision ${taskDefinition.revision}...`);

    await ecsUpdateService({
      region: argv.awsRegion,
      service: argv.ecsServiceName,
      cluster: argv.ecsClusterName,
      taskDefinition: taskDefinition.taskDefinitionArn,
    });

    if (!argv.ci) {
      cli.success(`Service updated. You can exit by using CTRL-C now.`);

      cli.banner("Service Monitor");

      const watch = ecsWatch(
        {
          region: argv.awsRegion,
          cluster: argv.ecsClusterName,
          service: argv.ecsServiceName,
        },
        (message) => {
          switch (message.type) {
            case "services":
              if (
                !message.services.some((x) =>
                  x.deployments.some(
                    (d) =>
                      d.desiredCount !== d.runningCount ||
                      d.rolloutState !== "COMPLETED"
                  )
                )
              ) {
                cli.success("Service successfully deployed!");
                watch.stop();
              }
              break;
            case "deployment":
              const d = message.deployment;
              console.log(
                `[${chk.yellow(d.taskDefinition.replace(/^[^\/]+/, ""))} ${
                  d.status
                } Running ${d.runningCount}/${d.desiredCount} Pending ${
                  d.pendingCount
                } Rollout ${d.rolloutState}`
              );
              break;
            default:
              console.log(
                `[${chk.magenta(
                  message.source
                )} ${message.createdAt.toISOString()}] ${message.message}`
              );
              break;
          }
        }
      );
      await watch.promise;
    }
  },
};
