/**
 * A SITE READ AS THE MODEL READS IT: WHAT IT ACTS ON, AND THE ONE CALL TO THE REST (05/10/2026).
 *
 * 🔒 WHY. Every character of a tool answer is re-sent on every later step of the turn. Measured on 55 flow D
 * runs (05/10/2026, designer preset, one WordPress, one EmDash and one Joomla site): the answers of the site
 * reads were 15.6% of all prompt tokens, and the agent used one row or one topic of them. The biggest:
 * - `content.read {view:"pages"}` on a Joomla site in three languages, 23,455 characters, still cut ("25 more
 *   pages not shown"): every row carries its url, its translation group, an id per other language and every
 *   module the page shows. The agent took one page's id from it.
 * - one Joomla page read (`content.read {id}`), 24–28k: the same `next` on every field (24% of it), a
 *   constraints object of two nulls and a false on every field (17%), sixteen blocks with no field (15%).
 * - `content.read {describe:true}`: 23,776 on WordPress, 19,488 on EmDash, of which `blockKinds` was 54% and
 *   84%. The agent acted on `where` (the SEO title road, the menu post, the identity slot), never on
 *   `blockKinds`, whose fields and limits a page read shows anyway.
 * - `extension.list` on Joomla, 49,932 characters (spilled): 366 rows, 109 of them exact duplicates, read for
 *   one component's name.
 *
 * WHAT CHANGES. Only the copy the model reads, after the host has used the answer (memory, revisions, the
 * site's host name): the relay's answer, the replace job's reads (`bodiesWhole`) and `full:true` are as they
 * were. Every cut says what it left out and the one call that shows it:
 * - a page list keeps the site's working language (its `defaultLocale`, else the language it was measured to
 *   serve) and the pages of every language, one row each: title, path, id and the page's own CMS record;
 *   the other languages are counted, and `{view:"pages", locale}` lists one of them.
 * - a describe document leaves `blockKinds` out unless asked (`blockKinds:true`).
 * - a content read states the per-field `next` once (`fieldNext`), keeps only the constraints that limit a
 *   write, leaves out the blocks that hold no field (site chrome — its words live in the shared content its
 *   `sharedContentId` names), and shows a `bodyHtml` over 4,000 characters as its headings.
 * - a list of extensions, plugins or themes shows 20 rows, without exact duplicates, with `search`, `type`,
 *   `offset` and `limit` read by this host (the component reads no parameter: `Engine.php` extensionList).
 *
 * Pure: no I/O.
 */

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v.trim() : '')

/** @param {unknown} v */
const size = (v) => JSON.stringify(v).length

const CONTENT_ENVELOPE = 'tracy-content/v1'
const CONTENT_DESCRIBE = 'tracy-content-describe/v1'
const CONTENT_PAGES = 'tracy-content-pages/v1'

/** The page list's budget: the same as a `content.read` listing's (`site-call.mjs` CONTENT_READ_LIST_CHARS). */
export const PAGES_LIST_CHARS = 24_000

/** A `bodyHtml` longer than this is shown as its headings. */
export const BODY_HTML_SHOWN_MAX = 4_000

/** How many headings a body's outline shows, and how long each may be. */
const HEADINGS_MAX = 30
const HEADING_CHARS = 80

/** The rows a list of extensions, plugins or themes shows when the call names no `limit`, and the most it may name. */
export const LIST_ROWS = 20
export const LIST_ROWS_MAX = 200

/** The actions whose whole list the component answers, so this host pages it. */
export const LISTED_ACTIONS = Object.freeze(['extension.list', 'plugin.list', 'theme.list'])

/**
 * Tracy's own parameters of a read: taken off the call before it is normalised and sent, never relayed.
 * `full:true` is the answer as the site gave it; the rest narrow what this host shows.
 */
export const VIEW_PARAMS = Object.freeze({
  'content.read': Object.freeze(['full', 'blockKinds']),
  'content.get': Object.freeze(['full']),
  'extension.list': Object.freeze(['full', 'search', 'type', 'offset', 'limit']),
  'plugin.list': Object.freeze(['full', 'search', 'type', 'offset', 'limit']),
  'theme.list': Object.freeze(['full', 'search', 'type', 'offset', 'limit'])
})

