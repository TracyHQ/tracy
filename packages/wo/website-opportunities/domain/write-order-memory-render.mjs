// What the memory site prints (ticket #597): every stored value the way the measured template prints it (door
// measurements of plugin 0.24.85, "JA ACM markers" and "Escaping of field values"), so a test can scan the pages of a
// whole build for markup the kit does not declare.
//
//   - a JA ACM module's `jatools-config` string has every `((` replaced with `<` and every `))` with `>`, blindly,
//     before it is decoded; each of its values is then printed raw
//   - a record column the kit declares escaped where it prints (`mapping.escapes`, `escaped: true`: `metadesc`, a
//     page title, the `og_*` keys, a menu item title, a contact's name) is printed escaped; a main menu item title is
//     printed escaped once (the mega menu) and twice (the hidden heading of a list page); without a mapping, raw
//   - every other value (a module title, as stored, never a reference; a module setting, an article `attribs` key, a
//     site language string, the site name in the logo and the copyright line) is printed raw, as stored, so a legacy
//     reference such as `&copy 2026` reaches the page as written and shows as the sign
//   - an HTML column (a mod_custom content, an article body, a contact's misc) is printed as the HTML it is
//   - a contract slot is printed from its current value: a piece of an HTML value as the DOM wrote it (escaped), any
//     other slot raw
//
// A raw value is printed in three places at once, a text node, a double quoted and a single quoted attribute of a
// probe element (`<x-v data-a="..." data-b='...'>...</x-v>`), since the template prints the same fields in all three:
// a value that breaks out of any of them shows up as an attribute or a tag the probe did not write. A value that
// holds a tag once printed (the kit's own markup in a JA ACM field) is printed as the HTML it is. Pure.
import { addressRunsCode, URL_ATTRS } from './draft-write-markup.mjs'
import { escapeOf } from './ai-quickstart-escapes.mjs'
import { readTags } from './draft-write-tags.mjs'

