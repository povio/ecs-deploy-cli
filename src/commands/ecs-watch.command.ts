/*
 Watch a running ECS Service and its Tasks
 */

import yargs from "yargs";
import { getBuilder, YargOption, YargsOptions } from "../helpers/yargs.helper";
import { logNotice, logVariable } from "../helpers/cli.helper";
import { chk } from "../helpers/chalk.helper";

import { ecsWatch } from "../helpers/aws-ecs.helper";
import { z } from "zod";
import { safeLoadConfig } from "../helpers/ze-config";

class EcsWatchOptions implements YargsOptions {
  @YargOption({ envAlias: "PWD", demandOption: true })
  pwd!: string;

  @YargOption({ envAlias: "STAGE", demandOption: true })
  stage!: string;

  @YargOption({ envAlias: "RELEASE", demandOption: true })
  release!: string;

  @YargOption({ envAlias: "TARGET" })
  target!: string;

  @YargOption({ envAlias: "VERBOSE", default: false })
  verbose!: boolean;

  @YargOption({ default: 10, describe: "Time in seconds between checks" })
  delay!: number;
}

export const command: yargs.CommandModule = {
  command: "watch",
  describe: "Watch the ECS Service",
  builder: getBuilder(EcsWatchOptions),
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcsWatchOptions;

    const TaskDefinitionConfig = z.object({
      target: z.string().optional(),
      region: z.string().optional(),
      serviceName: z.string().optional(),
      clusterName: z.string().optional(),
    });

    const TaskDefinitionConfigs = z
      .union([
        TaskDefinitionConfig.extend({ target: z.string().optional() }),
        TaskDefinitionConfig.array(),
      ])
      .transform((val) => (Array.isArray(val) ? val : [val]));

    const config2 = await safeLoadConfig(
      "ecs-deploy",
      argv.pwd,
      argv.stage,
      z.object({
        region: z.string(),
        serviceName: z.string(),
        clusterName: z.string(),
        taskDefinition: TaskDefinitionConfigs,
      }),
    );

    let taskDefinition;
    if (argv.target) {
      logVariable("target", argv.target);
      taskDefinition = config2.taskDefinition.find((x) => {
        x.target === argv.target;
      });
    } else {
      taskDefinition = config2.taskDefinition.find((x) => {
        !x.target || x.target == "default";
      });
    }

    if (!taskDefinition) {
      throw new Error("No task definition found");
    }

    const region = taskDefinition.region || config2.region;
    const clusterName = taskDefinition.clusterName || config2.clusterName;
    const serviceName = taskDefinition.serviceName || config2.serviceName;

    logNotice(`Watching ${serviceName}`);

    await ecsWatch(
      {
        region: region,
        cluster: clusterName,
        service: serviceName,
      },
      (message) => {
        switch (message.type) {
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
          case "message":
            console.log(
              `[${chk.magenta(
                message.source,
              )} ${message.createdAt.toISOString()}] ${message.message}`,
            );
            break;
        }
      },
    ).promise;
  },
};
