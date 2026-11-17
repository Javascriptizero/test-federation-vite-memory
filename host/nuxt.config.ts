// Nuxt host. Renders the fvm_remote microfrontend on its home page, in SSR too.
//
// SSR goes through @module-federation/nuxt, which wraps the loader of @module-federation/vite
// (`@module-federation/vite/ssrEntryLoader`, resolved to 1.24.1 via package.json `resolutions`).
// Strategy 'vm': the remote's server code is evaluated with vm.SourceTextModule instead of import()
// of temp files. Needs `node --experimental-vm-modules` (set in the package.json scripts).
//
// The remote releases much more often than the host: the host is built once and picks up every new
// release at runtime from mf-manifest.json (re-checked after `ssrManifestMaxAgeMs`).
const remoteOrigin = process.env.REMOTE_ORIGIN ?? 'http://localhost:4380'

// Workaround: the vm strategy of @module-federation/vite 1.24.1 resolves the remote's bare
// `@module-federation/runtime` import with ESM conditions (dist/index.js), but @module-federation/nuxt 0.2.0
// only traces the CJS file into .output. Without this the loader logs "strategy vm failed" and silently
// falls back to temp-file in the production build.
const ESM_RUNTIME_FILES = ['runtime', 'runtime-core', 'sdk']
  .map((name) => new URL(`./node_modules/@module-federation/${name}/dist/index.js`, import.meta.url).pathname)

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  modules: ['@module-federation/nuxt'],
  devtools: { enabled: false },
  devServer: { port: 4390 },
  nitro: {
    externals: { traceInclude: ESM_RUNTIME_FILES }
  },
  moduleFederation: {
    // 0 = check the manifest on every SSR request, so every release is picked up right away
    ssrManifestMaxAgeMs: Number(process.env.MF_MANIFEST_MAX_AGE_MS ?? 0),
    config: {
      name: 'fvm_host',
      hostInitInjectLocation: 'entry',
      // Options are merged by @module-federation/nuxt into its own wrapper of this loader
      runtimePlugins: [['@module-federation/vite/ssrEntryLoader', { strategy: 'vm' }]],
      remotes: {
        fvm_remote: {
          type: 'module',
          name: 'fvm_remote',
          entry: `${remoteOrigin}/mf-manifest.json`,
          entryGlobalName: 'fvm_remote',
          shareScope: 'default'
        }
      }
    }
  }
})
