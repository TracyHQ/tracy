/**
 * A CREATE'S RECEIPT SAYS WHAT THE SITE NOW HOLDS.
 *
 * 🔒 WHY (round 7, 29–30/09/2026). A WordPress or Joomla create answered `{ok, id, created}` (WordPress
 * added `verified:{chars…}`, which counts the body and says nothing of the rest), so the agent could not
 * tell from the receipt whether the post was PUBLISHED, DATED as asked, filed in the category it chose,
 * or reachable at the slug it typed. It read the answer as unfinished and spent 1–5 steps after the last
 * write on `page.text`, `content.get` and `wp post get` — seven of the eight add-a-post runs on WordPress
 * and Joomla (16 wasted calls), one of which quoted "do not read a record back after a write" and overrode it:
 * "the date and publication visibility are exactly the exception". It was right that a receipt without
 * them proves nothing: WordPress turns `publish` into `future` for a date still to come, and a create
 * that names no status is stored as a draft.
 *
 * The door reads the record back once after a create (a read: no step, no cache change) and the receipt
 * carries the columns that answer "is it live, where, and when", as the site stores them — the row's own
 * names, so they compare one to one with the fields that were sent. Only what the row holds: a column it
 * lacks is left out, never filled in. That is also why there is no address beyond the slug/alias (the
 * component does not compute a permalink) and no language on WordPress (Polylang keeps it as a term, not
 * in the row).
 *
 * 🔒 F2 (round 7 follow-up, 30/09/2026): THE RECEIPT ALSO SAYS `live`. `stored` gives the columns, and the agent
 * still had to work out from them whether a visitor can open the record: 4 of 16 add-a-post runs read the
 * page back after it. The EmDash receipt already answers with `live` (`emdash.mjs` `receiptOf`) and none of
 * its 8 runs read back. {@link liveOf} gives the same verdict from the row the door already holds — status
 * and dates, judged by the host's clock — and the reason when it is not live.
 *
 * 🔒 F2 REVIEW (30/09/2026): A VERDICT ONLY WHERE THE ROW CAN DECIDE IT. The first cut said `live:true` for every
 * Joomla kind whose row read `published: 1`, and a new MODULE does: the component's create writes the module
 * and never a page assignment (`moduleAssignment` is a write of its own), so it is shown nowhere — while the
 * next sentence told the agent there was nothing to check. A receipt is read as fact; a false `live:true` is
 * worse than none. So {@link liveOf} speaks only for a record with an address of its own (a Joomla article,
 * category, tag, contact or newsfeed; a WordPress post or page), and not for a row that holds an access level
 * other than Public or a password: what those rows say is `stored`, and no verdict.
 *
 * Pure: no I/O. `site-call.mjs` does the read.
 */

/**
 * The receipt's `next` when it carries {@link storedOf}: the same sentence as `WRITE_RECEIPT_NEXT`,
 * saying that `stored` is what the site holds, so the agent has no reason to read anything back.
 */
export const STORED_NEXT =
  'This is the receipt: stored is what the site holds now, so nothing to read back. When every change asked is made, tell the customer what changed, in plain words. Keep the apply_id to yourself: apply.revert with it if they ask to undo.'

/** A string longer than this is cut, with `…`: a title, never a body. */
export const STORED_VALUE_MAX = 80
/** A list longer than this is left out: the receipt is a summary, and a long list is not one. */
const STORED_LIST_MAX = 8

/**
 * The columns of the row that say where a record is and whether it is live, in the order a person
 * reads them: what it is called, its address, its status, where it is filed, its language, its dates.
 * WordPress: a post, a page or any post type. Joomla: the article, and the tree kinds (category, menu
 * item), module, tag, contact… each keeps the columns it has and the rest are simply absent.
 * @type {Readonly<Record<'wordpress' | 'joomla', readonly string[]>>}
 */
