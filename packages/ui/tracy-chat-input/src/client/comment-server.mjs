/**
 * The site's comments read straight from the server, for the Comments tab while no Browser tab of the
 * conversation on screen lists them (Akemi 01/10/2026: with the right pane on another tab the Comments
 * tab read "No comments yet" and carried no count, on a site with 11 open comments).
 *
 * The door is `GET /api/sites/:key/comments` (`apps/tracy-web` `sites/comments.js`), the same one the
 * Browser tab (`dsh-better-sidebar` `comment-api.ts`) polls: a root door of the host, root-absolute,
 * the session cookie riding along. Its rows are turned into the comments of a `tracy:comment-list`, the
 * way the Browser tab turns its store into one (`commentListDetail`): same facts, same element shape
 * (`sendElementOf`), so a row reads the same from either source and nothing moves when the tab opens.
 *
 * One source at a time (`comment-view.mjs` `sourceTabs`): while a Browser tab of the conversation on
 * screen lists, its list is the truth (it is live, and every act goes through it); the server's fills
 * in while none does. They are never merged, so a comment is never counted twice.
 */

/** @typedef {(input: string, init?: RequestInit) => Promise<Response>} FetchLike */

/**
 * The comment door of a site, root-absolute (a Worker door, never through `dshUrl`).
 * @param {string} siteKey
 * @returns {string}
 */
export function commentsDoor(siteKey) {
  return `/api/sites/${encodeURIComponent(siteKey)}/comments`
}

/** How long a quoted excerpt of the element's own words may be (the fork's `EXCERPT_CHARS`). */
const EXCERPT_CHARS = 40
/** A locate level's crumb (`Home › hero.img`): words for the agent, never for a person. */
const FIELD_PATH = /\s›\s/
/** A record label naming where an element sits rather than what it is (`page "Home"`). */
const CONTAINER = /^(page|article|post|shared|template part|template|layout) "(.*)"$/is

/** @param {unknown} v @returns {string} */
const str = (v) => (typeof v === 'string' ? v : '')

/** @param {string} text @param {number} limit */
function shorten(text, limit) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat
}

/** The record a sure `content.locate` answer names (its last level's label), or null. */
function resolvedLabel(/** @type {unknown} */ locate) {
  if (locate === null || typeof locate !== 'object') return null
  const raw = /** @type {{ status?: unknown, levels?: unknown }} */ (locate)
  if (raw.status !== 'resolved' || !Array.isArray(raw.levels)) return null
  const last = /** @type {{ label?: unknown, name?: unknown } | undefined} */ (raw.levels.at(-1))
  const label = str(last?.label) || str(last?.name)
  return label.trim() !== '' ? shorten(label, 160) : null
}

/** `page "Home"` → `Home page`; a shared part, template or layout by its name; anything else as it is. */
function plainRecord(/** @type {string} */ label) {
  const m = CONTAINER.exec(label.trim())
  if (m === null) return label
  const kind = m[1].toLowerCase()
  const name = m[2].trim()
  if (name === '') return label
  return kind === 'page' || kind === 'article' || kind === 'post' ? `${name} ${kind}` : name
}

/**
 * What the element names itself with: its words, else the page's name for it, else (an image) its alt,
 * caption or `image`, else the words inside it. The fork's `ownName`.
 * @param {Record<string, any>} el
 */
function ownName(el) {
  const text = str(el.text)
  if (text.trim() !== '') return `"${shorten(text, EXCERPT_CHARS)}"`
  const name = str(el.name).trim()
  if (el.image !== null && typeof el.image === 'object' && str(el.image.src) !== '') {
    const alt = str(el.image.alt)
    if (alt.trim() !== '') return shorten(alt, EXCERPT_CHARS)
    return name !== '' ? shorten(name, 80) : 'image'
  }
  if (name !== '') return shorten(name, 80)
  const inside = str(el.inside).trim()
  if (inside !== '') return `"${shorten(inside.replace(/…$/, ''), EXCERPT_CHARS)}"`
  return ''
}

