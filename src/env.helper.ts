import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import cli from "./cli.helper";

/**
 * Get env from .env.${STAGE}(?:.(${SERVICE}|secrets))
 * @param pwd
 * @param stage
 * @param override - Override the current process.env
 */
export function getEnv(pwd: string, stage?: string, override = true) {
  let out: Record<string, any> = {};

  if (!pwd) {
    throw new Error("Path not set");
  }

  if (stage) {
    if (fs.existsSync(path.join(pwd, `.env.${stage}`))) {
      // cli.info(`Loading .env.${stage}`);
      out = {
        ...out,
        ...dotenv.parse(fs.readFileSync(path.join(pwd, `.env.${stage}`))),
      };
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
        ...dotenv.parse(
          fs.readFileSync(path.join(pwd, `.env.${stage}.secrets`))
        ),
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
          ...dotenv.parse(
            fs.readFileSync(path.join(pwd, `.env.${stage}.${service}`))
          ),
        };
      } else {
        cli.notice(`Can not find .env.${stage}.${service}`);
      }
    }
  }

  for (const [k, v] of Object.entries(process.env)) {
    if (k in out && out[k] !== v) {
      out[k] = process.env[k];
    }
  }

  if (out["STAGE"] && out["STAGE"] !== stage) {
    throw new Error("Stage was overwritten in config file");
  }
  if (out["PWD"] && out["PWD"] !== pwd) {
    throw new Error("Path was overwritten in config file");
  }

  if (override) {
    for (const [k, v] of Object.entries(out)) {
      if (!(k in process.env)) {
        process.env[k] = v;
      }
    }
  }
  return out;
}
