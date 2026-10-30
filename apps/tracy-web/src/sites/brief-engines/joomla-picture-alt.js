/**
 * Alt text for every picture a Joomla brief build placed (spec TracyHQ/tracy#189, criterion 8.3, R12 group G).
 *
 * 🔒 A PLACED PICTURE SAYS WHAT IT SHOWS; A DECORATIVE FRAME SAYS NOTHING. Measured on a brief build 30/10/2026: the picture
 * step wrote each picture's path and nothing else, so every content picture printed the template's empty or demo alt. The
 * words come from the labelling step: a photo's label (`receipt.subject`), a dish's name, else the record its slot belongs
 * to; a decorative frame (an icon, a cut-out, a background, a blank placeholder) keeps `alt=""`.
 *
 * Where the alt goes is found beside the picture, in every row the picture is written to:
 *   HTML      the `<img>` whose `src` holds the picture gets an `alt` attribute
 *   JSON      the key beside the picture's key: `<key>_alt` (Joomla's article images), else `alt`, else `<key>-alt`
 * JSON held as a string inside a field (a T4 module's settings) is read and written back the same way. A picture with no
 * alt place beside it is counted, never guessed: the template must print one (the final check names those pages).
 */
import { paramsOf } from './joomla-tidy.js'

/** Picture roles that only decorate, so they say nothing. */
const DECORATIVE_ROLES = new Set(['icon', 'decor', 'cutout', 'background', 'pattern', 'texture', 'divider'])
const DECORATIVE_KINDS = new Set(['placeholder', 'blank'])

const escaped = (/** @type {string} */ t) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The alt text of each placed picture, by its file name.
 * @param {Array<{group?: any, hash?: string, ext?: string, receipt?: any}>} shaped - what the picture step placed
 * @param {Record<string, string>} [cardNames] - the record each card group shows (the site plan's honesty plan)
 * @returns {Map<string, string>}
 */
export function pictureAltsOf(shaped, cardNames = {}) {
  const out = new Map()
  for (const item of shaped ?? []) {
    if (!item?.hash || !item.ext) continue
    const role = String(item.group?.role ?? '')
    const receipt = item.receipt ?? {}
    const decorative =
      DECORATIVE_ROLES.has(role) || DECORATIVE_KINDS.has(String(receipt.kind ?? '')) || item.hide === true
    const slots = (item.group?.slots ?? []).map((s) => String(s?.key ?? s ?? ''))
    // The record a slot's entity shows: the card name of any group of that entity.
    const record = slots
      .map((key) => key.split('.')[0])
      .map((entity) => Object.entries(cardNames).find(([group]) => group.split('.')[0] === entity)?.[1])
      .find(Boolean)
    const words = String(receipt.subject ?? receipt.dish ?? record ?? '').trim()
    out.set(`${item.hash}.${item.ext}`, decorative ? '' : words)
  }
  return out
}

/** The alt of the placed picture a value names; undefined when it names none. */
const altFor = (/** @type {string} */ value, /** @type {Map<string, string>} */ alts) => {
  for (const [file, alt] of alts) if (value.includes(file)) return alt
  return undefined
}

/** HTML with the alt of every placed picture set; the same string when nothing changes. */
export function withAltsInHtml(/** @type {string} */ html, /** @type {Map<string, string>} */ alts) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? ''
    const alt = altFor(src, alts)
    if (alt === undefined) return tag
    const attr = `alt="${escaped(alt)}"`
    return /\balt\s*=\s*("[^"]*"|'[^']*')/i.test(tag)
      ? tag.replace(/\balt\s*=\s*("[^"]*"|'[^']*')/i, attr)
      : tag.replace(/^<img\b/i, `<img ${attr}`)
  })
}

/**
 * A JSON value with the alt beside every placed picture set; `missed` counts the pictures with no alt place.
 * @returns {{value: any, changed: boolean, missed: number}}
 */
export function withAltsInJson(value, alts) {
  let changed = false
  let missed = 0
  const walk = (node) => {
    if (typeof node === 'string') {
      const t = node.trim()
      if ((t.startsWith('{') || t.startsWith('[')) && altFor(t, alts) !== undefined) {
        const inner =
          paramsOf(t) ??
          (() => {
            try {
              return JSON.parse(t)
            } catch {
              return null
            }
          })()
        if (inner && typeof inner === 'object') return JSON.stringify(walk(inner))
      }
      if (/<img\b/i.test(node)) {
        const next = withAltsInHtml(node, alts)
        if (next !== node) changed = true
        return next
      }
      return node
    }
    if (Array.isArray(node)) return node.map(walk)
    if (!node || typeof node !== 'object') return node
    const out = { ...node }
    for (const [key, held] of Object.entries(node)) {
      if (typeof held === 'string' && !/^[[{]/.test(held.trim()) && !/<img\b/i.test(held)) {
        const alt = altFor(held, alts)
        if (alt === undefined) continue
        const place = [`${key}_alt`, 'alt', `${key}-alt`].find((k) => k in node && k !== key)
        if (!place) missed += 1
        else if (out[place] !== alt) {
          out[place] = alt
          changed = true
        }
        continue
      }
      out[key] = walk(held)
    }
    return out
  }
  const next = walk(value)
  return { value: next, changed, missed }
}

/** The columns of each row kind a picture is written to, and whether each holds HTML or JSON. */
const COLUMNS = Object.freeze({
  article: { introtext: 'html', fulltext: 'html', images: 'json', attribs: 'json' },
  module: { content: 'html', params: 'json' }
})

/**
 * The writes that give every placed picture its alt, in the rows of one kind.
 * @param {{ rows: any[], kind: 'article' | 'module', alts: Map<string, string> }} input
 * @returns {{ steps: Array<{kind: string, id: number, fields: Record<string, string>}>, missed: number }}
 */
export function altSteps({ rows, kind, alts }) {
  const steps = []
  let missed = 0
  if (!alts?.size) return { steps, missed }
  for (const row of rows ?? []) {
    const fields = /** @type {Record<string, string>} */ ({})
    for (const [column, form] of Object.entries(COLUMNS[kind] ?? {})) {
      const held = row?.[column]
      if (typeof held !== 'string' || altFor(held, alts) === undefined) continue
      if (form === 'html') {
        const next = withAltsInHtml(held, alts)
        if (next !== held) fields[column] = next
        continue
      }
      const parsed = paramsOf(held)
      if (!parsed) continue
      const result = withAltsInJson(parsed, alts)
      missed += result.missed
      if (result.changed) fields[column] = JSON.stringify(result.value)
    }
    if (Object.keys(fields).length > 0) steps.push({ kind, id: Number(row.id), fields })
  }
  return { steps, missed }
}