const HTML_COLUMNS = new Set(['content', 'introtext', 'fulltext', 'misc', 'description'])
const PROBE = 'x-v'
const escText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (text) => escText(text).replace(/"/g, '&quot;')

/** The converter of `mod_ja_acm` (`ModJAACMHelper::decode`): a blind replace over the whole string. */
export const decodeMarkers = (text) => String(text).replaceAll('((', '<').replaceAll('))', '>')

/** A raw value: in a text node and both attribute forms; a value holding markup (the kit's own) as the HTML it is. */
const probe = (value) =>
  /<[a-zA-Z]/.test(value) ? value : `<${PROBE} data-a="${value}" data-b='${value}'>${value}</${PROBE}>`
const leavesOf = (x, out = []) => {
  if (typeof x === 'string') out.push(x)
  else if (x && typeof x === 'object') for (const v of Object.values(x)) leavesOf(v, out)
  return out
}
const parsed = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** A module as the template prints it; `raw` prints one raw value. */
function moduleOf(row, raw) {
  const out = [raw(String(row.title ?? ''))]
  const params = parsed(row.params ?? '') ?? {}
  if (typeof params['jatools-config'] === 'string') {
    const data = parsed(decodeMarkers(params['jatools-config']))
    // A converted value that is no JSON any more prints nothing the scan could read: reported as broken.
    out.push(data === null ? '<x-broken-config>' : leavesOf(data).map(raw).join(''))
  }
  for (const [key, value] of Object.entries(params))
    if (key !== 'jatools-config') out.push(...leavesOf(value).map(raw))
  if (row.module === 'mod_custom') out.push(raw(String(row.content ?? ''), true))
  return out.join('')
}

/** How a record column prints: `raw`, `escaped` or `twice` (the kit's `escapes`; raw without a mapping). */
function printOf(mapping, kind, column, key, row) {
  if (!mapping?.escapes) return 'raw'
  const place = { kind, column, ...(key ? { key } : {}), ...(row.menutype ? { menutype: row.menutype } : {}) }
  if (escapeOf(mapping, place)?.escaped !== true) return 'raw'
  return kind === 'menuItem' && column === 'title' && place.menutype === mainMenuOf(mapping)
    ? 'twice'
    : 'escaped'
}
const mainMenuOf = (mapping) =>
  Object.values(mapping.placements ?? {}).find((p) => p?.layout && p?.menu?.menutype)?.menu?.menutype ?? null

/** A record as the template prints it: HTML columns as HTML, an escaped place escaped, every other string raw. */
function recordOf(row, raw, kind, mapping) {
  const out = []
  const printed = (value, how) =>
    how === 'raw'
      ? raw(value)
      : raw(how === 'twice' ? `${escAttr(value)} ${escAttr(escAttr(value))}` : escAttr(value), true)
  for (const [column, value] of Object.entries(row)) {
    if (typeof value !== 'string') continue
    if (HTML_COLUMNS.has(column)) out.push(raw(value, true))
    else if (/^\s*[[{]/.test(value)) {
      const json = parsed(value)
      if (!json || typeof json !== 'object') out.push(raw(value))
      else
        for (const [key, inner] of Object.entries(json))
          out.push(...leavesOf(inner).map((v) => printed(v, printOf(mapping, kind, column, key, row))))
    } else out.push(printed(value, printOf(mapping, kind, column, null, row)))
  }
  return out.join('')
}

/** Every printed value of the memory site, each given to `print(value, html)` (`html`: printed as HTML). */
function printedOf(memory, print, mapping = null) {
  const { records, slots, identity } = memory.site
  const out = []
  for (const row of records.module.values()) out.push(moduleOf(row, print))
  for (const kind of ['article', 'category', 'contact', 'menuItem'])
    for (const row of records[kind].values()) out.push(recordOf(row, print, kind, mapping))
  for (const slot of slots.values()) {
    if (slot.removed) continue
    const value = String(slot.current ?? '')
    if (slot.xpath) out.push(print(`<${PROBE} data-a="${escAttr(value)}">${escText(value)}</${PROBE}>`, true))
    else out.push(print(slot.nestedJson ? decodeMarkers(value) : value))
  }
  for (const value of Object.values(identity)) out.push(print(String(value)))
  return out.join('\n')
}

/** Every value a memory site prints: after a build, a value the blank site printed is the kit's own. */
export function valuesOf(memory, { mapping = null } = {}) {
  const values = new Set()
  printedOf(
    memory,
    (value) => {
      values.add(value)
      return ''
    },
    mapping
  )
  return values
}

/**
 * Every page of the memory site in one HTML string.
 * @param {{site: {records: object, slots: Map, identity: object}}} memory a `memoryDoors` site
 * @param {{known?: Set<string>, mapping?: object}} [options] `known`: the blank site's own values (`valuesOf`),
 *   printed as nothing, so a scan reads only what the build wrote; `mapping`: the kit's mapping file, whose `escapes`
 *   say which record columns print escaped
 */
export const renderedOf = (memory, { known = new Set(), mapping = null } = {}) =>
  printedOf(memory, (value, html) => (known.has(value) ? '' : html ? value : probe(value)), mapping)

/**
 * What a rendered page holds that nobody declared: a tag whose name is not `allowed`, a probe element with an
 * attribute it was not written with, an `on*` handler, a code address in an address attribute.
 * @param {string} html `renderedOf`
 * @param {Set<string>} allowed the tag names the kit declares (the blank site's own, the fields' inline parts, the
 *   library's)
 * @returns {Array<{what: string, name: string}>}
 */
export function undeclaredIn(html, allowed) {
  const found = []
  for (const tag of readTags(html).tags) {
    if (tag.form !== 'tag') continue
    if (tag.name !== PROBE && !allowed.has(tag.name)) found.push({ what: 'tag', name: tag.name })
    for (const { name, value } of tag.attrs) {
      if (tag.name === PROBE && !tag.close && name !== 'data-a' && name !== 'data-b')
        found.push({ what: 'attribute', name })
      if (name.startsWith('on')) found.push({ what: 'handler', name })
      if (URL_ATTRS.has(name) && addressRunsCode(value)) found.push({ what: 'code_address', name })
    }
  }
  return found
}

/** The tag names a rendered page holds: the blank site's own, before a build, is what the kit declares. */
export const tagNamesIn = (html) =>
  new Set(
    readTags(html)
      .tags.filter((t) => t.form === 'tag')
      .map((t) => t.name)
  )
