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

  async verifyPristine(): Promise<void> {
    // # check for changes in git
    // check_git_changes() {
    //   WORK_DIR=$(pwd)
    //   if [ -d "$WORK_DIR/.git" ]; then
    //     if [[ $(git status --porcelain) ]]; then
    //       if [ -z "$IGNORE_GIT_CHANGES" ]; then
    //         log error "Detected changes in .git"
    //         exit 1;
    //       else
    //         log warning "Detected changes in .git"
    //       fi
    //     fi
    //   else
    //     log warning ".git not found"
    //   fi
    // }

    console.log({ porcelain: await this.git.raw("status","--porcelain") });


    if (await this.git.raw("status", "--porcelain")) {
      if (process.env.IGNORE_GIT_CHANGES) {
        cli.notice("Git changes ignored");
      }
      return;
    }

    if (process.env.IGNORE_GIT_CHANGES) {
      cli.warning("Git changes ignored");
      return;
    }
    throw new Error("Detected changes in .git");
  }
}

export default new Git();