/**
 * @typedef {{ full: boolean, blockKinds: boolean, search: string, type: string, offset: number, limit: number, pageRows?: boolean, pageSearches?: string[] }} ReadView
 */

/**
 * The call without Tracy's view parameters, and what they asked. An action with none is returned as it came
 * (`view: null`).
 * @param {string} action
 * @param {unknown} params
 * @returns {{ params: Record<string, unknown>, view: ReadView | null }}
 */
export function takeViewParams(action, params) {
  const p = isRecord(params) ? params : {}
  const pageRows =
    action === 'content.read' && p.view === 'pages' && p.url === undefined && p.changedSince === undefined
  const base = /** @type {Record<string, readonly string[]>} */ (VIEW_PARAMS)[action]
  // Listing envelopes already own cursor/limit. Only the page-address view is filtered here.
  const own = pageRows ? [...base, 'search', 'offset', 'limit'] : base
  if (own === undefined) return { params: p, view: null }
  /** @type {Record<string, unknown>} */
  const rest = {}
  /** @type {Record<string, unknown>} */
  const taken = {}
  for (const [k, v] of Object.entries(p)) {
    if (own.includes(k)) taken[k] = v
    else rest[k] = v
  }
  const whole = (/** @type {unknown} */ v, /** @type {number} */ fallback, /** @type {number} */ min) => {
    const n = Number(v)
    return v !== undefined && v !== null && Number.isInteger(n) && n >= min ? n : fallback
  }
  return {
    params: rest,
    view: {
      full: taken.full === true || taken.full === 'true',
      blockKinds: taken.blockKinds === true || taken.blockKinds === 'true',
      search: str(taken.search).slice(0, 80),
      ...(pageRows && Array.isArray(taken.search) ? { pageSearches: taken.search.map(str) } : {}),
      type: str(taken.type).slice(0, 40),
      offset: whole(taken.offset, 0, 0),
      limit: Math.min(whole(taken.limit, LIST_ROWS, 1), LIST_ROWS_MAX),
      pageRows: pageRows && ['search', 'offset', 'limit'].some((key) => p[key] !== undefined)
    }
  }
}

// ── the page list ────────────────────────────────────────────────────────────────────────────────

/**
 * The site's working language as one of the page list's own `site.locales`: the list's `defaultLocale`, else
 * the language the site was measured to serve (`collect-site-facts.mjs` `siteLanguage`), else ''.
 * @param {unknown} answer
 * @param {unknown} measured - the site's language from its facts, or nothing.
 */
export function workingLocale(answer, measured) {
  const site = isRecord(answer) && isRecord(answer.site) ? answer.site : {}
  const locales = Array.isArray(site.locales) ? site.locales.filter((x) => typeof x === 'string') : []
  const listed = (/** @type {unknown} */ code) =>
    typeof code === 'string' && code !== ''
      ? (locales.find((one) => one.toLowerCase() === code.toLowerCase()) ?? '')
      : ''
  return listed(site.defaultLocale) || listed(measured)
}

/**
 * Whether a `content.read` answer is a page list this module shows compact: the relay's walk of every page,
 * not one page found by its address, nor what changed since a version.
 * @param {unknown} answer
 * @param {unknown} params - the call as sent.
 */
export function isPageList(answer, params) {
  const p = isRecord(params) ? params : {}
  return (
    isRecord(answer) &&
    answer.schemaVersion === CONTENT_PAGES &&
    Array.isArray(answer.pages) &&
    typeof answer.link !== 'string' &&
    p.url === undefined &&
    p.changedSince === undefined
  )
}

/**
 * A page's own CMS record, `kind:id`: the first `native` entry (a WordPress post, a Joomla menu item or
 * article). The modules a Joomla page shows come after it, and a read of the page lists them.
 * @param {unknown} native
 */
