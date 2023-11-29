/*
 Deploy an image from ECR to ECS Fargate
 */

import yargs from "yargs";

import { YargOption, YargsOptions, getBuilder } from "../helpers/yargs.helper";
import { ecsDeploy } from "./ecs-deploy";

class EcsDeployOptions implements YargsOptions {
  @YargOption({ envAlias: "PWD", demandOption: true })
  pwd!: string;

  @YargOption({ envAlias: "STAGE", demandOption: true })
  stage!: string;

  @YargOption({ envAlias: "RELEASE", demandOption: true })
  release!: string;

  @YargOption({ envAlias: "CI" })
  ci!: boolean;

  @YargOption({ envAlias: "SKIP_ECR_EXISTS_CHECK" })
  skipEcrExistsCheck!: boolean;

  @YargOption({ envAlias: "VERBOSE", default: false })
  verbose!: boolean;

  @YargOption({ envAlias: "VERSION", type: "string", alias: "ecsVersion" })
  appVersion!: string;
}

export const command: yargs.CommandModule = {
  command: "deploy",
  describe: "Deploy the ECR Image to ECS",
  builder: getBuilder(EcsDeployOptions),
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcsDeployOptions;

    await ecsDeploy(argv);
  },
};
