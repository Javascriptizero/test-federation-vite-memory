/**
 * Static server for the microfrontend releases (what a CDN would do).
 *   GET /mf-manifest.json      → releases/<current>/mf-manifest.json (no-store: the host polls it)
 *   GET /releases/<id>/...     → immutable release files
 *   GET /                      → standalone page of the current release
 */
import { readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releasesDir = join(root, 'releases')
const port = Number(process.env.REMOTE_PORT ?? 4380)

const CONTENT_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
}

function currentRelease () {
  try {
    return readFileSync(join(releasesDir, 'current.txt'), 'utf8').trim()
  } catch {
    return undefined
  }
}

createServer((request, response) => {
  const pathname = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const release = currentRelease()
  const headers = { 'Access-Control-Allow-Origin': '*' }

  let file
  let cache = 'public, max-age=31536000, immutable'

  if (pathname === '/mf-manifest.json' || pathname === '/' || pathname === '/index.html') {
    file = release && join(releasesDir, release, pathname === '/mf-manifest.json' ? 'mf-manifest.json' : 'index.html')
    cache = 'no-store'
  } else if (pathname.startsWith('/releases/')) {
    file = join(root, pathname)
  }

  if (!file || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
    response.writeHead(404, headers)
    response.end(release ? 'not found' : 'no release yet, run `yarn release`')

    return
  }

  response.writeHead(200, {
    ...headers,
    'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': cache,
    'X-Release': release ?? ''
  })
  response.end(readFileSync(file))
}).listen(port, () => {
  console.log(`[remote] http://localhost:${port}  current release: ${currentRelease() ?? 'none (run yarn release)'}`)
})
