/*
 Bootstrap the app with a config file
 */

import yargs from "yargs";

import { getBuilder, YargOption, YargsOptions } from "../helpers/yargs.helper";

import { bootstrap } from "./bootstrap";

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

    await bootstrap(argv);
  },
};