const recordOf = (native) => {
  const first = Array.isArray(native) ? native.find(isRecord) : undefined
  if (first === undefined || typeof first.kind !== 'string') return null
  const id = first.id ?? first.key
  return typeof id === 'string' || typeof id === 'number' ? `${first.kind}:${id}` : first.kind
}

/**
 * The page list as rows — `columns` names them, a page is `[title, path, id, record, …]` — in the site's
 * working language when it has several and the call named none, cut to {@link PAGES_LIST_CHARS} only if the
 * rows still do not fit. Anything that is not a page list is returned as it came.
 * @param {unknown} answer
 * @param {unknown} params - the call as sent.
 * @param {{ home?: string, view?: ReadView | null }} [opts] - the working language and host query.
 * @returns {unknown}
 */
export function compactPageList(answer, params, { home = '', view = null } = {}) {
  if (!isPageList(answer, params)) return answer
  const a = /** @type {Record<string, any>} */ (answer)
  const p = isRecord(params) ? params : {}
  const list = /** @type {unknown[]} */ (a.pages)
  const site = isRecord(a.site) ? a.site : {}
  const several = Array.isArray(site.locales) && site.locales.length > 1
  const localeOf = (/** @type {unknown} */ page) =>
    isRecord(page) && typeof page.locale === 'string' ? page.locale : null
  const everyLanguage = (/** @type {string | null} */ locale) => locale === null || locale === '*'
  const narrow = several && home !== '' && str(p.locale) === ''
  const own = narrow ? list.filter((page) => everyLanguage(localeOf(page)) || localeOf(page) === home) : list
  // A working language none of the pages is in narrows to nothing: the whole list, as rows.
  const shown = own.length > 0 ? own : list
  /** @type {Record<string, number>} */
  const elsewhere = {}
  if (shown !== list)
    for (const page of list) {
      const locale = localeOf(page)
      if (!everyLanguage(locale) && locale !== home)
        elsewhere[/** @type {string} */ (locale)] = (elsewhere[/** @type {string} */ (locale)] ?? 0) + 1
    }
  const words = (view?.search ?? '').toLowerCase()
  const searches = view?.pageSearches?.map((word) => word.toLowerCase()) ?? (words ? [words] : [])
  const matched = shown
    .filter(isRecord)
    .filter(
      (page) =>
        searches.length === 0 ||
        searches.some((term) =>
          [page.title, page.path, page.url, page.id, recordOf(page.native)].some(
            (value) => typeof value === 'string' && value.toLowerCase().includes(term)
          )
        )
    )
  const offset = view?.pageRows ? view.offset : 0
  const pages = view?.pageRows ? matched.slice(offset, offset + view.limit) : matched
  const columns = ['title', 'path', 'id', 'record']
  const anyType = pages.some((page) => typeof page.type === 'string' && page.type !== 'page')
  const anyStatus = pages.some((page) => typeof page.status === 'string' && page.status !== 'published')
  const languages = new Set(pages.map(localeOf).filter((l) => !everyLanguage(l)))
  if (anyType) columns.push('type')
  if (anyStatus) columns.push('status')
  if (languages.size > 1) columns.push('locale')
  const rows = pages.map((page) => {
    const row = [
      typeof page.title === 'string' ? page.title : null,
      typeof page.path === 'string' ? page.path : typeof page.url === 'string' ? page.url : null,
      page.id ?? null,
      recordOf(page.native)
    ]
    if (anyType) row.push(page.type ?? null)
    if (anyStatus) row.push(page.status ?? null)
    if (languages.size > 1) row.push(localeOf(page))
    return row
  })
  const leftOut = Object.values(elsewhere).reduce((sum, n) => sum + n, 0)
  const { pages: _pages, truncatedCount: _count, next: _next, ...rest } = a
  /** @param {number} count */
  const build = (count) => {
    const cut = matched.length - offset - count
    const more = Math.max(0, cut)
    const continuation = {
      view: 'pages',
      ...(typeof p.locale === 'string' ? { locale: p.locale } : {}),
      ...(view?.pageSearches ? { search: view.pageSearches } : words ? { search: view?.search } : {}),
      offset: offset + count,
      limit: view?.pageRows ? view.limit : Math.min(count, LIST_ROWS_MAX)
    }
    const parts = [
      leftOut > 0
        ? `Pages of ${home} and of every language; ${leftOut} more in ${Object.keys(elsewhere).length} other language${Object.keys(elsewhere).length === 1 ? '' : 's'} (otherLanguages): the same call with locale lists one.`
        : '',
      more > 0
        ? `${more} more pages not shown: next.params gives the next rows; search finds a title or path; url reads one known link.`
        : '',
      'A page by its link: {view:"pages", url}. Every language and field as the site gave them: full:true.'
    ].filter((x) => x !== '')
    return {
      ...rest,
      columns,
      pages: rows.slice(0, count),
      ...(leftOut > 0 ? { otherLanguages: elsewhere } : {}),
      ...(more > 0 ? { truncated: true, truncatedCount: more } : {}),
      ...(view?.pageRows || more > 0
        ? {
            pagination: {
              offset,
              returned: count,
              total: matched.length,
              totalIsComplete: a.truncated !== true,
              nextOffset: more > 0 ? offset + count : null
            }
          }
        : {}),
      ...(a.truncated === true && a.next !== undefined ? { sourceNext: a.next } : {}),
      ...(a.truncated === true && a.truncatedCount !== undefined
        ? { sourceTruncatedCount: a.truncatedCount }
        : {}),
      // A whole list in one language says nothing more: every page is a row.
      ...(leftOut > 0 || more > 0
        ? {
            next: {
              action: 'content.read',
              params: more > 0 ? continuation : { view: 'pages', locale: '<a locale of otherLanguages>' },
              why: parts.join(' ')
            }
          }
        : {})
    }
  }
  if (size(build(rows.length)) <= PAGES_LIST_CHARS) return build(rows.length)
  // The largest head that fits; at least one row.
  let lo = 1
  let hi = rows.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (size(build(mid)) <= PAGES_LIST_CHARS) lo = mid
    else hi = mid - 1
  }
  return build(lo)
}

