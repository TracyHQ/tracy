// The search title and description of every record page a brief build keeps (spec TracyHQ/tracy#189, criterion 8.1, R12
// group G). Pure and CMS neutral.
//
// 🔒 A RECORD PAGE IS A PAGE: IT HAS ITS OWN TITLE AND DESCRIPTION. Measured on a brief build 30/10/2026: the site plan held
// a search result for the five menu pages only, so each lesson page read its bare name on the tab ("Tennis") and every
// lesson carried its listing page's description. A template declares its record pages (`recordPages`, one entity per
// record); the honesty plan says which record each one now shows.
//
//   title        "<record name> | <business name>", the bare record name when that does not fit
//   description  the page's own copy as written (whole sentences that fit), else "<record> at <name> in <city>."
//
// The plan (`recordSeoPlanOf`) is made before the copy is written; the writer that holds the written copy finishes each row
// (`recordSeoOf`), so the description is always the page's own words.
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from './brief.mjs'
import { recordPagesOf } from './record-pages.mjs'

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
const flat = (text) =>
  String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const fits = (text, max) => [...text].length <= max

/**
 * The record pages the build keeps, each with the record it shows: the declared record page entities whose record the
 * honesty plan keeps and names.
 * @param {any} contentMap
 * @param {{records?: any[]}} honesty - the site plan's honesty plan
 * @param {{name?: string | null, city?: string | null}} [business]
 * @returns {Array<{entity: string, kind: string, label: string, name: string | null, city: string | null}>}
 */
export function recordSeoPlanOf(contentMap, honesty, { name = null, city = null } = {}) {
  const declared = new Set(
    recordPagesOf(contentMap).flatMap((p) => (Array.isArray(p.entities) ? p.entities : []))
  )
  const out = []
  const seen = new Set()
  for (const record of Array.isArray(honesty?.records) ? honesty.records : []) {
    if (record?.decision !== 'keep' || !nonEmpty(record?.assigned?.label)) continue
    const entity = String(record.group ?? '').split('.')[0]
    if (!declared.has(entity) || seen.has(entity)) continue
    seen.add(entity)
    out.push({
      entity,
      kind: String(record.kind ?? ''),
      label: record.assigned.label.trim(),
      name: nonEmpty(name) ? name.trim() : null,
      city: nonEmpty(city) ? city.trim() : null
    })
  }
  return out
}

/** The longest run of whole sentences of `text` from its start that fits `max`; '' when the first does not. */
export function sentencesThatFit(text, max = SEO_DESCRIPTION_MAX) {
  const words = flat(text)
  if (fits(words, max)) return words
  const sentences = words.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? []
  let out = ''
  for (const s of sentences) {
    const next = `${out} ${s.trim()}`.trim()
    if (!fits(next, max)) break
    out = next
  }
  return out
}

/**
 * One record page's search title and description, from its plan row and its own written copy.
 * @param {{label: string, name?: string | null, city?: string | null}} row - a row of `recordSeoPlanOf`
 * @param {string[]} copy - the page's own written lines, most telling first (its summary, then its description)
 * @returns {{title: string, description: string}}
 */
export function recordSeoOf(row, copy = []) {
  const label = flat(row.label)
  const own = nonEmpty(row.name) ? flat(row.name) : null
  const title = own && fits(`${label} | ${own}`, SEO_TITLE_MAX) ? `${label} | ${own}` : label
  // The page's own words: its lines joined until they fill the description, whole sentences only.
  const lines = copy.map(flat).filter((l) => l.length >= 20)
  let description = ''
  for (const line of lines) {
    const sentence = /[.!?]$/.test(line) ? line : `${line}.`
    const next = sentencesThatFit(`${description} ${sentence}`.trim())
    if (next.length <= description.length) break
    description = next
  }
  if (description === '') {
    const where = nonEmpty(row.city) ? ` in ${flat(row.city)}` : ''
    description = own ? `${label} at ${own}${where}.` : `${label}${where}.`
  }
  return { title, description }
}
