<template>
  <!--
    The remote is a separate Vue app with its own copy of Vue.
    Server: <div v-html> with the remote's SSR markup. Browser: an empty <div> with the same tag and class,
    so the host's hydration leaves the server markup alone; then the remote hydrates it with its own Vue.
    (A single <div v-html> does not work: Vue re-assigns dynamic innerHTML during hydration.)
  -->
  <div
    v-if="isServer"
    class="fvm-remote-island"
    v-html="serverHtml"
  />
  <div
    v-else
    ref="root"
    class="fvm-remote-island"
  />
</template>

<script setup lang="ts">
import type { MountedRemoteApp } from 'fvm_remote/app/client'

const props = defineProps<{ title: string }>()
const isServer = import.meta.server
const root = useTemplateRef<HTMLElement>('root')

// Server only: the HTML does not go into the payload, the browser takes it from the rendered DOM
let serverHtml = ''

type RemoteServer = typeof import('fvm_remote/app/server')

interface SsrRuntimeBridge {
  load(remoteName: string, importPath: string): Promise<RemoteServer>
}

interface FederationHost {
  name: string
  loadRemote<T>(id: string): Promise<T | null>
}

type FederationGlobals = Record<symbol, Map<string, SsrRuntimeBridge> | undefined> & {
  __FEDERATION__?: { __INSTANCES__?: FederationHost[] }
}

/**
 * Loads the remote's server expose so that every new release is picked up.
 * A plain import('fvm_remote/app/server') would keep the first loaded release forever (ESM cache).
 *
 *  1. @module-federation/nuxt SSR bridge — exists with the module's own loader wrapper
 *     (@module-federation/vite 1.20.0, the version the module pins); re-checks the manifest itself.
 *  2. Host MF runtime `loadRemote()` — with @module-federation/vite >= 1.24 its own ssrEntryLoader replaces
 *     the module's wrapper (no bridge); its `beforeRequest` hook re-checks the manifest after `maxAgeMs`
 *     and re-registers the remote when buildVersion changed.
 *  3. First request before the runtime is up: import() of the static remote wrapper starts it.
 */
async function loadRemoteServer (): Promise<RemoteServer> {
  const globals = globalThis as FederationGlobals
  const bridge = globals[Symbol.for('@module-federation/nuxt:ssr-runtime')]?.get('fvm_host')

  if (bridge) {
    return await bridge.load('fvm_remote', 'fvm_remote/app/server')
  }

  const host = globals.__FEDERATION__?.__INSTANCES__?.find((instance) => instance.name === 'fvm_host')
  const loaded = host && await host.loadRemote<RemoteServer>('fvm_remote/app/server')

  return loaded ?? await import('fvm_remote/app/server')
}

if (import.meta.server) {
  try {
    const { render } = await loadRemoteServer()

    serverHtml = await render({ title: props.title })
  } catch (error) {
    // Remote is down: render an empty block, the browser will mount the remote by itself
    console.error('[fvm_remote] SSR failed', error)
  }
}

let remote: MountedRemoteApp | undefined

onMounted(async () => {
  if (!root.value) {
    return
  }

  try {
    const { mount } = await import('fvm_remote/app/client')

    remote = mount(root.value, { title: props.title })
  } catch (error) {
    console.error('[fvm_remote] mount failed', error)
  }
})

onBeforeUnmount(() => remote?.unmount())
</script>
