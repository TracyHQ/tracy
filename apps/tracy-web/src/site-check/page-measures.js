// Measures the site check adds to the host's own: dead links, text that overflows its box, blocks far taller than a screen
// and pictures drawn out of shape. Each is a pure function of what the host read in its browser (`pageMeasures`, one entry per
// kept page and width), so each is tested on invented pages. The host's answer carries:
//   { path, width, links: [{ href, text, status }],
//     textBoxes: [{ selector, text, boxWidth, boxHeight, contentWidth, contentHeight, clips, right }],
//     blocks: [{ selector, height }],
//     pictures: [{ selector, src, naturalWidth, naturalHeight, width, height, fit }],
//     controls: [{ selector, fault: 'wordless' | 'nowhere', href, text }], fields: [{ selector, name }],
//     glued: [{ selector, text, around }], headings: [text], mainHeadings: [text], shownText,
//     shownLinks: [{ href, text }], shownPictures: [src] }

/** A box counts as overflowed only past this many pixels, so rounding in the browser is no finding. */
export const OVERFLOW_TOLERANCE_PX = 2
/** A block taller than this many screens of its width is unusual. At 390 a screen is 844 px high, at 1440 it is 900. */
export const TALL_SCREENS = 3
export const SCREEN_HEIGHT = { 1440: 900, 390: 844 }
/** A picture drawn with its width and height ratio this far from the file's own is stretched (fit `fill` only). */
export const STRETCH_TOLERANCE = 0.1

const each = (value) => (Array.isArray(value) ? value : [])
const clip = (text, n = 120) => String(text ?? '').slice(0, n)

/** A link answered with an error status, or none at all. A redirect is not dead. */
const dead = (status) =>
  status === null || status === undefined || Number(status) >= 400 || Number(status) === 0

/**
 * Pages the host could not open, and links on the pages that lead nowhere.
 * @param {{ path: string, status: number | null, skipped?: string }[]} visited the kept pages the host opened
 * @param {object[]} measures
 */
export function findDeadLinks(visited, measures) {
  const failures = []
  for (const v of each(visited))
    if (v.skipped === 'not found' || (v.status !== null && v.status !== undefined && v.status >= 400))
      failures.push({
        page: v.path,
        measured: v.status ?? v.skipped,
        reason: `A kept page does not answer (${v.status ?? v.skipped})`
      })
  const seen = new Set()
  for (const m of each(measures))
    for (const link of each(m.links)) {
      if (!dead(link.status)) continue
      const id = `${m.path} ${link.href}`
      if (seen.has(id)) continue
      seen.add(id)
      failures.push({
        page: m.path,
        measured: link.status ?? 'no answer',
        reason: `A link to ${clip(link.href, 100)} (${clip(link.text, 40) || 'no words'}) answers ${link.status ?? 'nothing'}`
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
        selector: c.selector
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
 * Where a visitor sees a stored value, or null. Words are read in the page's rendered text, a picture among its shown pictures, an
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
      return each(m.shownPictures).some((src) => decodeURI(String(src)).includes(file))
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

/** A block more than TALL_SCREENS screens high at its width: a warning, since a long list is legitimate. */
export function findTallBlocks(measures) {
  const failures = []
  for (const m of each(measures)) {
    const limit = (SCREEN_HEIGHT[m.width] ?? 900) * TALL_SCREENS
    for (const b of each(m.blocks))
      if (b.height > limit)
        failures.push({
          page: m.path,
          width: m.width,
          measured: Math.round(b.height),
          reason: `A block is ${Math.round(b.height)} px high, over ${TALL_SCREENS} screens (${limit} px)`,
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
