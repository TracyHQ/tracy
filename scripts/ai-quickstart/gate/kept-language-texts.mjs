// The words of the language strings a kit keeps (`mapping.overrides.language` entries with `keep`), read from the blank
// site archive's own language files, for the demo scan's existing input `interfaceTexts` (#587 triage of run 4). The
// demo scan compares interface words exactly, so a string with placeholders is given filled: each placeholder by the
// page numbers 1 to 20 (a list's "Page 1 of 2"), for a string of at most two placeholders. Words a placeholder holds
// otherwise cannot be given this way: the scan would need to read a kept string as a pattern (its owner's change). A
// site override wins over the file it overrides, since that is what the page prints. Pure.

const PLACEHOLDER = /%(?:\d+\$)?[sd]/g
const NUMBERS = Array.from({ length: 20 }, (_, i) => String(i + 1))
const LANGUAGE = /^(?:administrator\/)?language\/en-GB\/[^/]+\.ini$/
const OVERRIDE = /^language\/overrides\/en-GB\.override\.ini$/

/** The strings of an ini text: `Map<key, value>`. */
function stringsOf(text) {
  const out = new Map()
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_.-]+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(?:;.*)?$/.exec(line)
    if (m) out.set(m[1], m[2].replace(/\\"/g, '"'))
  }
  return out
}

/** A string with its placeholders filled by page numbers; the string alone when it has none, none past two. */
function filled(value) {
  const holes = value.match(PLACEHOLDER) ?? []
  if (!holes.length) return [value]
  if (holes.length > 2) return []
  const parts = value.split(PLACEHOLDER)
  const out = []
  const fill = (i, acc) => {
    if (i === holes.length) return out.push(acc + parts[i])
    for (const n of NUMBERS) fill(i + 1, acc + parts[i] + n)
  }
  fill(0, '')
  return out
}

/**
 * @param {object} mapping the kit's mapping
 * @param {Map<string, string>} files the archive's text files (`sources.mjs` `filesOf`)
 * @returns {string[]}
 */
export function keptLanguageTextsOf(mapping, files) {
  const kept = new Set(
    (Array.isArray(mapping?.overrides?.language) ? mapping.overrides.language : [])
      .filter((l) => l?.key && typeof l.keep === 'string' && l.keep.trim())
      .map((l) => l.key)
  )
  if (!kept.size) return []
  const values = new Map()
  const overrides = new Map()
  for (const [file, text] of files ?? []) {
    const target = OVERRIDE.test(file) ? overrides : LANGUAGE.test(file) ? values : null
    if (!target) continue
    for (const [key, value] of stringsOf(text)) if (kept.has(key) && !target.has(key)) target.set(key, value)
  }
  const out = []
  for (const key of kept) {
    const value = overrides.get(key) ?? values.get(key)
    if (value?.trim()) out.push(...filled(value))
  }
  return out
}
