import { createApp, createSSRApp } from 'vue'

import App from '../App.vue'
import type { RemoteAppProps } from './props'

export type { RemoteAppProps } from './props'

export interface MountedRemoteApp {
  unmount(): void
}

/**
 * Expose `./app/client`: called by the host in the browser.
 * If `el` already holds the SSR markup of this remote it is hydrated, otherwise mounted from scratch.
 */
export function mount (el: Element, props: RemoteAppProps): MountedRemoteApp {
  const app = el.hasChildNodes() ? createSSRApp(App, { ...props }) : createApp(App, { ...props })

  app.mount(el)

  return { unmount: () => app.unmount() }
}
