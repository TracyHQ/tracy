// Measures the site check adds to the host's own: dead links, text that overflows its box, blocks far taller than on the demo,
// blocks that print far less or far more text than on the demo, and pictures drawn out of shape. Each is a pure function of what the host read in its browser (`pageMeasures`, one entry per
// kept page and width), so each is tested on invented pages. The host's answer carries:
//   { path, width, links: [{ href, text, status }],
//     textBoxes: [{ selector, text, boxWidth, boxHeight, contentWidth, contentHeight, clips, right }],
//     blocks: [{ selector, height }], textBlocks: [{ selector, chars, items?: [chars] }],
//     pictures: [{ selector, src, naturalWidth, naturalHeight, width, height, fit }],
//     controls: [{ selector, fault: 'wordless' | 'nowhere', href, text }], fields: [{ selector, name }],
//     glued: [{ selector, text, around }], headings: [text], mainHeadings: [text], shownText,
//     minorHeadings: [text], hiddenHeadings: [text], selfLinks: [{ selector, text, href, holders }], contentControls: [{ key, text }], view,
//     title, shownLinks: [{ href, text, clickable }], shownLinksClickable, shownPictures: [src],
//     orphanRows: [{ selector, perRow, lastRow, rows, gap }], blankFooterColumns: [{ selector, width, height }], brandStyle?, look? }

/** A box counts as overflowed only past this many pixels, so rounding in the browser is no finding. */
export const OVERFLOW_TOLERANCE_PX = 2
/**
 * A block taller than the same block on the template's demo by more than this share is unusual. Never a fixed height: the owner
 * ruled a 2721 px home block no fault when the demo's was taller still (04/11/2026).
 */
export const TALLER_THAN_DEMO = 0.25
/**
 * A block prints less than TEXT_FILL_MIN or more than TEXT_FILL_MAX of the text the same block prints on the demo (ADR 0044,
 * 2026-11-04). The writer writes between 80% and 100% of each slot's demo, so a whole block outside these bounds is copy that does
 * not follow the demo, or text the block lost or gained. Only blocks whose demo prints over TEXT_FILL_DEMO_MIN characters.
 */
export const TEXT_FILL_MIN = 0.6
export const TEXT_FILL_MAX = 1.1
export const TEXT_FILL_DEMO_MIN = 40
/** A list warns with this share of the demo's items or fewer, or with a median item this many times the demo's or longer. */
export const LIST_ITEMS_MIN_SHARE = 0.5
export const LIST_ITEM_LONGER = 2

/** A picture drawn with its width and height ratio this far from the file's own is stretched (fit `fill` only). */
export const STRETCH_TOLERANCE = 0.1

import { addressMoves, addressNow, movePath } from '../lib/renamed-addresses.js'
import { pathOfMeasure } from './page-faults.js'

const each = (value) => (Array.isArray(value) ? value : [])
const clip = (text, n = 120) => String(text ?? '').slice(0, n)

/** A link answered with an error status, or none at all. A redirect is not dead. */
const dead = (status) =>
  status === null || status === undefined || Number(status) >= 400 || Number(status) === 0

