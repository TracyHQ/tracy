/** A byte-bounded LRU for incremental QA reads. Eviction only costs another full page read. */
export class DemoReadCache {
  constructor({ maxBytes = 16 * 1024 * 1024, maxEntries = 300, ttlMs = 15 * 60_000, now = Date.now } = {}) {
    this.maxBytes = maxBytes
    this.maxEntries = maxEntries
    this.ttlMs = ttlMs
    this.now = now
    this.entries = new Map()
    this.bytes = 0
  }

  drop(key) {
    const entry = this.entries.get(key)
    if (entry) this.bytes -= entry.bytes
    this.entries.delete(key)
  }

  get(key) {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (this.now() - entry.at >= this.ttlMs) {
      this.drop(key)
      return null
    }
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key, value) {
    this.drop(key)
    // Reads contain measurements, never screenshots. An accidental image payload must not become a long-lived cache.
    // 🔒 A PICTURE THE PAGE'S OWN STYLESHEET INLINES IS NOT ONE (local measure 28/10/2026): T4's form-select arrow
    // (`data:image/svg+xml,…`) in every page's sheet made the cache refuse every read, and each incremental check
    // read a Joomla site whole. Refused: a base64 picture of a screenshot's size, or a field named for one.
    const json = JSON.stringify(value)
    if (
      /data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]{16384,}|"(?:base64|screenshot|screenshots)"\s*:/.test(json)
    )
      return
    // Account conservatively for UTF-16 strings, object overhead and the key; this is a budget, not an RSS claim.
    const bytes = 4 * (Buffer.byteLength(json) + Buffer.byteLength(key))
    if (bytes > this.maxBytes || this.maxEntries < 1) return
    for (const [oldKey, entry] of this.entries) if (this.now() - entry.at >= this.ttlMs) this.drop(oldKey)
    this.entries.set(key, { value, bytes, at: this.now() })
    this.bytes += bytes
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries)
      this.drop(this.entries.keys().next().value)
  }
}
