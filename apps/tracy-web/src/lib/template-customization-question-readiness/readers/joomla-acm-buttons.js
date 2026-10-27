/**
 * Whether the button behind a Joomla ACM link slot is on the page at all (PAGE-5). An ACM layout
 * draws a button only while its data says so: JA Impact and JA Nova `hero` print the second button
 * inside `if ($helper->get('button-2'))`, JA Tour `slideshow` inside
 * `if ($helper->get('data.btn-link-2'))`. A demo that leaves that field empty shows no button, so its
 * empty link leads nowhere because there is nothing to click.
 *
 * A link slot (`jsonPath` `[group, "group[btn-link-2]", index]`) is not rendered when, in the demo
 * data of the presentation lock:
 * - its caption field is empty (`btn-link` → `button`, `btn-link-2` → `button-2`), or
 * - the one field the layout's nearest enclosing `if` tests before the link is printed is empty.
 * The layout is `acm/<group>/tmpl/<jatools-layout-<group>>.php` of the template. Anything this cannot
 * read (no lock row, no layout file, a condition on more than one field) counts as rendered.
 */

const IF_OR_ENDIF = /<\?php\s+(?:(if)\s*\((.*?)\)\s*:|(endif)\s*;?)\s*\?>/gs
const ONE_FIELD = /^\s*\$helper->get\(\s*['"](?:data\.)?([\w-]+)['"]\s*(?:,\s*\$\w+\s*)?\)\s*$/

/** The ACM config of a lock row (`params` → `jatools-config`), or null. */
function acmConfig(/** @type {any} */ row) {
  try {
    const params = typeof row?.params === 'string' ? JSON.parse(row.params) : row?.params
    const config = params?.['jatools-config']
    return typeof config === 'string' ? JSON.parse(config) : (config ?? null)
  } catch {
    return null
  }
}

/** The field the nearest `if` around the first print of `field`'s link tests, or null. */
function guardField(/** @type {string} */ layout, /** @type {string} */ field) {
  const escaped = field.replace(/[-[\]]/g, '\\$&')
  const href = new RegExp(`href=["']<\\?php\\s+echo\\s+\\$helper->get\\(\\s*['"](?:data\\.)?${escaped}['"]`)
  const at = href.exec(layout)?.index
  if (at === undefined) return null
  const marks = [...layout.slice(0, at).matchAll(IF_OR_ENDIF)]
  let depth = 0
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    if (marks[i][3]) depth += 1
    else if (depth > 0) depth -= 1
    else return ONE_FIELD.exec(marks[i][2])?.[1] ?? null
  }
  return null
}

/**
 * @param {{ entity?: string, jsonPath?: unknown[] }} slot a `url` slot of the content map
 * @param {any} lock the parsed `presentation-lock.json`
 * @param {Map<string, string> | null} files the template files (`template-source-tree.js`)
 * @returns {string | null} why the button is not rendered, or null when it is (or cannot be told)
 */
export function unrenderedButton(slot, lock, files) {
  const [group, key, index] = slot.jsonPath ?? []
  const m = typeof key === 'string' ? /^(.*)\[([\w-]+)\]$/.exec(key) : null
  if (typeof group !== 'string' || !m) return null
  const data = acmConfig(lock?.entities?.[slot.entity ?? ''])?.[group]
  if (!data || typeof data !== 'object') return null
  const [, prefix, field] = m
  const valueOf = (/** @type {string} */ name) => {
    const v = data[`${prefix}[${name}]`]
    return Array.isArray(v) ? v[typeof index === 'number' ? index : 0] : v
  }
  const empty = (/** @type {string} */ name) => {
    const v = valueOf(name)
    return v === undefined ? null : String(v ?? '').trim() === ''
  }
  const caption = field.includes('btn-link') ? field.replace('btn-link', 'button') : null
  if (caption && empty(caption)) return `its caption ${caption} is empty`
  const layoutName = data[`jatools-layout-${group}`]
  const layout =
    typeof layoutName === 'string' ? files?.get(`acm/${group}/tmpl/${layoutName}.php`) : undefined
  const guard = layout ? guardField(layout, field) : null
  if (guard && empty(guard)) return `the layout prints it only if ${guard}, which is empty`
  return null
}
