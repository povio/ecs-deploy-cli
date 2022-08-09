const { loadConfig } = require("node-stage");
const { getRelease } = require("node-stage/git");

const config = loadConfig(__dirname);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  /**
   * @see https://nextjs.org/docs/api-reference/next.config.js/configuring-the-build-id
   * @returns {Promise<string>}
   */
  generateBuildId: async () => {
    // the build id should be linked to the git sha
    return (
      config.release ||
      process.env.RELEASE ||
      (await getRelease(__dirname, "gitsha-stage"))
    );
  },
  /**
   * Environment variables
   *  By default, Next.js will use the `process.env` to interpolate values at build time
   *  you can set additional variables in config.yaml that are pass-trough instead
   * @see https://nextjs.org/docs/api-reference/next.config.js/runtime-configuration
   */
  env: config.nextBuildEnv,
  serverRuntimeConfig: config.nextRuntimeConfig,
  publicRuntimeConfig: config.nextPublicConfig
};

module.exports = nextConfig;
