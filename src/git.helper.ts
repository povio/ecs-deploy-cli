import simpleGit, { SimpleGit } from "simple-git";
import cli from "./cli.helper";

class Git {
  private git: SimpleGit;
  public enabled = true;

  constructor() {
    this.git = simpleGit(cli.pwd);
  }

  async version(): Promise<string> {
    try {
      return (await this.git.raw("--version")).trim();
    } catch (e) {
      if (process.env.VERBOSE) {
        cli.error(e.toString());
      }
      this.enabled = false;
      return "n/a";
    }
  }
}

export default new Git();
