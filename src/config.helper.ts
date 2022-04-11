import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import YAML from "yaml";

interface ConfigItem {
  [key: string]: Config | string | number | string[];
}
export interface Config extends ConfigItem {
  /**
   * Environment as it was set in the config file - use process.env to account for overrides
   */
  readonly environment?: Record<string, string>;
  /**
   * dotenv files used to load environment
   */
  readonly env_files?: string[];
}

/**
 *  Read config.yaml
 *   - allow for .env file overrides, priority is
 *    1. process.env
 *    2. .env file
 *    3. config.environment
 *   - override config.yaml with process.env.CONFIG_FILE
 *
 */
export function loadConfig(
  root: string,
  stage: string,
  fileName: string = process.env.CONFIG_FILE || "config.yaml"
): Config {
  const config: Config = {
    environment: {},
    env_files: [],
    // read tree from .yaml stage
    ...readYaml(root, fileName).stages[stage],
  };

  const environment: Record<string, string> = {
    // get environment from yaml
    ...config.environment,

    // get .env from env_files defined in yaml
    ...config.env_files.reduce((acc, cur) => {
      return { ...acc, ...readEnv(root, cur) };
    }, {} as Record<string, string>),

    // and finally from process.env
    ...process.env,
  };

  //  add missing environment variables into process.env
  for (const [k, v] of Object.entries(environment)) {
    if (process.env[k] === undefined && process.env[k] !== v) {
      process.env[k] = v;
    }
  }

  loadEnvironmentIntoConfig(config, environment);

  return config;
}

/**
 * parse environment into config
 *  - converts app__one__two=three into {one: {two: "three" }}
 *  - overrides existing nodes
 * @param config
 * @param environment - dict from dot-env file
 * @param prefix - defaults to "app"
 */
export function loadEnvironmentIntoConfig(
  config: Config,
  environment: Record<string, string>,
  prefix: string | false = "app" || false
) {
  const reservedRoots = ["environment", "env_files"];

  for (const [key, value] of Object.entries(environment)) {
    if (key.startsWith("__") || key.endsWith("__")) {
      // ignore edge cases
      continue;
    }
    const valuePath = key.split("__");

    if (prefix) {
      // only allow variables with a global prefix
      if (valuePath.shift() !== prefix) continue;
    }

    // handle root exceptions
    if (valuePath[0] === undefined || reservedRoots.includes(valuePath[0])) {
      continue;
    }

    // walk the value path
    let p: ConfigItem | Config = config;
    while (true) {
      const n = valuePath.shift();

      if (valuePath.length !== 0) {
        // we need to walk down more objects

        if (p[n] === undefined) {
          // there is nothing here, make a new structure
          p[n] = {};
          (p as unknown) = p[n];
          continue;
        }

        if (p[n] && typeof p[n] === "object") {
          // we're at an object

          if (Array.isArray(p[n])) {
            // interaction with arrays is not defined
            throw new Error(`Tried to change config array: ${key}`);
          }

          // move down
          (p as unknown) = p[n];
          continue;
        }

        // we need to move down but we cant
        throw new Error(`Tried to change config structure with env: ${key}`);
      }

      // we have a simple value to set

      if (p[n] !== undefined) {
        if (typeof p[n] === "object") {
          throw new Error(
            `Tried to override config structure with env: ${key}`
          );
        }

        // we probably have a simple value
      }

      // set a simple value
      p[n] = value;
      break;
    }
  }
  return config;
}

/**
 * Read YAML into json tree
 * @param root
 * @param name
 */
export function readYaml(
  root: string,
  name = "config.yaml"
): Record<string, any> {
  const yamlPath = path.join(root, name);
  if (!fs.existsSync(yamlPath)) {
    // the config file is required
    throw new Error(`Couldn't find configuration file "${yamlPath}"`);
  }
  return YAML.parse(fs.readFileSync(yamlPath, "utf8"), {
    version: "1.1", //Supports merge keys
  });
}

/**
 * Read dot-env file into dict
 * @param root
 * @param name
 */
export function readEnv(root: string, name: string): Record<string, string> {
  const envPath = path.join(root, name);
  if (envPath) {
    return dotenv.parse(fs.readFileSync(envPath));
  } else {
    console.log(`Notice: env file ${envPath} not found`);
  }
  return {};
}

function obj2env(obj: Record<string, any>, delimiter = "__") {
  let keys: string[] = [];
  for (const key in obj) {
    if (isObject(obj[key])) {
      const subkeys = obj2env(obj[key]);
      keys = keys.concat(
        subkeys.map((subkey) => {
          const prevVal = key + delimiter + subkey;
          return prevVal;
        })
      );
    } else {
      keys.push(key + "=" + deepValue(obj, key, delimiter));
    }
  }
  return keys;
}

function env2record(obj: Record<string, any>) {
  return obj
    .map((entry: any) => {
      const [key, value] = entry.split("=");
      return { [key]: value };
    })
    .reduce(function (result: any, current: any) {
      return Object.assign(result, current);
    }, {});
}

function isObject(item: any) {
  return item && typeof item === "object" && !Array.isArray(item);
}
/**
 * Deep merge two objects.
 * @param target
 * @param ...sources
 */
function mergeDeep(target: any, ...sources: any[]): object {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}

function deepValue(obj: Record<string, any>, path: any, delimiter = "__") {
  for (const pathEntry of path.split(delimiter)) {
    obj = obj[pathEntry];
  }
  return obj;
}
