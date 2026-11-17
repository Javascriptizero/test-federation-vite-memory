import { federation } from '@module-federation/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const PORT = Number(process.env.REMOTE_PORT ?? 4380)
const ORIGIN = process.env.REMOTE_ORIGIN ?? `http://localhost:${PORT}`

// `yarn release` sets MF_RELEASE: every release is a separate immutable build in releases/<id>/,
// served by scripts/serve.mjs. Without it (plain `vite` / `vite build`) the id is "dev".
const RELEASE = process.env.MF_RELEASE ?? 'dev'
const RELEASE_DIR = process.env.MF_RELEASE ? `releases/${RELEASE}` : 'dist'
// The config is evaluated once per environment (client, ssr): pin the timestamp for the whole build,
// otherwise server and browser bundles differ and hydration mismatches
const BUILT_AT = (process.env.MF_BUILT_AT ??= new Date().toISOString())

// Standalone microfrontend: everything, Vue included, is bundled inside, nothing is shared with the host.
//   remoteEntry.js     — browser entry
//   remoteEntry.ssr.js — server entry (manifest `ssrRemoteEntry`), loaded by the host's Node server
export default defineConfig({
  base: `${ORIGIN}/${process.env.MF_RELEASE ? `${RELEASE_DIR}/` : ''}`,
  define: {
    __MF_RELEASE__: JSON.stringify(RELEASE),
    __MF_BUILT_AT__: JSON.stringify(BUILT_AT),
    // Report what differs if the remote's hydration ever mismatches (POC: worth the few bytes)
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true'
  },
  ssr: {
    // Otherwise remoteEntry.ssr.js keeps bare `vue` imports and the host server would resolve its own Vue
    noExternal: ['vue', /^@vue\//]
  },
  plugins: [
    vue(),
    federation({
      name: 'fvm_remote',
      filename: 'remoteEntry.js',
      manifest: true,
      dts: false,
      exposes: {
        './app/client': './src/app/client.ts',
        './app/server': './src/app/server.ts'
      },
      shared: {}
    })
  ],
  build: {
    target: 'esnext',
    outDir: RELEASE_DIR,
    emptyOutDir: true,
    minify: false
  },
  // `vite build` builds both environments; MF emits remoteEntry.ssr.js from the ssr one
  // and lists it in mf-manifest.json as metaData.ssrRemoteEntry
  builder: {},
  environments: {
    client: {},
    ssr: {
      build: {
        outDir: `${RELEASE_DIR}/ssr`,
        rollupOptions: { input: './src/app/server.ts' }
      }
    }
  },
  server: {
    port: PORT,
    origin: ORIGIN,
    cors: true
  }
})
