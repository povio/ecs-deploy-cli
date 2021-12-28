import chalk from "chalk";
import * as Console from "console";
import Prompt from "prompt-sync";
import process from "process";
import { getGitVersion } from "./git.helper";
import { ECS_DEPLOY_CLI } from "./index";
import { diffJson } from "diff";

export const chk = new chalk.Instance({ level: 2 });
const log = Console.log;
const prompt = Prompt({ sigint: true });

export const nonInteractive = !!process.env.CI;

/**
 * Print a variable, color it magenta if it's different from the default
 * @param name
 * @param value
 * @param defaultValue
 */
export function variable(
  name: string,
  value: any,
  defaultValue?: string | number
) {
  if (defaultValue !== undefined && defaultValue !== value) {
    log(`${chk.yellow(`${name}:`.padEnd(20))}${chk.magenta(value)}`);
  } else {
    log(`${`${name}:`.padEnd(20)}${value}`);
  }
}

export function info(message: string) {
  log(`[INFO] ${message}`);
}

export function verbose(message: string) {
  log(`[VERBOSE] ${message}`);
}

export function notice(message: string) {
  log(chk.magenta(`[NOTICE] ${message}`));
}

export function success(message: string) {
  log(chk.green(`[SUCCESS] ${message}`));
}

export function warning(message: string) {
  log(chk.red(`[WARNING] ${message}`));
}

export function error(message: string) {
  log(chk.red(`[ERROR] ${message}`));
}

export function banner(message: string) {
  log(chk.bgYellow(`==== ${message} ====`));
}

/**
 * Set a env variable
 * @param name
 * @param value
 * @param suggested - the value the scripts expects and suggest
 */
export function promptVar(name: string, value: string, suggested?: string) {
  if (value !== undefined) {
    variable(name, value, suggested);
    return value;
  }
  if (nonInteractive) {
    if (suggested !== undefined) {
      // take suggestion on CI
      variable(name, value, suggested);
      return suggested;
    } else {
      throw new Error(`Missing Environment: ${name}`);
    }
  } else {
    const response = prompt(
      `Please provide ${chk.yellow(name)} (${suggested}):`,
      suggested
    );
    // todo remove previous line to prevent duplicates
    variable(name, response, suggested);
    return response;
  }
}

export async function confirm(message: string): Promise<boolean> {
  return (await prompt(message, "yes")) === "yes";
}

export async function printEnvironment(argv: { pwd: string; stage?: string }) {
  banner(`ECS Build ${ECS_DEPLOY_CLI}`);

  variable("PWD", argv.pwd);
  variable("NODE_VERSION", process.version);

  variable("GIT_CLI_VERSION", await getGitVersion(argv.pwd));

  if (argv.stage) {
    // get current STAGE if set
    // CI would not use this for builds
    variable("STAGE", argv.stage);
  }
}

export function printDiff(one: object, two: object) {
  const line = 0;
  for (const { value, added, removed } of diffJson(one, two)) {
    if (added) {
      console.log(chk.yellow(value.replace(/\n$/, "")));
    } else if (removed) {
      console.log(chk.green(value.replace(/\n$/, "")));
    } else {
      const text = value.replace(/\n$/, "").split("\n");
      if (text.length < 6) {
        console.log(value.replace(/\n$/, ""));
      } else {
        console.log(
          [
            text[0],
            text[1],
            "...",
            text[text.length - 2],
            text[text.length - 1],
          ].join("\n")
        );
      }
    }
  }
}

export default {
  printEnvironment,
  confirm,
  promptVar,
  variable,
  notice,
  warning,
  error,
  banner,
  info,
  verbose,
  printDiff,
  success,
};
