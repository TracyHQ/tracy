// Measure every picture frame of every captured block on the live page, at every width: find it by its picture
// file, read its box, pixels and theme marker, cut a crop of small frames (icon candidates), then empty it (DOM
// only, never the site's database), shoot the block again and judge the layout. A frame repeated by every row
// of a list is emptied in every row at once (`measuredAs: row-slot`); a frame in a tab, slide or accordion is
// revealed first; a picture not in its own block is looked for in the other blocks of the captured pages.
// Writes frame-evidence.json.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { entityOfBlock, pictureOf, slotsOfBlock } from './block-slots.mjs'
import { openFrozen, openKitContext } from './capture.mjs'
import { emptyAndJudge, shoot } from './empty-frame.mjs'
import { neutralKey } from './ids.mjs'
import { urlOfPath } from './kit-paths.mjs'
import { assignedAt, indexMap } from './map-index.mjs'
import { readFrames } from './read-frames.js'
import { revealFrame } from './reveal.js'
import { rowSlotsOf } from './row-slots.mjs'

const CROP_SIDE = 320 // frames this small get a crop of their own, to be classified as icons
const REVEAL_TRIES = 20
const BIG_CROP_H = 1200
let cropAllAt = null // the first width: every frame gets a crop there

/** The frames of every block, by the page each block was first shown on at each width. */
export function framePlan({ capture, map }) {
  const idx = indexMap(map)
  const pathOfSlug = new Map(capture.pages.map((p) => [p.slug, p.path]))
  const plan = []
  for (const rec of Object.values(capture.blocks)) {
    const entity = entityOfBlock(rec, idx, pathOfSlug)
    const { slots } = slotsOfBlock({ rec, entity, idx })
    const frames = slots
      .filter((s) => s.type === 'image' && pictureOf(s))
      .map((s) => ({ id: neutralKey(s.key), path: pictureOf(s) }))
    if (!frames.length) continue
    const rowSlots = rowSlotsOf(slots)
    for (const [w, at] of Object.entries(rec.widths)) {
      const slug = at.pages?.[0] ?? at.hiddenOn?.[0]
      if (slug)
        plan.push({
          width: Number(w),
          path: pathOfSlug.get(slug),
          block: rec.source,
          blockId: rec.id,
          frames,
          rowSlots
        })
    }
  }
  return { plan, idx }
}

/**
 * @param {{chromium: object, siteUrl: string, hostHeader?: string, capture: object, map: object, out: string, hide?: object, inherit?: Map<string, string>, log?: Function}} o
 *   `inherit`: frame id -> the frame on the layout's exemplar page whose emptying stands for it (not emptied again)
 */
export async function measureFrames({
  chromium,
  siteUrl,
  hostHeader,
  capture,
  map,
  out,
  hide,
  inherit = new Map(),
  log = () => {}
}) {
  const { plan, idx } = framePlan({ capture, map })
  const dir = join(out, 'images')
  mkdirSync(dir, { recursive: true })
  const evidence = {}
  const browser = await chromium.launch()
  try {
    cropAllAt = capture.widths[0]
    for (const width of capture.widths) {
      const ctx = await openKitContext(browser, { width, siteUrl, hostHeader })
      const cmp = await ctx.newPage()
      const byPage = new Map()
      for (const job of plan.filter((j) => j.width === width)) {
        if (!byPage.has(job.path)) byPage.set(job.path, [])
        byPage.get(job.path).push(job)
      }
      const missing = new Map() // frames not in their own block: id -> {frame, blockId}
      const visit = async (path, fn) => {
        const opened = await openFrozen(ctx, urlOfPath(path, siteUrl), assignedAt(idx, path), hide)
        if (!opened.page) return log('frames: page failed', width, path, opened.error)
        try {
          await fn(opened.page)
          if (missing.size)
            await findElsewhere({ page: opened.page, path, width, dir, cmp, evidence, missing })
        } finally {
          await opened.page.close().catch(() => {})
        }
      }
      try {
        for (const [path, jobs] of byPage) {
          await visit(path, async (page) => {
            for (const job of jobs)
              await measureBlock({ page, job, width, dir, cmp, evidence, missing, inherit })
          })
          log(
            'frames',
            width,
            path,
            jobs.reduce((n, j) => n + j.frames.length, 0)
          )
        }
        for (const p of capture.pages) {
          if (!missing.size) break
          if (byPage.has(p.path) || !p.widths?.[width]) continue
          await visit(p.path, async () => {})
        }
      } finally {
        await ctx.close()
      }
    }
  } finally {
    await browser.close()
  }
  writeFileSync(join(out, 'frame-evidence.json'), `${JSON.stringify(evidence, null, 1)}\n`)
  return evidence
}