/**
 * The element's name in plain words, as the Browser tab labels it (the fork's `plainLabel`): the
 * record's label when the record IS the element, else the element's own name, never a field path.
 * @param {Record<string, any>} el
 * @param {unknown} locate
 */
function plainLabel(el, locate) {
  const raw = resolvedLabel(locate)
  const record = raw === null || FIELD_PATH.test(raw) ? null : raw
  const own = ownName(el)
  if (record !== null && !(own !== '' && CONTAINER.test(record.trim()))) return plainRecord(record)
  return own || (record === null ? '' : plainRecord(record))
}

/**
 * A stored element as the Browser tab lists it (the fork's `sendElementOf`): its facts and its plain
 * label. Null for a comment about the whole page.
 * @param {unknown} element - the row's `element`, as the picker stored it.
 * @param {unknown} locate - the row's `locate`.
 * @param {string} url - the row's page.
 * @returns {Record<string, unknown> | null}
 */
export function serverElementOf(element, locate, url) {
  if (element === null || typeof element !== 'object') return null
  const el = /** @type {Record<string, any>} */ (element)
  const image =
    el.image !== null && typeof el.image === 'object' && str(el.image.src) !== ''
      ? { src: str(el.image.src), alt: str(el.image.alt) }
      : null
  return {
    url,
    selector: str(el.selector),
    label: plainLabel(el, locate),
    text: str(el.text),
    rect: el.rect,
    marks: Array.isArray(el.marks)
      ? el.marks.filter((/** @type {unknown} */ m) => typeof m === 'string')
      : [],
    tag: str(el.tag).toLowerCase(),
    image
  }
}

/**
 * The door's answer as a `tracy:comment-list` detail with no tab (`tabId` is the caller's): every row
 * the door lists (it lists live comments and the deleted ones replies still stand under), each as the
 * Browser tab would list it.
 * @param {unknown} body - `{comments, attachments?, limits?}`.
 * @param {string} siteKey
 * @returns {{ siteKey: string, comments: Record<string, unknown>[], attachments: unknown, limits: unknown } | null}
 */
export function serverListOf(body, siteKey) {
  if (body === null || typeof body !== 'object') return null
  const b = /** @type {Record<string, any>} */ (body)
  if (!Array.isArray(b.comments)) return null
  const rows = b.comments.filter((/** @type {unknown} */ r) => r !== null && typeof r === 'object')
  return {
    siteKey,
    comments: rows.map((/** @type {Record<string, any>} */ r) => ({
      ...r,
      element: serverElementOf(r.element, r.locate, str(r.url)),
      // The fork's `removed`: a deleted root kept for its replies (TH-4).
      ...(r.deletedRoot === true ? { removed: true } : {})
    })),
    attachments: b.attachments,
    limits: b.limits
  }
}

/**
 * Reads the site's comments into the lists: `loading` until the first answer, then `ready` with the
 * comments, or `failed` when the door refused or did not answer. A later read that fails keeps the
 * comments already read (old but true beats an error over a list that was fine); answers that come
 * back out of order are dropped, the newest read wins.
 * @param {{ lists: { serve(answer: { status: 'loading' } | { status: 'failed' } | { status: 'ready', siteKey: string, body: unknown }): void },
 *   siteKey: string, fetch: FetchLike }} input
 * @returns {{ load(): Promise<void> }}
 */
export function createServerComments({ lists, siteKey, fetch }) {
  let asked = 0
  let ready = false
  return {
    async load() {
      asked += 1
      const mine = asked
      if (!ready) lists.serve({ status: 'loading' })
      /** @type {unknown} */
      let body = null
      try {
        const res = await fetch(commentsDoor(siteKey), {
          headers: { accept: 'application/json' },
          credentials: 'same-origin'
        })
        body = res.ok ? await res.json() : null
      } catch {
        body = null
      }
      if (mine !== asked) return
      if (serverListOf(body, siteKey) === null) {
        if (!ready) lists.serve({ status: 'failed' })
        return
      }
      ready = true
      lists.serve({ status: 'ready', siteKey, body })
    }
  }
}
