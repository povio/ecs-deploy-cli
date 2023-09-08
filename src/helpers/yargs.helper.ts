import "reflect-metadata";
import type { Options } from "yargs";
import path from "path";

import type { ReleaseStrategy } from "./config.types";
import { loadConfig, Config } from "./config.helper";
import { getRelease } from "./git.helper";

interface IOptionProperties extends Options {
  envAlias?: string;
  envAliases?: string[];
  configAlias?: (c: Config) => any;
}

const optionsKey = Symbol("options_key");

export { Config } from "./config.helper";

export function Option(properties: IOptionProperties) {
  return (target: object, propertyKey: string) => {
    if (properties !== undefined && properties !== null) {
      const newMetadata = {
        ...(Reflect.getMetadata(optionsKey, target) || {}),
        [propertyKey]: {
          ...properties,
          describe: properties.envAlias
            ? `${properties.describe || ""} [${properties.envAlias}]`
            : properties.describe,
          type:
            properties.type ||
            Reflect.getMetadata(
              "design:type",
              target,
              propertyKey,
            ).name.toLowerCase(),
        },
      };

      Reflect.defineMetadata(optionsKey, newMetadata, target);
    }
  };
}

export function getYargsOption<T>(
  target: any,
): Record<keyof T, IOptionProperties> {
  const options = Reflect.getMetadata(optionsKey, target.prototype);
  if (!options) {
    throw new Error(`Options for ${(target as any).name} were not defined`);
  }
  return options;
}

export function getYargsOptions<T>(target: any): Record<keyof T, Options> {
  return Object.entries(getYargsOption(target)).reduce(
    (a, [property, options]) => {
      // @ts-ignore
      a[property] = Object.fromEntries(
        Object.entries(options).filter(
          ([optionName, optionValue]) =>
            !["envAlias", "envAliases", "configAlias", "default"].includes(
              optionName,
            ),
        ),
      );
      return a;
    },
    {} as Record<keyof T, Options>,
  );
}

export interface YargsOptions {
  stage: string;
  service?: string;
  pwd: string;
  config: Config;

  release?: string;
  releaseStrategy?: ReleaseStrategy;
}

export async function loadYargsConfig<T extends YargsOptions>(
  cls: new () => T,
  _argv: Record<string, unknown>,
  configDefaultBase?: string,
): Promise<T> {
  const argv: T = new cls();

  argv.pwd = path.resolve(
    (_argv.pwd as string) || process.env.PWD || process.cwd(),
  );
  if (!argv.pwd) throw new Error("No PWD given");

  let config;
  if (_argv.service) {
    argv.service = _argv.service as string;
    config = loadConfig(argv.pwd, _argv.stage as string, {
      service: argv.service,
    });
  } else {
    config = loadConfig(argv.pwd, _argv.stage as string);
  }

  argv.stage = config.stage;

  for (const [name, o] of Object.entries(getYargsOption(cls))) {
    if (["pwd", "stage", "config"].includes(name)) {
      continue;
    }

    argv[name as keyof typeof argv] =
      // yargs is always right
      _argv[name] ||
      // default to config if set
      (configDefaultBase && config[configDefaultBase]?.[name]) ||
      // fallback to env
      (o.envAlias && process.env[o.envAlias]);

    // write alias back into process.env
    if (
      o.envAlias &&
      (process.env[o.envAlias] as any) !==
        (argv[name as keyof typeof argv] as any)
    ) {
      if (process.env[o.envAlias] !== undefined) {
        console.warn(`Overwriting ${o.envAlias}!`);
      }
      process.env[o.envAlias] = argv[name as keyof typeof argv] as any;
    }

    // fallback to default
    if (argv[name as keyof typeof argv] === undefined && o.default) {
      // use default from yargs
      argv[name as keyof typeof argv] = o.default;
    }
  }

  argv.release =
    config.release ||
    process.env.RELEASE ||
    (await getRelease(argv.pwd, argv.releaseStrategy));

  argv.config = config;

  return argv;
}
