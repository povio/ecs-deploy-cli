/*
 Deploy an image from ECR to ECS Fargate
 */

import yargs from "yargs";
import { clean as semverClean, inc as semverInc } from "semver";
import { RegisterTaskDefinitionCommandInput } from "@aws-sdk/client-ecs";

import { Config, ReleaseStrategy } from "node-stage";
import {
  Option,
  YargsOptions,
  loadYargsConfig,
  getYargsOptions,
} from "node-stage/yargs";
import {

  logBanner,
  getToolEnvironment,
  logVariable,
  logInfo,
  logWarning,
  logNotice,
  confirm,
  logSuccess,
} from "node-stage/cli";
import { chk, loadColors } from "node-stage/chalk";

import {
  ecrImageExists,
  ecsGetCurrentTaskDefinition,
  ecsRegisterTaskDefinition,
  ecsUpdateService,
  ecsWatch,
} from "../helpers/aws.helper";
import { printDiff } from "../helpers/diff.helper";
import { getVersion } from "../helpers/version.helper";

class EcsDeployOptions implements YargsOptions {
  @Option({ envAlias: "PWD", demandOption: true })
  pwd!: string;

  @Option({ envAlias: "STAGE", demandOption: true })
  stage!: string;

  @Option({ envAlias: "SERVICE" })
  service!: string;

  @Option({ envAlias: "RELEASE", demandOption: true })
  release!: string;

  @Option({
    envAlias: "RELEASE_STRATEGY",
    default: "gitsha",
    choices: ["gitsha", "gitsha-stage"],
    type: "string",
  })
  releaseStrategy!: ReleaseStrategy;

  @Option({ envAlias: "AWS_REPO_NAME", demandOption: true })
  ecrRepoName!: string;

  @Option({ envAlias: "ECS_TASK_FAMILY", demandOption: true })
  ecsTaskFamily!: string;

  @Option({ envAlias: "ECS_CLUSTER_NAME", demandOption: true })
  ecsClusterName!: string;

  @Option({ envAlias: "ECS_SERVICE_NAME", demandOption: true })
  ecsServiceName!: string;

  @Option({ envAlias: "AWS_REGION", demandOption: true })
  awsRegion!: string;

  @Option({ envAlias: "AWS_ACCOUNT_ID", demandOption: true })
  awsAccountId!: string;

  @Option({ envAlias: "CI" })
  ci!: boolean;

  @Option({ envAlias: "SKIP_ECR_EXISTS_CHECK" })
  skipEcrExistsCheck!: boolean;

  @Option({ envAlias: "VERBOSE", default: false })
  verbose!: boolean;

  @Option({ envAlias: "VERSION", type: "string", alias: "ecsVersion" })
  appVersion!: string;

  @Option({
    type: "string",
    describe: "The version to base the next revision on",
  })
  ecsBaseTaskVersion!: string;

  config!: Config;
}