// ── the describe document ────────────────────────────────────────────────────────────────────────

/**
 * The describe document without `blockKinds`, unless the call asked for them: their fields and limits are
 * what a read of the page shows for each field it holds. A note says how many there are and the call that
 * shows them. Anything that is not a describe document is returned as it came.
 * @param {unknown} doc
 * @param {ReadView | null} view
 * @returns {unknown}
 */
export function narrowDescribe(doc, view) {
  if (!isRecord(doc) || doc.schemaVersion !== CONTENT_DESCRIBE) return doc
  if (view?.full === true || view?.blockKinds === true) return doc
  if (!Array.isArray(doc.blockKinds) || doc.blockKinds.length === 0) return doc
  const { blockKinds, ...rest } = doc
  return {
    ...rest,
    blockKindsOmitted: `${blockKinds.length} block kind${blockKinds.length === 1 ? '' : 's'} with their fields and limits: content.read {describe:true, blockKinds:true}. A page's own read shows each of its fields with its key, limit and next.`
  }
}

// ── one content, or a listing of them ────────────────────────────────────────────────────────────

const SLOT = '<slotKey>'

/**
 * `value` with every string equal to `slotKey` (a key or a value, at any depth) written as {@link SLOT}.
 * @param {unknown} value @param {string} slotKey
 * @returns {unknown}
 */
function withSlotHole(value, slotKey) {
  if (typeof value === 'string') return value === slotKey ? SLOT : value
  if (Array.isArray(value)) return value.map((v) => withSlotHole(v, slotKey))
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k === slotKey ? SLOT : k, withSlotHole(v, slotKey)])
  )
}

/**
 * A field's constraints with only what limits a write: a null is "not determined, implies nothing" and
 * `requiresEvidence: false` asks nothing. Null when nothing is left.
 * @param {Record<string, unknown>} constraints
 * @returns {Record<string, unknown> | null}
 */
