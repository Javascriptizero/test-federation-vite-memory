import v8 from 'node:v8'

const MB = 1024 * 1024
const GC_ROUNDS = 3
const GC_PAUSE_MS = 20

interface ReleaseFootprint {
  release?: string
  builtAt?: string
  evaluatedAt?: string
  renders?: number
  payload?: string
}

type GcFunction = (options?: { type: 'major'; execution: 'sync'; flavor: 'regular' | 'last-resort' }) => void

const toMb = (bytes: number): number => Math.round(bytes / MB * 100) / 100

function describeKey (key: string | symbol): string {
  return typeof key === 'symbol' ? key.toString() : key
}

/** Short, JSON-safe description of an arbitrary global value */
function describeValue (value: unknown): unknown {
  if (Array.isArray(value)) {
    return { type: 'array', length: value.length }
  }

  if (value instanceof Map || value instanceof Set) {
    return { type: value.constructor.name, size: value.size, keys: value instanceof Map ? [...value.keys()].slice(0, 20).map(String) : undefined }
  }

  if (typeof value === 'function') {
    return { type: 'function', name: value.name }
  }

  if (value && typeof value === 'object') {
    const keys = Reflect.ownKeys(value)

    return { type: 'object', keys: keys.slice(0, 20).map(describeKey), keyCount: keys.length }
  }

  return { type: typeof value, value: typeof value === 'string' ? value.slice(0, 100) : value }
}

/**
 * GET /api/memory[?gc=1|last-resort]
 *  - memory: process.memoryUsage() + V8 heap spaces, in MB (optionally after GC, needs --expose-gc)
 *  - remoteReleases: Symbol-keyed properties the remote's SSR entry put on this server's globalThis,
 *    one per evaluation of a release; if old releases stay here, the host realm retains them
 *  - addedGlobals: every other own property of globalThis added after the server started
 *    (MF runtime caches, Vue's __VUE_*_SETTERS__ of the remote's bundled Vue, ...)
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const gc = (globalThis as { gc?: GcFunction }).gc
  const gcFlavor = query.gc === 'last-resort' ? 'last-resort' : query.gc ? 'regular' : undefined

  if (gcFlavor && gc) {
    for (let round = 0; round < GC_ROUNDS; round++) {
      gc({ type: 'major', execution: 'sync', flavor: gcFlavor })
      await new Promise((resolve) => setTimeout(resolve, GC_PAUSE_MS))
    }
  }

  const memory = process.memoryUsage()
  const heapSpaces = Object.fromEntries(v8.getHeapSpaceStatistics().map((space) => [space.space_name, toMb(space.space_used_size)]))
  const globals = globalThis as unknown as Record<string | symbol, unknown>

  const remoteReleases = Object.getOwnPropertySymbols(globalThis)
    .filter((symbol) => symbol.description?.startsWith(REMOTE_GLOBAL_KEY_PREFIX))
    .map((symbol) => {
      const { payload, ...footprint } = (globals[symbol] ?? {}) as ReleaseFootprint

      return { key: symbol.toString(), ...footprint, payloadBytes: payload?.length ?? 0 }
    })

  const addedGlobals = Object.fromEntries(Reflect.ownKeys(globalThis)
    .filter((key) => !globalsBaseline.has(key))
    .filter((key) => !(typeof key === 'symbol' && key.description?.startsWith(REMOTE_GLOBAL_KEY_PREFIX)))
    .map((key) => [describeKey(key), describeValue(globals[key])]))

  setResponseHeader(event, 'Cache-Control', 'no-store')

  return {
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    gc: gcFlavor ? (gc ? gcFlavor : 'requested, but not exposed (start node with --expose-gc)') : 'not requested',
    memoryMb: {
      rss: toMb(memory.rss),
      heapTotal: toMb(memory.heapTotal),
      heapUsed: toMb(memory.heapUsed),
      external: toMb(memory.external),
      arrayBuffers: toMb(memory.arrayBuffers)
    },
    heapSpacesMb: heapSpaces,
    remoteReleaseCount: remoteReleases.length,
    remoteReleases,
    addedGlobals
  }
})