const STORED_KEYS = Object.freeze({
  wordpress: Object.freeze([
    'post_title',
    'post_name',
    'post_status',
    'post_date',
    'post_type',
    'post_parent',
    'post_category'
  ]),
  joomla: Object.freeze([
    'title',
    'name',
    'alias',
    'path',
    'state',
    'published',
    'catid',
    'parent_id',
    'menutype',
    'position',
    'language',
    'access',
    'publish_up',
    'publish_down'
  ])
})

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRow = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** @param {string} text */
const atMost = (text) => (text.length > STORED_VALUE_MAX ? `${text.slice(0, STORED_VALUE_MAX - 1)}…` : text)

/**
 * One stored value as the receipt shows it, or `undefined` for one that says nothing: an empty string,
 * `null` (an unset `publish_down`), an empty or long list, an object.
 * @param {unknown} v
 * @returns {string | number | boolean | (string | number)[] | undefined}
 */
function storedValue(v) {
  if (typeof v === 'string') return v.trim() === '' ? undefined : atMost(v.trim())
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'boolean') return v
  if (!Array.isArray(v) || v.length === 0 || v.length > STORED_LIST_MAX) return undefined
  // A list of category ids or tag names; anything else in it and the list is not a summary.
  if (!v.every((x) => typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x))))
    return undefined
  return v.map((x) => (typeof x === 'string' ? atMost(x.trim()) : x))
}

/**
 * The columns of a stored row that a create's receipt shows, or null when the row has none of them.
 * @param {'wordpress' | 'joomla'} shape - whose row it is.
 * @param {unknown} item - the row, as `content.get` answered it.
 * @returns {Record<string, string | number | boolean | (string | number)[]> | null}
 */
