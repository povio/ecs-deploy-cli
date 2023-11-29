import { z } from "zod";
import { BaseConfig } from "./bootstrap.dto";

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
