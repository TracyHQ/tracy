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

/**
 * The pages a failing check or the residue ledger names (review 27/10/2026): the pages a sweep writes and the ones whose
 * words a failure rests on. Each keeps its read for the next check only when that read can stand for its finding
 * (`keptForFinding`); a failure that names no page is confirmed by a full check before it counts (tracy-web
 * `client-demo.js` `measure`).
 * @param {{checks?: Array<Record<string, any>>, residue?: unknown} | null | undefined} result - `runDemoQa`'s
 * @returns {Set<string>} the pages, by the path they were read at
 */
export function pagesWithFindings(result) {
  const pages = new Set()
  /** @param {unknown} value @param {number} depth */
  const walk = (value, depth) => {
    if (depth > 8 || value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1)
      return
    }
    const page = /** @type {Record<string, unknown>} */ (value).page
    if (typeof page === 'string') pages.add(page)
    for (const item of Object.values(value)) walk(item, depth + 1)
  }
  for (const check of result?.checks ?? []) if (check && check.pass !== true) walk(check, 0)
  walk(result?.residue, 0)
  return pages
}

/**
 * 🔒 A FINDING ALONE NEVER DROPS A KEPT READ (#247), A DYNAMIC PAGE STILL DOES (review 27/10/2026). Dropping every page a
 * finding named left a build mid-repair nothing to keep (template residue on most routes): every "incremental" read of a
 * 48-page site read all 48 again (dev 30/10/2026, six times in one check). A page's fingerprint holds its document as
 * served and every same-origin stylesheet, script and picture it loaded by its load event, each by its body
 * (`readDemoPage`), so a repair of its words, its styles or its pictures changes it and the page is read anew. What the
 * fingerprint cannot hold is a page's script-fetched data, the category label or card list a visitor's scroll loads that
 * made the old rule: such a page is `dynamic` and is still read in full while a finding names it. A read kept before
 * this was known (no `dynamic` said) is dropped too.
 * @param {{dynamic?: boolean} | null | undefined} entry - the cache's entry for the page
 * @returns {boolean}
 */
export function keptForFinding(entry) {
  return entry?.dynamic === false
}
