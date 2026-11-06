// The whole-row limit of the main menu: how many characters its top-level labels hold when all are filled together
// (read-row-fit.js), at the kit's wide width and at every narrower width down to where the menu still shows as one
// row (below it the menu folds into an off-canvas button). The row's limit is the smallest over those widths, and
// the narrowest width it was read at is named. Nothing is screenshotted. Writes row-fit.json:
// `{[navigationGroupId]: {maxCharacters, byWidth, narrowest, labels}}`.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { openFrozen, openKitContext } from './capture.mjs'
import { neutralKey } from './ids.mjs'
import { urlOfPath } from './kit-paths.mjs'
import { assignedAt, indexMap } from './map-index.mjs'
import { readRowFit } from './read-row-fit.js'

// Widths read for the row, widest first; the walk stops at the first width where the row no longer shows.
const ROW_WIDTHS = [1440, 1366, 1280, 1200, 1100, 1024, 992, 900, 820, 768]

/** The main menu group (the menu the header's links come from) and its top-level labels' demo words. */
export function rowFitPlan(kit, capture, map) {
  const header = kit.blocks.find((b) => b.id === 'header')
  const menu = (header?.links ?? []).find((l) => l.menu)?.menu
  const group = (kit.site?.navigationGroups ?? []).find((g) => menu && g.block === neutralKey(menu))
  if (!group) return null
  const sampleOf = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), s.sample]))
  const top = (group.items ?? []).filter((it) => it.level === 1 && it.labelSlot)
  const labels = top.map((it) => String(sampleOf.get(it.labelSlot) ?? it.label ?? ''))
  const at = capture.blocks.header?.widths?.[String(kit.widths[0])]
  const slug = at?.shotOn ?? at?.pages?.[0]
  const path = capture.pages.find((p) => p.slug === slug)?.path
  if (!path || !labels.length) return null
  return {
    groupId: group.id,
    raw: capture.blocks.header.source,
    path,
    labels,
    slots: top.map((it) => it.labelSlot)
  }
}

/**
 * @param {{chromium: object, siteUrl: string, hostHeader?: string, kit: object, capture: object, map: object, out: string, hide?: object, log?: Function}} o
 */
export async function measureRowFit({
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
  const job = rowFitPlan(kit, capture, map)
  const result = {}
  if (job) {
    const idx = indexMap(map)
    const byWidth = {}
    const browser = await chromium.launch()
    try {
      for (const width of ROW_WIDTHS) {
        const ctx = await openKitContext(browser, { width, siteUrl, hostHeader, skip: ['media'] })
        try {
          const opened = await openFrozen(
            ctx,
            urlOfPath(job.path, siteUrl),
            assignedAt(idx, job.path),
            hide,
            {
              wake: 'quick'
            }
          )
          if (!opened.page) {
            log('row-fit: page failed', job.path, width, opened.error)
            break
          }
          const r = await opened.page.evaluate(readRowFit, { block: job.raw, labels: job.labels })
          await opened.page.close().catch(() => {})
          if (!r?.shown) break
          byWidth[width] = r.total
        } finally {
          await ctx.close()
        }
      }
    } finally {
      await browser.close()
    }
    const widths = Object.keys(byWidth).map(Number)
    if (widths.length)
      result[job.groupId] = {
        maxCharacters: Math.min(...Object.values(byWidth)),
        byWidth,
        narrowest: Math.min(...widths),
        labels: job.slots
      }
    log('row-fit', job.groupId, JSON.stringify(result[job.groupId] ?? null))
  }
  writeFileSync(join(out, 'row-fit.json'), `${JSON.stringify(result, null, 1)}\n`)
  return result
}
