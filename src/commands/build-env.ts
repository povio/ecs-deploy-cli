import { resolveResource, safeLoadConfig } from "../helpers/ze-config";
import { generateIni } from "./bootstrap";
import {
  EcrBuildConfigBuildItem,
  EcrBuildConfigBuildItemType,
  resolveBuildargs,
} from "./ecr-build";
import { z } from "zod";
import { resolveEnvDict, TaskDefinitionConfig } from "./ecs-deploy";
import { resolveSSMPath } from "../helpers/aws-ssm.helper";
import { RegisterTaskDefinitionCommandInput } from "@aws-sdk/client-ecs";

export async function buildEnv(argv: {
  pwd: string;
  stage: string;
  release: string;
  verbose?: boolean;
  appVersion?: string;
  container?: string;
  target?: string;
}) {
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
      build: z.array(EcrBuildConfigBuildItem).optional(),
      taskDefinition: z
        .union([TaskDefinitionConfig, TaskDefinitionConfig.array()])
        .transform((val) => (Array.isArray(val) ? val : [val]))
        .optional(),
    }),
  );

  const env: Record<string, any> = {};

  Object.entries(process.env)
    .filter((x) => x[0].startsWith("DOCKER_"))
    .forEach(([key, value]) => {
      env[key] = value;
    });

  const release = argv.release;
  env.IMAGE_TAG = release;

  const container: EcrBuildConfigBuildItemType | undefined = config.build?.find(
    (x) => x.name === argv.container,
  );

  const accountId = container?.accountId || config.accountId;
  if (!accountId) {
    throw new Error(`accountId not defined`);
  }
  env.ACCOUNT_ID = accountId;
  const region = container?.region || config.region;
  if (!region) {
    throw new Error(`region not defined`);
  }
  env.AWS_REGION = region;
  const repoName = container?.repoName;
  if (!repoName) {
    throw new Error(`repoName not defined`);
  }
  env.ECR_REPOSITORY = repoName;
  env.IMAGE_URL = `${accountId}.dkr.ecr.${region}.amazonaws.com/${repoName}:${release}`;

  if (container) {
    env.ECR_DEPLOY_CONTAINER = container.name;
    for (const [k, v] of Object.entries(
      resolveBuildargs(argv, region, container),
    )) {
      env[`ECS_DEPLOY_DOCKER_ARGS_${k}`] = v;
    }
    env.ECR_DEPLOY_DOCKER_FILE = container.dockerfile;
    env.ECR_DEPLOY_PLATFORM = container.platform;
  }

  const target = argv.target;
  if (target) {
    env.ECS_DEPLOY_TARGET = target;
  }

  let taskDefinition;
  if (argv.target && config.taskDefinition) {
    taskDefinition = config.taskDefinition.find(
      (x) => x.name === argv.target || x.target === argv.target,
    );

    if (!taskDefinition) {
      throw new Error(`Task definition not found for target ${argv.target}`);
    }

    const version = argv.appVersion;

    const taskFamily = taskDefinition.taskFamily || config.taskFamily;
    env.ECS_TASK_FAMILY = taskFamily;

    const serviceName = taskDefinition.serviceName || config.serviceName;
    env.ECS_SERVICE_NAME = serviceName;

    const clusterName = taskDefinition.clusterName || config.clusterName;
    env.ECS_CLUSTER_NAME = clusterName;

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

    for (const configContainer of taskDefinition.containerDefinitions) {
      const templateContainer = tdRequest.containerDefinitions?.find(
        (x: any) => x.name === configContainer.name,
      );

      if (!templateContainer) {
        throw new Error(
          `Container ${configContainer.name} not found in template`,
        );
      }

      if (configContainer.image) {
        const buildContainer = config.build?.find(
          (x) => x.name === configContainer.image,
        );
        if (buildContainer) {
          // if container image is found in the build config, we have the image - match the release
          templateContainer.image = `${accountId}.dkr.ecr.${region}.amazonaws.com/${buildContainer.repoName}:${argv.release}`;
        } else {
          // third party image ?
          templateContainer.image = configContainer.image;
        }
      }

      const envDict = await resolveEnvDict(
        argv,
        region,
        templateContainer,
        configContainer,
      );

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
        for (const [name, valueFrom] of Object.entries(
          configContainer.secrets,
        )) {
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
    env.ECS_TASK_DEFINITION = JSON.stringify(tdRequest);
  }

  console.log(generateIni(env));
}
