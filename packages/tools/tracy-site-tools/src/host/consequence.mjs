/**
 * WRITES THE CUSTOMER CONFIRMS FIRST THOUGH THEY ARE NOT DELETES (council 19/10/2026, the P0 of
 * ADR 0034). D34 (`tiers.mjs`) asks before what cannot be taken back: a delete, an install, a rollback.
 * What it did not see — and the Voice rule only asked of the agent, in words — were writes that run at
 * once though the person may not have meant them:
 *
 * - `hides`: an update that takes a record off the site's pages (WordPress draft/pending/private/
 *   trash, Joomla unpublished/archived/trashed — `removal-check.mjs` `HIDING_VALUES`);
 * - `site`: a change every page shows — the site's look at site scope, its theme style, its name and
 *   description, a Joomla template's logo, name and favicon;
 * - `many`: one call writing {@link MANY_PLACES} places or more (the `>5` the replace door already had);
 * - `price`: an amount of money changed (old → new), however small the change;
 * - `shared`: an update of a record other pages show too (20/10/2026, staff on real customer sites: "when
 *   Tracy fixes one place it often breaks another place") — a WordPress template part, template, synced
 *   pattern (`wp_block`) or navigation menu (`wp_navigation`), a Joomla module (on every page it is
 *   assigned to), EmDash's `site` entry. Asked for one page, such a write changes every page; the
 *   customer hears where else before it runs (`sharedBy`).
 *
 * Each answers CONFIRM_FIRST with the door's own question, as a delete does: only the person's yes to
 * that question opens the call, once (`call-memory.mjs` `confirmed`). For every channel, typed or
 * spoken — what a write does to the site does not depend on how it was asked (council 19/10/2026).
 * `facts` are the parts of the question the agent may not reword: it puts the question in the
 * person's language, but a card that leaves out what changes, how many or which amount is refused
 * before it is shown (`confirmCardRefusal`).
 *
 * Kept pure so `test/consequence.test.mjs` holds every rule.
 */

import { HIDING_VALUES } from './removal-check.mjs'
import { setOnlyDoorWrites } from './set-only-doors.mjs'

/** One call writing this many places or more asks first (the replace door's `>5`, now the person's word). */
export const MANY_PLACES = 6

/**
 * Money as a site writes it: an amount with a currency mark before or after it. The marks are escapes
 * in regex literals, the form gate `language` reads as a pattern, so no letter of another language
 * stands in a string of this code: `₫` the dong sign, `đ` the d with a stroke Vietnamese prices end with,
 * `đồng` its word; dollar, euro, pound, yen/yuan and their codes.
 */
const AMOUNT = String.raw`\d{1,3}(?:[.,\s ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`
const BEFORE = /(?:[$€£¥\u20ab]|(?:USD|EUR|GBP|VND|JPY|CNY)\s?)/u.source
const AFTER = /(?:\s?(?:[$€£¥\u20ab]|\u0111\u1ed3ng|\u0111|USD|EUR|GBP|VND|JPY|CNY|元|円)(?![\p{L}]))/u.source
const MONEY = new RegExp(String.raw`(?:${BEFORE}(?:${AMOUNT}))|(?:(?:${AMOUNT})${AFTER})`, 'giu')

/** The amounts of money in a text, as written (spaces folded), in order. @param {unknown} text */
export function amountsIn(text) {
  if (typeof text !== 'string' || text === '') return []
  return [...text.normalize('NFC').matchAll(MONEY)].map((m) => m[0].replace(/[\s ]+/g, ' ').trim())
}

/**
 * The amounts a change takes away and the ones it puts in their place: every amount of `before` the
 * change no longer has, paired in order with an amount it did not have. Empty when no price changed.
 * @param {unknown} before
 * @param {unknown} after
 * @returns {{ from: string, to: string }[]}
 */
export function priceChanges(before, after) {
  const was = amountsIn(before)
  const now = amountsIn(after)
  const gone = [...was]
  const added = []
  for (const amount of now) {
    const i = gone.indexOf(amount)
    if (i >= 0) gone.splice(i, 1)
    else added.push(amount)
  }
  const pairs = []
  for (let i = 0; i < Math.max(gone.length, added.length); i += 1)
    pairs.push({ from: gone[i] ?? '', to: added[i] ?? '' })
  return pairs.filter((p) => p.from !== p.to)
}

