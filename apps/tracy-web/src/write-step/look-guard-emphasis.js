// The look guard's one opening for the emphasis stage (emphasis-stage.js): a `content.update` of a row the run read first, whose
// every field reads the same as the row held once real emphasis tags are read as content map codes. So the update can change the
// form of an emphasis (`((span))` to `<span>`) and nothing else: no word, no setting, no other tag.
import { tagsToCodes } from '../lib/site-copy/emphasis-markup.js'

/**
 * Emphasis codes in one spelling: `((br /))` and `((br/))`, `(( span ))` and `((span))` are the same code. The emphasis stage
 * writes a code the writer spelled with spaces as its tag, which reads back as the code without them: before (dev lat30,
 * 23/11/2026) JA Diner's reservation article took its emphasis and the guard read the update as a change of its introtext.
 */
const canonicalCodes = (text) =>
  text.replace(/\(\(\s*(\/?)\s*(br|span|p|ul|ol|li)\b([^()]*?)\s*\)\)/gi, (_whole, close, name, raw) => {
    const tag = name.toLowerCase()
    const attrs = String(raw ?? '')
      .replace(/\/\s*$/, '')
      .trim()
    return `((${close}${tag}${attrs ? ` ${attrs}` : ''}${tag === 'br' ? '/' : ''}))`
  })

/** A value with every string's emphasis tags read as codes, JSON in a string read as data. */
function normal(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^[[{]/.test(trimmed))
      try {
        return normal(JSON.parse(trimmed))
      } catch {
        // Not JSON: compared as text.
      }
    return canonicalCodes(tagsToCodes(value))
  }
  if (Array.isArray(value)) return value.map(normal)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).map((k) => [k, normal(value[k])]))
  return value
}

/**
 * @param {{ kind?: string, id?: unknown, fields?: Record<string, unknown> }} params the update
 * @param {{ rows: Map<string, object> }} state what the run read of each row
 * @returns {boolean} whether the update changes only the form of emphasis markup of a row read first
 */
export function emphasisOnlyUpdate(params, state) {
  const { kind, id, fields } = params ?? {}
  const held = state?.rows?.get(`${kind}:${id}`)
  const names = Object.keys(fields ?? {})
  if (!held || !names.length) return false
  let changed = false
  for (const name of names) {
    if (!(name in held)) return false
    if (fields[name] === held[name]) continue
    if (JSON.stringify(normal(fields[name])) !== JSON.stringify(normal(held[name]))) return false
    changed = true
  }
  return changed
}
