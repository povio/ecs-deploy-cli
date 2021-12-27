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
          describe:
            properties.describe || properties.envAlias
              ? `Override ${properties.envAlias}`
              : undefined,
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

export class Options {
  constructor(values: any, overrideEnv: boolean) {
    if (!values.stage && process.env.STAGE) {
      values.stage = process.env.STAGE;
    }

    const environment = getEnv(values.pwd, values.stage, overrideEnv);
    // override from ENV
    for (const [name, { envAlias }] of Object.entries(
      getOptions(this.constructor)
    )) {
      if (values[name]) {
        this[name] = values[name];
      }
      if (envAlias) {
        if (!this[name]) {
          // get option from ENV
          this[name] = environment[envAlias];
        } else {
          // write option into ENV
          if (overrideEnv) {
            process.env[envAlias] = this[name];
          }
        }
      }
    }
  }
}
