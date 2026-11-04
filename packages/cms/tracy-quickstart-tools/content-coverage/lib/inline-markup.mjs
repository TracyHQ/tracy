// Inline markup of the content map's text samples against the demo database (a Joomla quickstart's dump). A whole-unit
// slot (one heading or field merged from several text pieces, `capture-contract.py --whole-units`) was captured with its
// words only: "More<br><span>Blogs</span>" became "More Blogs", so nothing downstream knew the template draws "Blogs" on
// a second line in the accent colour. This reads each text slot's value from the dump, takes the markup of its element
// (`unit-markup.php`, which loads HTML as the plugin's helper does) and:
//   resamples  a slot whose sample is the same words as that markup, writing the markup as its `sample` in the content
//              map's notation (`More((br/)) ((span))Blogs((/span))`), as `capture-contract.py --inline-markup` would;
//   counts     `inlineMarkupLost`: a text slot whose database value marks words inline (a `br`, `span`, `strong`, `em`,
//              `b` or `i` with words, inline-marks.mjs) while its sample marks none. It must be 0.
// Nothing else of a slot moves: key, role, group, limit and fit stay as they are.
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { inlineOf } from '../../template-kit/lib/inline-marks.mjs'
import { normText } from './normalize.mjs'

export const UNIT_MARKUP = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../tracy-joomla-quickstart/scripts/unit-markup.php'
)

/** The tags whose loss changes what a visitor sees of a title: a line break, an accent span, a bold or italic word. */
const KEPT_TAGS = new Set(['br', 'span', 'strong', 'em', 'b', 'i'])
/** The slots `inlineMarkup.lostSlots` names; the count says how many there are. */
const NAMED = 20

/** The Joomla table each content map entity kind is a row of. */
const TABLE_OF = {
  module: 'modules',
  article: 'content',
  menuItem: 'menu',
  category: 'categories',
  templateStyle: 'template_styles',
  contact: 'contact_details',
  tag: 'tags',
  field: 'fields'
}

/** The rows of a Joomla table, whatever the dump's prefix (`#__`, `jos_`): the prefix of the shortest `<prefix>content`. */
function tableOf(tables, name) {
  const prefix = [...tables.keys()]
    .filter((k) => k.endsWith('content'))
    .map((k) => k.slice(0, -'content'.length))
    .sort((a, b) => a.length - b.length)[0]
  return prefix === undefined ? null : (tables.get(prefix + name) ?? null)
}

const parse = (v) => {
  try {
    return typeof v === 'string' ? JSON.parse(v) : null
  } catch {
    return null
  }
}

/** The stored value a content map slot was captured from, or null when the dump does not hold it as a string. */
export function storedValueOf(slot, entity, tables) {
  const table = TABLE_OF[entity?.kind]
  const rows = table ? tableOf(tables, table) : null
  const row = rows?.find((r) => String(r.id) === String(entity.sourceId))
  if (!row) return null
  let value = row[slot.column]
  if (slot.nestedJson) value = parse(parse(value)?.[slot.nestedJson])
  else if (Array.isArray(slot.jsonPath)) value = parse(value)
  if (Array.isArray(slot.jsonPath)) for (const k of slot.jsonPath) value = value?.[k]
  return typeof value === 'string' ? value : null
}

/** Whether a slot's xpath names an element (a whole unit), not a text node or an attribute. */
const isElementXpath = (x) => typeof x === 'string' && !x.includes('/@') && !/\/text\(\)(\[\d+\])?$/.test(x)

const kept = (sample) => inlineOf(sample).filter((m) => KEPT_TAGS.has(m.tag))

/** The markup of each `{html, xpath}`, by `unit-markup.php` (one php run for all). */
export function unitMarkupOf(entries, { php = 'php' } = {}) {
  if (!entries.length) return []
  return JSON.parse(execFileSync(php, [UNIT_MARKUP], { input: JSON.stringify(entries), maxBuffer: 1 << 28 }))
}

/**
 * Measure (and, with `write`, resample) the text samples of `map` against the dump's `tables`. `map` is changed in place
 * only with `write`.
 * @param {{ map: any, tables: Map<string, object[]>, write?: boolean, markupOf?: typeof unitMarkupOf }} o
 *   `lostBefore`: the slots losing markup in the map as it was given; `lost`: as it is now (after a write)
 * @returns {{ checked: number, resampled: string[], mismatched: string[], lostBefore: string[], lost: string[], unread: number }}
 */
export function inlineMarkupOf({ map, tables, write = false, markupOf = unitMarkupOf }) {
  const entities = new Map((map.entities ?? []).map((e) => [e.key, e]))
  const units = []
  const plainSlots = []
  let unread = 0
  for (const slot of map.slots ?? []) {
    if (slot.type !== 'text') continue
    if (typeof slot.xpath === 'string' && !isElementXpath(slot.xpath)) continue
    const value = storedValueOf(slot, entities.get(slot.entity), tables)
    if (value == null) {
      unread++
      continue
    }
    if (isElementXpath(slot.xpath)) units.push({ slot, value })
    else plainSlots.push({ slot, markup: value })
  }
  const markups = markupOf(units.map((u) => ({ html: u.value, xpath: u.slot.xpath })))
  const measured = [...plainSlots, ...units.map((u, i) => ({ slot: u.slot, markup: markups[i] }))]
  const resampled = []
  const mismatched = []
  const lostBefore = []
  const lost = []
  for (const { slot, markup } of measured) {
    if (typeof markup !== 'string') continue
    const losing = (sample) => kept(markup).length > 0 && kept(sample).length === 0
    if (losing(slot.sample)) lostBefore.push(slot.key)
    if (isElementXpath(slot.xpath) && markup !== slot.sample) {
      // The markup must read as the words the slot holds; anything else is a different value, never written.
      if (normText(markup) !== normText(slot.sample)) mismatched.push(slot.key)
      else {
        resampled.push(slot.key)
        if (write) slot.sample = markup
      }
    }
    if (losing(slot.sample)) lost.push(slot.key)
  }
  return { checked: measured.length, resampled, mismatched, lostBefore, lost, unread }
}

/** The block `content-coverage.json` carries (read by the template kit's `inlineMarkupLost`). */
export function inlineMarkupBlock(r, { dump, measuredAt = new Date().toISOString() }) {
  return {
    measuredAt,
    dump,
    checked: r.checked,
    unread: r.unread,
    lost: r.lost.length,
    lostSlots: r.lost.slice(0, NAMED),
    mismatched: r.mismatched.length,
    mismatchedSlots: r.mismatched.slice(0, NAMED)
  }
}
