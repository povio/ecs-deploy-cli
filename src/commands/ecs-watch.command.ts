/*
 Watch a running ECS Service and its Tasks
 */

import yargs from "yargs";
import { getBuilder, YargOption, YargsOptions } from "../helpers/yargs.helper";
import { logNotice } from "../helpers/cli.helper";
import { chk } from "../helpers/chalk.helper";

import { ecsWatch } from "../helpers/aws.helper";
import { loadConfig } from "../helpers/config.helper";
import { DeployConfig } from "../types/ecs-deploy.dto";

class EcsWatchOptions implements YargsOptions {
  @YargOption({ envAlias: "PWD", demandOption: true })
  pwd!: string;

  @YargOption({ envAlias: "STAGE", demandOption: true })
  stage!: string;

  @YargOption({ envAlias: "RELEASE", demandOption: true })
  release!: string;

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

    const config = await loadConfig(
      DeployConfig,
      argv.pwd,
      argv.stage,
      argv.verbose,
    );

    logNotice(`Watching ${config.serviceName}`);
    await ecsWatch(
      {
        region: config.region,
        cluster: config.clusterName,
        service: config.serviceName,
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
