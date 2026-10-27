import { readFileSync } from 'node:fs'

const normalise = (text) =>
  text.normalize('NFKC').replace(/[’‘ʼ]/g, "'").replace(/\s+/gu, ' ').trim().toLowerCase()
const byLocale = JSON.parse(readFileSync(new URL('./neutral-copy/forbidden.json', import.meta.url), 'utf8'))
/**
 * The fillers a demo never writes without a source, as written (`neutral-copy/forbidden.json`): of one site language, or
 * of every language when none is given.
 * @param {string} [locale]
 * @returns {string[]}
 */
export function forbiddenFillers(locale) {
  return locale === undefined ? Object.values(byLocale).flat() : [...(byLocale[locale] ?? [])]
}
const forbidden = new Set(forbiddenFillers().map(normalise))

/** Match a whole filler, not a sourced sentence which happens to mention one. */
export function forbiddenFillerText(text) {
  return typeof text === 'string' && forbidden.has(normalise(text))
}

/**
 * @typedef {Object} SlotFillEntry
 * @property {string} slotKey
 * @property {'sourced'|'composed'|'neutral'|'empty'} state
 * @property {string} [neutralKey]
 * @property {string} locale
 * @property {string} [entityId]
 * @property {string[]} factRefs
 */

const states = new Set(['sourced', 'composed', 'neutral', 'empty'])
const fields = new Set(['slotKey', 'state', 'neutralKey', 'locale', 'entityId', 'factRefs'])
const hasText = (value) => typeof value === 'string' && Boolean(value.trim())

/** Validate the manifest's shape and provenance; resolving fact IDs belongs to the build. */
export function validateSlotFillManifest(entries) {
  const errors = []
  if (!Array.isArray(entries)) return { ok: false, errors: ['entries must be an array'] }
  const slots = new Set()
  for (const [index, entry] of entries.entries()) {
    const path = `entries[${index}]`
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${path} must be an object`)
      continue
    }
    for (const key of Object.keys(entry)) {
      if (!fields.has(key)) errors.push(`${path}.${key} is not a manifest field`)
    }
    for (const key of ['slotKey', 'locale']) {
      if (!hasText(entry[key])) errors.push(`${path}.${key} must be a non-empty string`)
    }
    if (hasText(entry.slotKey)) {
      if (slots.has(entry.slotKey)) errors.push(`${path}.slotKey duplicates "${entry.slotKey}"`)
      slots.add(entry.slotKey)
    }
    if (!states.has(entry.state)) errors.push(`${path}.state must be sourced, composed, neutral or empty`)
    for (const key of ['entityId', 'neutralKey']) {
      if (entry[key] !== undefined && !hasText(entry[key]))
        errors.push(`${path}.${key} must be a non-empty string when present`)
    }
    if (entry.neutralKey !== undefined && entry.state !== 'neutral')
      errors.push(`${path}.neutralKey is only valid for neutral slots`)
    if (!Array.isArray(entry.factRefs)) {
      errors.push(`${path}.factRefs must be an array`)
    } else {
      const refs = new Set()
      for (const [i, ref] of entry.factRefs.entries()) {
        if (!hasText(ref)) errors.push(`${path}.factRefs[${i}] must be a non-empty string`)
        else if (refs.has(ref)) errors.push(`${path}.factRefs[${i}] duplicates "${ref}"`)
        refs.add(ref)
      }
      if ((entry.state === 'sourced' || entry.state === 'composed') && !entry.factRefs.length) {
        errors.push(`${path}.factRefs must identify the facts used by ${entry.state} slots`)
      }
      if ((entry.state === 'neutral' || entry.state === 'empty') && entry.factRefs.length) {
        errors.push(`${path}.factRefs must be empty for ${entry.state} slots`)
      }
    }
  }
  return { ok: errors.length === 0, errors }
}
