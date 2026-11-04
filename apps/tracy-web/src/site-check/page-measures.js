// Measures the site check adds to the host's own: dead links, text that overflows its box, blocks far taller than a screen
// and pictures drawn out of shape. Each is a pure function of what the host read in its browser (`pageMeasures`, one entry per
// kept page and width), so each is tested on invented pages. The host's answer carries:
//   { path, width, links: [{ href, text, status }],
//     textBoxes: [{ selector, text, boxWidth, boxHeight, contentWidth, contentHeight, clips, right }],
//     blocks: [{ selector, height }],
//     pictures: [{ selector, src, naturalWidth, naturalHeight, width, height, fit }] }

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
