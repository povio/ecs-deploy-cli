#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { command as buildCommand } from "./commands/ecr-build.command";
import { command as deployCommand } from "./commands/ecs-deploy.command";
import { command as watchCommand } from "./commands/ecs-watch.command";
import { logError, logInfo } from "node-stage";

import { getVersion } from "./helpers/version.helper";

yargs(hideBin(process.argv))
  .version(getVersion() || "unknown")
  .scriptName("ecs-deploy-cli")
  .command(buildCommand)
  .command(deployCommand)
  .command(watchCommand)
  .help()
  .demandCommand(1)
  .strictCommands(true)
  .showHelpOnFail(true)
  .fail((msg, err, yargs) => {
    if (msg) logError(msg);
    if (err) {
      if (!!process.env.VERBOSE) {
        console.error(err);
      } else {
        logError(err.message);
      }
    }
    logInfo("Use '--help' for more info");
    process.exit(1);
  })
  .parse();
