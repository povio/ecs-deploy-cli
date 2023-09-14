import { z } from "zod";

export const BaseConfig = z.object({
  accountId: z.string(),
  region: z.string(),
  taskFamily: z.string(),
  serviceName: z.string(),
  clusterName: z.string(),
  configs: z
    .array(
      z.object({
        name: z.string(),
        destination: z.string(),
        values: z.any(),
      }),
    )
    .optional(),
});

export const BuildConfig = BaseConfig.extend({
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

export const BootstrapConfig = BaseConfig.extend({
  configs: z
    .array(
      z.object({
        name: z.string(),
        treeFrom: z.string().optional(),
        valueFrom: z.string().optional(),
        value: z.string().optional(),
      }),
    )
    .optional(),
});
