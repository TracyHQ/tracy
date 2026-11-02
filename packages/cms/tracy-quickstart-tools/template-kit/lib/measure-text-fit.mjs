// The character limit of every text slot a block shows, measured from its container (read-text-fit.js) on the page
// the block was cut from, at every kit width (nothing is screenshotted): a list row's text, a card field, a section
// title, a tab, a chip or a button label that grows with its words. A slot's limit is the smallest over the widths;
// slot-limits.mjs then gives every place of a slot, and the slots at one place of every list row, one number. A
// slot that shows on more lines somewhere (a title wrapping on another card, as the content map measured the demo)
// may take that many lines everywhere. A slot of several paragraphs or bullets is flowing content and is not filled.
// Writes text-fit.json.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { openFrozen, openKitContext } from './capture.mjs'
import { neutralKey } from './ids.mjs'
import { urlOfPath } from './kit-paths.mjs'
import { assignedAt, indexMap } from './map-index.mjs'
import { readTextFit } from './read-text-fit.js'
import { groupsOf, slotPlaces } from './slot-limits.mjs'
import { partsOf } from './text-format.mjs'

/** The text slot ids each block shows: its own, its demo facts', its list rows' and card fields'. */
function blockTextSlots(kit) {
  const byBlock = new Map()
  for (const b of kit.blocks) byBlock.set(b.id, [...new Set(slotPlaces({ blocks: [b] }).map((p) => p.id))])
  return byBlock
}

/**
 * Per block: the page it is read on, its raw block name and the text slots to fill, with their demo words and the
 * lines each may take per content map viewport (`lines: {desktop, phone}`, the most any slot of its group shows).
 */
export function textFitPlan(kit, capture, map) {
  const desk = String(kit.widths[0])
  const pathOf = new Map(capture.pages.map((p) => [p.slug, p.path]))
  const slotOf = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), s]))
  const find = groupsOf(kit)
  const lines = new Map()
  for (const id of new Set(slotPlaces(kit).map((p) => p.id))) {
    const g = find(id)
    const had = lines.get(g) ?? {}
    for (const [vp, n] of Object.entries(slotOf.get(id)?.fit?.lines ?? {}))
      if (Number.isFinite(n)) had[vp] = Math.max(had[vp] ?? 0, n)
    lines.set(g, had)
  }
  const plan = []
  for (const [blockId, ids] of blockTextSlots(kit)) {
    const at = capture.blocks[blockId]?.widths?.[desk]
    const slug = at?.shotOn ?? at?.pages?.[0]
    if (!slug) continue
    const texts = ids
      .map((id) => ({ id, text: String(slotOf.get(id)?.sample ?? ''), lines: lines.get(find(id)) ?? {} }))
      .filter((t) => t.text.trim() && partsOf(t.text).length === 1)
    if (texts.length)
      plan.push({ blockId, raw: capture.blocks[blockId].source, path: pathOf.get(slug), texts })
  }
  return plan
}

/** The content map viewport a kit width is read as. */
const viewportOf = (width) => (width >= 1000 ? 'desktop' : 'phone')

/**
 * @param {{chromium: object, siteUrl: string, hostHeader?: string, kit: object, capture: object, map: object, out: string, hide?: object, log?: Function}} o
 * @returns {Promise<Record<string, {limit: number, byWidth: Record<string, number>}>>}
 */
export async function measureTextFit({
  chromium,
  siteUrl,
  hostHeader,
  kit,
  capture,
  map,
  out,
  hide,
  log = () => {}
}) {
  const idx = indexMap(map)
  const byPage = new Map()
  for (const job of textFitPlan(kit, capture, map)) {
    if (!byPage.has(job.path)) byPage.set(job.path, [])
    byPage.get(job.path).push(job)
  }
  const result = {}
  const browser = await chromium.launch()
  try {
    for (const width of kit.widths.map(Number)) {
      const ctx = await openKitContext(browser, { width, siteUrl, hostHeader, skip: ['media'] })
      try {
        for (const [path, jobs] of byPage) {
          const opened = await openFrozen(ctx, urlOfPath(path, siteUrl), assignedAt(idx, path), hide, {
            wake: 'quick'
          })
          if (!opened.page) {
            log('text-fit: page failed', path, width, opened.error)
            continue
          }
          try {
            for (const job of jobs) {
              const texts = job.texts.map((t) => ({
                id: t.id,
                text: t.text,
                lines: t.lines[viewportOf(width)]
              }))
              const fit = await opened.page.evaluate(readTextFit, { block: job.raw, texts })
              for (const [id, f] of Object.entries(fit ?? {})) {
                const r = (result[id] ??= { limit: f.limit, byWidth: {} })
                r.byWidth[width] = Math.min(r.byWidth[width] ?? f.limit, f.limit)
                r.limit = Math.min(r.limit, f.limit)
              }
            }
          } finally {
            await opened.page.close().catch(() => {})
          }
        }
      } finally {
        await ctx.close()
      }
      log('text-fit', width, Object.keys(result).length, 'slots measured')
    }
  } finally {
    await browser.close()
  }
  writeFileSync(join(out, 'text-fit.json'), `${JSON.stringify(result, null, 1)}\n`)
  return result
}
