import { build } from "esbuild";

await build({
  entryPoints: ["./src/sh.ts"],
  bundle: true,
  sourcemap: false,
  platform: "node",

  minify: true,
  metafile: true,
  format: "cjs",
  banner: {
    // hacks to allow commonjs modules to be imported
    //js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);import * as url from 'url';const __dirname = url.fileURLToPath(new URL('.', import.meta.url));"
  },
  target: "node16",
  logLevel: "info",
  outfile: "./dist/sh.js"
});
