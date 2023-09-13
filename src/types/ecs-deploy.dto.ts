import { z } from "zod";

export const EcsDeployConfig = z.object({
  accountId: z.string(),
  region: z.string(),
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
