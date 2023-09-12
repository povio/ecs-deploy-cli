/*
 Watch a running ECS Service and its Tasks
 */

import yargs from "yargs";
import {
  getYargsOptions,
  loadYargsConfig,
  YargOption,
  YargsOptions,
} from "../helpers/yargs.helper";
import { logNotice } from "../helpers/cli.helper";
import { chk } from "../helpers/chalk.helper";

import { ecsWatch } from "../helpers/aws.helper";
import { Config } from "../helpers/config.helper";

class EcsWatchOptions implements YargsOptions {
  @YargOption({ envAlias: "PWD", demandOption: true })
  pwd!: string;

  @YargOption({ envAlias: "STAGE", demandOption: true })
  stage!: string;

  @YargOption({ envAlias: "ECS_CLUSTER_NAME", demandOption: true })
  ecsClusterName!: string;

  @YargOption({ envAlias: "ECS_SERVICE_NAME" })
  ecsServiceName!: string;

  @YargOption({ envAlias: "AWS_REGION", demandOption: true })
  awsRegion!: string;

  @YargOption({ envAlias: "VERBOSE", default: false })
  verbose!: boolean;

  @YargOption({ default: 10, describe: "Time in seconds between checks" })
  delay!: number;

  config!: Config;
}

export const command: yargs.CommandModule = {
  command: "watch",
  describe: "Watch the ECS Service",
  builder: async (y) => {
    return y
      .options(getYargsOptions(EcsWatchOptions))
      .middleware(async (_argv) => {
        return (await loadYargsConfig(
          EcsWatchOptions,
          _argv as any,
          "ecsDeploy",
        )) as any;
      }, true);
  },
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcsWatchOptions;
    logNotice(`Watching ${argv.ecsServiceName}`);
    await ecsWatch(
      {
        region: argv.awsRegion,
        cluster: argv.ecsClusterName,
        service: argv.ecsServiceName,
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
