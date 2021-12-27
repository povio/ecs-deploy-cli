export const ECS_DEPLOY_CLI = "0.1";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { command as buildCommand } from "./ecs-build";
import { command as deployCommand } from "./ecs-deploy";
import * as cli from "./cli.helper";

yargs(hideBin(process.argv))
  .version(ECS_DEPLOY_CLI)
  .command(buildCommand)
  .command(deployCommand)
  .help()
  .demandCommand(1)
  .strictCommands(true)
  .showHelpOnFail(true)
  .fail((msg, err, yargs) => {
    if (msg) cli.error(msg);
    if (err) throw err;
    cli.info("Use '--help' for more info");
    process.exit(1);
  })
  .parse();
