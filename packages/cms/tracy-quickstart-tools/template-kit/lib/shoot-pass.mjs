// The SHOOT pass: only what the pack holds. From the kit assembled on the read pass (pages grouped by layout, each
// group's representative chosen, body blocks of one layout pointing at one exemplar with `shotOf`), the plan names
// per width the pages whose full-page shot is packed (every group's representative) and, for every block id that
// has no `shotOf`, the one page it is cut from (a representative showing it first, so one screenshot gives both,
// then the page covering the most blocks still to cut). Then each planned page is loaded once for all its widths.
import { join } from 'node:path'

import { openFrozen, openKitContext, shootOpened } from './capture.mjs'
import { findBlocks, freezeFloating } from './find-blocks.js'
import { blockIdOf, pageIdOf } from './ids.mjs'
import { urlOfPath } from './kit-paths.mjs'
import { assignedAt, indexMap } from './map-index.mjs'
import { representativeOf } from './pack.mjs'

export const keepSkeleton = (fresh, read) =>
  fresh ? (read?.skeleton != null ? { ...fresh, skeleton: read.skeleton } : fresh) : read

/**
 * @param {object} kit assembled from the read pass (pages, pageGroups, blocks with `shotOf`)
 * @param {object} capture the read pass's capture index
 * @returns {Record<string, Record<string, {full: boolean, blocks: string[]}>>} width -> page slug -> what to shoot
 */
export function shootPlan(kit, capture) {
  const pageById = new Map(kit.pages.map((p) => [p.id, p]))
  const slugOfId = new Map(capture.pages.map((p) => [pageIdOf(p.slug), p.slug]))
  const reps = new Set(
    (kit.pageGroups ?? [])
      .map((g) => representativeOf(g, pageById)?.page)
      .filter(Boolean)
      .map((id) => slugOfId.get(id))
  )
  const stands = new Set(kit.blocks.filter((b) => !b.shotOf).map((b) => b.id))
  const plan = {}
  for (const w of capture.widths.map(String)) {
    const at = (plan[w] = {})
    const want = (slug) => (at[slug] ??= { full: false, blocks: [] })
    for (const slug of reps)
      if (capture.pages.find((p) => p.slug === slug)?.widths?.[w]) want(slug).full = true
    const todo = new Map()
    for (const rec of Object.values(capture.blocks))
      if (stands.has(rec.id) && rec.widths[w]?.pages?.length) todo.set(rec.id, rec.widths[w].pages)
    const take = (slug) => {
      for (const [id, pages] of todo)
        if (pages.includes(slug)) {
          want(slug).blocks.push(id)
          todo.delete(id)
        }
    }
    for (const slug of reps) take(slug)
    while (todo.size) {
      const count = new Map()
      for (const pages of todo.values()) for (const s of pages) count.set(s, (count.get(s) ?? 0) + 1)
      const [best] = [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]
      take(best)
    }
  }
  return plan
}

/**
 * Shoot the plan into `<out>/images` and fold the files into `capture` (in place): a page's `full`, a block's
 * `image`, its box and details read again on the page it was cut from (`shotOn`), so the crop and its reading match.
 * A page wanted at several widths is loaded once, at the widest, and resized for the others; a block the resized
 * page does not show is shot again on a page loaded at that width.
 */
export async function shootPages({ chromium, siteUrl, hostHeader, map, out, capture, plan, hide, log }) {
  const idx = indexMap(map)
  const dir = join(out, 'images')
  const pageOf = new Map(capture.pages.map((p) => [p.slug, p]))
  const widths = Object.keys(plan)
    .map(Number)
    .sort((a, b) => b - a)
  const slugs = [...new Set(widths.flatMap((w) => Object.keys(plan[w])))]
  let shots = 0
  const browser = await chromium.launch()
  const ctxs = new Map()
  const ctxOf = async (w) => {
    if (!ctxs.has(w)) ctxs.set(w, await openKitContext(browser, { width: w, siteUrl, hostHeader }))
    return ctxs.get(w)
  }
  const fold = (slug, w, r, job) => {
    const page = pageOf.get(slug)
    const left = new Set(job.blocks)
    if (job.full && r.fullName) {
      page.widths[w].full = `images/${r.fullName}`
      page.widths[w].truncated = r.truncated || undefined
      shots++
    }
    for (const b of r.blocks) {
      if (!b.file) continue
      const id = blockIdOf(b.block, slug)
      left.delete(id)
      Object.assign(capture.blocks[id].widths[w], {
        image: `images/${b.file}`,
        box: { width: b.width, height: b.height },
        // Read again on the page it was cut from, but the skeleton stays the read pass's: layouts were decided
        // from it, and a skeleton read with pictures loaded must not split a layout after its shots were planned.
        details: keepSkeleton(r.details?.[b.block], capture.blocks[id].widths[w].details),
        shotOn: slug
      })
      shots++
    }
    return left
  }
  const shootAt = async (ctx, page, opened, slug, w, job) => {
    const wanted = new Set(job.blocks)
    const fullName = job.full ? `${pageIdOf(slug)}-${w}.jpg` : null
    const r = await shootOpened({
      ctx,
      page,
      blocks: opened.blocks,
      docHeight: opened.docHeight,
      width: w,
      dir,
      fullName,
      fileOf: (b) => (wanted.has(blockIdOf(b.block, slug)) ? `${blockIdOf(b.block, slug)}-${w}.jpg` : null)
    })
    return fold(slug, w, { ...r, fullName }, job)
  }
  try {
    for (const slug of slugs) {
      const page = pageOf.get(slug)
      const at = widths.filter((w) => plan[w][slug])
      const ctx = await ctxOf(at[0])
      const opened = await openFrozen(ctx, urlOfPath(page.path, siteUrl), assignedAt(idx, page.path), hide)
      if (!opened.page) {
        capture.failures.push({ path: page.path, width: at[0], status: opened.status, error: opened.error })
        log('shot failed', page.path, opened.error)
        continue
      }
      const again = []
      try {
        for (const [n, w] of at.entries()) {
          let found = opened
          if (n > 0) {
            await opened.page.setViewportSize({ width: w, height: 900 })
            await opened.page.waitForTimeout(400)
            await opened.page.evaluate(freezeFloating)
            found = await opened.page.evaluate(findBlocks, assignedAt(idx, page.path) ?? [])
          }
          const left = await shootAt(ctx, opened.page, found, slug, w, plan[w][slug])
          if (left.size || (plan[w][slug].full && !page.widths[w].full))
            again.push({ w, job: { full: plan[w][slug].full && !page.widths[w].full, blocks: [...left] } })
        }
      } finally {
        await opened.page.close().catch(() => {})
      }
      // What the resized page did not show is shot on a page loaded at its own width.
      for (const { w, job } of again) {
        const c = await ctxOf(w)
        const o2 = await openFrozen(c, urlOfPath(page.path, siteUrl), assignedAt(idx, page.path), hide)
        if (!o2.page) continue
        try {
          await shootAt(c, o2.page, o2, slug, w, job)
        } finally {
          await o2.page.close().catch(() => {})
        }
      }
      log(
        'shot',
        page.path,
        at.join('+'),
        again.length ? `(again at ${again.map((x) => x.w).join(',')})` : ''
      )
    }
  } finally {
    for (const c of ctxs.values()) await c.close().catch(() => {})
    await browser.close()
  }
  return { shots }
}
