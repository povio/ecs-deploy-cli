/*
 Bootstrap the app with a config file
 */

import yargs from "yargs";
import fs from "fs";
import path from "path";
import { dump } from "js-yaml";

import { getBuilder, YargOption, YargsOptions } from "../helpers/yargs.helper";

import { getVersion } from "../helpers/version.helper";
import {
  safeLoadConfig,
  resolveBootstrapConfigItem,
} from "../helpers/config.helper";

import { BootstrapConfig } from "../types/bootstrap.dto";

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
      const { destination } = ci;
      if (destination.endsWith(".json")) {
        fs.writeFileSync(
          path.join(argv.pwd, destination),
          JSON.stringify(data, null, 2),
        );
      } else if (
        destination.endsWith(".yml") ||
        destination.endsWith(".yaml")
      ) {
        fs.writeFileSync(path.join(argv.pwd, destination), dump(data));
      } // else if (destination.endsWith(".env")) {}
      else {
        throw new Error(`Unknown destination file type: ${destination}`);
      }
    }
  },
};
