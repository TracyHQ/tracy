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
 * Flat t4section action links also require an explicit disabled setting, matching layout receivers
 * and the chrome source's guarded assignment; unknown settings or source still count as rendered.
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
 * Flat section-action links are chrome settings, outside the ACM's nested configuration.
 * @param {{ entity?: string, column?: string, jsonPath?: unknown[] }} slot
 * @param {any} lock
 * @param {Map<string, string> | null} files
 */
function hiddenSectionAction(slot, lock, files) {
  if (slot.column !== 'params' || slot.jsonPath?.length !== 1 || slot.jsonPath[0] !== 'link-btn') return null
  const row = lock?.entities?.[slot.entity ?? '']
  try {
    const params = typeof row?.params === 'string' ? JSON.parse(row.params) : row?.params
    // Only an explicit zero is proven disabled; missing or unfamiliar data remains a candidate.
    if (!['0', 0].includes(params?.['section-link']) || !['0', 't4section'].includes(params?.style))
      return null
    if (typeof row.position !== 'string' || !row.position) return null
    const receivers = Object.values(lock.entities)
      .filter((r) => r.group === 'layout')
      .flatMap((r) => {
        const value = typeof r.value === 'string' ? JSON.parse(r.value) : r.value
        return (value?.layout?.sections ?? []).flatMap((s) => s.contents ?? [])
      })
      .filter((c) => c.type === 'positions' && c.name === row.position)
    if (!receivers.length || receivers.some((c) => c.style !== 't4section')) return null
    const chrome = files?.get('html/layouts/chromes/t4section.php') ?? ''
    // shortcut: recognize only this PHP-only reset/guard shape; extend with source-backed cases.
    if (!/^\s*<\?php\b/.test(chrome) || /\?>|<<<|`/.test(chrome)) return null
    // Mask comments and literal contents before matching executable code, keeping only field names.
    const code = chrome.replace(
      /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|#[^\r\n]*/g,
      (token) => {
        if (!/^['"]/.test(token)) return ' '
        return /^(['"])(section-link|link-btn|title-btn)\1$/.test(token) ? token : "''"
      }
    )
    const action =
      /\$moduleAction\s*=\s*'';\s*if\s*\(\s*\$params->get\(\s*['"]section-link['"]\s*\)\s*\)\s*\{\s*\$moduleAction\s*=\s*([^;]+);\s*\}/.exec(
        code
      )
    const link = /\$params->get\(\s*['"]link-btn['"]\s*\)/g
    if (
      !action ||
      (code.match(link) ?? []).length !== 1 ||
      !link.test(action[1]) ||
      !/\$params->get\(\s*['"]title-btn['"]\s*\)/.test(action[1])
    )
      return null
    const before = code.slice(0, action.index)
    const outside = before + code.slice(action.index + action[0].length)
    // No enclosing branch or other action use/assignment can invalidate the disabled proof.
    if (
      [...before.matchAll(/[{}]/g)].reduce((depth, m) => depth + (m[0] === '{' ? 1 : -1), 0) !== 0 ||
      /\$moduleAction\b/.test(outside)
    )
      return null
    return 'the t4section chrome prints it only if section-link, which is 0'
  } catch {
    return null
  }
}

/**
 * @param {{ entity?: string, column?: string, jsonPath?: unknown[] }} slot a `url` slot of the content map
 * @param {any} lock the parsed `presentation-lock.json`
 * @param {Map<string, string> | null} files the template files (`template-source-tree.js`)
 * @returns {string | null} why the button is not rendered, or null when it is (or cannot be told)
 */
export function unrenderedButton(slot, lock, files) {
  if (slot.jsonPath?.length === 1) return hiddenSectionAction(slot, lock, files)
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