/** @param {unknown} v */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
/** @param {unknown} v */
const text = (v) => (typeof v === 'string' ? v.trim() : '')
/**
 * The record an update takes off the site's pages: one of `HIDING_VALUES` set on an existing record —
 * except Joomla's `featured: 0`, which only takes an article off the featured lists while it stays on
 * the site (the receipt still reads it back: `removal-check.mjs`), so it runs at once.
 * @param {string} platform
 * @param {Record<string, unknown>} p
 * @returns {{ kind: string, id: number } | null}
 */
function hiddenBy(platform, p) {
  const hiding = Object.hasOwn(HIDING_VALUES, platform) ? HIDING_VALUES[platform] : null
  const fields = isRecord(p.fields) ? /** @type {Record<string, unknown>} */ (p.fields) : null
  const kind = text(p.kind)
  const id = Number(p.id)
  if (hiding === null || fields === null || kind === '' || !Number.isInteger(id) || id <= 0) return null
  for (const [column, values] of Object.entries(hiding)) {
    if (column === 'featured' || !Object.hasOwn(fields, column)) continue
    const value = fields[column]
    const asNumber = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value
    if (values.includes(/** @type {string | number} */ (asNumber))) return { kind, id }
  }
  return null
}

/**
 * WordPress post types whose record other pages show (`postType` from a read: `call-memory.mjs`), and
 * where. A template part is also its own kind (`kind:"templatePart"`); the rest are posts by id.
 * @type {Readonly<Record<string, string>>}
 */
const WORDPRESS_SHARED_TYPES = Object.freeze({
  wp_template_part:
    'This changes a part every page of your site shows (like the header or footer), not this page alone.',
  wp_template: 'This changes a layout every page built on it shows, not this page alone.',
  wp_block: 'This changes a shared block that shows on every page it is used on, not this page alone.',
  wp_navigation: 'This changes the menu every page of your site shows.'
})

/**
 * The same sentences naming the record by its title (council 20/10/2026: a card names the record it
 * asks about, as a delete's and a hide's do), the title being one of the card's facts.
 * @type {Readonly<Record<string, (title: string) => string>>}
 */
const WORDPRESS_SHARED_NAMED = Object.freeze({
  wp_template_part: (title) =>
    `This changes the "${title}" part every page of your site shows (like the header or footer), not this page alone.`,
  wp_template: (title) =>
    `This changes the "${title}" layout every page built on it shows, not this page alone.`,
  wp_block: (title) =>
    `This changes the shared block "${title}", which shows on every page it is used on, not this page alone.`,
  wp_navigation: (title) => `This changes the "${title}" menu every page of your site shows.`
})

/**
 * The shared record an update writes, as the card's sentence, or null (`shared` above). An update that
 * CREATES (no id; Joomla `id:0`) writes nothing anyone sees yet, so it asks nothing.
 * @param {string} platform
 * @param {Record<string, unknown>} p
 * @param {{ title?: string, postType?: string }} context
 * @returns {{ sentence: string, what: string, facts: string[] } | null}
 */
function sharedBy(platform, p, context) {
  const kind = text(p.kind)
  const id = Number(p.id)
  const title = text(context.title)
  if (platform === 'wordpress') {
    if (kind === 'templatePart') {
      const key = text(p.key)
      if (key === '') return null
      return {
        sentence: `This changes the ${title ? `"${title}"` : `"${key}"`} part every page of your site shows, not this page alone.`,
        what: `templatePart ${key}`,
        facts: title ? [title] : []
      }
    }
    const postType = text(context.postType)
    if (kind === 'post' && Number.isInteger(id) && id > 0 && Object.hasOwn(WORDPRESS_SHARED_TYPES, postType))
      return title
        ? { sentence: WORDPRESS_SHARED_NAMED[postType](title), what: `${postType} ${id}`, facts: [title] }
        : { sentence: WORDPRESS_SHARED_TYPES[postType], what: `${postType} ${id}`, facts: [] }
    return null
  }
  if (platform === 'joomla' && kind === 'module' && Number.isInteger(id) && id > 0)
    return {
      sentence: title
        ? `This changes the "${title}" block, which shows on every page it is assigned to, not this page alone.`
        : 'This changes a block that shows on every page it is assigned to, not this page alone.',
      what: `module ${id}`,
      facts: title ? [title] : []
    }
  return null
}

