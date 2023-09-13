import merge from "lodash.merge";

import { cosmiconfigSync } from "cosmiconfig";
import { logBanner, logError, logInfo } from "./cli.helper";
import { z } from "zod";

/**
 * Load config in order, one of
 *  .config/stage.moduleName.json
 *  .config/stage.moduleName.yml
 *
 * then one of
 *  .config/stage.local.moduleName.json
 *  .config/stage.local.moduleName.yml
 */
export async function loadConfig<T extends z.ZodType<any, any, any>>(
  type: T,
  cwd: string,
  moduleName: string,
  stage: string,
  verbose: boolean,
): Promise<z.output<T>> {
  let config = {};
  for (const name of [stage, `${stage}.local`]) {
    const { search } = cosmiconfigSync(moduleName, {
      searchPlaces: [`${name}.${moduleName}.json`, `${name}.${moduleName}.yml`],
      stopDir: cwd,
    });
    const result = search(`${cwd}/.config`);
    if (result && !result.isEmpty) {
      logInfo(`Loaded ${result.filepath}`);
      config = merge(config, result.config);
    }
  }
  if (verbose) {
    logBanner("Config");
    console.log(JSON.stringify(config, null, 2));
  }
  const result = type.safeParse(config);
  if (!result.success) {
    const errors = result.error.flatten();
    logError(
      [
        ...errors.formErrors,
        Object.entries(errors.fieldErrors).map(([k, v]) => `${v}: ${k}`),
      ].join("\n"),
    );
    process.exit(1);
  }
  return result.data;
}


export async function resolveConfigValue(value: any) {

}
