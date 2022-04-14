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

import { getCommitMessage, getRelease, getSha, getShortSha } from "~git.helper";
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
    const buildUrl = process.env.CIRCLE_BUILD_URL;

    const slackToken = argv.slackToken;
    const slackChannel =
      argv.slackChannel || argv.config.ecs_deploy?.slackChannel;
    const slackAutolinkPrefix = argv.config.ecs_deploy?.slackAutolinkPrefix;
    const slackAutolinkTarget = argv.config.ecs_deploy?.slackAutolinkTarget;
    const slackCommitPrefix = argv.config.ecs_deploy?.slackCommitPrefix;
    const slackProjectName = argv.config.ecs_deploy?.slackProjectName;

    const gitSha = await getSha(pwd);
    const gitShortSha = await getShortSha(pwd);

    const web = new WebClient(slackToken);

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

    let message = `${templates[argv.messageType].icon} `;

    if (slackProjectName) {
      message += `*${slackProjectName}* `;
    }

    const deployName = `${repoName ? `${repoName}:` : ""}${
      appVersion || branchName || ""
    }`;

    let text = `[${templates[argv.messageType].icon}] ${deployName}`;

    if (argv.message) {
      text += ` ${argv.message}`;
    }

    if (buildUrl) {
      message += `<${buildUrl}|${deployName}>`;
    } else {
      message += deployName;
    }

    if (service) {
      message += ` Service: ${service}`;
    }

    if (slackCommitPrefix) {
      message += `\t :memo: <${slackCommitPrefix}${gitSha}|${gitShortSha}>\t`;
    } else {
      message += `\t :memo: ${gitShortSha}\t`;
    }

    if (slackAutolinkTarget && slackAutolinkPrefix) {
      message += `_${commitMessage.replace(
        new RegExp(`\\b${slackAutolinkPrefix}[a-zA-Z0-9]+\\b`, "gm"),
        (a) => {
          return `<${slackAutolinkTarget}|${a}>`;
        }
      )}_`;
    } else {
      message += `_${commitMessage}_`;
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
      text,
      channel: slackChannel,
      unfurl_links: false,
      unfurl_media: false,
    });
  },
};
