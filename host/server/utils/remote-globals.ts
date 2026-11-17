/** Must match GLOBAL_KEY_PREFIX in remote/src/app/server.ts */
export const REMOTE_GLOBAL_KEY_PREFIX = 'federation-vite-memory/remote@'

/** Own keys of globalThis when the Nitro server started (filled by server/plugins/globals-baseline.ts) */
export const globalsBaseline = new Set<string | symbol>()
