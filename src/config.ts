import dotenv from "dotenv";
import path from "path";
import YAML from "yaml";
import fs from "fs";

export function loadConfig(name: string, stage: string, root: string) {
  let config: Record<string, any> = {};
  let env: Record<string, string> = {};

  //Load config.yaml
  config = loadYaml(root, name).stages[stage];
  //Load ENV KV pairs from config.yaml
  if (config.environment) {
    mergeDeep(env, config.environment);
  }
  //Load ENV files from config.yaml
  if (config.env_files) {
    config.env_files.forEach((env_file: string) => {
      let envConfig = loadEnv(root, env_file);
      mergeDeep(env, envConfig);
    });
  }
  //Add process.env to generated ENV
  mergeDeep(env, process.env);
  //Add our env to process.env
  pushToProcessEnv(env);
  //Add env to config
  mergeDeep(config, env2obj(env));
  console.log(config);

  return config;
}

export function getConfigForECS(name: string, stage: string, root: string) {
  return env2record(obj2env(loadConfig(name, stage, root)));
}

export function getSecretsForECS(configFile: Record<string, any>) {
  let configtoenv = obj2env(configFile);
  let secrets = configtoenv
    .filter((entry) => entry.split("=")[0].match(/__FROM$/gi))
    .map((entry) => {
      let split = entry.split("=");
      return {
        name: split[0].replace(/__FROM$/i, ""),
        valueFrom: split[1],
      };
    });
  return secrets;
}

export function loadYaml(root: string, name: string): Record<string, any> {
  const configPath = findFile(root, name);
  if (configPath) {
    let yamlConfigObject = YAML.parse(fs.readFileSync(configPath, "utf8"), {
      version: "1.1", //Supports merge keys
    });
    return yamlConfigObject;
  }
  return {};
}

export function loadEnv(root: string, name: string): Record<string, any> {
  const configPath = findFile(root, name);
  if (configPath) {
    return dotenv.parse(fs.readFileSync(configPath));
  }
  return {};
}

export function findFile(root: string, name: string): string | undefined {
  let configPath = path.join(root, name);
  if (fs.existsSync(configPath)) {
    return configPath;
  }
  return undefined;
}

function delimitedStringToObject(str: string, val = {}, delimiter = "__") {
  return str.split(delimiter).reduceRight((acc, currentValue) => {
    return { [currentValue]: acc };
  }, val);
}

function obj2env(obj: Record<string, any>) {
  var keys: string[] = [];
  for (var key in obj) {
    if (typeof obj[key] === "object") {
      var subkeys = obj2env(obj[key]);
      keys = keys.concat(
        subkeys.map(function (subkey) {
          let prevVal = key + "__" + subkey;
          if (prevVal.includes("=")) {
            return prevVal;
          } else {
            return prevVal + "=" + deepValue(obj, key + "." + subkey);
          }
        })
      );
    } else {
      keys.push(key + "=" + deepValue(obj, key));
    }
  }
  return keys;
}

function env2record(obj: Record<string, any>) {
  return obj
    .map((entry: any) => {
      let [key, value] = entry.split("=");
      return { [key]: value };
    })
    .reduce(function (result: any, current: any) {
      return Object.assign(result, current);
    }, {});
}

function pushToProcessEnv(obj: Record<string, any>) {
  Object.keys(obj).forEach((key) => {
    if (process.env[key] === undefined) {
      process.env[key] = obj[key];
    }
  });
}

function env2obj(env: Record<string, string> | NodeJS.ProcessEnv) {
  let configFromENV: any = {};
  Object.keys(env).forEach((envKey: string) => {
    let objectFromKey = delimitedStringToObject(envKey, env[envKey]);
    configFromENV = mergeDeep(configFromENV, objectFromKey);
  });
  return configFromENV;
}

/**
 * Deep merge two objects.
 * @param target
 * @param ...sources
 */
function mergeDeep(target: any, ...sources: any[]): object {
  function isObject(item: any) {
    return item && typeof item === "object" && !Array.isArray(item);
  }
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

function deepValue(obj: Record<string, any>, path: any) {
  for (var i = 0, path = path.split("."), len = path.length; i < len; i++) {
    obj = obj[path[i]];
  }
  return obj;
}
