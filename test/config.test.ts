import { test } from "node:test";
import { getSha } from "../src/helpers/git.helper";
import { dirname } from "node:path";
import { fileURLToPath } from "url";
import { bootstrap } from "../src/commands/bootstrap";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Test multiple destinations from a single ECR image
 */
test("config", async () => {
  // prepare image
  await bootstrap({
    pwd: __dirname,
    stage: "myapp-dev",
    release: await getSha(__dirname),
    verbose: true,
    target: "backend",
  });
});

test("config-env", async () => {
  // prepare image
  await bootstrap({
    pwd: __dirname,
    stage: "myapp-dev",
    release: await getSha(__dirname),
    verbose: true,
    target: "backend-ini",
  });
});

test("config-2", async () => {
  // prepare image
  await bootstrap({
    pwd: __dirname,
    stage: "myapp-dev",
    release: await getSha(__dirname),
    verbose: true,
    target: "backend-2",
  });
});
