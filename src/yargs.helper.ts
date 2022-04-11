import "reflect-metadata";
import { Options as YargsOptions } from "yargs";
import path from "path";

import { loadConfig, Config } from "~config.helper";
import cli from "~cli.helper";

interface IOptionProperties extends YargsOptions {
  envAlias?: string;
}

const optionsKey = Symbol("options_key");

export { Config } from "~config.helper";

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
              propertyKey
            ).name.toLowerCase(),
        },
      };

      Reflect.defineMetadata(optionsKey, newMetadata, target);
    }
  };
}

export function getOptions<T>(target: any): Record<keyof T, IOptionProperties> {
  const options = Reflect.getMetadata(optionsKey, target.prototype);
  if (!options) {
    throw new Error(`Options for ${(target as any).name} were not defined`);
  }
  return options;
}

export function getYargsOptions<T>(target: any): Record<keyof T, YargsOptions> {
  return Object.entries(getOptions(target)).reduce((a, [property, options]) => {
    a[property] = Object.fromEntries(
      Object.entries(options).filter(
        ([optionName, optionValue]) =>
          !["envAlias", "default"].includes(optionName)
      )
    );
    return a;
  }, {} as Record<keyof T, YargsOptions>);
}

export class Options {
  stage: string;
  pwd: string;
  config: Config;
}

export function loadYargsConfig<T extends Options>(
  cls: new () => T,
  _argv: Record<string, unknown>
): T {
  const argv: T = new cls();

  argv.pwd = path.resolve(
    (_argv.pwd as string) || process.env.PWD || process.cwd()
  );
  if (!argv.pwd) throw new Error("No PWD given");
  argv.stage = (_argv.stage as string) || process.env.STAGE;
  if (!argv.stage) throw new Error("No Stage defined");

  const config = loadConfig(argv.pwd, argv.stage);

  for (const [name, o] of Object.entries(getOptions(cls))) {
    if (["pwd", "stage", "config"].includes(name)) {
      continue;
    }
    argv[name] =
      // yargs is always right
      _argv[name] ||
      // default to config if set
      config.ecs_deploy[name] ||
      // fallback to env
      process.env[o.envAlias];

    // write alias back into process.env
    if (o.envAlias && process.env[o.envAlias] !== argv[name]) {
      if (process.env[o.envAlias] !== undefined) {
        cli.warning(`Overwriting ${o.envAlias}!`);
      }
      process.env[o.envAlias] = argv[name];
    }

    // fallback to default
    if (argv[name] === undefined && o.default) {
      // use default from yargs
      argv[name] = o.default;
    }
  }

  argv.config = config;

  return argv;
}