function limitsOf(constraints) {
  const kept = Object.fromEntries(
    Object.entries(constraints).filter(([k, v]) => v !== null && !(k === 'requiresEvidence' && v === false))
  )
  return Object.keys(kept).length > 0 ? kept : null
}

/**
 * Every field record of a content: its own, its blocks', and its blocks' items'.
 * @param {Record<string, any>} content
 * @returns {Record<string, any>[]}
 */
function fieldsOf(content) {
  const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.filter(isRecord) : [])
  return [
    ...list(content.fields),
    ...list(content.blocks).flatMap((b) => [
      ...list(b.fields),
      ...list(b.items).flatMap((i) => list(i.fields))
    ])
  ]
}

/**
 * The headings of an HTML body, `h2 Words`, at most {@link HEADINGS_MAX}.
 * @param {string} html
 */
export function headingsOf(html) {
  /** @type {string[]} */
  const out = []
  for (const m of html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const words = m[2]
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (words === '') continue
    out.push(`h${m[1]} ${words.length > HEADING_CHARS ? `${words.slice(0, HEADING_CHARS - 1)}…` : words}`)
    if (out.length >= HEADINGS_MAX) break
  }
  return out
}

/**
 * A `content.read` answer of contents (one, or a listing) as the model reads it: the `next` most fields
 * share stated once as `fieldNext` (each field's own is it with that field's slotKey in place of
 * `<slotKey>`); constraints with only what limits a write; the blocks that hold no field left out; a
 * `bodyHtml` over {@link BODY_HTML_SHOWN_MAX} shown as its headings. `omitted` says what was left out and
 * that `full:true` shows it. A projection (`fields`) is the model's own choice and is left as it came, as is
 * anything that is not such an answer.
 * @param {unknown} answer
 * @param {unknown} params - the call as sent.
 * @returns {unknown}
 */
export function compactContents(answer, params) {
  if (!isRecord(answer) || answer.schemaVersion !== CONTENT_ENVELOPE || !Array.isArray(answer.contents))
    return answer
  const p = isRecord(params) ? params : {}
  if (p.fields !== undefined) return answer
  const contents = structuredClone(answer.contents)
  // The template most fields share: each field's `next` with its own slotKey as the hole.
  /** @type {Map<string, { template: unknown, count: number }>} */
  const templates = new Map()
  for (const content of contents.filter(isRecord))
    for (const field of fieldsOf(content)) {
      if (!isRecord(field.next) || typeof field.slotKey !== 'string' || field.slotKey === '') continue
      const template = withSlotHole(field.next, field.slotKey)
      const key = JSON.stringify(template)
      if (!key.includes(SLOT)) continue
      const seen = templates.get(key)
      templates.set(key, { template, count: (seen?.count ?? 0) + 1 })
    }
  const shared = [...templates.entries()].sort((x, y) => y[1].count - x[1].count)[0]
  const sharedKey = shared !== undefined && shared[1].count >= 2 ? shared[0] : null
  let nexts = 0
  let limits = 0
  let emptyBlocks = 0
  let bodies = 0
  /** @type {unknown[]} */
  const posts = []
  for (const content of contents.filter(isRecord)) {
    for (const field of fieldsOf(content)) {
      if (
        sharedKey !== null &&
        isRecord(field.next) &&
        typeof field.slotKey === 'string' &&
        JSON.stringify(withSlotHole(field.next, field.slotKey)) === sharedKey
      ) {
        delete field.next
        nexts += 1
      }
      if (isRecord(field.constraints)) {
        const kept = limitsOf(field.constraints)
        if (kept === null) delete field.constraints
        else if (Object.keys(kept).length < Object.keys(field.constraints).length) field.constraints = kept
        else continue
        limits += 1
      }
    }
    if (Array.isArray(content.blocks)) {
      const before = content.blocks.length
      content.blocks = content.blocks.filter(
        (/** @type {unknown} */ b) =>
          !isRecord(b) ||
          (Array.isArray(b.fields) && b.fields.length > 0) ||
          (Array.isArray(b.items) && b.items.length > 0) ||
          !Array.isArray(b.fields)
      )
      emptyBlocks += before - content.blocks.length
    }
    if (typeof content.bodyHtml === 'string' && content.bodyHtml.length > BODY_HTML_SHOWN_MAX) {
      const html = content.bodyHtml
      delete content.bodyHtml
      content.bodyOutline = { chars: html.length, headings: headingsOf(html) }
      bodies += 1
      const post = Array.isArray(content.native)
        ? content.native.find((/** @type {unknown} */ r) => isRecord(r) && r.kind === 'post')
        : undefined
      if (post !== undefined) posts.push(post.id)
    }
  }
  if (nexts === 0 && limits === 0 && emptyBlocks === 0 && bodies === 0) return answer
  const left = [
    emptyBlocks > 0
      ? `${emptyBlocks} block${emptyBlocks === 1 ? '' : 's'} holding no field (site chrome; its words are in the shared contents {type:"shared"} lists)`
      : '',
    bodies > 0
      ? `bodyHtml over ${BODY_HTML_SHOWN_MAX.toLocaleString('en-US')} characters (bodyOutline: its length and headings${
          posts.length > 0
            ? `; the body by blocks: content.get {kind:"post", id:${JSON.stringify(posts[0])}, outline:true}`
            : ''
        })`
      : '',
    limits > 0 ? 'the constraints that limit nothing (null, requiresEvidence:false)' : ''
  ].filter((x) => x !== '')
  return {
    ...answer,
    contents,
    ...(nexts > 0
      ? {
          fieldNext: {
            .../** @type {Record<string, unknown>} */ (
              templates.get(/** @type {string} */ (sharedKey))?.template
            ),
            why: `The next of every field showing none of its own: its slotKey in place of ${SLOT}, your value in place of null; several changes go in one call.`
          }
        }
      : {}),
    ...(left.length > 0
      ? {
          omitted: `Left out: ${left.join('; ')}. The same read with full:true shows the answer as the site gave it.`
        }
      : {})
  }
}

