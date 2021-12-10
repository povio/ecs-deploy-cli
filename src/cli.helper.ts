import chalk, { Level as ColorSupportLevel, Chalk } from "chalk";
import * as Console from "console";
import Prompt from "prompt-sync";

export class Cli {
  private readonly chalk: Chalk;
  private readonly log: typeof Console.log;
  public readonly pwd: string;
  public readonly nonInteractive: boolean;
  private readonly prompt;

  constructor(level: ColorSupportLevel = 2) {
    this.chalk = new chalk.Instance({ level });
    this.pwd = process.cwd();
    this.log = Console.log;
    this.nonInteractive = !!process.env.CI;
    this.prompt = Prompt({ sigint: true });
  }

  /**
   * Print a variable, color it magenta if it's different from the default
   * @param name
   * @param value
   * @param def
   */
  var(name: string, value: string | number, def?: string | number) {
    if (def !== undefined && def !== value) {
      this.log(
        `${this.chalk.yellow(`${name}:`.padEnd(20))}${this.chalk.magenta(
          value
        )}`
      );
    } else {
      this.log(`${`${name}:`.padEnd(20)}${value}`);
    }
  }

  info(message: string) {
    this.log(`[INFO] ${message}`);
  }

  notice(message: string) {
    this.log(this.chalk.magenta(`[NOTICE] ${message}`));
  }

  warning(message: string) {
    this.log(this.chalk.red(`[WARNING] ${message}`));
  }

  error(message: string) {
    this.log(this.chalk.red(`[ERROR] ${message}`));
  }

  banner(message: string) {
    this.log(this.chalk.bgYellow(`==== ${message} ====`));
  }

  /**
   * Set a env variable
   * @param name
   * @param value
   * @param suggested - the value the scripts expects and suggest
   */
  promptVar(name: string, value: string, suggested?: string) {
    if (value !== undefined) {
      this.var(name, value, suggested);
      return value;
    }
    if (this.nonInteractive) {
      if (suggested !== undefined) {
        // take suggestion on CI
        this.var(name, value, suggested);
        return suggested;
      } else {
        throw new Error(`Missing Environment: ${name}`);
      }
    } else {
      const response = this.prompt(
        `Please provide ${this.chalk.yellow(name)} (${suggested}):`,
        suggested
      );
      // todo remove previous line to prevent duplicates
      this.var(name, response, suggested);
      return response;
    }
  }

  async confirm(message: string): Promise<boolean> {
    return (await this.prompt(message, "yes")) === "yes";
  }
}

export default new Cli();
