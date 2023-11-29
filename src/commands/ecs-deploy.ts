import {
  confirm,
  logBanner,
  logInfo,
  logNotice,
  logSuccess,
  logVariable,
} from "../helpers/cli.helper";
import { getVersion } from "../helpers/version.helper";
import {
  ecrImageExists,
  ecsRegisterTaskDefinition,
  ecsUpdateService,
  ecsWatch,
} from "../helpers/aws-ecs.helper";
import { resolveSSMPath } from "../helpers/aws-ssm.helper";
import { printDiff } from "../helpers/diff.helper";
import { chk } from "../helpers/chalk.helper";
import { resolveResource, safeLoadConfig } from "../helpers/ze-config";
import { z } from "zod";
import { RegisterTaskDefinitionCommandInput } from "@aws-sdk/client-ecs";

export async function ecsDeploy(argv: {
  pwd: string;
  stage: string;
  release: string;
  appVersion: string;
  ci: boolean;
  skipEcrExistsCheck: boolean;
  verbose: boolean;
}) {
  logBanner(`EcsDeploy ${getVersion()}`);
  logInfo(`NodeJS Version: ${process.version}`);

  const config = await safeLoadConfig(
    "ecs-deploy",
    argv.pwd,
    argv.stage,
    z.object({
      accountId: z.string(),
      region: z.string(),

      taskFamily: z.string(),
      serviceName: z.string(),
      clusterName: z.string(),

      taskDefinition: z.object({
        template: z.string(),
        containerDefinitions: z.array(
          z.object({
            name: z.string(),
            image: z.string(),
            environment: z.record(z.string()).optional(),
            secrets: z.record(z.string()).optional(),
          }),
        ),
      }),

      build: z.array(
        z.object({
          name: z.string(),
          repoName: z.string(),
          context: z.string().optional(),
          dockerfile: z.string().optional(),
          platform: z.string().default("linux/amd64"),
          environment: z.record(z.string()).optional(),
        }),
      ),
    }),
  );

  logVariable("pwd", argv.pwd);
  logVariable("release", argv.release);
  logVariable("version", argv.appVersion);
  logVariable("stage", argv.stage);

  logBanner("Deploy Environment");
  logVariable("accountId", config.accountId);
  logVariable("region", config.region);
  logVariable("taskFamily", config.taskFamily);
  logVariable("clusterName", config.clusterName);
  logVariable("serviceName", config.serviceName);

  logBanner("Fetching template");
  logVariable("taskDefinition__template", config.taskDefinition.template);

  const template = JSON.parse(
    await resolveResource(config.taskDefinition.template, {
      awsRegion: config.region,
      release: argv.release,
      stage: argv.stage,
    }),
  );

  const tdRequest: RegisterTaskDefinitionCommandInput = JSON.parse(
    JSON.stringify(template),
  );

  const version = argv.appVersion;

  for (const configContainer of config.taskDefinition.containerDefinitions) {
    logBanner(`Container ${configContainer.name}`);

    const templateContainer = tdRequest.containerDefinitions?.find(
      (x: any) => x.name === configContainer.name,
    );

    if (!templateContainer) {
      throw new Error(
        `Container ${configContainer.name} not found in template`,
      );
    }

    if (configContainer.image) {
      const buildContainer = config.build.find(
        (x) => x.name === configContainer.image,
      );
      if (buildContainer) {
        // if container image is found in the build config, we have the image - match the release
        templateContainer.image = `${config.accountId}.dkr.ecr.${config.region}.amazonaws.com/${buildContainer.repoName}:${argv.release}`;
        logInfo(`Using build image ${templateContainer.image}`);

        // load ECR details
        if (!argv.skipEcrExistsCheck) {
          if (
            !(await ecrImageExists({
              region: config.region,
              repositoryName: buildContainer.repoName,
              imageIds: [{ imageTag: argv.release }],
            }))
          ) {
            throw new Error("ECR image does not exist");
          }
        }
      } else {
        // third party image ?
        templateContainer.image = configContainer.image;
        logNotice(`Using external image ${templateContainer.image}`);
      }
    }

    const envDict: Record<string, any> = {};
    if (templateContainer.environment) {
      for (const env of templateContainer.environment) {
        if (env.name && env.value) {
          envDict[env.name] = env.value;
        }
      }
    }
    if (configContainer.environment) {
      for (const [name, valueFrom] of Object.entries(
        configContainer.environment,
      )) {
        envDict[name] = valueFrom;
      }
    }

    if (envDict.STAGE && envDict.STAGE !== argv.stage) {
      throw new Error(`Stage mismatch - tried to deploy to ${envDict.STAGE}`);
    }
    envDict.STAGE = argv.stage;
    envDict.VERSION = version;

    templateContainer.environment = Object.entries(envDict).reduce(
      (acc, [name, value]) => {
        acc.push({ name, value });
        return acc;
      },
      [] as { name: string; value: string }[],
    );

    const secretsDict: Record<string, any> = {};
    if (templateContainer.secrets) {
      for (const secret of templateContainer.secrets) {
        if (secret.name && secret.valueFrom) {
          secretsDict[secret.name] = secret.valueFrom;
        }
      }
    }
    if (configContainer.secrets) {
      for (const [name, valueFrom] of Object.entries(configContainer.secrets)) {
        secretsDict[name] = valueFrom;
      }
    }
    templateContainer.secrets = Object.entries(secretsDict).reduce(
      (acc, [name, valueFrom]) => {
        acc.push({
          name,
          valueFrom: resolveSSMPath({
            arn: valueFrom,
            accountId: config.accountId,
            region: config.region,
          }),
        });
        return acc;
      },
      [] as { name: string; valueFrom: string }[],
    );
  }

  if (argv.verbose) {
    logBanner("Task Definition");
    console.log(JSON.stringify(tdRequest, null, 2));
  }

  logBanner("Task Definition Diff");

  printDiff(template, tdRequest);

  logBanner("Update task definition & service");

  if (!argv.ci) {
    if (!(await confirm("Press enter to deploy task to ECS..."))) {
      logInfo("Canceled");
      return;
    }
  }

  logInfo("Creating new task..");

  const newTaskDefinition = await ecsRegisterTaskDefinition({
    region: config.region,
    taskDefinitionRequest: tdRequest,
  });

  if (!newTaskDefinition || !newTaskDefinition.taskDefinitionArn) {
    console.log({ taskDefinition: JSON.stringify(newTaskDefinition) });
    // this can't really happen, the call above should error out
    throw new Error("Task could not be registered.");
  }

  logInfo(`Updating service task to revision ${newTaskDefinition.revision}...`);

  await ecsUpdateService({
    region: config.region,
    service: config.serviceName,
    cluster: config.clusterName,
    taskDefinition: newTaskDefinition.taskDefinitionArn,
  });

  if (!argv.ci) {
    logSuccess(`Service updated. You can exit by using CTRL-C now.`);

    logBanner("Service Monitor");

    const watch = ecsWatch(
      {
        region: config.region,
        service: config.serviceName,
        cluster: config.clusterName,
      },
      (message) => {
        switch (message.type) {
          case "services": {
            if (
              !message.services.some(
                (x) =>
                  x?.deployments?.some(
                    (d) =>
                      d.desiredCount !== d.runningCount ||
                      d.rolloutState !== "COMPLETED",
                  ),
              )
            ) {
              logSuccess("Service successfully deployed!");
              watch.stop();
            }
            break;
          }
          case "deployment": {
            const d = message.deployment;
            console.log(
              `[${chk.yellow(d.taskDefinition?.replace(/^[^/]+/, ""))} ${
                d.status
              } Running ${d.runningCount}/${d.desiredCount} Pending ${
                d.pendingCount
              } Rollout ${d.rolloutState}`,
            );
            break;
          }
          default: {
            console.log(
              `[${chk.magenta(
                message.source,
              )} ${message.createdAt.toISOString()}] ${message.message}`,
            );
            break;
          }
        }
      },
    );
    await watch.promise;
  }
}
