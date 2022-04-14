/*
 Notify a Slack channel
 */

import yargs from "yargs";
import { WebClient } from "@slack/web-api";

import {
  getYargsOptions,
  loadYargsConfig,
  Option,
  YargsOptions,
} from "~yargs.helper";

import { getCommitMessage, getRelease } from "~git.helper";
import * as process from "process";

class SlackOptions extends YargsOptions {
  @Option({ envAlias: "PWD", demandOption: true })
  pwd: string;

  @Option({ envAlias: "STAGE", demandOption: true })
  stage: string;

  @Option({ envAlias: "SERVICE" })
  service: string;

  @Option({ envAlias: "SLACK_TOKEN", demandOption: true })
  slackToken: string;

  @Option({ envAlias: "SLACK_CHANNEL", demandOption: true })
  slackChannel: string;

  @Option({ envAlias: "RELEASE", demandOption: true })
  release: string;

  @Option({
    envAlias: "RELEASE_STRATEGY",
    default: "gitsha",
    choices: ["gitsha", "gitsha-stage"],
    type: "string",
  })
  releaseStrategy: "gitsha" | "gitsha-stage";

  @Option({ envAlias: "VERSION", type: "string", alias: "ecsVersion" })
  appVersion: string;

  @Option({
    demandOption: true,
    choices: ["success", "failure", "info"],
    default: "info",
  })
  messageType: string;

  @Option({ demandOption: false })
  message: string;
}

export const command: yargs.CommandModule = {
  command: "slack",
  describe: "Send Status to Slack",
  builder: async (y) => {
    return y
      .options(getYargsOptions(SlackOptions))
      .middleware(async (_argv) => {
        const argv = loadYargsConfig(SlackOptions, _argv as any);
        argv.release =
          argv.release || (await getRelease(argv.pwd, argv.releaseStrategy));

        return argv as any;
      }, true);
  },
  handler: async (_argv) => {
    const argv = (await _argv) as unknown as SlackOptions;

    const { release, service, pwd } = argv;
    const commitMessage = await getCommitMessage(pwd);

    const appVersion =
      argv.appVersion || process.env.CIRCLE_TAG || process.env.BITBUCKET_TAG;
    const branchName =
      process.env.CIRCLE_BRANCH || process.env.BITBUCKET_BRANCH;
    const repoName =
      process.env.CIRCLE_PROJECT_REPONAME || process.env.BITBUCKET_REPO_SLUG;
    const userName = process.env.CIRCLE_USERNAME;
    const buildUrl = process.env.CIRCLE_BUILD_URL;

    const slackToken = argv.slackToken;
    const slackChannel =
      argv.slackChannel || argv.config.ecs_deploy?.slackChannel;
    const slackAutolinkPrefix = argv.config.ecs_deploy?.slackAutolinkPrefix;
    const slackAutolinkTarget = argv.config.ecs_deploy?.slackAutolinkTarget;

    const web = new WebClient(slackToken);

    // <http://www.example.com|This message *is* a link>

    const templates = {
      success: {
        icon: ":greencircle:",
      },
      info: {
        icon: ":information_source:",
      },
      failure: {
        icon: ":red_circle:",
      },
    };

    let message = `${templates[argv.messageType].icon}`;

    if (buildUrl) {
      message += `<${buildUrl}|${repoName}:${appVersion || branchName}>`;
    } else {
      message += `${repoName}:${appVersion || branchName}`;
    }

    if (slackAutolinkTarget && slackAutolinkPrefix) {
      commitMessage.replace(
        new RegExp(`\\b${slackAutolinkPrefix}[a-zA-Z0-9]+\\b`, "gm"),
        (a) => {
          return `<${slackAutolinkPrefix}|${a}>`;
        }
      );
    } else {
      message += `\n  ${release}: ${commitMessage}`;
    }

    if (argv.message) {
      message += `\n${argv.message}`;
    }

    await web.chat.postMessage({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: message,
          },
        },
      ],
      channel: slackChannel,
      unfurl_links: false,
      unfurl_media: false,
    });
  },
};
