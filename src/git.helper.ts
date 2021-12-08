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
      // todo, check this without .version()
      this.enabled = false;
      return "n/a";
    }
  }

  async verifyPristine(): Promise<void> {
    if (
      ((await this.git.raw("status", "--porcelain")) as any).porcelain !== ""
    ) {
      if (process.env.IGNORE_GIT_CHANGES) {
        cli.warning("Detected changes in .git");
      } else {
        throw new Error(
          "Detected changes in .git: Make sure the build is pristine"
        );
      }
    }
  }
}

export default new Git();
