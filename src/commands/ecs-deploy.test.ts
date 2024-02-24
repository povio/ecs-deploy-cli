import { test } from "node:test";
import assert from "assert";
import { resolveEnvDict } from "./ecs-deploy";

test("ecs-deploy", async () => {
  const envDict = await resolveEnvDict(
    {
      stage: "myapp-dev",
      pwd: ".",
      release: "a-random-string",
    },
    "us-east-1",
    {
      environment: [
        { name: "STAGE", value: "myapp-dev" },
        { name: "VERSION", value: "1.0.0" },
      ],
    },
    {
      environment: {
        LEGACY_VAR: "test1",
      },
      environmentValues: [
        { name: "RELEASE", valueFrom: "func:release" },
        { name: "FIXED", value: "fixed" },
      ],
      name: "",
      image: "",
    },
  );
  assert.deepStrictEqual(envDict, {
    LEGACY_VAR: "test1",
    RELEASE: "a-random-string",
    FIXED: "fixed",
    STAGE: "myapp-dev",
    VERSION: "1.0.0",
  });
});