export function storedOf(shape, item) {
  const keys = STORED_KEYS[shape]
  if (keys === undefined || !isRow(item)) return null
  /** @type {Record<string, string | number | boolean | (string | number)[]>} */
  const out = {}
  for (const key of keys) {
    if (!Object.hasOwn(item, key)) continue
    const value = storedValue(item[key])
    // A top-level page has no parent: `0` says nothing, and would sit in every receipt.
    if (value === undefined || (key === 'post_parent' && value === 0)) continue
    out[key] = value
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * A Joomla word for a state number other than 1 — the codes its articles (`state`) and its tree kinds,
 * modules and the rest (`published`) share.
 * @type {Readonly<Record<string, string>>}
 */
const JOOMLA_STATE_WORD = Object.freeze({ 0: 'unpublished', 2: 'archived', '-2': 'trashed' })

/** Joomla's date columns: `YYYY-MM-DD`, then optionally ` HH:MM` or ` HH:MM:SS` (or `T`). */
const JOOMLA_TIME = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?$/

/**
 * A Joomla date column as epoch milliseconds — the database keeps them in UTC. `null`: the column sets no
 * limit (absent, null, blank, or the zero date older rows hold). `NaN`: it holds something that is not a date.
 * @param {unknown} v
 * @returns {number | null}
 */
function joomlaTime(v) {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return Number.NaN
  const text = v.trim()
  if (text === '' || text.startsWith('0000-00-00')) return null
  const m = JOOMLA_TIME.exec(text)
  return m === null ? Number.NaN : Date.parse(`${m[1]}T${m[2] ?? '00:00'}:${m[3] ?? '00'}Z`)
}

/**
 * A state column as a whole number, or NaN: Joomla answers `1`, and a database driver may answer `"1"`.
 * @param {unknown} v
 */
const stateNumber = (v) =>
  typeof v === 'number' && Number.isInteger(v)
    ? v
    : typeof v === 'string' && /^-?\d+$/.test(v.trim())
      ? Number(v)
      : Number.NaN

/**
 * The Joomla kinds whose record a visitor opens by an address of its own (`index.php?option=…&view=…&id=N`):
 * an article, a category, a tag, a contact, a newsfeed. For those the row's status and dates say whether it can
 * be opened. For every other kind they do not: a MODULE is shown where a menu assignment puts it
 * (`moduleAssignment`, a write of its own that no create makes — so a fresh module is shown nowhere while its
 * row says `published: 1`), a menu item is listed only by a menu module, a redirect does nothing while its
 * plugin is off, and a banner, a field or a language is no page at all.
 */
const JOOMLA_OPENED_BY_ADDRESS = new Set(['article', 'category', 'tag', 'contact', 'newsfeed'])

/**
 * The WordPress post types a visitor opens by an address of their own on every site. Any other type — a menu
 * (`wp_navigation`), a template, a synced pattern, a form, an upload, a plugin's own — is used by what refers to
 * it, or opened only when its plugin says so; the row does not tell which, so it gets no verdict.
 */
const WORDPRESS_OPENED_BY_ADDRESS = new Set(['post', 'page'])

/**
 * Whether a record the site just made is LIVE — a visitor can open it now — and, when it is not, why.
 * `live` is the record's own status, dates and reader, and no more: not its category's or a menu's.
 * WordPress: a post or a page (any other post type: no verdict) that is `publish`ed (WordPress itself turns a
 * date still to come into `future`, and a create that names no status into `draft`) and has no password.
 * Joomla: a kind in {@link JOOMLA_OPENED_BY_ADDRESS} (any other kind, or none named: no verdict) whose `state`
 * (or `published`, which the tree kinds use) is 1, `publish_up` is not after now and `publish_down` not before
 * it, and whose access level is Public (1). What is closed is closed for any reader, so `live:false` and its
 * reason do not depend on the level; but the level is a NUMBER, and only 1 is known to be open to everyone
 * (a Guest, a Registered or a level a site made up may or may not be), so any other level says nothing rather
 * than `live:true`. A row that holds no status, or a date that cannot be read, gets no verdict either: it is
 * never guessed.
 * @param {'wordpress' | 'joomla'} shape - whose row it is.
 * @param {unknown} item - the row, as `content.get` answered it.
 * @param {number} nowMs - the host's clock, epoch milliseconds.
 * @param {string} [kind] - a Joomla row's kind, as sent; WordPress rows name their own type.
 * @returns {{ live: true } | { live: false, why: string } | null}
 */
export function liveOf(shape, item, nowMs, kind = '') {
  if (!isRow(item)) return null
  if (shape === 'wordpress') {
    const type = typeof item.post_type === 'string' ? item.post_type.trim() : ''
    if (!WORDPRESS_OPENED_BY_ADDRESS.has(type)) return null
    const status = typeof item.post_status === 'string' ? item.post_status.trim() : ''
    if (status === '') return null
    if (status === 'publish')
      return typeof item.post_password === 'string' && item.post_password !== '' ? null : { live: true }
    if (status !== 'future') return { live: false, why: status }
    const date = typeof item.post_date === 'string' ? item.post_date.trim() : ''
    return { live: false, why: date === '' ? 'scheduled' : `scheduled for ${date}` }
  }
  if (shape !== 'joomla' || !JOOMLA_OPENED_BY_ADDRESS.has(kind)) return null
  const state = stateNumber(item.state ?? item.published)
  if (Number.isNaN(state)) return null
  if (state !== 1) return { live: false, why: JOOMLA_STATE_WORD[String(state)] ?? `state ${state}` }
  const up = joomlaTime(item.publish_up)
  const down = joomlaTime(item.publish_down)
  if (Number.isNaN(up) || Number.isNaN(down)) return null
  if ((up !== null || down !== null) && !Number.isFinite(nowMs)) return null
  if (up !== null && up > nowMs)
    return { live: false, why: `scheduled for ${String(item.publish_up).trim()}` }
  if (down !== null && down < nowMs) return { live: false, why: `ended ${String(item.publish_down).trim()}` }
  if (item.access !== undefined && stateNumber(item.access) !== 1) return null
  return { live: true }
}

/**
 * What a create's receipt adds: the row's columns ({@link storedOf}) and the verdict ({@link liveOf}) — the
 * verdict beside them, never among them, so `stored` still compares one to one with the fields that were sent.
 * @param {'wordpress' | 'joomla'} shape
 * @param {unknown} item
 * @param {number} nowMs
 * @param {string} [kind] - a Joomla row's kind, as sent (see {@link liveOf}).
 * @returns {{ stored: NonNullable<ReturnType<typeof storedOf>>, live?: boolean, why?: string } | null}
 *   null when the row holds none of the columns.
 */
export function createEcho(shape, item, nowMs, kind = '') {
  const stored = storedOf(shape, item)
  return stored === null ? null : { stored, ...liveOf(shape, item, nowMs, kind) }
}
