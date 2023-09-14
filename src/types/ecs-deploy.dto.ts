import { z } from "zod";

export const BaseConfig = z.object({
  accountId: z.string(),
  region: z.string(),
});

export type BaseConfigDto = z.output<typeof BaseConfig>;

export const BuildConfig = BaseConfig.extend({
  taskFamily: z.string(),
  serviceName: z.string(),
  clusterName: z.string(),
  build: z.array(
    z.object({
      name: z.string(),
      repoName: z.string(),
      context: z.string().optional(),
      dockerfile: z.string().optional(),
      platform: z.string().default("linux/amd64"),
      environment: z.record(z.string()).optional(),
    }),
  ),
});

export const DeployConfig = BuildConfig.extend({
  taskDefinition: z.object({
    template: z.string(),
    containerDefinitions: z.array(
      z.object({
        name: z.string(),
        image: z.string(),
        environment: z.record(z.string()).optional(),
        secrets: z.record(z.string()).optional(),
      }),
    ),
  }),
});

export const BootstrapConfigItemValue = z
  .object({
    name: z.string(),
    treeFrom: z.string().optional(),
    valueFrom: z.string().optional(),
    objectFrom: z.string().optional(),
    configFrom: z.string().optional(),
    value: z.string().optional(),
  })
  .refine(
    (val) =>
      [
        val.treeFrom,
        val.valueFrom,
        val.value,
        val.configFrom,
        val.objectFrom,
      ].filter((x) => x !== undefined).length === 1,
    {
      message: "Exactly one of treeFrom, valueFrom, or value must be specified",
    },
  );

export const BootstrapConfigItem = z.object({
  name: z.string(),
  destination: z.string(),
  values: z.array(BootstrapConfigItemValue),
});

export type BootstrapConfigItemDto = z.output<typeof BootstrapConfigItem>;

export const BootstrapConfig = BaseConfig.extend({
  configs: z.array(BootstrapConfigItem),
});

export type BootstrapConfigDto = z.output<typeof BootstrapConfig>;
