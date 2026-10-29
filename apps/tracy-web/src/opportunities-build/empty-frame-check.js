/**
 * The final check of emptied frames (COO decision, spec TracyHQ/tracy#189 items 14 and 15): no frame a visitor sees prints
 * empty. A fact row whose label and value were emptied still prints its box and the template's icon (a diamond drawn by
 * CSS, so a text check never sees it); a card taken off its list still prints its frame. The build hides each such frame
 * from the head block (`empty-frames.js`, by a selector of the page's own structure); this check reads every served page,
 * finds its empty frames by the same rules, and reports each one the page's Tracy head block does not hide.
 *
 * Framework-wide (Joomla T3/T4, WordPress, EmDash pages alike), never one template's: the frames are read from the served
 * HTML and the hiding rules from the page's own `data-tracy-*` style blocks. Pure: pages in, findings out.
 *
 * A band that lost its working parts and kept only a logo or an icon beside their emptied column (#189 item 30) is
 * reported as `lone-decoration-band` when the head block does not hide it: the band was meant to come off whole.
 */
import { emptyFramesOf } from '../sites/brief-engines/empty-frames.js'

/** The text of the page's Tracy style blocks (the leftovers head block, wherever the template prints it). */
const tracyCss = (/** @type {string} */ html) =>
  [...String(html).matchAll(/<style\b[^>]*\bdata-tracy[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join('\n')

/**
 * @param {{pages: Array<{path: string, status?: number, html: string}>}} input
 * @returns {Array<{kind: 'empty-frame' | 'lone-decoration-band', severity: 'major', page: string, found: string, why: string}>}
 */
export function checkEmptyFrames({ pages }) {
  const out = []
  // Only a site the build wrote its frame net on is judged (a brief build): a plain demo build keeps the demo's frames.
  if (!(pages ?? []).some((page) => /<style\b[^>]*\bdata-tracy-leftovers\b/i.test(String(page.html ?? ''))))
    return out
  for (const page of pages ?? []) {
    if (page.status !== undefined && page.status !== 200) continue
    const css = tracyCss(page.html)
    const { hide, tiles, bands = [] } = emptyFramesOf(page.html)
    for (const selector of bands) {
      if (css.includes(selector)) continue
      out.push({
        kind: 'lone-decoration-band',
        severity: 'major',
        page: page.path,
        found: selector,
        why: `A band shows only a logo or an icon beside the empty place of what was taken off on ${page.path}`
      })
    }
    for (const selector of [...hide, ...tiles.map((t) => t.selector)]) {
      if (css.includes(selector)) continue
      out.push({
        kind: 'empty-frame',
        severity: 'major',
        page: page.path,
        found: selector,
        why: `An empty frame (a fact row, a card or a box with no words left) is shown on ${page.path}`
      })
    }
  }
  return out
}
