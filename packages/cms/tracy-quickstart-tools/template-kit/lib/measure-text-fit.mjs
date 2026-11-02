// The character limit of every text slot in a list row, measured from its frame (read-text-fit.js) on the page the
// block was cut from, at every kit width (nothing is screenshotted). A slot's limit is the smallest over the widths;
// text-limits.mjs then gives each slot kind of a list the smallest over its rows. Writes text-fit.json.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { openFrozen, openKitContext } from './capture.mjs'
import { neutralKey } from './ids.mjs'
import { urlOfPath } from './kit-paths.mjs'
import { assignedAt, indexMap } from './map-index.mjs'
import { readTextFit } from './read-text-fit.js'

/** The text slots of a block's lists: each row's own, and each card field's items. */
function listTextSlots(block) {
  const ids = new Set()
  for (const l of block.lists ?? []) {
    for (const r of l.rows ?? []) for (const s of r.slots ?? []) if (s.type === 'text') ids.add(s.id)
    for (const f of l.rowSlots ?? [])
      if (f.type === 'text') for (const s of f.slots ?? []) if (s?.id) ids.add(s.id)
  }
  return [...ids]
}

/** Per block: the page it is read on, its raw block name and the text slots to fill, with their demo words. */
export function textFitPlan(kit, capture, map) {
  const desk = String(kit.widths[0])
  const pathOf = new Map(capture.pages.map((p) => [p.slug, p.path]))
  const sampleOf = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), s.sample]))
  const plan = []
  for (const b of kit.blocks) {
    const at = capture.blocks[b.id]?.widths?.[desk]
    const slug = at?.shotOn ?? at?.pages?.[0]
    if (!slug) continue
    const texts = listTextSlots(b)
      .map((id) => ({ id, text: String(sampleOf.get(id) ?? '') }))
      .filter((t) => t.text.trim())
    if (texts.length)
      plan.push({ blockId: b.id, raw: capture.blocks[b.id].source, path: pathOf.get(slug), texts })
  }
  return plan
}

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
              const fit = await opened.page.evaluate(readTextFit, { block: job.raw, texts: job.texts })
              for (const [id, f] of Object.entries(fit ?? {})) {
                const r = (result[id] ??= { limit: f.limit, byWidth: {} })
                r.byWidth[width] = f.limit
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
