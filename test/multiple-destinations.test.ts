import { test } from "node:test";
import { ecrBuild } from "../src/commands/ecr-build";
import { getSha } from "../src/helpers/git.helper";
import { dirname } from "node:path";
import { fileURLToPath } from "url";
import { ecsDeploy } from "../src/commands/ecs-deploy";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Test multiple destinations from a single ECR image
 */
test("multiple-destinations", async () => {
  // prepare image
  await ecrBuild({
    pwd: __dirname,
    stage: "myapp-dev",
    container: "backend",

    release: await getSha(__dirname),

    skipEcrExistsCheck: true,
    buildx: false,
    skipPush: true,
    verbose: true,
  });

  await ecsDeploy({
    pwd: __dirname,
    stage: "myapp-dev",
    target: "worker",

    release: await getSha(__dirname),
    appVersion: "1.0.0",
    ci: true,
    skipEcrExistsCheck: true,
    verbose: true,
  });

  //
});