export const command: yargs.CommandModule = {
  command: "deploy",
  describe: "Deploy the ECR Image to ECS",
  builder: async (y) => {
    return y
      .options(getYargsOptions(EcsDeployOptions))
      .middleware(async (_argv) => {
        return (await loadYargsConfig(
          EcsDeployOptions,
          _argv as any,
          "ecsDeploy"
        )) as any;
      }, true);
  },
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcsDeployOptions;

    await loadColors();

    logBanner(`EcsBuild ${getVersion()}`);

    for (const [k, v] of Object.entries(await getToolEnvironment(argv))) {
      logVariable(k, v);
    }

    logBanner("Deploy Environment");

    logVariable("ecrRepoName", argv.ecrRepoName);
    logVariable("ecsTaskFamily", argv.ecsTaskFamily);
    logVariable("ecsClusterName", argv.ecsClusterName);
    logVariable("ecsServiceName", argv.ecsServiceName);

    // load ECR details
    const imageName = `${argv.awsAccountId}.dkr.ecr.${argv.awsRegion}.amazonaws.com/${argv.ecrRepoName}:${argv.release}`;

    logInfo(`Image name: ${imageName}`);

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

    logInfo("Getting latest task definition..");

    if (argv.ecsBaseTaskVersion) {
      logNotice(
        `Basing next version on version ${argv.ecsTaskFamily}:${argv.ecsBaseTaskVersion}`
      );
    }

    const previousTaskDefinition = await ecsGetCurrentTaskDefinition({
      region: argv.awsRegion,
      taskDefinition: argv.ecsBaseTaskVersion
        ? `${argv.ecsTaskFamily}:${argv.ecsBaseTaskVersion}`
        : argv.ecsTaskFamily,
    });

    if (previousTaskDefinition?.containerDefinitions?.length != 1) {
      // this could be handled somehow
      throw new Error("Task definition contains none or more than 1 tasks");
    }

    const previousContainerDefinition =
      previousTaskDefinition.containerDefinitions[0];

    const globalPrefix = process.env.CONFIG_PREFIX || "app";

    if (!previousContainerDefinition.environment) {
      throw new Error("Task definition missing environment");
    }

    //  get previous environment
    const taskDefinitionContainerEnvironment =
      previousContainerDefinition.environment.reduce((acc, cur) => {
        if (cur.name) {
          // @ts-ignore
          acc[cur.name] = cur.value;
        }
        return acc;
      }, {} as Record<string, string>);

    let version = argv.appVersion;
    if (!version) {
      const previousVersion =
        taskDefinitionContainerEnvironment[`${globalPrefix}__version`];
      if (previousVersion) {
        const cleanedVersion = semverClean(
          previousVersion.replace(/^([^0-9]+)/, "")
        );
        if (!cleanedVersion) {
          logWarning("Version could not be parsed");
        } else {
          // make the version ${stage}-0.0.1
          version = `${argv.stage}-${semverInc(cleanedVersion, "patch")}`;
          logInfo("Incrementing version");
        }
      } else {
        logNotice("No version provided");
      }
    } else {
      logVariable(`${globalPrefix}__version`, version);
    }

    // override task container env from config.yaml
    if (argv.config.ecsEnv && typeof argv.config.ecsEnv === "object") {
      for (const [envKey, envValue] of Object.entries(
        argv.config.ecsEnv as Record<string, string>
      )) {
        taskDefinitionContainerEnvironment[envKey] = envValue;
      }
    }

    // override version
    if (version) {
      taskDefinitionContainerEnvironment[`${globalPrefix}__version`] = version;
    }

    // check/set stage
    if (!taskDefinitionContainerEnvironment[`${globalPrefix}__stage`]) {
      taskDefinitionContainerEnvironment[`${globalPrefix}__stage`] = argv.stage;
    } else if (
      taskDefinitionContainerEnvironment[`${globalPrefix}__stage`] !==
      argv.stage
    ) {
      throw new Error(
        `Stage mismatch - tried to deploy to ${
          taskDefinitionContainerEnvironment[`${globalPrefix}__stage`]
        }`
      );
    }

    // get previous secret pointers
    const taskDefinitionContainerSecrets: Record<string, string> =
      previousContainerDefinition.secrets
        ? previousContainerDefinition.secrets.reduce((acc, cur) => {
            if (cur.name) {
              // @ts-ignore
              acc[cur.name] = cur.valueFrom;
            }
            return acc;
          }, {} as Record<string, string>)
        : {};

    // override task container secrets from config.yaml
    if (argv.config.ecsSecrets && typeof argv.config.ecsSecrets === "object") {
      for (const [secretKey, secretFrom] of Object.entries(
        argv.config.ecsSecrets as Record<string, string>
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

    logBanner("Container Definition Diff");
    printDiff(
      previousContainerDefinition,
      taskDefinitionRequest?.containerDefinitions?.[0] || {}
    );

    logBanner("Update task definition & service");

    if (!argv.ci) {
      if (!(await confirm("Press enter to deploy task to ECS..."))) {
        logInfo("Canceled");
        return;
      }
    }

    logInfo("Creating new task..");

    const taskDefinition = await ecsRegisterTaskDefinition({
      region: argv.awsRegion,
      taskDefinitionRequest,
    });

    if (!taskDefinition || !taskDefinition.taskDefinitionArn) {
      console.log({ taskDefinition: JSON.stringify(taskDefinition) });
      // this can't really happen, the call above should error out
      throw new Error("Task could not be registered.");
    }

    logBanner("Task Definition Diff");
    printDiff(taskDefinition, previousTaskDefinition);

    logInfo(`Updating service task to revision ${taskDefinition.revision}...`);

    await ecsUpdateService({
      region: argv.awsRegion,
      service: argv.ecsServiceName,
      cluster: argv.ecsClusterName,
      taskDefinition: taskDefinition.taskDefinitionArn,
    });

    if (!argv.ci) {
      logSuccess(`Service updated. You can exit by using CTRL-C now.`);

      logBanner("Service Monitor");

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
                  x?.deployments?.some(
                    (d) =>
                      d.desiredCount !== d.runningCount ||
                      d.rolloutState !== "COMPLETED"
                  )
                )
              ) {
                logSuccess("Service successfully deployed!");
                watch.stop();
              }
              break;
            case "deployment":
              const d = message.deployment;
              console.log(
                `[${chk.yellow(d.taskDefinition?.replace(/^[^\/]+/, ""))} ${
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