/** A link's path as a move compares it: no origin, no query, no fragment. */
const hrefPath = (href) =>
  String(href ?? '')
    .replace(/^(?:https?:)?\/\/[^/?#]+/i, '')
    .replace(/[?#].*$/, '')

/**
 * Pages the host could not open, and links on the pages that lead nowhere. A dead address the write step's route stage moved
 * is the write step's (card AD): it renamed the page and left the link behind, so the failure names step 9 and the rename.
 * @param {{ path: string, status: number | null, skipped?: string }[]} visited the kept pages the host opened
 * @param {object[]} measures
 * @param {object[]} [routes] the write report's route table
 */
export function findDeadLinks(visited, measures, routes = []) {
  const moves = addressMoves(routes)
  const blame = (href) => {
    const path = hrefPath(href)
    if (!path.startsWith('/') && !/^index\.php\//i.test(path)) return {}
    const now = addressNow(path, moves)
    if (now === null) return {}
    const move = moves.find((m) => movePath(path) === m.from || movePath(path).startsWith(`${m.from}/`))
    return {
      causingStep: 9,
      why: `; the write step renamed ${move.from} to ${move.to} and left this at the old address (${now} now)`
    }
  }
  const failures = []
  for (const v of each(visited))
    if (v.skipped === 'not found' || (v.status !== null && v.status !== undefined && v.status >= 400)) {
      const { why = '', ...step } = blame(v.path)
      failures.push({
        page: v.path,
        measured: v.status ?? v.skipped,
        reason: `A kept page does not answer (${v.status ?? v.skipped})${why}`,
        ...step
      })
    }
  const seen = new Set()
  for (const m of each(measures))
    for (const link of each(m.links)) {
      if (!dead(link.status)) continue
      const id = `${m.path} ${link.href}`
      if (seen.has(id)) continue
      seen.add(id)
      const { why = '', ...step } = blame(link.href)
      failures.push({
        page: m.path,
        measured: link.status ?? 'no answer',
        reason: `A link to ${clip(link.href, 100)} (${clip(link.text, 40) || 'no words'}) answers ${link.status ?? 'nothing'}${why}`,
        ...step
      })
    }
  return failures
}

/** Text that does not fit: cut by its box, or running out past the right edge of the screen. */
export function findTextOverflow(measures) {
  const failures = []
  for (const m of each(measures))
    for (const t of each(m.textBoxes)) {
      const wide = t.contentWidth - t.boxWidth
      const high = t.contentHeight - t.boxHeight
      const cut = t.clips === true && (wide > OVERFLOW_TOLERANCE_PX || high > OVERFLOW_TOLERANCE_PX)
      const past = Number(t.right) > m.width + OVERFLOW_TOLERANCE_PX
      if (!cut && !past) continue
      failures.push({
        page: m.path,
        width: m.width,
        measured: clip(t.text, 60),
        reason: cut
          ? `Text runs ${Math.max(wide, high)} px past its box`
          : `Text runs ${Math.round(t.right - m.width)} px past the right edge`,
        selector: t.selector ?? null
      })
    }
  return failures
}

/** One finding per page and what was seen: the two widths read the same page. */
function oncePerPage(measures, listOf, findingOf) {
  const seen = new Set()
  const failures = []
  for (const m of each(measures))
    for (const item of listOf(m)) {
      const finding = { page: m.path, ...findingOf(item) }
      const id = `${m.path} ${finding.measured}`
      if (seen.has(id)) continue
      seen.add(id)
      failures.push(finding)
    }
  return failures
}

/** One finding per page and element, at the first width that shows it: the same grid or column is one fault at both widths. */
function oncePerElement(measures, listOf, reasonOf) {
  const seen = new Set()
  const failures = []
  for (const m of each(measures))
    for (const item of each(listOf(m))) {
      const id = `${m.path} ${item?.selector}`
      if (seen.has(id)) continue
      seen.add(id)
      failures.push({
        page: m.path,
        width: m.width,
        measured: clip(item?.selector, 120),
        reason: reasonOf(item),
        selector: item?.selector ?? null
      })
    }
  return failures
}

/**
 * A grid or wrapping row of cards of one kind whose last row holds fewer cards, pushed to the left with a hole on its right
 * (the host's `orphanRows`, which names the rule): the visitor sees a gap where a card is missing.
 */
export function findOrphanRows(measures) {
  return oncePerElement(
    measures,
    (m) => m.orphanRows,
    (o) => `${o.lastRow} cards on the last row of ${o.perRow}, leaving ${o.gap} px empty`
  )
}

/** A footer column that prints no words, link or picture beside one that does (the host's `blankFooterColumns`). */
export function findBlankFooterColumns(measures) {
  return oncePerElement(
    measures,
    (m) => m.blankFooterColumns,
    (c) => `A footer column ${c.width} px wide prints no words, link or picture`
  )
}

/** A button with no words, a button going nowhere, a form field nothing names: a visitor cannot use them. */
export function findEmptyControls(measures) {
  const reasons = {
    wordless: 'A button has no words',
    nowhere: 'A button goes nowhere (its address is #)'
  }
  return [
    ...oncePerPage(
      measures,
      (m) => each(m.controls),
      (c) => ({
        measured: c.fault === 'nowhere' ? clip(c.text, 80) : `${c.selector} -> ${c.href ?? '(no address)'}`,
        reason: reasons[c.fault] ?? 'A button cannot be used',
        selector: c.selector,
        // A button going nowhere has the wrong link target, and the plan owns link targets (as `demo-links` says).
        ...(c.fault === 'nowhere' ? { causingStep: 3 } : {})
      })
    ),
    ...oncePerPage(
      measures,
      (m) => each(m.fields),
      (f) => ({ measured: f.selector, reason: 'A form field that nothing names', selector: f.selector })
    )
  ]
}

/** Words that run into a highlight beside them. */
export function findGluedWords(measures) {
  return oncePerPage(
    measures,
    (m) => each(m.glued),
    (g) => ({
      measured: clip(g.around, 80),
      reason: `Words run together with no space (${clip(g.text, 50)})`,
      selector: g.selector
    })
  )
}

const UNFINISHED = /(?:^|\s)(?:a|an|and|at|by|for|from|in|of|on|or|our|the|to|with|your)$/i

/** A heading that stops on a small word: the rest of it is missing. */
export function findUnfinishedHeadings(measures) {
  return oncePerPage(
    measures,
    (m) => each(m.headings).filter((h) => UNFINISHED.test(String(h).trim())),
    (h) => ({ measured: clip(h, 80), reason: 'A heading stops halfway' })
  )
}

/**
 * A page should print one main heading a visitor reads. Two read as the title said twice, which blocks. None is a warning: a template
 * can draw its big words in something else, and a heading kept for a screen reader is no fault a visitor sees.
 */
export function findMainHeadings(measures) {
  const known = each(measures).filter((m) => Array.isArray(m.mainHeadings))
  return [
    ...oncePerPage(
      known.filter((m) => m.mainHeadings.length > 1),
      (m) => [m.mainHeadings],
      (h) => ({ measured: clip(h.join(' / '), 120), reason: `${h.length} main headings on one page` })
    ),
    ...oncePerPage(
      known.filter((m) => m.mainHeadings.length === 0),
      () => ['no main heading'],
      (h) => ({ measured: h, level: 'warn', reason: 'No main heading a visitor can read' })
    )
  ]
}

const squashed = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
const pathOfHref = (href) => {
  try {
    return new URL(href).pathname
      .replace(/^\/index\.php(?=\/|$)/, '')
      .replace(/\/+$/, '')
      .toLowerCase()
  } catch {
    return null
  }
}

/**
 * Where a visitor sees a stored value, or null. Words are read in the page's rendered text, a picture among its shown pictures in
 * the theme the page opens on or on either side of its light and dark switch (the look read), an
 * address among its shown links: with the words beside it when it has any, else alone, and only when no written line also sends a link
 * there, since then the page cannot tell the two apart.
 * @param {object[]} measures
 * @param {{ type: string, value: string, path?: string | null, label?: string | null, claimed?: boolean }} slot `path`: where an
 *   address opens; `label`: the words of its button; `claimed`: a written line goes to the same address
 * @returns {{ page: string, width: number } | null}
 */
export function whereShown(measures, { type, value, path = null, label = null, claimed = false }) {
  const seen = (m) => {
    if (type === 'image') {
      const file = String(value).split('#')[0].replace(/^\/+/, '')
      // The look read puts each side of the light and dark switch (theme-reads.js): a picture either side shows is shown.
      const sides = Object.values(m.look?.sides ?? {}).flatMap((side) => each(side?.shownPictures))
      return [...each(m.shownPictures), ...sides].some((src) => decodeURI(String(src)).includes(file))
    }
    if (type === 'url') {
      if (path === null) return false
      return each(m.shownLinks).some(
        (l) => pathOfHref(l.href) === path && (label ? squashed(l.text) === squashed(label) : !claimed)
      )
    }
    const words = squashed(value)
    return words !== '' && squashed(m.shownText).includes(words)
  }
  const at = each(measures).find(seen)
  return at ? { page: at.path, width: at.width } : null
}

/**
 * A block more than TALLER_THAN_DEMO taller than the same block (page, width and selector) on the untouched demo: a warning, since a
 * long list is legitimate. A block the demo baseline holds no height for says nothing: the host keeps only blocks over two screens,
 * and a baseline measured before it kept them holds none.
 * @param {object[]} measures the written site's
 * @param {{ page: string, width: number, selector: string, height: number }[]} [demoBlocks] the baseline's `blocks`
 */
export function findTallBlocks(measures, demoBlocks = []) {
  const demo = new Map()
  for (const d of each(demoBlocks)) {
    const key = `${pathOfMeasure(d.page)} ${d.width} ${d.selector}`
    if (d.height > 0) demo.set(key, Math.max(demo.get(key) ?? 0, d.height))
  }
  const failures = []
  for (const m of each(measures))
    for (const b of each(m.blocks)) {
      const was = demo.get(`${pathOfMeasure(m.path)} ${m.width} ${b.selector}`)
      if (!was || b.height <= was * (1 + TALLER_THAN_DEMO)) continue
      failures.push({
        page: m.path,
        width: m.width,
        measured: Math.round(b.height),
        reason: `A block is ${Math.round(b.height)} px high, ${Math.round((b.height / was - 1) * 100)}% taller than on the template's demo (${Math.round(was)} px)`,
        selector: b.selector ?? null
      })
    }
  return failures
}

/** A picture drawn in a ratio other than its file's, with nothing to crop it (`object-fit: fill`). */
export function findStretchedPictures(measures) {
  const failures = []
  for (const m of each(measures))
    for (const p of each(m.pictures)) {
      if (p.fit !== 'fill' || !(p.naturalWidth > 0 && p.naturalHeight > 0 && p.width > 0 && p.height > 0))
        continue
      const drawn = p.width / p.height
      const own = p.naturalWidth / p.naturalHeight
      const off = Math.abs(drawn / own - 1)
      if (off <= STRETCH_TOLERANCE) continue
      failures.push({
        page: m.path,
        width: m.width,
        measured: `${Math.round(off * 100)}% off`,
        reason: `A picture is drawn ${p.width}x${p.height} from a ${p.naturalWidth}x${p.naturalHeight} file`,
        selector: p.selector ?? null,
        file: clip(p.src, 160)
      })
    }
  return failures
}

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** The text blocks of one page and width by selector, leaving out a selector the page holds twice: it cannot be matched. */
function uniqueBySelector(list) {
  const seen = new Map()
  for (const b of each(list)) {
    if (typeof b?.selector !== 'string' || !(b.chars >= 0)) continue
    seen.set(b.selector, seen.has(b.selector) ? null : b)
  }
  return seen
}

/** What is wrong with a block's text against the same block on the demo, or null. */
function fillFault(b, was) {
  if (was.chars > TEXT_FILL_DEMO_MIN) {
    const share = b.chars / was.chars
    if (share < TEXT_FILL_MIN || share > TEXT_FILL_MAX)
      return {
        measured: `${b.chars} characters`,
        reason: `A block prints ${b.chars} characters, ${Math.round(share * 100)}% of the ${was.chars} it prints on the template's demo (${TEXT_FILL_MIN * 100}% to ${TEXT_FILL_MAX * 100}% expected)`
      }
  }
  const items = each(b.items)
  const demoItems = each(was.items)
  if (!Array.isArray(b.items) || demoItems.length < 2) return null
  if (items.length <= demoItems.length * LIST_ITEMS_MIN_SHARE)
    return {
      measured: `${items.length} items`,
      reason: `A list shows ${items.length} items where the template's demo shows ${demoItems.length}`
    }
  const now = median(items)
  const then = median(demoItems)
  if (then > 0 && now >= then * LIST_ITEM_LONGER)
    return {
      measured: `median item ${now} characters`,
      reason: `A list's items run ${now} characters (median), ${Math.round((now / then) * 10) / 10} times the template demo's ${then}`
    }
  return null
}

/**
 * A block (page, width and selector, a selector the page holds once) that prints far less or far more text than the same block on
 * the untouched demo, and a list with half the demo's items or items twice as long: warnings, one line per block for the whole run.
 * A block the baseline holds no text for says nothing (a baseline measured before the host read text blocks holds none).
 * @param {object[]} measures the written site's
 * @param {{ page: string, width: number, selector: string, chars: number, items?: number[] }[]} [demoBlocks] the baseline's
 *   `textBlocks`
 */
export function findTextFill(measures, demoBlocks = []) {
  const demo = new Map()
  for (const d of each(demoBlocks)) {
    const key = `${pathOfMeasure(d.page)} ${d.width}`
    if (!demo.has(key)) demo.set(key, [])
    demo.get(key).push(d)
  }
  const said = new Set()
  const failures = []
  for (const m of each(measures)) {
    const was = uniqueBySelector(demo.get(`${pathOfMeasure(m.path)} ${m.width}`))
    if (!was.size) continue
    for (const [selector, b] of uniqueBySelector(m.textBlocks)) {
      const before = was.get(selector)
      if (!b || !before) continue
      const fault = fillFault(b, before)
      const id = `${pathOfMeasure(m.path)} ${selector}`
      if (!fault || said.has(id)) continue
      said.add(id)
      failures.push({ page: m.path, width: m.width, selector, ...fault })
    }
  }
  return failures
}
