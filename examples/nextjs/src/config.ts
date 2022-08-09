import getConfig from 'next/config'
const { serverRuntimeConfig, publicRuntimeConfig } = getConfig()


/**
 * Export all build time env variables from this file
 *  note: they need to start with process.env, destruction won't work!
 */
export const BUILD_TIME_VARIABLE = process.env.BUILD_TIME_VARIABLE as string;

/**
 * serverRuntimeConfig is only available on the server-side
 *  you can set it in config.yaml under `nextRuntimeConfig`
 */
export const BACKEND_RUNTIME_VARIABLE = serverRuntimeConfig.BACKEND_RUNTIME_VARIABLE;

/**
 * publicRuntimeConfig is available on both server-side and client-side
 you can set it in config.yaml under `nextPublicConfig`
 */
export const  PUBLIC_RUNTIME_VARIABLE = publicRuntimeConfig.PUBLIC_RUNTIME_VARIABLE;


export {};
