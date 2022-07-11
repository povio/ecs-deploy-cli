/*
 Watch a running ECS Service and its Tasks
 */

import yargs from "yargs";

import { Config } from "node-stage";
import {
  getYargsOptions,
  Option,
  YargsOptions,
  loadYargsConfig,
} from "node-stage/yargs";
import { logNotice } from "node-stage/cli";
import { chk, loadColors } from "node-stage/chalk";

import { ecsWatch } from "../helpers/aws.helper";

class EcsWatchOptions implements YargsOptions {
  @Option({ envAlias: "PWD", demandOption: true })
  pwd!: string;

  @Option({ envAlias: "STAGE", demandOption: true })
  stage!: string;

  @Option({ envAlias: "ECS_CLUSTER_NAME", demandOption: true })
  ecsClusterName!: string;

  @Option({ envAlias: "ECS_SERVICE_NAME" })
  ecsServiceName!: string;

  @Option({ envAlias: "AWS_REGION", demandOption: true })
  awsRegion!: string;

  @Option({ envAlias: "VERBOSE", default: false })
  verbose!: boolean;

  @Option({ default: 10, describe: "Time in seconds between checks" })
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
          "ecsDeploy"
        )) as any;
      }, true);
  },
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcsWatchOptions;
    await loadColors();
    logNotice(`Watching ${argv.ecsServiceName}`);
    await ecsWatch(
      {
        region: argv.awsRegion,
        cluster: argv.ecsClusterName,
        service: argv.ecsServiceName,
      },
      (message) => {
        switch (message.type) {
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
          case "message":
            console.log(
              `[${chk.magenta(
                message.source
              )} ${message.createdAt.toISOString()}] ${message.message}`
            );
            break;
        }
      }
    ).promise;
  },
};
