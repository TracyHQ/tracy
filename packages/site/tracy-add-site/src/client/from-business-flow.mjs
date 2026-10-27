/**
 * Build from my business — the logic of Add site's one-press start, without React (`from-business.tsx` draws it).
 *
 * The customer types their business's name and city, or pastes its website or Google Maps link, into the one
 * question the questionnaire serves for it (`kind: 'business'`, `GET /api/sites/questions`). Tracy researches it
 * (`/api/sites/from-business`, `apps/tracy-web/src/opportunities-build/own-site.js`) and suggests a template; the person
 * keeps it or picks another (David 24/10/2026), the server accepts that one build, and this page opens the chat of
 * the claimed site with `wo-demo-chat=<action>`: the Website Opportunities plugin on that page sends the brief as
 * the customer's message, as it does for a demo.
 */
import { tracyWebFetch } from '@tracy/core/web-path'

const BASE = '/api/sites/from-business'
/** How often the page asks where the research stands; the research takes minutes. */
export const POLL_MS = 4000
// A `retryAt` is trusted inside these bounds only: a skewed clock never spins the walk or parks it for long.
const RETRY_AT_MIN_MS = 500

/**
 * Milliseconds before asking again: `POLL_MS`, or less when `retryAt` (the ISO deadline the server named for the
 * logo research) comes sooner; never under `RETRY_AT_MIN_MS`. The research may finish well before its deadline,
 * so the deadline only shortens the wait, never lengthens it.
 * @param {unknown} retryAt
 * @param {number} at
 */
