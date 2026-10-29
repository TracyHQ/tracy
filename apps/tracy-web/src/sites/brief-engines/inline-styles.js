/**
 * The demo's inline styling of each text slot of a Joomla contract (spec TracyHQ/tracy#189, "replace the words, never the
 * style"): the style pattern (`website-opportunities/domain/inline-style.mjs`) of every slot whose demo value carries inline
 * markup, read from what the release ships.
 *
 * Two kinds of slot carry it, framework-wide (T4 and T3, every JA template):
 *   a JSON field with markers   a JA ACM field stores markup as `((span))NO1((/span))`; the content map's sample keeps it
 *   a whole-unit HTML slot      a slot whose path ends at an element (`/html/body/div`, `…/h2`), not a text node: the content
 *                               map's sample is the unit's words only ("THE WORKOUT"), so the demo's markup is read from the
 *                               release's own rows (`presentation-lock.json`) at that path ("THE<br/><span>WORKOUT</span>")
 * A slot bound to one text node never carries markup of its own: the tags around it stay where they are when it is written.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'parse5'
import { inlineStylePattern } from 'website-opportunities/domain/inline-style.mjs'

/** A path that ends at a text node or an attribute: one scalar, never a unit with markup. */
const SCALAR_PATH = /\/(?:text\(\)(?:\[\d+\])?|@[\w:-]+)$/
/** Markup in a stored value: an HTML tag or a JA ACM marker. */
const MARKUP = /<\/?[a-z][^>]*>|\(\(\/?[a-z][^()]*\)\)/i
/** The root the contract capture wraps every HTML value in (`ContentSlots::html`). */
const ROOT = '<html><body><div id="contract-root">'

/** Whether a slot's path addresses a whole element of an HTML value. */
export const isUnitPath = (/** @type {unknown} */ xpath) =>
  typeof xpath === 'string' && xpath.startsWith('/') && !SCALAR_PATH.test(xpath)

/**
 * The source span of an element's inner HTML in `html`, found by the capture's absolute path grammar
 * (`/html/body/div/h2[1]`); the root itself (`/html/body/div`) is the whole value. Null when the path finds no single element.
 * @param {string} html
 * @param {string} xpath
 * @returns {{ start: number, end: number } | null}
 */
export function unitSpan(html, xpath) {
  const doc = parse(`${ROOT}${html}</div></body></html>`, { sourceCodeLocationInfo: true })
  /** @type {any[]} */
  let nodes = [doc]
  for (const segment of xpath.slice(1).split('/')) {
    const m = /^([a-zA-Z][\w-]*)(?:\[(\d+)\])?$/.exec(segment)
    if (!m) return null
    const next = []
    for (const node of nodes) {
      const children = (node.childNodes ?? []).filter((c) => c.tagName === m[1].toLowerCase())
      if (m[2]) {
        if (children[Number(m[2]) - 1]) next.push(children[Number(m[2]) - 1])
      } else next.push(...children)
    }
    nodes = next
  }
  if (nodes.length !== 1) return null
  const node = nodes[0]
  if (node.attrs?.some((a) => a.name === 'id' && a.value === 'contract-root'))
    return { start: 0, end: html.length }
  const loc = node.sourceCodeLocation
  if (!loc?.startTag || !loc?.endTag) return null
  return { start: loc.startTag.endOffset - ROOT.length, end: loc.endTag.startOffset - ROOT.length }
}

/**
 * The string a slot addresses in a row: the column, its nested JSON and the JSON path. Null when it is not a string.
 * @param {Record<string, any>} row
 * @param {{ column?: string, nestedJson?: string, jsonPath?: unknown[] }} slot
 */
export function leafOf(row, slot) {
  let value = row?.[String(slot.column)]
  const parsed = (/** @type {unknown} */ v) => {
    if (typeof v !== 'string') return v
    try {
      return JSON.parse(v)
    } catch {
      return null
    }
  }
  if (Array.isArray(slot.jsonPath) && slot.jsonPath.length > 0) {
    value = parsed(value)
    if (slot.nestedJson) value = parsed(value?.[slot.nestedJson])
    for (const step of slot.jsonPath) value = value?.[/** @type {any} */ (step)]
  }
  return typeof value === 'string' ? value : null
}

/**
 * The demo value a slot shows, with its markup: the sample of a JSON field, or the inner HTML of a unit read from the release.
 * @param {any} slot
 * @param {Record<string, any> | null} rows - `presentation-lock.json` entities, by entity key
 */
export function demoMarkupOf(slot, rows) {
  if (slot?.type !== 'text') return null
  if (!slot.xpath) return MARKUP.test(String(slot.sample ?? '')) ? String(slot.sample) : null
  if (!isUnitPath(slot.xpath)) return null
  const leaf = rows ? leafOf(rows[slot.entity], slot) : null
  if (leaf === null || !MARKUP.test(leaf)) return null
  const span = unitSpan(leaf, slot.xpath)
  return span ? leaf.slice(span.start, span.end) : null
}

/** @type {Map<string, Record<string, any> | null>} a release's rows, read once: a release never changes */
const lockRows = new Map()

function rowsOf(/** @type {string | undefined} */ dir) {
  if (!dir) return null
  if (!lockRows.has(dir)) {
    const file = path.join(dir, 'presentation-lock.json')
    let rows = null
    try {
      rows = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).entities ?? null) : null
    } catch {
      rows = null
    }
    lockRows.set(dir, rows)
  }
  return lockRows.get(dir) ?? null
}

/**
 * The slots, each one whose demo value carries inline styling given its `inlineStyle` (the style pattern, with its `hint`
 * for the writer and its `form`, HTML or JA ACM markers). The others are returned as they are.
 * @template {Record<string, any>} T
 * @param {T[]} slots
 * @param {string | undefined} dir - the release's contract folder
 * @returns {T[]}
 */
export function withInlineStyles(slots, dir) {
  const rows = rowsOf(dir)
  return slots.map((slot) => {
    const demo = demoMarkupOf(slot, rows)
    const pattern = demo === null ? null : inlineStylePattern(demo)
    return pattern ? { ...slot, inlineStyle: pattern } : slot
  })
}