/** The actions a site-wide write is: their `set` writes every page (a read is a read: `tierOf`). */
const SITE_WIDE = new Set(['theme.style', 'site.identity', 'template.siteSettings'])

/**
 * @typedef {{ reason: 'hides' | 'site' | 'many' | 'price' | 'shared', sentence: string, error: string, facts: string[] }} Consequence
 *   `sentence`: what the person reads on the card (English; the agent puts it in their words);
 *   `error`: what the refusal tells the agent; `facts`: what the card must name as written.
 */

/**
 * What a mutating call does that the person confirms first, or null when it runs at once. Decided on
 * the call as it will be sent (aliases resolved): `context.places` is how many places a replace writes,
 * once counted; `context.find`/`context.replace` its words; `context.title` the record's title when a
 * read named it; `context.postType` the WordPress post type that read showed.
 * @param {string} platform - 'wordpress' | 'joomla' | 'emdash'
 * @param {string} action
 * @param {Record<string, unknown>} params
 * @param {{ places?: number, find?: string, replace?: string, title?: string, postType?: string }} [context]
 * @returns {Consequence | null}
 */
export function consequenceOf(platform, action, params, context = {}) {
  const p = isRecord(params) ? params : {}
  // Money first: a price changed is the person's to see, whatever else the call does.
  if (action === 'content.replace') {
    const prices = priceChanges(context.find, context.replace)
    if (prices.length > 0) {
      const [first] = prices
      const shown = prices.map((x) => `${x.from || '—'} → ${x.to || '—'}`).join(', ')
      return {
        reason: 'price',
        sentence: `This changes a price on your site: ${shown}.`,
        error: `content.replace changes a price (${shown}), and the customer has not been asked.`,
        facts: [first.from, first.to].filter((f) => f !== '')
      }
    }
    const places = typeof context.places === 'number' ? context.places : 0
    if (places >= MANY_PLACES)
      return {
        reason: 'many',
        sentence: `This changes the words in ${places} places on your site at once.`,
        error: `content.replace writes ${places} places at once, and the customer has not been asked.`,
        facts: [String(places)]
      }
    return null
  }
  if (action === 'content.update') {
    const removed = hiddenBy(platform, p)
    if (removed !== null) {
      const title = text(context.title)
      return {
        reason: 'hides',
        sentence: title
          ? `This takes "${title}" off your site's pages.`
          : `This takes ${removed.kind} ${removed.id} off your site's pages.`,
        error: `content.update takes ${removed.kind} ${removed.id} off the site's pages, and the customer has not been asked.`,
        facts: title ? [title] : []
      }
    }
    const shared = sharedBy(platform, p, context)
    if (shared !== null)
      return {
        reason: 'shared',
        sentence: shared.sentence,
        error: `content.update changes ${shared.what}, which other pages show too, and the customer has not been asked.`,
        facts: shared.facts
      }
    return null
  }
  if (action === 'look.set' && text(p.scope) === 'site')
    return {
      reason: 'site',
      sentence: 'This changes how every page of your site looks.',
      error: 'look.set at site scope changes every page, and the customer has not been asked.',
      facts: []
    }
  // theme.style always writes; the two set-only doors write on set alone (`set-only-doors.mjs`).
  if (SITE_WIDE.has(action) && (action === 'theme.style' || setOnlyDoorWrites(p))) {
    const fields = /** @type {Record<string, unknown>} */ (
      isRecord(p.fields) ? p.fields : isRecord(p.values) ? p.values : {}
    )
    const name = text(fields.sitename ?? fields.name ?? fields.title)
    return {
      reason: 'site',
      sentence:
        action === 'theme.style'
          ? 'This changes how every page of your site looks.'
          : name
            ? `This changes your site's name to "${name}" on every page.`
            : "This changes your site's name, description or logo on every page.",
      error: `${action} changes every page of the site, and the customer has not been asked.`,
      facts: name ? [name] : []
    }
  }
  return null
}

