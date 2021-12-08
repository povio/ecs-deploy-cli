import chalk, { Level as ColorSupportLevel, Chalk } from "chalk";
import * as Console from "console";

export class Cli {
  private readonly chalk: Chalk;
  private readonly log: typeof Console.log;
  public readonly pwd: string;

  constructor(level: ColorSupportLevel = 2) {
    this.chalk = new chalk.Instance({ level: process.env.CI ? 0 : level });
    this.pwd = process.cwd();
    this.log = Console.log;
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
        `${`${this.chalk.yellow(name)}:`.padEnd(20)}${this.chalk.magenta(
          value
        )}`
      );
    } else {
      this.log(`${this.chalk.yellow(`${name}:`.padEnd(20))}${value}`);
    }
  }

  info(message: string) {
    this.log(this.chalk.yellow(`[INFO] ${message}`));
  }

  notice(message: string) {
    this.log(this.chalk.magenta(`[NOTICE] ${message}`));
  }

  warning(message: string) {
    this.log(this.chalk.magenta(`[WARNING] ${message}`));
  }

  error(message: string) {
    this.log(this.chalk.magenta(`[ERROR] ${message}`));
  }

  banner(message: string) {
    this.log(this.chalk.bgYellow(`==== ${message} ====`));
  }
}

export default new Cli();
