/**
 * THE DEMO'S OWN PAGES, for the old URL → new page map (`website-opportunities/domain/url-map.mjs`): a target of that
 * map must be a page the demo really has, so the demo's page list is read from the demo itself, as its CMS lists it:
 * `content.read {view: "pages"}` through the Apply door (the relay's walk over the Claude Cowork plugin's listing,
 * `sites/content-pages.js`), the same list the site agent reads. Kept on the build as `wo_build.built.pages`:
 * `{readAt, truncated, pages: [{path, title, type}]}`, or `{readAt, reason}` when the read gave no list.
 *
 * Read once when the build's action completes (`demo-preview.js` `createDemoBuilt`, as the account that built it), and
 * again when the seller opens the map or hands the demo over (`route.js`, as the caller), so the map follows pages the
 * owner or the agent changed since. 🔒 A read that fails never replaces a list already kept, and never fails a build or
 * a handover: the map then says the demo's pages were not read.
 */

export const DEMO_PAGES_SCHEMA = 'tracy-content-pages/v1'
/** Pages one list keeps; a WO demo has a dozen or two. */
export const DEMO_PAGES_MAX = 300
/** How long one read may take: one walk of a one-language demo answered in about 3 s on dev (04/11/2026). */
export const DEMO_PAGES_READ_MS = 30_000
const CODE = /^[A-Z][A-Z0-9_]{2,63}$/

const readAtOf = (at) => new Date(at).toISOString()

/**
 * The pages of a `tracy-content-pages/v1` answer a map may lead to: published, on the demo's own host, in its default
 * language when it has several, one per path. Pure.
 * @param {any} doc the Apply door's answer to `content.read {view: "pages"}`
 * @param {number} at when it was read
 * @returns {{readAt: string, truncated: boolean, pages: {path: string, title: string | null, type: string | null}[]}
 *   | {readAt: string, reason: string}}
 */
export function demoPagesSnapshot(doc, at) {
  if (doc?.schemaVersion !== DEMO_PAGES_SCHEMA || !Array.isArray(doc.pages))
    return { readAt: readAtOf(at), reason: 'UNREADABLE' }
  const siteUrl = typeof doc.site?.url === 'string' ? doc.site.url : null
  let host = null
  try {
    host = siteUrl ? new URL(siteUrl).host : null
  } catch {
    host = null
  }
  const locales = Array.isArray(doc.site?.locales) ? doc.site.locales : []
  const language =
    locales.length > 1 && typeof doc.site?.defaultLocale === 'string' ? doc.site.defaultLocale : null
  const seen = new Set()
  const pages = []
  let cut = false
  for (const row of doc.pages) {
    if (typeof row?.path !== 'string' || !row.path.startsWith('/') || row.path.length > 400) continue
    // A draft, an unpublished menu item or a page in the bin is not where a visitor can land.
    if (row.status != null && row.status !== 'published') continue
    if (language && typeof row.locale === 'string' && row.locale !== language) continue
    // A menu item that links elsewhere (another site) is not a page of this one.
    if (host && typeof row.url === 'string') {
      try {
        if (new URL(row.url, siteUrl ?? undefined).host !== host) continue
      } catch {
        continue
      }
    }
    if (seen.has(row.path)) continue
    if (pages.length >= DEMO_PAGES_MAX) {
      cut = true
      break
    }
    seen.add(row.path)
    const title = typeof row.title === 'string' ? row.title.trim().slice(0, 200) : ''
    pages.push({
      path: row.path,
      title: title || null,
      type: typeof row.type === 'string' && row.type ? row.type.slice(0, 40) : null
    })
  }
  return { readAt: readAtOf(at), truncated: doc.truncated === true || cut, pages }
}

/**
 * One read of the demo's pages. `ask(call)` sends `{action, params}` to the demo's Apply door and answers its JSON body
 * (`ok: false` with a `code` for a refusal). Bounded by `timeoutMs` even when `ask` never settles; never throws.
 * @param {(call: {action: string, params: Record<string, unknown>}) => Promise<any>} ask
 * @param {{now?: () => number, timeoutMs?: number}} [options]
 */
export async function readDemoPages(ask, { now = Date.now, timeoutMs = DEMO_PAGES_READ_MS } = {}) {
  let timer
  try {
    const bound = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs)
      timer.unref?.()
    })
    const answer = await Promise.race([
      Promise.resolve()
        .then(() => ask({ action: 'content.read', params: { view: 'pages' } }))
        .catch(() => ({ ok: false, code: 'UNREACHABLE' })),
      bound
    ])
    if (answer?.timedOut) return { readAt: readAtOf(now()), reason: 'TIMEOUT' }
    if (answer?.schemaVersion === DEMO_PAGES_SCHEMA) return demoPagesSnapshot(answer, now())
    const code = answer?.code ?? answer?.error?.code
    return { readAt: readAtOf(now()), reason: typeof code === 'string' && CODE.test(code) ? code : 'REFUSED' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Keep a read on the build row, beside what the build took (`built`). A read with no list replaces only a read with no
 * list: pages already kept stay.
 * @returns {Promise<boolean>} whether it was kept
 */
export async function saveDemoPages(pool, buildId, snapshot) {
  const listed = Array.isArray(snapshot?.pages)
  const { rowCount } = await pool.query(
    `update wo_build set built = coalesce(built, '{}'::jsonb) || jsonb_build_object('pages', $2::jsonb)
      where id = $1 and ($3::boolean or jsonb_typeof(built->'pages'->'pages') is distinct from 'array')`,
    [buildId, JSON.stringify(snapshot), listed]
  )
  return rowCount > 0
}

/**
 * The Apply door asked over HTTP as the caller (their session cookie and this deployment's `Origin`), for the doors that
 * read the demo's pages while the seller waits.
 * @param {(path: string, init?: RequestInit) => Promise<Response>} request
 * @param {{siteKey: string, cookie: string, origin: string}} as
 */
export function applyOverRequest(request, { siteKey, cookie, origin }) {
  return async (call) => {
    const res = await request(`/api/sites/${encodeURIComponent(siteKey)}/apply`, {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify(call)
    })
    const body = await res.json().catch(() => null)
    if (res.ok && body && typeof body === 'object') return body
    return {
      ...(body && typeof body === 'object' ? body : {}),
      ok: false,
      code: body?.code ?? `HTTP_${res.status}`
    }
  }
}
