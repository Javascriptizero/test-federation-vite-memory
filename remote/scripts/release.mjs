/**
 * Builds a new release of the microfrontend and makes it current.
 *   releases/<id>/        — immutable build (its own base URL, so the host sees new chunk URLs)
 *   releases/current.txt  — id served at /mf-manifest.json by scripts/serve.mjs
 * The host is not rebuilt or restarted: it picks the release up from the manifest at runtime.
 *
 *   node scripts/release.mjs          — one release
 *   node scripts/release.mjs --id foo — explicit id
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releasesDir = join(root, 'releases')

function nextReleaseId () {
  mkdirSync(releasesDir, { recursive: true })

  const numbers = readdirSync(releasesDir)
    .map((name) => /^r(\d+)$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number)
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1

  return `r${String(next).padStart(4, '0')}`
}

const idFlag = process.argv.indexOf('--id')
const id = idFlag > 0 ? process.argv[idFlag + 1] : nextReleaseId()
const started = Date.now()

const result = spawnSync(join(root, 'node_modules', '.bin', 'vite'), ['build', '--logLevel', 'warn'], {
  cwd: root,
  stdio: 'inherit',
  // MF_BUILD_VERSION → mf-manifest buildVersion: the host's loader detects a new release by it
  env: { ...process.env, MF_RELEASE: id, MF_BUILD_VERSION: id }
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

writeFileSync(join(releasesDir, 'current.txt'), id)
console.log(`[release] ${id} is current (${Date.now() - started} ms)`)
