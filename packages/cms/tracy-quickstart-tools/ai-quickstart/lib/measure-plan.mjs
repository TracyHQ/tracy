// Which pages to open, and which demo texts to fill on each, to measure at the narrowest width the text limits the
// kit could not give (ticket #583). Pure. The filling itself is the kit's own frame reading (`readTextFit`,
// template-kit/lib/read-text-fit.js), run by measure-limits.mjs on a running copy of the template.
import { NARROWEST_WIDTH } from './draft-fields.mjs'

/** A content map sample as the page shows it: inline markers dropped, words kept. */
export const shownTextOf = (sample, joiner = ' ') =>
  String(sample ?? '')
    .replace(/\(\([^)]*\)\)/g, joiner)
    .replace(/\s+/g, ' ')
    .trim()

/**
 * `measureOn` (the template's decisions) names, per content map key, another page to read the slot on and the words
 * of a tab to open first (`{path, click}`): a price in a closed tab, a masthead row only one page shows.
 * Each text carries `tight`: its words as a phone shows them when a forced line break is hidden there ("WHATTO
 * BRING" for "WHAT<br>TO BRING").
 * @param {{unmeasured: {block: string, slot: string}[], blockStore: object, kit: object, contentMap: object, measureOn?: object}} input
 * @returns {{pages: {path: string, click?: string, texts: {id: string, slot: string, text: string, tight: string}[]}[], skipped: {slot: string, why: string}[]}}
 */
export function planMeasurements({ unmeasured, blockStore, kit, contentMap, measureOn = {} }) {
  const mapSlots = new Map((contentMap.slots ?? []).map((s) => [s.key, s]))
  const kitIdsOf = new Map(
    blockStore.blocks.map((b) => [b.id, (b.from?.kit ?? []).map((k) => k.split(' ')[0])])
  )
  const byPath = new Map()
  const skipped = []
  const seen = new Set()
  for (const { block, slot } of unmeasured) {
    if (seen.has(slot)) continue
    seen.add(slot)
    const text = shownTextOf(mapSlots.get(slot)?.sample)
    if (!text) {
      skipped.push({ slot, why: 'the demo shows no words there, so no box can be found to fill' })
      continue
    }
    const kitIds = new Set(kitIdsOf.get(block) ?? [])
    // The first page that shows the block at 390 px, else at the next wider width (a header button the phone hides).
    const shows = (w) => (p) => (p.blocks?.[w] ?? []).some((k) => kitIds.has(k))
    const page = measureOn[slot]?.path
      ? { path: measureOn[slot].path }
      : MEASURE_WIDTHS.map((w) => (kit.pages ?? []).find(shows(String(w)))).find(Boolean)
    if (!page) {
      skipped.push({ slot, why: `no kit page shows ${block} at ${MEASURE_WIDTHS.join(', ')} px` })
      continue
    }
    // No `lines` from the content map: its fit of these slots is the box of a whole section (13 lines for a two
    // line heading), so the text may take the lines the demo shows, no more.
    const click = measureOn[slot]?.click
    const key = JSON.stringify([page.path, click ?? null])
    const texts = byPath.get(key) ?? []
    texts.push({ id: slot, slot, text, tight: shownTextOf(mapSlots.get(slot)?.sample, '') })
    byPath.set(key, texts)
  }
  const pages = [...byPath].map(([key, texts]) => {
    const [path, click] = JSON.parse(key)
    return click ? { path, click, texts } : { path, texts }
  })
  return { pages, skipped }
}

/** The widths a limit is read at: the phone, the tablet and the desktop width of the kit. */
export const MEASURE_WIDTHS = Object.freeze([NARROWEST_WIDTH, 768, 1440])

/**
 * The recorded limit of a slot from its readings per width (`{390: reading, 768: reading, 1440: reading}`): the
 * smallest over every width that draws the text, as the kit takes, so copy fits the phone, the tablet and the
 * desktop layout. A text must be read at 390 px, unless the layout hides it there (`hiddenAt`, its box drawn 0 by 0):
 * then the narrowest width that draws it stands in, and the record says so. Null otherwise.
 * @param {Record<string, {limit: number, demo: number, lines: number, how?: string}>} readings
 * @param {string} path
 * @param {{hiddenAt?: number[]}} [options]
 */
export function limitFromReadings(readings, path, { hiddenAt = [] } = {}) {
  const hidden = new Set(hiddenAt.map(Number))
  const widths = Object.keys(readings)
    .map(Number)
    .filter((w) => !hidden.has(w))
    .sort((a, b) => a - b)
  if (widths.length === 0) return null
  const narrowest = widths[0]
  if (narrowest !== NARROWEST_WIDTH && !hidden.has(NARROWEST_WIDTH)) return null
  const limit = Math.min(...widths.map((w) => readings[w].limit))
  const how = widths.some((w) => readings[w].how === 'placeholder')
    ? `the form field's placeholder repeated until it was wider than the field`
    : 'the box filled until the text needed more lines than the demo shows, grew the page or pushed another text'
  const parts = widths.map((w) => {
    const r = readings[w]
    return `${w}px ${r.limit} (demo ${r.demo} characters on ${r.lines} line(s))`
  })
  const hiddenNote =
    narrowest === NARROWEST_WIDTH
      ? ''
      : `; the layout hides it at ${[...hidden].sort((a, b) => a - b).join(' and ')}px (its box is drawn 0 by 0), so ${narrowest}px is the narrowest width that draws it`
  return {
    limit,
    limitFrom: `measured at ${narrowest}px on the running template, page ${path}: ${parts.join(', ')}; ${how}${hiddenNote}`
  }
}
