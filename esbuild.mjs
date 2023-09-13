import { build } from "esbuild";

await build({
  entryPoints: ["./src/endpoint.ts"],
  bundle: true,
  sourcemap: "external",
  platform: "node",
  minify: true,
  format: "esm",
  // latest supported by AWS Lambda
  external: [
    "@aws-sdk/client-ssm",
    "@aws-sdk/client-ecr",
    "@aws-sdk/client-ecs",
    "@aws-sdk/client-sts",
    "@aws-sdk/credential-providers",
    "@smithy/node-config-provider"
  ],
  banner: {
    // hacks to allow commonjs modules to be imported
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);import * as url from 'url';const __dirname = url.fileURLToPath(new URL('.', import.meta.url));"
  },
  target: "node18",
  logLevel: "info",
  outfile: "./dist/endpoint.mjs"
});
