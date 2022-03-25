import { config } from "dotenv";
import "reflect-metadata";
import { Options as YargsOptions } from "yargs";
import { getConfigForECS, loadConfig } from "./config";

interface IOptionProperties extends YargsOptions {
  envAlias?: string;
}

const optionsKey = Symbol("options_key");

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
  config: Record<string, string>;
  constructor(values: any, overrideEnv: boolean) {
    this.stage = values.stage || process.env.STAGE;
    this.pwd = values.pwd || process.cwd();
    this.config = getConfigForECS("config.yaml", this.stage, this.pwd);
    // override from ENV REWRITE
    for (const [name, o] of Object.entries(getOptions(this.constructor))) {
      if (["pwd", "stage", "config"].includes(name)) {
        continue;
      }

      let valueFromConfig =
        values[name] ||
        this.config["ecs_deploy__" + name] ||
        this.config["ecs_deploy__" + o.envAlias] ||
        this.config[o.envAlias];
      this[name] = valueFromConfig;

      // fallback to env
      /*if (o.envAlias) {
        if (this[name] === undefined) {
          // get option from ENV
          let variableFromConfig =
            this.config["ecs_deploy__" + name] ||
            this.config["ecs_deploy__" + o.envAlias];
          if (variableFromConfig !== undefined) {
            this[name] = variableFromConfig;
          }
        } else {
          // write option from yargs back into ENV
          if (overrideEnv) {
            process.env[o.envAlias] = this[name];
          }
        }
      }*/
      // fallback to default
      if (this[name] === undefined && o.default) {
        // use default from yargs
        this[name] = o.default;
      }
    }
  }
}
