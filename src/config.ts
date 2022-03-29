import dotenv from "dotenv";
import path from "path";
import YAML from "yaml";
import fs from "fs";

export function loadConfig(name: string, stage: string, root: string) {
  let config: Record<string, any> = {};
  let env: Record<string, string> = {};

  //Get config tree from config.yaml
  config = loadYaml(root, name).stages[stage];
  //Get environment from config
  if (config.environment) {
    Object.assign(env, config.environment);
    delete config.environment;
  }
  //Load environment from env files defined in config
  if (config.env_files) {
    config.env_files.forEach((env_file: string) => {
      let envConfig = loadEnv(root, env_file);
      Object.assign(env, envConfig);
    });
    delete config.env_files;
  }
  //Add process.env to generated env
  Object.assign(env, process.env);
  //Add generated env back to process.env
  pushToProcessEnv(env);
  //Merge env with config

  mergeDeep(
    config,
    env2obj(
      Object.fromEntries(
        Object.entries(env).filter(
          ([key]) => key.includes("__") && !key.startsWith("__")
        )
      )
    )
  );
  return config;
}

export function getConfigForECS(name: string, stage: string, root: string) {
  return env2record(obj2env(loadConfig(name, stage, root)));
}

export function getSecretsForECS(configFile: Record<string, any>) {
  let configtoenv = obj2env(configFile);
  let secrets = configtoenv
    .filter((entry) => entry.split("=")[0].match(/__FROM$/i))
    .map((entry) => {
      let [name, value] = entry.split("=");
      return {
        name: name.replace(/__FROM$/i, ""),
        valueFrom: value,
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

function obj2env(obj: Record<string, any>, delimiter = "__") {
  var keys: string[] = [];
  for (var key in obj) {
    if (isObject(obj[key])) {
      var subkeys = obj2env(obj[key]);
      keys = keys.concat(
        subkeys.map((subkey) => {
          let prevVal = key + delimiter + subkey;
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
  return Object.keys(env)
    .map((envKey) => delimitedStringToObject(envKey, env[envKey]))
    .reduce((prev, current) => {
      mergeDeep(prev, current);
      return prev;
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
  for (let pathEntry of path.split(delimiter)) {
    obj = obj[pathEntry];
  }
  return obj;
}
