export const ECS_DEPLOY_CLI = "0.1";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { command as buildCommand } from "./ecs-build";

yargs(hideBin(process.argv))
  .version(ECS_DEPLOY_CLI)
  .command(buildCommand)
  .help()
  .demandCommand()
  .parse();
