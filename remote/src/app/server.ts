import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

import App from '../App.vue'
import { BUILT_AT, RELEASE } from '../release'
import type { RemoteAppProps } from './props'

export type { RemoteAppProps } from './props'

/**
 * Description prefix of the Symbol this SSR entry puts on `globalThis`.
 * The host's /api/memory endpoint looks for symbols with this prefix.
 */
export const GLOBAL_KEY_PREFIX = 'federation-vite-memory/remote@'

/** Size of the per-release payload, so that a retained release is visible in heapUsed */
const PAYLOAD_BYTES = 256 * 1024

export interface ReleaseFootprint {
  release: string
  builtAt: string
  evaluatedAt: string
  renders: number
  payload: string
}

/**
 * Evaluated once per load of this module, i.e. once per release on the host server.
 * A plain (not registered) Symbol: every evaluation gets its own key, nothing is overwritten.
 * If the host runs remote code in its own realm, these properties end up on the host's globalThis
 * and stay there after the host switches to a newer release.
 */
const footprint: ReleaseFootprint = {
  release: RELEASE,
  builtAt: BUILT_AT,
  evaluatedAt: new Date().toISOString(),
  renders: 0,
  payload: `${RELEASE}|`.padEnd(PAYLOAD_BYTES, '#')
}

;(globalThis as Record<symbol, unknown>)[Symbol(`${GLOBAL_KEY_PREFIX}${RELEASE}`)] = footprint

/** Expose `./app/server`: called by the host server, returns the HTML of the remote app */
export function render (props: RemoteAppProps): Promise<string> {
  footprint.renders++

  return renderToString(createSSRApp(App, { ...props }))
}
