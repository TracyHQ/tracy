/**
 * Addresses that carry a demo person's name (spec TracyHQ/tracy#189). A template's demo names its people (a trainer, a
 * dentist, the author of a quote), and the record that shows one of them (a menu item, an article, a contact) often lives at
 * an address made from that name. When a brief build keeps the record and gives it a real person's name, the address must
 * follow: a stranger's name in the address of the owner's own staff page is a demo leftover.
 *
 *   planDemoNameAliases   the new addresses: a live record whose address carries a demo name while its title no longer does
 *                         takes an address made from its title; a menu item opening a record renamed this build follows it.
 *                         Unique among the record's siblings (same kind, parent and language), never only figures.
 *   demoNameAliasesLeft   the final check: every live record still at an address that carries a demo name while its title
 *                         shows someone else.
 *
 * 🔒 CMS-NEUTRAL: records come as `{kind, id, alias, title, published, parent, language, opens}`; the engine of each CMS
 * reads its rows into that shape and writes the steps through its own doors. A record that is not live (hidden because no
 * real person kept it) is left as it is. No template, business or trade is named here.
 */
import { slugOf } from './outside-map.mjs'

/** The roles whose samples are the names of the demo's people. */
export const DEMO_NAME_ROLES = Object.freeze(new Set(['person.name', 'quote.author_name']))
/** A sample longer than this many words is a heading about a person, not a name. */
const MAX_NAME_WORDS = 4

const words = (/** @type {unknown} */ value) =>
  String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const live = (/** @type {any} */ record) => record?.published === true || Number(record?.published) === 1

/**
 * The slugs of the demo names a content map declares: each person-name or quote-author sample of one to four words.
 * @param {{slots?: any[]} | null | undefined} contentMap
 * @returns {string[]}
 */
export function demoNameSlugs(contentMap) {
  const out = new Set()
  for (const slot of contentMap?.slots ?? []) {
    if (!DEMO_NAME_ROLES.has(slot?.role) || typeof slot.sample !== 'string') continue
    const text = words(slot.sample)
    if (text === '' || text.split(' ').length > MAX_NAME_WORDS) continue
    const slug = slugOf(text)
    if (slug.length >= 4) out.add(slug)
  }
  return [...out]
}

/**
 * The demo name an address carries, or null: a name of two words or more as a whole run of the address's words
 * (`dr-ellis-hartwell` carries `ellis-hartwell`), a one-word name only as the whole address.
 * @param {unknown} alias
 * @param {string[]} slugs
 */
export function carriesDemoName(alias, slugs) {
  const own = String(alias ?? '').toLowerCase()
  if (own === '') return null
  for (const slug of slugs) {
    if (slug.includes('-') ? `-${own}-`.includes(`-${slug}-`) : own === slug) return slug
  }
  return null
}

/** The content map's record for a row: its demo address and its demo title, or null. */
function demoOf(/** @type {any} */ contentMap, /** @type {any} */ record) {
  const entity = (contentMap?.entities ?? []).find(
    (e) =>
      e?.kind === record.kind && Number(e.sourceId ?? String(e.key).split('-').at(-1)) === Number(record.id)
  )
  if (!entity) return null
  const alias =
    typeof entity.identity?.alias === 'string'
      ? entity.identity.alias
      : typeof entity.identity?.path === 'string'
        ? entity.identity.path.split('/').at(-1)
        : null
  const title = (contentMap?.slots ?? []).find(
    (s) => s.entity === entity.key && (s.column === 'title' || s.column === 'name')
  )?.sample
  return { alias, title: typeof title === 'string' ? title : null }
}

/**
 * Whether a live record sits at an address carrying a demo name its title no longer shows: the name it carries, or null.
 * @param {any} record
 * @param {string[]} slugs
 * @param {any} contentMap
 */
function strandedName(record, slugs, contentMap) {
  if (!live(record)) return null
  const alias = String(record.alias ?? '')
  const name = carriesDemoName(alias, slugs)
  if (!name) return null
  const demo = demoOf(contentMap, record)
  // Still the demo's words on the record: the address is honest about what the page shows.
  if (demo?.title && words(record.title) === words(demo.title)) return null
  if (carriesDemoName(slugOf(String(record.title ?? '')), [name])) return null
  return name
}

const siblingKey = (/** @type {any} */ r) => `${r.kind}\u0000${r.parent ?? ''}\u0000${r.language ?? '*'}`

/**
 * The new addresses for records still named after a demo person.
 * @param {{contentMap?: any, records?: any[], moved?: Array<{kind: string, id: number|string, alias: string, from: string}>}} input
 *   `moved`: records another rule of the same build already gave a new address (they are not planned again; menu items
 *   opening them follow)
 * @returns {Array<{kind: string, id: number, alias: string, from: string, reason: string}>}
 */
export function planDemoNameAliases({ contentMap = null, records = [], moved = [] }) {
  const slugs = demoNameSlugs(contentMap)
  const done = new Set(moved.map((m) => `${m.kind}:${Number(m.id)}`))
  /** @type {Map<string, Set<string>>} */
  const taken = new Map()
  for (const r of records) {
    const key = siblingKey(r)
    if (!taken.has(key)) taken.set(key, new Set())
    taken.get(key)?.add(String(r.alias ?? ''))
  }
  const unique = (/** @type {any} */ r, /** @type {string} */ base) => {
    const used = /** @type {Set<string>} */ (taken.get(siblingKey(r)))
    let next = base
    for (let n = 2; used.has(next); n += 1) next = `${base}-${n}`
    used.delete(String(r.alias ?? ''))
    used.add(next)
    return next
  }
  /** @type {Array<{kind: string, id: number, alias: string, from: string, reason: string}>} */
  const out = []
  // A record of the content is planned before the menu items that open it, so they can follow.
  const ordered = [...records].sort((a, b) => Number(a.kind === 'menuItem') - Number(b.kind === 'menuItem'))
  for (const r of ordered) {
    if (done.has(`${r.kind}:${Number(r.id)}`) || !live(r)) continue
    const from = String(r.alias ?? '')
    const target = r.opens
      ? [...moved, ...out].find((m) => m.kind === r.opens.kind && Number(m.id) === Number(r.opens.id))
      : null
    if (target && target.from === from) {
      out.push({
        kind: r.kind,
        id: Number(r.id),
        alias: unique(r, target.alias),
        from,
        reason: 'follows-record'
      })
      continue
    }
    if (!strandedName(r, slugs, contentMap)) continue
    const base = slugOf(String(r.title ?? ''))
    if (!base || base === from || /^[0-9-]+$/.test(base)) continue
    out.push({ kind: r.kind, id: Number(r.id), alias: unique(r, base), from, reason: 'demo-name-replaced' })
  }
  return out
}

/**
 * The final check: live records still at an address that carries a demo name their title does not show.
 * @param {{contentMap?: any, records?: any[]}} input
 * @returns {Array<{kind: string, id: number, alias: string, name: string}>}
 */
export function demoNameAliasesLeft({ contentMap = null, records = [] }) {
  const slugs = demoNameSlugs(contentMap)
  const out = []
  for (const r of records) {
    const name = strandedName(r, slugs, contentMap)
    if (name) out.push({ kind: r.kind, id: Number(r.id), alias: String(r.alias ?? ''), name })
  }
  return out
}
