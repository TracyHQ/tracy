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
 * `measureOn` (the template's decisions) names, per content map key, another page to read the slot on and what to
 * open first (`{path, click, clickSelector, openEach}`: the words of a tab, CSS selectors clicked in turn, every
 * match, such as a menu toggle, and `openEach`, a selector of submenu toggles opened one at a time on a visit of their
 * own, with the toggles of the items they sit in, since such toggles close each other): a price in
 * a closed tab, a masthead row only one page shows, a phone menu that slides in.
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
    // Every store block that draws the place, each on the first page that shows it at 390 px, else at the next
    // wider width (a header button the phone hides): a place several pages draw is read on each of them.
    const holders = holdersOf(blockStore, slot)
    const pagesOf = (id) => {
      const kitIds = new Set(kitIdsOf.get(id) ?? [])
      const shows = (w) => (p) => (p.blocks?.[w] ?? []).some((k) => kitIds.has(k))
      return MEASURE_WIDTHS.map((w) => (kit.pages ?? []).find(shows(String(w)))).find(Boolean)
    }
    const found = measureOn[slot]?.path
      ? [{ path: measureOn[slot].path }]
      : (holders.length ? holders : [block]).map(pagesOf).filter(Boolean)
    const paths = [...new Set(found.map((p) => p.path))]
    if (!paths.length) {
      skipped.push({ slot, why: `no kit page shows ${block} at ${MEASURE_WIDTHS.join(', ')} px` })
      continue
    }
    // No `lines` from the content map: its fit of these slots is the box of a whole section (13 lines for a two
    // line heading), so the text may take the lines the demo shows, no more.
    const click = measureOn[slot]?.click
    const clickSelector = measureOn[slot]?.clickSelector
    const openEach = measureOn[slot]?.openEach
    for (const pagePath of paths) {
      const key = JSON.stringify([pagePath, click ?? null, clickSelector ?? null, openEach ?? null])
      const texts = byPath.get(key) ?? []
      texts.push({ id: slot, slot, text, tight: shownTextOf(mapSlots.get(slot)?.sample, '') })
      byPath.set(key, texts)
    }
  }
  const pages = [...byPath].map(([key, texts]) => {
    const [path, click, clickSelector, openEach] = JSON.parse(key)
    return {
      path,
      ...(click ? { click } : {}),
      ...(clickSelector ? { clickSelector } : {}),
      ...(openEach ? { openEach } : {}),
      texts
    }
  })
  return { pages, skipped }
}

/** The store blocks that declare `slot` as a field, an item field or a child field, in store order. */
export function holdersOf(blockStore, slot) {
  const childHolds = (lists) =>
    (lists ?? []).some(
      (l) => (l.fields ?? []).some((f) => (f.slots ?? []).flat().includes(slot)) || childHolds(l.lists)
    )
  return (blockStore.blocks ?? [])
    .filter(
      (b) =>
        [...(b.fields ?? []), ...(b.itemFields ?? [])].some(
          (f) => f.slot === slot || (f.slots ?? []).includes(slot)
        ) ||
        childHolds(b.lists) ||
        childHolds(b.itemLists)
    )
    .map((b) => b.id)
}

/**
 * The limit of a place read on several pages: the smallest of the pages' limits, so the copy fits every page that
 * draws it; the record names each page's reading. One page gives its own record unchanged.
 * @param {Array<{limit: number, limitFrom: string, path?: string}>} records one per page, from `limitFromReadings`
 */
export function limitAcrossPages(records) {
  const recs = records.filter(Boolean)
  if (recs.length <= 1) return recs[0] ?? null
  const least = recs.reduce((a, b) => (b.limit < a.limit ? b : a))
  const page = least.limitFrom.match(/, page ([^:]+):/)?.[1] ?? '?'
  return {
    limit: least.limit,
    limitFrom: `measured on the running template on ${recs.length} pages, the smallest limit taken (${least.limit}, page ${page}): ${recs.map((r) => r.limitFrom.replace(/^measured on the running template /, '')).join(' | ')}`
  }
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
  const at = widths.find((w) => readings[w].limit === limit)
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
    limitFrom: `measured on the running template at ${widths.join(', ')}px, page ${path}: ${parts.join(', ')}; the limit is the smallest reading, ${limit} at ${at}px; ${how}${hiddenNote}`
  }
}