// ── a whole list the component answers: extensions, plugins, themes ──────────────────────────────

/**
 * The list of rows an answer of {@link LISTED_ACTIONS} carries: its one array of records.
 * @param {Record<string, any>} answer
 * @returns {string | null}
 */
function listKeyOf(answer) {
  const keys = Object.keys(answer).filter((k) => Array.isArray(answer[k]) && answer[k].every(isRecord))
  return keys.length === 1 ? keys[0] : null
}

/**
 * A list of extensions, plugins or themes as the model reads it: without exact duplicates (a language pack
 * is one row per client), narrowed by `search` (words in any of a row's text) and `type`, then `limit` rows
 * from `offset` — {@link LIST_ROWS} unless the call named more. `total` counts the rows that match, `byType`
 * how many of each type there are when the call named none. An answer that is not such a list, or a list
 * that is shown whole anyway, is returned as it came.
 * @param {unknown} answer
 * @param {ReadView | null} view
 * @returns {unknown}
 */
export function pageListRows(answer, view) {
  if (!isRecord(answer) || answer.ok !== true || view?.full === true) return answer
  const key = listKeyOf(answer)
  if (key === null) return answer
  const v = view ?? { full: false, blockKinds: false, search: '', type: '', offset: 0, limit: LIST_ROWS }
  /** @type {Record<string, any>[]} */
  const all = answer[key]
  const seen = new Set()
  const unique = all.filter((row) => {
    const k = JSON.stringify(row)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const words = v.search.toLowerCase()
  const textOf = (/** @type {Record<string, any>} */ row) =>
    Object.values(row)
      .filter((x) => typeof x === 'string')
      .join(' ')
      .toLowerCase()
  const matched = unique.filter(
    (row) =>
      (words === '' || textOf(row).includes(words)) &&
      (v.type === '' || str(row.type).toLowerCase() === v.type.toLowerCase())
  )
  const rows = matched.slice(v.offset, v.offset + v.limit)
  const narrowed = words !== '' || v.type !== '' || v.offset > 0
  if (!narrowed && rows.length === all.length) return answer
  /** @type {Record<string, number>} */
  const byType = {}
  if (v.type === '')
    for (const row of matched)
      if (typeof row.type === 'string') byType[row.type] = (byType[row.type] ?? 0) + 1
  const end = v.offset + rows.length
  const more = matched.length - end
  const what = [words !== '' ? `search "${v.search}"` : '', v.type !== '' ? `type "${v.type}"` : '']
    .filter((x) => x !== '')
    .join(' and ')
  const next =
    matched.length === 0
      ? `No row matches ${what}: ${unique.length} rows in all; other words, or none.`
      : [
          `Rows ${v.offset + 1}–${end} of ${matched.length}${what !== '' ? ` matching ${what}` : ''}.`,
          more > 0 ? `offset:${end} gives the next ones; limit (≤${LIST_ROWS_MAX}) sets how many.` : '',
          words === '' ? 'search:"<a word of the name>" finds one.' : '',
          v.type === '' && Object.keys(byType).length > 1 ? 'type keeps one type (byType).' : '',
          'full:true lists every row as the site gave it.'
        ]
          .filter((x) => x !== '')
          .join(' ')
  return {
    ...answer,
    [key]: rows,
    total: matched.length,
    ...(Object.keys(byType).length > 1 ? { byType } : {}),
    next
  }
}

/**
 * A WordPress page listing names native post IDs, not Content API IDs. Keep those IDs intact for
 * record operations and put the map lookup beside the rows so a lookup cannot silently use either
 * namespace as the other. No extra read is performed; the model chooses whether it needs the map.
 * @param {unknown} answer
 * @param {Record<string, unknown>} params
 * @param {unknown} platform
 * @returns {unknown}
 */
export function nativePageIdAdvice(answer, params, platform) {
  if (platform !== 'wordpress' || !isRecord(answer) || answer.ok !== true || !Array.isArray(answer.items))
    return answer
  if (
    params.post_type !== 'page' &&
    !(answer.items.length > 0 && answer.items.every((row) => isRecord(row) && row.type === 'page'))
  )
    return answer
  if (answer.kind !== undefined && answer.kind !== 'post') return answer
  const one = answer.items.length === 1 ? answer.items[0] : null
  const path = isRecord(one) ? str(one.path) : ''
  const search = str(params.search)
  return {
    ...answer,
    idNamespace: 'wordpress:post',
    contentIdLookup: {
      action: 'content.read',
      params: {
        view: 'pages',
        ...(path.startsWith('/') && !path.startsWith('//') ? { url: path } : search ? { search } : {})
      },
      why: 'items[].id is a native post ID for content.get/update. This read returns opaque Content API IDs.'
    }
  }
}

/** A bounded OR query on page-address rows only; other search contracts remain unchanged.
 * @param {string} action
 * @param {unknown} params
 * @returns {string | null}
 */
export function pageSearchProblem(action, params) {
  if (
    action !== 'content.read' ||
    !isRecord(params) ||
    params.view !== 'pages' ||
    !Array.isArray(params.search)
  )
    return null
  if (params.url !== undefined || params.changedSince !== undefined)
    return 'A search array is only for a page list without url or changedSince.'
  if (
    params.search.length < 1 ||
    params.search.length > 8 ||
    params.search.some((word) => typeof word !== 'string' || word.trim() === '' || word.length > 80)
  )
    return 'search must contain 1 to 8 nonempty title or path fragments, at most 80 characters each.'
  return null
}

/** Label the two ID namespaces where the agent reads them, without changing either identifier.
 * @param {unknown} answer
 * @returns {unknown}
 */
export function pageIdAdvice(answer) {
  if (!isRecord(answer) || answer.schemaVersion !== CONTENT_PAGES || !Array.isArray(answer.pages))
    return answer
  return {
    ...answer,
    idNamespace: 'content-api',
    idMeaning:
      'Content ID = id. record or native[].id is only the CMS locator; never return it as the Content ID.'
  }
}
