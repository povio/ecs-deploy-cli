import { getVersion } from "../helpers/version.helper";
import fs from "fs";
import path from "path";
import { dump } from "js-yaml";
import {
  resolveZeConfigItem,
  safeLoadConfig,
  ZeConfigs,
} from "../helpers/ze-config";
import { z } from "zod";

export async function bootstrap(argv: {
  pwd: string;
  stage: string;
  release: string;
  verbose?: boolean;
  target?: string;
}) {
  const config = await safeLoadConfig(
    "ecs-deploy",
    argv.pwd,
    argv.stage,
    z.object({
      accountId: z.string(),
      region: z.string(),
      configs: ZeConfigs,
    }),
  );

  if (argv.verbose) {
    console.log({
      event: "bootstrap",
      ecsDeploy: getVersion(),
      nodejs: process.version,
      pwd: argv.pwd,
      release: argv.release,
      stage: argv.stage,
      accountId: config.accountId,
      region: config.region,
    });
  }

  for (const ci of config.configs) {
    if (argv.target && ci.name !== argv.target) {
      continue;
    }

    const envData = await resolveZeConfigItem(
      ci,
      {
        awsRegion: config.region,
        release: argv.release,
      },
      argv.pwd,
      argv.stage,
    );

    const { destination } = ci;

    const fileName = path.basename(destination);

    let output: string | undefined;
    if (fileName.endsWith(".json")) {
      output = generateJson(envData);
    } else if (fileName.endsWith(".yml") || fileName.endsWith(".yaml")) {
      output = generateYaml(envData);
    } else if (fileName.endsWith(".env") || fileName.startsWith(".env")) {
      output = generateIni(envData);
    } else {
      throw new Error(`Unknown destination file type: ${fileName}`);
    }
    const outputPath = path.join(argv.pwd, destination);
    if (output) {
      console.log(`Writing ${outputPath}`);
      fs.writeFileSync(outputPath, output);
    }
  }
}

export function generateIni(data: any): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      lines.push(`${key}=${value}`);
    } else {
      lines.push(`${key}=${JSON.stringify(value)}`);
    }
  }
  return lines.join("\n");
}

export function generateJson(data: any): string {
  return JSON.stringify(data, null, 2);
}

export function generateYaml(data: any): string {
  return dump(data);
}
