/**
 * Cuts N real releases of the remote (vite build each, see remote/scripts/release.mjs) while the host keeps
 * running, waits until the host's SSR renders each new release, and prints the host's /api/memory after GC.
 *
 *   node scripts/releases.mjs [--count 20] [--host http://localhost:4390] [--gc regular|last-resort]
 *
 * Needs the remote server (`yarn serve` in remote/) and the host (`yarn start` in host/) running.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function arg (name, fallback) {
  const index = process.argv.indexOf(`--${name}`)

  return index > 0 ? process.argv[index + 1] : fallback
}

const count = Number(arg('count', 20))
const host = arg('host', 'http://localhost:4390')
const gc = arg('gc', 'last-resort')
const WAIT_TRIES = 50
const WAIT_MS = 100

async function memory () {
  const response = await fetch(`${host}/api/memory?gc=${gc}`)

  return response.json()
}

async function renderedRelease () {
  const html = await (await fetch(`${host}/`)).text()

  return /class="fvm-remote" data-release="([^"]+)"/.exec(html)?.[1]
}

async function waitForRelease (release) {
  for (let attempt = 1; attempt <= WAIT_TRIES; attempt++) {
    if (await renderedRelease() === release) {
      return attempt
    }

    await new Promise((resolve) => setTimeout(resolve, WAIT_MS))
  }

  throw new Error(`host did not render release ${release} after ${WAIT_TRIES} requests`)
}

function row (label, mem, extra = '') {
  const { heapUsed, rss } = mem.memoryMb
  const vueSetters = mem.addedGlobals.__VUE_INSTANCE_SETTERS__?.length ?? 0

  console.log([
    label.padEnd(8),
    `heapUsed ${heapUsed.toFixed(2).padStart(7)} MB`,
    `rss ${rss.toFixed(1).padStart(6)} MB`,
    `remote globals ${String(mem.remoteReleaseCount).padStart(3)}`,
    `__VUE_INSTANCE_SETTERS__ ${String(vueSetters).padStart(3)}`,
    extra
  ].join(' | '))
}

await renderedRelease()

const first = await memory()

row('start', first, `pid ${first.pid}, gc ${first.gc}`)

for (let index = 0; index < count; index++) {
  const build = spawnSync(process.execPath, ['scripts/release.mjs'], { cwd: join(root, 'remote'), encoding: 'utf8' })

  if (build.status !== 0) {
    console.error(build.stdout, build.stderr)
    process.exit(1)
  }

  const release = readFileSync(join(root, 'remote', 'releases', 'current.txt'), 'utf8').trim()
  const requests = await waitForRelease(release)

  row(release, await memory(), `${requests} request(s) until rendered`)
}

const last = await memory()
const perRelease = (last.memoryMb.heapUsed - first.memoryMb.heapUsed) / count

console.log(`\nheapUsed growth: ${(perRelease * 1024).toFixed(0)} KB per release over ${count} releases`)
console.log('remote globals still on the host globalThis:')

for (const footprint of last.remoteReleases) {
  console.log(`  ${footprint.key}  renders=${footprint.renders}  evaluatedAt=${footprint.evaluatedAt}`)
}
