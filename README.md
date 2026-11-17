# federation-vite-memory

Does a Nuxt host leak memory when it server-renders a microfrontend that releases more often than the host,
using the `vm` strategy of `@module-federation/vite`?

The trick: the remote's SSR entry writes a property with a **Symbol key** and **per-release data** onto
`globalThis` when it is evaluated. If the host evaluated remote code in an isolated realm, that property
would never show up on the host's `globalThis`. If it shows up and stays after newer releases, the host realm
holds every release.

## Parts

| folder | what |
|---|---|
| `remote/` | Vue 3.5.45 app, `@module-federation/vite` 1.24.1, port 4380. Standalone: Vue is bundled into both the browser and the SSR build (`shared: {}`, `ssr.noExternal: vue`). Exposes an app, not a component: `./app/server` → `render(props)` HTML, `./app/client` → `mount(el, props)` (hydrates). |
| `remote/src/app/server.ts` | on evaluation: `globalThis[Symbol('federation-vite-memory/remote@<release>')] = { release, builtAt, evaluatedAt, renders, payload }` (payload = 256 KB string so a retained release is visible in the heap) |
| `remote/scripts/release.mjs` | `yarn release`: a real `vite build` into `releases/<id>/` (own base URL, `buildVersion = <id>`), then marks it current |
| `remote/scripts/serve.mjs` | `yarn serve`: the "CDN". `/mf-manifest.json` → current release (no-store), `/releases/<id>/…` immutable |
| `host/` | Nuxt 4.5.2 + `@module-federation/nuxt` 0.2.0, port 4390. Home page = own content + the remote (SSR + hydration). SSR loader: `@module-federation/vite/ssrEntryLoader` with `strategy: 'vm'`, manifest re-checked on every request (`ssrManifestMaxAgeMs: 0`). `@module-federation/vite` is forced to 1.24.1 via `resolutions` (the module pins 1.20.0). |
| `host/server/api/memory.get.ts` | `GET /api/memory[?gc=1\|last-resort]`: `process.memoryUsage()` + heap spaces (MB), every remote Symbol on `globalThis` (`remoteReleases`), every other global added since startup (`addedGlobals`: `__VUE_*_SETTERS__`, `__mf_module_cache__`, `__FEDERATION__`, loader state…) |
| `scripts/releases.mjs` | cuts N releases while the host runs, waits until the host renders each one, prints memory after GC |

## Run

```bash
cd remote && yarn && yarn release && yarn serve
```

```bash
cd host && yarn && yarn build && yarn start
```

Open http://localhost:4390 and http://localhost:4390/api/memory?gc=1. Then, in another terminal:

```bash
cd remote && yarn release
```

Reload the page: it shows the new release without restarting the host, and `/api/memory` lists one more Symbol.
Or run a whole series (both servers running):

```bash
node scripts/releases.mjs --count 30
```

`yarn start` runs `node --experimental-vm-modules --expose-gc`; without `--experimental-vm-modules` the loader
silently falls back to `temp-file` (then files appear in `host/node_modules/.ssr-cache`). `yarn dev` in `host/`
works too (sets `NODE_OPTIONS=--experimental-vm-modules`).

## Result (30 releases, prod build, Node 22.22.3, heap after last-resort GC)

```
start  | heapUsed 13.98 MB | rss  94.4 MB | remote globals  1 | __VUE_INSTANCE_SETTERS__  2
r0011  | heapUsed 15.28 MB | rss  96.3 MB | remote globals  2 | __VUE_INSTANCE_SETTERS__  3
...
r0040  | heapUsed 47.96 MB | rss 132.6 MB | remote globals 31 | __VUE_INSTANCE_SETTERS__ 32
heapUsed growth: 1159 KB per release
```

Full log: `results/30-releases.txt`.

- **The remote's Symbol lands on the host's `globalThis` and stays there for every release.** The `vm` strategy
  evaluates `vm.SourceTextModule`s in the host's own context; there is no realm isolation. Anything a remote
  release writes to a global lives as long as the host process.
- Linear growth, ~1.16 MB per release. 256 KB of it is the deliberate payload; the other ~900 KB is the release's
  code, kept alive by the remote's bundled Vue: every Vue copy pushes a setter into
  `globalThis.__VUE_INSTANCE_SETTERS__` / `__VUE_SSR_SETTERS__` (32 entries after 31 releases = host Vue + one per
  release).
- Release switching itself works: the new release is rendered on the first request after the manifest changes,
  and nothing is written to `.ssr-cache` (no `import()` of remote code).

## Findings while building it

- **MF Vite 1.24.1 no longer emits `remoteEntry.ssr.js` by default.** The remote needs an `ssr` environment
  (`builder: {}` + `environments.ssr` in `remote/vite.config.ts`); then `mf-manifest.json` gets `metaData.ssrRemoteEntry`.
- **`buildVersion` comes from `package.json` (`1.0.0`)** unless `MF_BUILD_VERSION` is set. The loader detects new
  releases by `buildVersion` + manifest hash; `release.mjs` sets it to the release id.
- **With MF Vite 1.24.1 the `@module-federation/nuxt` 0.2.0 loader wrapper is bypassed.** 1.24.1 resolves
  `@module-federation/vite/ssrEntryLoader` itself, so the host runtime gets the plain upstream loader (options
  `strategy`, `maxAgeMs` are still passed). Consequences:
  - the module's SSR bridge (`Symbol.for('@module-federation/nuxt:ssr-runtime')`) does not exist, and a plain
    `import('fvm_remote/app/server')` keeps the first release forever. `FvmRemoteApp.vue` therefore loads through
    the host runtime (`__FEDERATION__.__INSTANCES__` → `loadRemote()`), whose `beforeRequest` hook re-checks the
    manifest (it falls back to the bridge if one exists, i.e. with the module's pinned 1.20.0);
  - the `vm` strategy resolves the remote's bare `@module-federation/runtime` with ESM conditions (`dist/index.js`)
    but the module traces only the CJS files into `.output` → `ERR_MODULE_NOT_FOUND` and a silent fallback to
    `temp-file`. Workaround: `nitro.externals.traceInclude` in `host/nuxt.config.ts`;
  - all `@module-federation/{runtime,runtime-core,sdk,error-codes}` are pinned to 2.9.3 in `resolutions` so there
    is one runtime copy;
  - every release logs `[ Federation Runtime ]: The remote "…fvm_remote" is already registered` (expected:
    the loader re-registers with `force: true`).
- The remote's `vite.config.ts` is evaluated once per environment: a `new Date()` in `define` differs between the
  client and SSR bundles → hydration mismatch. The build timestamp is pinned via `process.env.MF_BUILT_AT`.
- The remote's CSS files are not added to the host's SSR HTML (and not injected on client mount), so the remote
  uses inline styles.
