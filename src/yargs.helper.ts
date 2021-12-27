import "reflect-metadata";
import { getEnv } from "./env.helper";
import { Options as YargsOptions } from "yargs";

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

  constructor(values: any, overrideEnv: boolean) {
    this.stage = values.stage || process.env.STAGE;
    this.pwd = values.pwd || process.cwd();

    const environment = getEnv(this.pwd, this.stage, overrideEnv);

    // override from ENV
    for (const [name, o] of Object.entries(getOptions(this.constructor))) {
      if (["pwd", "stage"].includes(name)) {
        continue;
      }
      this[name] = values[name];
      // fallback to env
      if (o.envAlias) {
        if (this[name] === undefined) {
          // get option from ENV
          if (environment[o.envAlias] !== undefined) {
            this[name] = environment[o.envAlias];
          }
        } else {
          // write option from yargs back into ENV
          if (overrideEnv) {
            process.env[o.envAlias] = this[name];
          }
        }
      }
      // fallback to default
      if (this[name] === undefined && o.default) {
        // use default from yargs
        this[name] = o.default;
      }
    }
  }
}
