/*
 Bootstrap the app with a config file
 */

import yargs from "yargs";

import { getBuilder, YargOption, YargsOptions } from "../helpers/yargs.helper";

import { buildEnv } from "./build-env";

class BuildEnvOptions implements YargsOptions {
  @YargOption({ envAlias: "PWD", demandOption: true })
  pwd!: string;

  @YargOption({ envAlias: "STAGE", demandOption: true })
  stage!: string;

  @YargOption({ envAlias: "RELEASE", demandOption: true })
  release!: string;

  @YargOption({ envAlias: "VERBOSE", default: false })
  verbose!: boolean;

  @YargOption({ envAlias: "CONTAINER", demandOption: false })
  container!: string;

  @YargOption({ envAlias: "TARGET", demandOption: false })
  target!: string;

  @YargOption({ envAlias: "VERSION", type: "string", alias: "ecsVersion" })
  appVersion!: string;
}

export const command: yargs.CommandModule = {
  command: "build-env",
  describe: "Output build and deploy environment variables",
  builder: getBuilder(BuildEnvOptions),
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as BuildEnvOptions;
    return buildEnv(argv);
  },
};
