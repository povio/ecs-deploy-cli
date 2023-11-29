#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { command as buildCommand } from "./commands/ecr-build.command";
import { command as deployCommand } from "./commands/ecr-push.command";
import { command as pushCommand } from "./commands/ecr-push.command";
import { command as watchCommand } from "./commands/ecs-watch.command";
import { command as bootstrapCommand } from "./commands/bootstrap.command";
import { logError, logInfo } from "./helpers/cli.helper";
import { getVersion } from "./helpers/version.helper";

yargs(hideBin(process.argv))
  .version(getVersion() || "unknown")
  .scriptName("ecs-deploy")
  .command(buildCommand)
  .command(pushCommand)
  .command(deployCommand)
  .command(watchCommand)
  .command(bootstrapCommand)
  .help()
  .demandCommand(1)
  .strictCommands(true)
  .showHelpOnFail(true)
  .fail((msg, err) => {
    if (msg) logError(msg);
    if (err) {
      console.error(err);
    }
    logInfo("Use '--help' for more info");
    process.exit(1);
  })
  .parse();
