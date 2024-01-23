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
  target: string;
  release: string;
  appVersion: string;
  ci: boolean;
  skipEcrExistsCheck: boolean;
  verbose: boolean;
}) {
  logBanner(`EcsDeploy ${getVersion()}`);
  logInfo(`NodeJS Version: ${process.version}`);

  const TaskDefinitionConfig = z.object({
    name: z.string().optional(),
    target: z.string().optional(),

    template: z.string(),

    accountId: z.string().optional(),
    region: z.string().optional(),

    taskFamily: z.string().optional(),
    serviceName: z.string().optional(),
    clusterName: z.string().optional(),

    containerDefinitions: z.array(
      z.object({
        name: z.string(),
        image: z.string(),
        environment: z.record(z.string()).optional(),
        secrets: z.record(z.string()).optional(),
      }),
    ),
  });

  const TaskDefinitionConfigs = z
    .union([TaskDefinitionConfig, TaskDefinitionConfig.array()])
    .transform((val) => (Array.isArray(val) ? val : [val]));

  const config = await safeLoadConfig(
    "ecs-deploy",
    argv.pwd,
    argv.stage,
    z.object({
      accountId: z.string().optional(),
      region: z.string().optional(),

      taskFamily: z.string().optional(),
      serviceName: z.string().optional(),
      clusterName: z.string().optional(),

      taskDefinition: TaskDefinitionConfigs,

      build: z.array(
        z.object({
          name: z.string(),
          repoName: z.string(),
        }),
      ),
    }),
  );

  logVariable("pwd", argv.pwd);
  logVariable("release", argv.release);
  logVariable("version", argv.appVersion);
  logVariable("stage", argv.stage);

  let taskDefinition;
  if (argv.target) {
    logVariable("target", argv.target);
    taskDefinition = config.taskDefinition.find(
      (x) => x.name === argv.target || x.target === argv.target,
    );
  } else {
    taskDefinition = config.taskDefinition.find(
      (x) =>
        (!x.name && !x.target) || x.name == "default" || x.target == "default",
    );
  }

  if (!taskDefinition) {
    throw new Error("Task definition not found");
  }

  const accountId = taskDefinition.accountId || config.accountId;

  if (!accountId) {
    throw new Error(`accountId not defined`);
  }

  const region = taskDefinition.region || config.region;

  if (!region) {
    throw new Error(`region not defined`);
  }

  const taskFamily = taskDefinition.taskFamily || config.taskFamily;

  if (!taskFamily) {
    throw new Error(`taskFamily not defined`);
  }

  const clusterName = taskDefinition.clusterName || config.clusterName;

  if (!clusterName) {
    throw new Error(`clusterName not defined`);
  }

  const serviceName = taskDefinition.serviceName || config.serviceName;

  if (!serviceName) {
    throw new Error(`serviceName not defined`);
  }

  logBanner("Deploy Environment");
  logVariable("accountId", accountId);
  logVariable("region", region);
  logVariable("taskFamily", taskFamily);
  logVariable("clusterName", clusterName);
  logVariable("serviceName", serviceName);

  logBanner("Fetching template");
  logVariable("taskDefinition__template", taskDefinition.template);

  const rawTemplate = await resolveResource(taskDefinition.template, {
    awsRegion: region,
    release: argv.release,
    stage: argv.stage,
    cwd: argv.pwd,
  });

  const template =
    typeof rawTemplate === "string" ? JSON.parse(rawTemplate) : rawTemplate;

  const tdRequest: RegisterTaskDefinitionCommandInput = JSON.parse(
    JSON.stringify(template),
  );

  const version = argv.appVersion;

  for (const configContainer of taskDefinition.containerDefinitions) {
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
        templateContainer.image = `${accountId}.dkr.ecr.${region}.amazonaws.com/${buildContainer.repoName}:${argv.release}`;
        logInfo(`Using build image ${templateContainer.image}`);

        // load ECR details
        if (!argv.skipEcrExistsCheck) {
          if (
            !(await ecrImageExists({
              region,
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
            accountId,
            region,
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
    region,
    taskDefinitionRequest: tdRequest,
  });

  if (!newTaskDefinition || !newTaskDefinition.taskDefinitionArn) {
    console.log({ taskDefinition: JSON.stringify(newTaskDefinition) });
    // this can't really happen, the call above should error out
    throw new Error("Task could not be registered.");
  }

  logInfo(`Updating service task to revision ${newTaskDefinition.revision}...`);

  await ecsUpdateService({
    region: region,
    service: serviceName,
    cluster: clusterName,
    taskDefinition: newTaskDefinition.taskDefinitionArn,
  });

  if (!argv.ci) {
    logSuccess(`Service updated. You can exit by using CTRL-C now.`);

    logBanner("Service Monitor");

    const watch = ecsWatch(
      {
        region: region,
        service: serviceName,
        cluster: clusterName,
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
