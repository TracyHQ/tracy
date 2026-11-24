// The look guard's opening for the record alt stage (record-alt-stage.js): a `content.update` of a row the run read first whose
// every field reads the same once each picture's alt is taken out, the `alt` of an img in an article's or a module's HTML and
// the `<field>_alt` of an article's `images` column. So the stage can give a picture step 8 placed its alt, and change no word,
// no other attribute, no setting. Before (dev lat32, 23/11/2026) each such write of a template article or module read as a
// change of a closed column: four look guard blocks on JA Diner ("the column introtext of article 28 is not open", "only a
// picture fallback block may change") and three on JA Boxing ("the column images of article 2 is not open").
import { hasMarkup } from './look-guard-markup.js'

const IMG_ALT = /(<img\b[^>]*?)\s+alt\s*=\s*(["'])(.*?)\2/gis
const ALT_KEY = /_alt$/

/** The alts a value holds, and the value without them; JSON in a string is read as data. */
function split(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{'))
      try {
        return split(JSON.parse(trimmed))
      } catch {
        // Not JSON: read as HTML.
      }
    const alts = []
    const rest = value.replace(IMG_ALT, (_whole, tag, _quote, alt) => {
      alts.push(alt)
      return tag
    })
    return { rest, alts }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const alts = []
    const rest = {}
    for (const key of Object.keys(value).sort())
      if (ALT_KEY.test(key)) alts.push(String(value[key] ?? ''))
      else rest[key] = value[key]
    return { rest, alts }
  }
  return { rest: value, alts: [] }
}

/**
 * @param {{ kind?: string, id?: unknown, fields?: Record<string, unknown> }} params the update
 * @param {{ rows: Map<string, object> }} state what the run read of each row
 * @returns {boolean} whether the update changes only the alts of pictures of a row read first, each alt plain words
 */
export function altOnlyUpdate(params, state) {
  const { kind, id, fields } = params ?? {}
  if (kind !== 'article' && kind !== 'module') return false
  const held = state?.rows?.get(`${kind}:${id}`)
  const names = Object.keys(fields ?? {})
  if (!held || !names.length) return false
  let changed = false
  for (const name of names) {
    if (!(name in held)) return false
    if (fields[name] === held[name]) continue
    const now = split(fields[name])
    if (JSON.stringify(now.rest) !== JSON.stringify(split(held[name]).rest)) return false
    if (now.alts.some((alt) => /[<>]/.test(alt) || hasMarkup(alt))) return false
    changed = true
  }
  return changed
}
