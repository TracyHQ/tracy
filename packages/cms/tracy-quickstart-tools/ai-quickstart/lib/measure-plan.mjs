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
  const width = String(NARROWEST_WIDTH)
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
    const page = measureOn[slot]?.path
      ? { path: measureOn[slot].path }
      : (kit.pages ?? []).find((p) => (p.blocks?.[width] ?? []).some((k) => kitIds.has(k)))
    if (!page) {
      skipped.push({ slot, why: `no kit page shows ${block} at ${width} px` })
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

/** The width a measured limit must hold at too: the widest the kit reads, where a heading may have fewer lines. */
export const WIDEST_WIDTH = 1440

/**
 * The recorded limit of a slot from its readings per width (`{390: reading, 1440: reading}`): the smallest, as the
 * kit takes, so copy fits the phone and the desktop layout. Null without a reading at the narrowest width.
 */
export function limitFromReadings(readings, path, { hiddenAtNarrowest = false } = {}) {
  if (!readings[NARROWEST_WIDTH] && !(hiddenAtNarrowest && readings[WIDEST_WIDTH])) return null
  const widths = Object.keys(readings).sort((a, b) => Number(a) - Number(b))
  const limit = Math.min(...widths.map((w) => readings[w].limit))
  const how = Object.values(readings).some((r) => r.how === 'placeholder')
    ? `the form field's placeholder repeated until it was wider than the field`
    : 'the box filled until the text needed more lines than the demo shows, grew the page or pushed another text'
  const parts = widths.map((w) => {
    const r = readings[w]
    return `${w}px ${r.limit} (demo ${r.demo} characters on ${r.lines} line(s))`
  })
  if (!readings[NARROWEST_WIDTH])
    return {
      limit,
      limitFrom: `measured at ${WIDEST_WIDTH}px on the running template, page ${path}: ${parts.join(', ')}; ${how}; the block hides it at ${NARROWEST_WIDTH}px (its box is drawn 0 by 0), so ${WIDEST_WIDTH}px is the narrowest kit width that shows it`
    }
  return {
    limit,
    limitFrom: `measured at ${NARROWEST_WIDTH}px on the running template, page ${path}: ${parts.join(', ')}; ${how}`
  }
}
