/*
 Build the Docker image and deploy it to ECR
  - Skip building if the release (git version) already exists
 */

import yargs from "yargs";

import { YargOption, YargsOptions, getBuilder } from "../helpers/yargs.helper";
import { logBanner, logInfo, logVariable } from "../helpers/cli.helper";
import { getVersion } from "../helpers/version.helper";
import { ecrPush } from "./ecr-push";

class EcrPushOptions implements YargsOptions {
  @YargOption({ demandOption: true })
  pwd!: string;

  @YargOption({ envAlias: "STAGE" })
  stage!: string;

  @YargOption({ envAlias: "CONTAINER" })
  container!: string;

  @YargOption({ envAlias: "RELEASE", demandOption: true })
  release!: string;

  @YargOption({})
  skipEcrExistsCheck!: boolean;

  @YargOption({ default: false })
  verbose!: boolean;
}

export const command: yargs.CommandModule = {
  command: "push <container>",
  describe: "Push the ECR Image",
  builder: getBuilder(EcrPushOptions),
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcrPushOptions;

    if (argv.verbose) {
      logBanner(`EcsDeploy ${getVersion()}`);
      logInfo(`NodeJS Version: ${process.version}`);

      logBanner("Build Environment");
      logVariable("pwd", argv.pwd);
      logVariable("release", argv.release);
      logVariable("stage", argv.stage);
    }

    return ecrPush(argv);
  },
};
