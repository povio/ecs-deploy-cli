/*
 Bootstrap the app with a config file
 */

import yargs from "yargs";

import { getBuilder, YargOption, YargsOptions } from "../helpers/yargs.helper";

import { getVersion } from "../helpers/version.helper";
import {
  safeLoadConfig,
  resolveBootstrapConfigItem,
} from "../helpers/config.helper";
import { BootstrapConfig } from "../types/ecs-deploy.dto";

class BootstrapOptions implements YargsOptions {
  @YargOption({ envAlias: "PWD", demandOption: true })
  pwd!: string;

  @YargOption({ envAlias: "STAGE", demandOption: true })
  stage!: string;

  @YargOption({ envAlias: "RELEASE", demandOption: true })
  release!: string;

  @YargOption({ envAlias: "VERBOSE", default: false })
  verbose!: boolean;
}

export const command: yargs.CommandModule = {
  command: "bootstrap",
  describe: "Bootstrap the app with a config file",
  builder: getBuilder(BootstrapOptions),
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as BootstrapOptions;

    const config = await safeLoadConfig(
      "ecs-deploy",
      argv.pwd,
      argv.stage,
      BootstrapConfig,
    );

    if (argv.verbose) {
      console.log({
        event: "bootstrap",
        ecsDeploy: getVersion(),
        nodejs: process.version,
        pwd: argv.pwd,
        release: argv.release,
        stage: argv.stage,
        accountId: config.accountId,
        region: config.region,
      });
    }

    for (const ci of config.configs) {
      const data = await resolveBootstrapConfigItem(
        ci,
        config,
        argv.pwd,
        argv.stage,
      );

      console.log(data);
    }
  },
};
