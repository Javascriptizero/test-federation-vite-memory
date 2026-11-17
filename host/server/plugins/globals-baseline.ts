/** Remembers what globalThis looked like at startup, so /api/memory can show what was added later */
export default defineNitroPlugin(() => {
  for (const key of Reflect.ownKeys(globalThis)) {
    globalsBaseline.add(key)
  }
})
