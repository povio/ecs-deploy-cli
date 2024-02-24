import { test } from "node:test";
import assert from "assert";
import { resolveBuildargs } from "./ecr-build";

test("ecs-build", async () => {
  const buildargs = await resolveBuildargs(
    {
      stage: "myapp-dev",
      pwd: ".",
      release: "a-random-string",
    },
    "us-east-1",
    {
      name: "default",
      repoName: "myapp-dev",
      platform: "linux/amd64",
      environment: {
        LEGACY_VAR: "test1",
      },
      environmentValues: [
        { name: "RELEASE", valueFrom: "func:release" },
        { name: "FIXED", value: "fixed" },
      ],
    },
  );
  assert.deepStrictEqual(buildargs, {
    LEGACY_VAR: "test1",
    RELEASE: "a-random-string",
    FIXED: "fixed",
  });
});