/**
 * A look written at scope "element" or "page" that reaches further than the one element the customer
 * named, as `look.set` reads it BEFORE writing (`look-set.mjs` `wide`): an element of the site's header
 * or footer (the same element on every page), or a winning rule that paints more than one element on
 * this page (`paints`, counted in the same browser visit). Null when it reaches that one element only.
 *
 * 🔒 SAID BEFORE THE WRITE, NOT AFTER (20/10/2026). The reach used to come back in the answer of a write
 * already made. Staff on real customer sites: "when Tracy fixes one place it often breaks another
 * place". Asked as every `consequence.mjs` write is: the door's own question, opened once by the yes.
 * @param {{ scope: string, everyPage: boolean, paints: number | null }} reach
 * @returns {Consequence | null}
 */
export function lookReachOf({ scope, everyPage, paints }) {
  if (scope !== 'element' && scope !== 'page') return null
  if (everyPage)
    return {
      reason: 'shared',
      sentence:
        'This changes how that part of your header or footer looks on every page, not this page alone.',
      error: `look.set at ${scope} scope writes an element of the header or footer, which every page shows, and the customer has not been asked.`,
      facts: []
    }
  if (scope === 'page' && typeof paints === 'number' && paints > 1)
    return {
      reason: 'shared',
      sentence: `This changes how ${paints} items on this page look, not only the one you named.`,
      error: `look.set at page scope writes a rule that paints ${paints} elements on this page, and the customer has not been asked.`,
      facts: [String(paints)]
    }
  return null
}

/**
 * EmDash writes the customer confirms first though EmDash does not mark them destructive
 * (`EMDASH_DESTRUCTIVE_TOOLS`, `emdash.mjs`): EmDash keeps no undo for them — only an entry's revisions
 * — and each shows on the public site at once: an entry taken off the site, the menu every page shows,
 * the site's own settings (title, tagline, logo, the head of every page). A `content_update` with
 * `status:"draft"` on a live entry is already refused as `WOULD_UNPUBLISH`, so `content_unpublish` is the
 * one road off the site.
 * @param {string} tool
 * @param {Record<string, unknown>} args
 * @param {{ title?: string }} [context] - the entry's title, read by the door (`emdash-call.mjs`)
 * @returns {Consequence | null}
 */
export function emdashConsequenceOf(tool, args, context = {}) {
  const a = isRecord(args) ? args : {}
  if (tool === 'content_unpublish') {
    const collection = text(a.collection) || 'entries'
    const title = text(context.title)
    const where = text(a.locale) ? ` (${text(a.locale)})` : ''
    return {
      reason: 'hides',
      sentence: title
        ? `This takes "${title}"${where} off your site's pages; it stays as a draft.`
        : `This takes one of your ${collection}${where} off your site's pages; it stays as a draft.`,
      error: `content_unpublish takes ${collection}/${text(a.id) || '?'} off the site, and the customer has not been asked.`,
      facts: title ? [title] : []
    }
  }
  // The `site` entry holds what every page's header and footer print (its name, contacts, links): an update
  // asked for one page changes them all. Creating one (a new language's row) is not this tool.
  if (tool === 'content_update' && text(a.collection) === 'site')
    return {
      reason: 'shared',
      sentence:
        "This changes your site's shared details (like the header and footer) on every page, not this page alone.",
      error: `content_update writes the site entry ${text(a.id) || '?'}, which every page shows, and the customer has not been asked.`,
      facts: []
    }
  if (tool === 'menu_set_items')
    return {
      reason: 'site',
      sentence: 'This changes the menu every page of your site shows.',
      error: 'menu_set_items changes the menu on every page, and the customer has not been asked.',
      facts: []
    }
  if (tool === 'settings_update') {
    const name = text(a.title)
    return {
      reason: 'site',
      sentence: name
        ? `This changes your site's name to "${name}" on every page.`
        : "This changes your site's settings on every page.",
      error: 'settings_update changes every page of the site, and the customer has not been asked.',
      facts: name ? [name] : []
    }
  }
  return null
}
