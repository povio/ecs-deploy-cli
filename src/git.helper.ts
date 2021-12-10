import simpleGit, { SimpleGit } from "simple-git";
import cli from "./cli.helper";

class Git {
  private git: SimpleGit;
  private _version: string;
  public enabled: boolean;

  constructor() {
    this.git = simpleGit(cli.pwd);
  }

  get version() {
    return this._version;
  }

  async init() {
    try {
      this._version = (await this.git.raw("--version")).trim();
      this.enabled = true;
    } catch (e) {
      if (process.env.VERBOSE) {
        cli.error(e.toString());
      }
      this.enabled = false;
      return "n/a";
    }
    return this._version;
  }

  async verifyPristine(ignore = false): Promise<void> {
    if (
      ((await this.git.raw("status", "--porcelain")) as any).porcelain !== ""
    ) {
      if (ignore) {
        cli.warning("Detected changes in .git");
      } else {
        throw new Error(
          "Detected changes in git state. Make sure the build is pristine"
        );
      }
    }
  }

  async getRelease(): Promise<string> {
    if (!this.enabled) {
      return undefined;
    }
    return await this.git.revparse("HEAD");
  }
}

export default new Git();