const recOf = (evidence, id, blockId, width, rec) => {
  const ev = (evidence[id] ??= { block: blockId, widths: {} })
  ev.widths[width] = rec
  return rec
}

/** A crop of the frame: of a small one at every width, of a bigger one at the first width only (to look at). */
async function crop({ page, id, m, rec, width, dir }) {
  if (Math.max(m.box.width, m.box.height) > CROP_SIDE && width !== cropAllAt) return
  const pad = 6
  const box = {
    left: m.box.left - pad,
    top: m.box.top - pad,
    width: m.box.width + 2 * pad,
    height: Math.min(m.box.height + 2 * pad, BIG_CROP_H)
  }
  const name = `${id}-crop-${width}.jpg`
  if (await shoot(page, box, join(dir, name), width)) rec.crop = `images/${name}`
}

/** Open a hidden frame the way a visitor would (tab, slide, accordion); its fresh reading, or null. */
async function reveal(page, block, f) {
  for (let attempt = 0; attempt < REVEAL_TRIES; attempt++) {
    const r = await page.evaluate(revealFrame, { id: f.id, attempt })
    if (!r.did) return null
    await page.waitForTimeout(500)
    const m = (await page.evaluate(readFrames, { block, frames: [f] })).frames[f.id]
    if (m?.shown) return { ...m, revealed: r.how }
  }
  return null
}

async function measureBlock({ page, job, width, dir, cmp, evidence, missing, inherit = new Map() }) {
  const read = await page.evaluate(readFrames, { block: job.block, frames: job.frames })
  const inSlot = new Set(job.rowSlots.flatMap((s) => s.ids))
  const later = []
  for (const f of job.frames) {
    // A frame two blocks list (a logo the header and the footer both hold) is measured once, where it was first emptied.
    if (evidence[f.id]?.widths[width]?.hidden) continue
    const m = read.frames[f.id] ?? { found: false }
    if (!m.found) missing.set(f.id, { frame: f, blockId: job.blockId })
    const rec = recOf(evidence, f.id, job.blockId, width, { page: job.path, ...m })
    if (!m.found) continue
    if (!m.shown) {
      later.push(f)
      continue
    }
    await crop({ page, id: f.id, m, rec, width, dir })
    // A frame of a page sharing its layout with the exemplar page takes the exemplar frame's result: not emptied.
    if (inherit.has(f.id)) {
      rec.canHideFrom = inherit.get(f.id)
      continue
    }
    // Emptied and judged in the block that shows it (`host`), which is not always the block that lists it.
    if (!inSlot.has(f.id))
      rec.hidden = await emptyAndJudge({
        page,
        cmp,
        block: m.host ?? job.block,
        ids: [f.id],
        box: m.box,
        width,
        dir
      })
  }
  for (const slot of job.rowSlots) {
    const shown = slot.ids.filter((id) => evidence[id]?.widths[width]?.shown && !inherit.has(id))
    if (!shown.length) continue
    const box = evidence[shown[0]].widths[width].box
    const h = await emptyAndJudge({
      page,
      cmp,
      block: job.block,
      ids: shown,
      box,
      width,
      dir,
      name: shown[0]
    })
    if (h)
      for (const id of shown)
        evidence[id].widths[width].hidden = { ...h, measuredAs: 'row-slot', slot: slot.key }
  }
  for (const f of later) {
    const m = await reveal(page, job.block, f)
    if (!m) continue
    const rec = recOf(evidence, f.id, job.blockId, width, { page: job.path, ...m })
    await crop({ page, id: f.id, m, rec, width, dir })
    if (inherit.has(f.id)) rec.canHideFrom = inherit.get(f.id)
    else
      rec.hidden = await emptyAndJudge({ page, cmp, block: job.block, ids: [f.id], box: m.box, width, dir })
  }
}

/** Frames whose picture is not in their own block, looked for in any block of this page. */
async function findElsewhere({ page, path, width, dir, cmp, evidence, missing }) {
  const frames = [...missing.values()].map((x) => x.frame)
  const read = await page.evaluate(readFrames, { block: null, frames })
  for (const f of frames) {
    const m = read.frames[f.id]
    if (!m?.found || !m.shown) continue
    const { blockId } = missing.get(f.id)
    missing.delete(f.id)
    const rec = recOf(evidence, f.id, blockId, width, { page: path, ...m, measuredIn: m.host })
    await crop({ page, id: f.id, m, rec, width, dir })
    rec.hidden = await emptyAndJudge({ page, cmp, block: m.host, ids: [f.id], box: m.box, width, dir })
  }
}