export function pendingDelay(retryAt, at) {
  const until = typeof retryAt === 'string' ? Date.parse(retryAt) : Number.NaN
  if (!Number.isFinite(until)) return POLL_MS
  return Math.min(POLL_MS, Math.max(RETRY_AT_MIN_MS, until - at))
}
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:[/:?#]|$)/i

/**
 * Whether what was typed is a link rather than a name: a web address with a scheme, `www.`, or a bare domain.
 * @param {string} text
 */
export function looksLikeLink(text) {
  const s = String(text ?? '').trim()
  if (!s || /\s/.test(s)) return false
  return /^https?:\/\//i.test(s) || /^www\./i.test(s) || DOMAIN.test(s)
}

/**
 * A link as the server takes it: `https://` added to a bare domain.
 * @param {string} text
 */
export function linkOf(text) {
  const s = String(text ?? '').trim()
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

/**
 * The `business` question of a served questionnaire, or null when the set has none (a server that does not
 * offer this start yet).
 * @param {unknown} body The JSON of `GET /api/sites/questions`.
 * @returns {{ id: string, label: string, hint: string | null } | null}
 */
export function businessQuestionOf(body) {
  const questions = Array.isArray(/** @type {any} */ (body)?.questions)
    ? /** @type {any} */ (body).questions
    : []
  const q = questions.find((/** @type {any} */ item) => item?.kind === 'business')
  if (!q || typeof q.label !== 'string' || !q.label) return null
  return { id: q.id, label: q.label, hint: typeof q.hint === 'string' && q.hint ? q.hint : null }
}

/**
 * One line under a found business: its address, then what Google calls it.
 * @param {{ address?: string, category?: string } | null | undefined} place
 */
export function placeLine(place) {
  return [place?.address, place?.category].filter((s) => typeof s === 'string' && s).join(' · ')
}

/**
 * The chat a prepared build opens: the claimed site's session, carrying the action the WO plugin sends the brief
 * for (`client-demo-chat.ts` `receiveClientDemoChat`). Null when the answer is not one this page can trust.
 * @param {any} prepared The answer of `POST /api/website-opportunities/demo/actions/:id/chat/prepare`.
 */
export function chatEntryOf(prepared) {
  const chat = prepared?.chat
  const actionId = prepared?.action?.id
  if (!chat?.siteKey || !chat.sessionId || typeof actionId !== 'string') return null
  const path = `/${encodeURIComponent(chat.siteKey)}/s/${encodeURIComponent(chat.sessionId)}`
  const href = new URL(String(chat.href ?? ''), 'https://workspace.invalid')
  if (href.origin !== 'https://workspace.invalid' || href.pathname !== path) return null
  return `${path}?${new URLSearchParams({ 'wo-demo-chat': actionId })}`
}

/**
 * The doors this start uses, each answering `{ ok, status, body }` and never throwing for an HTTP refusal.
 * @param {typeof tracyWebFetch} [fetchImpl]
 */
export function fromBusinessApi(fetchImpl = tracyWebFetch) {
  /**
   * @param {string} path @param {string} [method] @param {unknown} [body]
   * @returns {Promise<{ ok: boolean, status: number, body: any }>}
   */
  const call = async (path, method = 'GET', body = undefined) => {
    try {
      const res = await fetchImpl(path, {
        method,
        credentials: 'same-origin',
        headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
      const parsed = await res.json().catch(() => null)
      return { ok: res.ok, status: res.status, body: parsed }
    } catch {
      return { ok: false, status: 0, body: null }
    }
  }
  return {
    /** @param {string} lang */
    question: (lang) =>
      call(`/api/sites/questions?${new URLSearchParams({ platform: 'joomla', lang: lang || 'en' })}`),
    /** @param {string} q */
    find: (q) => call(`${BASE}/find?${new URLSearchParams({ q })}`),
    /** @param {{ requestId: string, place?: object, url?: string, label?: string, links?: string[], name?: string }} input */
    start: (input) => call(BASE, 'POST', input),
    /** @param {string} id */
    state: (id) => call(`${BASE}/${encodeURIComponent(id)}`),
    /** @param {string} id @param {{ cms: string, design: string, quickstart: string } | { auto: true }} selection */
    build: (id, selection) => call(`${BASE}/${encodeURIComponent(id)}/build`, 'POST', { selection }),
    /** The template catalogue (`GET /api/templates`), for the suggestion's picture, sentence and demo. */
    templates: () => call('/api/templates'),
    /** @param {string} actionId */
    prepare: (actionId) =>
      call(`/api/website-opportunities/demo/actions/${encodeURIComponent(actionId)}/chat/prepare`, 'POST', {})
  }
}

/**
 * The request id of one press: new for every press, kept for that press's replays. `randomUUID` exists only on a
 * secure origin; a laptop stand on plain http draws the same 128 random bits from `getRandomValues`.
 */
export function newRequestId() {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return `own-${c.randomUUID()}`
  const bytes = c.getRandomValues(new Uint8Array(16))
  return `own-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

const KEPT_KEY = 'tracy:from-business:v1'
/** How long a kept business is followed again: its research and choice wait on the server well within it. */
const KEPT_MS = 24 * 60 * 60_000
/** The most links one business is added with (`MAX_LINKS` of the link rows). */
const KEPT_LINKS = 5

/**
 * The business this viewer is building from, kept in the browser so a reload, a closed tab or another page comes back to
 * it — its research, its template choice or its chat — instead of an empty field (local stand 24/10/2026: a reload ten
 * minutes into a research showed the empty form, the research on with nothing to reach it). A per-viewer convenience:
 * storage that throws or is empty starts afresh, as before.
 * @param {Pick<Storage, 'getItem'> | null | undefined} storage
 * A business started from its links keeps them (`links`, and the words typed beside them, `linkName`), so the page
 * reopens in links mode with them instead of an empty "Search by name" field (local stand 26/10/2026).
 * @param {number} [now]
 * @returns {{ id: string, name: string, links?: string[], linkName?: string } | null}
 */
export function keptBusiness(storage, now = Date.now()) {
  try {
    const kept = JSON.parse(storage?.getItem(KEPT_KEY) ?? 'null')
    if (typeof kept?.id !== 'string' || !kept.id || typeof kept.at !== 'number' || now - kept.at > KEPT_MS)
      return null
    const links = Array.isArray(kept.links)
      ? kept.links
          .filter((/** @type {unknown} */ l) => typeof l === 'string' && l.trim())
          .slice(0, KEPT_LINKS)
      : []
    return {
      id: kept.id,
      name: typeof kept.name === 'string' ? kept.name : '',
      ...(links.length ? { links } : {}),
      ...(links.length && typeof kept.linkName === 'string' && kept.linkName.trim()
        ? { linkName: kept.linkName.trim() }
        : {})
    }
  } catch {
    return null
  }
}

/**
 * Keep (or with `null`, forget) the business this viewer is building from.
 * @param {Pick<Storage, 'setItem' | 'removeItem'> | null | undefined} storage
 * @param {{ id: string, name: string, links?: string[], linkName?: string } | null} business
 * @param {number} [now]
 */
export function keepBusiness(storage, business, now = Date.now()) {
  try {
    if (business === null) storage?.removeItem(KEPT_KEY)
    else
      storage?.setItem(
        KEPT_KEY,
        JSON.stringify({
          id: business.id,
          name: business.name,
          ...(business.links?.length ? { links: business.links.slice(0, KEPT_LINKS) } : {}),
          ...(business.links?.length && business.linkName?.trim()
            ? { linkName: business.linkName.trim() }
            : {}),
          at: now
        })
      )
  } catch {
    // A browser that keeps nothing starts afresh next time.
  }
}

/** The names a research source is shown with: brand names, the same in every language. The business's own website
 * has its own sentence (`own_progress_website`), so `website` names itself.
 * @type {Readonly<Record<string, string>>} */
const SOURCE_NAMES = Object.freeze({
  website: 'website',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  'google-places': 'Google',
  'google-maps': 'Google Maps',
  tripadvisor: 'Tripadvisor'
})

/**
 * What the research wait shows besides its sentence (`own_progress_*`), read off the job the state door answers: the
 * source being read, the photos saved so far, and the whole minutes since it started. Measured 24/10/2026 on a local
 * stand: a bakery's research took ten minutes with a spinner and one sentence, while its job counted 101 photos.
 * @param {any} job The `job` of `GET /api/sites/from-business/:id` in phase `research`.
 * @param {number} [now]
 * @returns {{ source: string | null, photos: { done: number, total: number } | null, minutes: number | null }}
 */
export function researchProgressOf(job, now = Date.now()) {
  const progress = job?.progress && typeof job.progress === 'object' ? job.progress : {}
  const source = typeof progress.collecting === 'string' ? (SOURCE_NAMES[progress.collecting] ?? null) : null
  const media = progress.media
  const photos =
    media && Number.isInteger(media.done) && Number.isInteger(media.total) && media.total > 0
      ? { done: Math.min(media.done, media.total), total: media.total }
      : null
  const started = Date.parse(job?.createdAt ?? '')
  const minutes = Number.isFinite(started) && now >= started ? Math.floor((now - started) / 60_000) : null
  return { source, photos, minutes }
}

/**
 * What the template choice shows of the suggested template besides its name: the picture its card has (the home page's
 * desktop shot, else the card's image), the sentence a person wrote about it, and its live demo on the suggested CMS —
 * each null when the catalogue has none. A name alone was all a customer had to choose on (local stand 24/10/2026).
 * @param {any} body The JSON of `GET /api/templates`.
 * @param {{ cms: string, design: string, quickstart: string } | null | undefined} suggestion
 * @returns {{ image: string | null, blurb: string | null, demo: string | null }}
 */
export function suggestionCardOf(body, suggestion) {
  const none = { image: null, blurb: null, demo: null }
  if (!suggestion || !Array.isArray(body?.templates)) return none
  const row = body.templates.find((/** @type {any} */ t) => t?.id === suggestion.design)
  if (!row) return none
  const text = (/** @type {unknown} */ v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const home = Array.isArray(row.card?.layouts)
    ? row.card.layouts.find((/** @type {any} */ l) => l?.key === 'home')
    : undefined
  const platform = Array.isArray(row.platforms)
    ? (row.platforms.find(
        (/** @type {any} */ p) => p?.platform === suggestion.cms && p?.tag === suggestion.quickstart
      ) ?? row.platforms.find((/** @type {any} */ p) => p?.platform === suggestion.cms))
    : undefined
  const demo = text(platform?.demo?.url ?? platform?.demo)
  return {
    image: text(home?.shots?.desktop) ?? text(row.card?.image),
    blurb: text(row.card?.blurb),
    demo: demo && /^https?:\/\//.test(demo) ? demo : null
  }
}

/**
 * The sentence Tracy's suggestion is explained with (`strings.ts` `own_reason_*`), from the server's reason.
 * @param {string | null | undefined} reason
 */
export function reasonKey(reason) {
  const tier = String(reason ?? '').split(';')[0]
  if (/^auto:(restaurant|hospitality)-match/.test(tier)) return 'own_reason_food'
  if (tier.startsWith('auto:trade-match:')) return 'own_reason_trade'
  if (/^auto:(business|small-business|multipurpose)-match/.test(tier)) return 'own_reason_business'
  return 'own_reason_nearest'
}

/**
 * Which message a refusal or a failed build is said with (`strings.ts` `own_*`).
 * @param {string | null | undefined} code
 */
export function failureKey(code) {
  if (code === 'DEMO_BUILD_DAILY_LIMIT' || code === 'NEW_PLACES_LIMIT') return 'own_limit'
  if (code === 'RATE_LIMITED') return 'own_rate'
  if (code === 'CREDENTIAL_MISSING') return 'own_search_off'
  if (code === 'INVALID_URL' || code === 'URL_BLOCKED' || code === 'URL_UNRESOLVABLE') return 'own_bad_link'
  return 'own_failed'
}

/**
 * The body of a start from links (`POST /api/sites/from-business`): the links in order, the words typed next to
 * them, and the place picked when the Google link matched several.
 * @param {string} requestId
 * @param {{ links: string[], name?: string, place?: object | null }} input
 */
export function linksStart(requestId, { links, name, place }) {
  const words = String(name ?? '').trim()
  return { requestId, links: [...links], ...(words ? { name: words } : {}), ...(place ? { place } : {}) }
}

/**
 * What a start answered: the business started; places to pick one from (409 `GOOGLE_LINK_AMBIGUOUS`, then the same
 * links are sent again with `place`); links none of which can be used (422 `NO_USABLE_LINKS`, said row by row);
 * or a failure, by its message key. `links` is the server's judgement of each link sent, when it gave one.
 * @param {{ ok: boolean, status: number, body: any }} answer
 * @returns {{ started: { id: string, name: string }, links?: any[] } | { pick: any[], links?: any[] }
 *   | { unusable: any[] } | { failed: string }}
 */
export function startOutcome(answer) {
  const body = answer?.body ?? {}
  const links = Array.isArray(body.links) ? body.links : undefined
  const id = body.business?.id
  if (answer?.ok && typeof id === 'string')
    return { started: { id, name: typeof body.business.name === 'string' ? body.business.name : '' }, links }
  if (body.code === 'GOOGLE_LINK_AMBIGUOUS' && Array.isArray(body.candidates) && body.candidates.length > 0)
    return { pick: body.candidates.slice(0, 5), links }
  if (body.code === 'NO_USABLE_LINKS') return { unusable: links ?? [] }
  return { failed: failureKey(body.code) }
}

/**
 * Follow one business from its research to its chat: ask where it stands every `POLL_MS`, tell `onState` each
 * answer; at `choose` hand the business back for the person to pick its template (`{ choose }`); once its build
 * was accepted prepare the chat and open it. Stops when `signal` aborts. `onLogoWait(true)` while the chat waits
 * for the demo's logo research, `onLogoWait(false)` once that wait is over; that wait lasts until the answer's
 * `retryAt` when it names one.
 * @param {{ api: ReturnType<typeof fromBusinessApi>, id: string, onState(state: any): void,
 *   open(href: string): void, signal: AbortSignal, wait?: (ms: number) => Promise<void>,
 *   now?: () => number, onLogoWait?: (waiting: boolean) => void }} deps
 * @returns {Promise<{ opened: true } | { failed: string } | { choose: any }>}
 */
export async function followBusiness({ api, id, onState, open, signal, wait, now = Date.now, onLogoWait }) {
  const pause = wait ?? ((/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  let waiting = false
  /** @param {boolean} now */
  const logoWait = (now) => {
    if (now !== waiting) onLogoWait?.((waiting = now))
  }
  try {
    return await walk()
  } finally {
    logoWait(false)
  }
  /** @returns {Promise<{ opened: true } | { failed: string } | { choose: any }>} */
  async function walk() {
    for (;;) {
      if (signal.aborted) return { failed: 'STOPPED' }
      const answer = await api.state(id)
      if (signal.aborted) return { failed: 'STOPPED' }
      const business = answer.body?.business
      if (!answer.ok || !business) return { failed: answer.body?.code ?? 'STATE_UNAVAILABLE' }
      onState(business)
      if (business.phase === 'failed') return { failed: business.code ?? 'RESEARCH_FAILED' }
      if (business.phase === 'choose') return { choose: business }
      if (business.phase === 'build' && business.action?.id) {
        const prepared = await api.prepare(business.action.id)
        if (signal.aborted) return { failed: 'STOPPED' }
        // 🔒 The server never holds the request while the demo's logo research may still answer (tracy-web
        // `logo-research.js`): it says so at once, and the walk asks again on its next beat.
        if (!prepared.ok && prepared.body?.code === 'DEMO_LOGO_RESEARCH_PENDING') {
          logoWait(true)
          await pause(pendingDelay(prepared.body?.retryAt, now()))
          continue
        }
        logoWait(false)
        const href = prepared.ok ? chatEntryOf(prepared.body) : null
        if (!href) return { failed: prepared.body?.code ?? 'CHAT_UNAVAILABLE' }
        open(href)
        return { opened: true }
      }
      await pause(POLL_MS)
    }
  }
}

/** A link or a bare host (`httpbin.org`): what a business added by links is called until a source names it. */
function isHostLike(/** @type {string} */ name) {
  return /^https?:\/\//i.test(name) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?$/i.test(name)
}

/**
 * The name the research line shows as the state door answers: the server's best known name (`bestKnownName`), unless
 * it is still a host while the line already has a real name (the words typed with the links).
 * @param {string} current
 * @param {unknown} server
 * @returns {string}
 */
export function researchNameOf(current, server) {
  const said = typeof server === 'string' ? server.trim() : ''
  if (!said) return current
  if (isHostLike(said) && current.trim() && !isHostLike(current.trim())) return current
  return said
}

/**
 * The name a links start shows before the server answers: the words typed with the links, else the first link's host
 * (`www.` dropped), the last resort; never empty, which read "about : its website" (local stand 26/10/2026).
 * @param {string} typed
 * @param {readonly string[]} links
 * @returns {string}
 */
export function startNameOf(typed, links) {
  const words = String(typed ?? '').trim()
  if (words) return words
  for (const link of links) {
    try {
      return new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).hostname.replace(/^www\./, '')
    } catch {
      // Not a URL: the next link.
    }
  }
  return ''
}
