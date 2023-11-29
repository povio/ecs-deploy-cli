/*
 Build the Docker image and deploy it to ECR
  - Skip building if the release (git version) already exists
 */

import yargs from "yargs";

import { YargOption, YargsOptions, getBuilder } from "../helpers/yargs.helper";
import { ecrBuild } from "./ecr-build";
import {
  logBanner,
  logError,
  logInfo,
  logVariable,
  logWarning,
} from "../helpers/cli.helper";
import { getVersion } from "../helpers/version.helper";
import fs from "fs";
import path from "path";
import { getGitChanges, getGitVersion } from "../helpers/git.helper";

class EcrBuildOptions implements YargsOptions {
  @YargOption({ demandOption: true })
  pwd!: string;

  @YargOption({ envAlias: "STAGE" })
  stage!: string;

  @YargOption({ envAlias: "CONTAINER" })
  container!: string;

  @YargOption({ envAlias: "RELEASE", demandOption: true })
  release!: string;

  @YargOption({})
  ignoreGitChanges!: boolean;

  @YargOption({ envAlias: "CI" })
  ci!: boolean;

  @YargOption({})
  skipEcrExistsCheck!: boolean;

  @YargOption({ default: false })
  skipPush!: boolean;

  @YargOption({ default: false })
  buildx!: boolean;

  @YargOption({ default: false })
  verbose!: boolean;
}

export const command: yargs.CommandModule = {
  command: "build <container>",
  describe: "Build and Push the ECR Image",
  builder: getBuilder(EcrBuildOptions),
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as EcrBuildOptions;

    if (argv.verbose) {
      logBanner(`EcsDeploy ${getVersion()}`);
      logInfo(`NodeJS Version: ${process.version}`);

      logBanner("Build Environment");
      logVariable("pwd", argv.pwd);
      logVariable("release", argv.release);
      logVariable("stage", argv.stage);
    }

    if (!argv.ci) {
      // check for git changes
      if (fs.existsSync(path.join(argv.pwd, ".git"))) {
        logVariable("Git Bin Version", await getGitVersion(argv.pwd));
        const gitChanges = await getGitChanges(argv.pwd);
        if (gitChanges !== "") {
          if (argv.ignoreGitChanges) {
            logWarning("Changes detected in .git");
          } else {
            if (gitChanges === undefined) {
              logError("Error detecting Git");
            } else {
              logBanner(
                "Detected Changes in Git - Stage must be clean to build!",
              );
              console.log(gitChanges);
            }
            process.exit(1);
          }
        }
      }
    } else {
      logInfo("Running Non-Interactively");
    }

    return ecrBuild(argv);
  },
};
