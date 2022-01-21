#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { command as buildCommand } from "./ecr-build";
import { command as deployCommand } from "./ecs-deploy";
import { command as watchCommand } from "./ecs-watch";
import * as cli from "./cli.helper";

const { version } = require("../package.json");

yargs(hideBin(process.argv))
  .version(version)
  .scriptName("ecs-deploy-cli")
  .command(buildCommand)
  .command(deployCommand)
  .command(watchCommand)
  .help()
  .demandCommand(1)
  .strictCommands(true)
  .showHelpOnFail(true)
  .fail((msg, err, yargs) => {
    if (msg) cli.error(msg);
    if (err) {
        if (!!process.env.VERBOSE) {
            console.error(err);
        } else {
            cli.error(err.message);
        }
    }
    cli.info("Use '--help' for more info");
    process.exit(1);
  })
  .parse();
