/**
 * PovioLabs SPA Deploy Script Helpers
 *
 * @version 1.2
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import cli from "./cli.helper";

export function getEnv(pwd: string, stage: string) {
  let out: Record<string, any> = {};

  if (stage) {
    if (fs.existsSync(`.env.${stage}`)) {
      // cli.info(`Loading .env.${stage}`);
      out = { ...out, ...dotenv.parse(fs.readFileSync(`.env.${stage}`)) };
    } else {
      cli.notice(`Can not find .env.${stage}`);
    }

    // load deploy time secrets
    // runtime secrets should be injected with SSM/Secrets, see load_secrets

    if (fs.existsSync(`.env.${stage}.secrets`)) {
      if (process.env.CI) {
        cli.warning(`Loading .env.${stage}.secrets`);
      } else {
        cli.info(`Loading .env.${stage}.secrets`);
      }
      out = {
        ...out,
        ...dotenv.parse(fs.readFileSync(`.env.${stage}.secrets`)),
      };
    }

    //  load in a target of the stage
    //  example use is for deploying multiple tasks
    if (process.env.SERVICE) {
      const service = process.env.SERVICE;
      if (fs.existsSync(`.env.${stage}.${service}`)) {
        cli.info(`Loading .env.${stage}.${service}`);
        out = {
          ...out,
          ...dotenv.parse(fs.readFileSync(`.env.${stage}.${service}`)),
        };
      } else {
        cli.notice(`Can not find .env.${stage}.${service}`);
      }
    }

    // display overrides
    for (const [k, v] of Object.entries(process.env)) {
      if (k in out && out[k] !== v) {
        cli.var(k, v, out[k]);
      }
    }
  }

  // override with the env
  return { ...out, ...process.env };
}
