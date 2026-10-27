// apps/tracy-web/src/shard/catalogue.js
/**
 * What the Add site form reads that only the master's database holds (shard beta, spec §7): the
 * design template cards — with their pictures and the live demo of each release. Read from the
 * master's PUBLIC doors (no signature: they answer anyone), kept a minute, and served here as this
 * shard's own: the list with its picture addresses moved to this shard, the pictures and the demo
 * frame check passed through. The preview of a design system is NOT asked of the master: this
 * shard builds it from the demo row `demoOf` makes and reads the demo at its public address, so its
 * links and fonts stay on this shard's origin (`sites/design-system-preview.js`).
 */
import { json } from '../lib/http.js'

const LIST_KEEP_MS = 60_000
const CALL_MS = 10_000
const PASS_THROUGH = /^\/api\/templates\/[^/]+\/(?:shots\/[^/]+|demo-frame)$/
const KEPT_HEADERS = ['content-type', 'cache-control', 'etag', 'access-control-allow-origin']

/** The host a demo read off the master's cards is "on": never a shard's name, so it is read at its address. */
export const MASTER_HOST = '@master'

export function rebaseUrls(value, from, to) {
  if (typeof value === 'string') return value.startsWith(from) ? `${to}${value.slice(from.length)}` : value
  if (Array.isArray(value)) return value.map((item) => rebaseUrls(item, from, to))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rebaseUrls(item, from, to)]))
  return value
}

export function masterCatalogue({ masterOrigin, fetchImpl = fetch, now = Date.now, keepMs = LIST_KEEP_MS }) {
  let kept = null
  async function templates() {
    if (kept && now() - kept.at < keepMs) return kept.body
    try {
      const response = await fetchImpl(`${masterOrigin}/api/templates`, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(CALL_MS)
      })
      const body = response.ok ? await response.json() : null
      if (!body || !Array.isArray(body.templates)) throw new Error('unreadable')
      kept = { at: now(), body }
      return body
    } catch {
      // A master that does not answer leaves the last list it gave: older cards beat no cards.
      return kept?.body ?? null
    }
  }
  /** The demo of `tag` as the preview doors read a demo row (`lib/demo-sites.js` `liveDemoOf`). */
  async function demoOf(tag) {
    const body = await templates()
    for (const card of body?.templates ?? [])
      for (const p of Array.isArray(card?.platforms) ? card.platforms : []) {
        if (p?.tag !== tag || typeof p.demo?.url !== 'string') continue
        let label
        try {
          label = new URL(p.demo.url).hostname.split('.')[0]
        } catch {
          return null
        }
        return {
          host: MASTER_HOST,
          label,
          port: null,
          publish: 'published',
          address: p.demo.url,
          platform: typeof p.platform === 'string' ? p.platform : null,
          quickstart_version: p.demo.version ?? p.version ?? null,
          quickstart_sha256: null
        }
      }
    return null
  }
  return { templates, demoOf }
}

export function shardCatalogueDoors({ config, catalogue, fetchImpl = fetch }) {
  return async (c, next) => {
    if (c.req.method !== 'GET') return next()
    const url = new URL(c.req.url)
    if (url.pathname === '/api/templates') {
      c.header('cache-control', 'no-store')
      const body = await catalogue.templates()
      if (!body) return json(c, { code: 'CATALOGUE_UNAVAILABLE' }, 503)
      return json(
        c,
        rebaseUrls(body, `${config.shard.masterOrigin}/api/templates/`, `${config.origin}/api/templates/`)
      )
    }
    if (!PASS_THROUGH.test(url.pathname)) return next()
    let upstream
    try {
      upstream = await fetchImpl(`${config.shard.masterOrigin}${url.pathname}${url.search}`, {
        redirect: 'error',
        signal: AbortSignal.timeout(CALL_MS)
      })
    } catch {
      c.header('cache-control', 'no-store')
      return json(c, { code: 'CATALOGUE_UNAVAILABLE' }, 503)
    }
    const headers = {}
    for (const name of KEPT_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) headers[name] = value
    }
    return c.body(await upstream.arrayBuffer(), upstream.status, headers)
  }
}
