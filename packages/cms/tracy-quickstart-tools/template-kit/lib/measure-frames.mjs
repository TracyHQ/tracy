// Measure every picture frame of every captured block on the live page, at every width: find it by its picture
// file, read its box, pixels and theme marker, then empty it (DOM only, never the site's database) and judge the
// block from its DOM (empty-frame.mjs). Nothing is screenshotted. A frame repeated by every row
// of a list is emptied in every row at once (`measuredAs: row-slot`); a frame in a tab, slide or accordion is
// revealed first; a picture not in its own block is looked for in the other blocks of the captured pages. At the
// first width, before anything is emptied, every list row's picture also records the card it prints in and the
// block's text slots shown inside that card (`rowCard`, read-row-cards.js; row-pairs.mjs writes it on the rows).
// Writes frame-evidence.json.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { entityOfBlock, pictureOf, slotsOfBlock } from './block-slots.mjs'
import { openFrozen, openKitContext } from './capture.mjs'
import { emptyAndJudge } from './empty-frame.mjs'
import { neutralKey } from './ids.mjs'
import { urlOfPath } from './kit-paths.mjs'
import { assignedAt, indexMap } from './map-index.mjs'
import { readFrames } from './read-frames.js'
import { readRowCards } from './read-row-cards.js'
import { revealFrame } from './reveal.js'
import { rowSlotsOf } from './row-slots.mjs'
import { partsOf } from './text-format.mjs'

const REVEAL_TRIES = 20

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
      .map((s) => ({ id: neutralKey(s.key), path: pictureOf(s), row: s.group?.id ?? null }))
    if (!frames.length) continue
    const rowSlots = rowSlotsOf(slots)
    // The block's text slots by their shown words (a slot of several paragraphs by its first), for the row cards.
    const texts = slots
      .filter((s) => s.type === 'text')
      .map((s) => ({ id: neutralKey(s.key), text: partsOf(s.sample)[0]?.text ?? '' }))
      .filter((t) => t.text.trim())
    for (const [w, at] of Object.entries(rec.widths)) {
      const slug = at.shotOn ?? at.pages?.[0] ?? at.hiddenOn?.[0]
      if (slug)
        plan.push({
          width: Number(w),
          path: pathOfSlug.get(slug),
          block: rec.source,
          blockId: rec.id,
          frames,
          rowSlots,
          texts
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
  const evidence = {}
  const browser = await chromium.launch()
  try {
    for (const width of capture.widths) {
      const ctx = await openKitContext(browser, { width, siteUrl, hostHeader })
      const byPage = new Map()
      for (const job of plan.filter((j) => j.width === width)) {
        if (!byPage.has(job.path)) byPage.set(job.path, [])
        byPage.get(job.path).push(job)
      }
      const missing = new Map() // frames not in their own block: id -> {frame, blockId}
      const visit = async (path, fn) => {
        const opened = await openFrozen(ctx, urlOfPath(path, siteUrl), assignedAt(idx, path), hide, {
          wake: 'quick'
        })
        if (!opened.page) return log('frames: page failed', width, path, opened.error)
        try {
          await fn(opened.page)
          if (missing.size) await findElsewhere({ page: opened.page, path, width, evidence, missing })
        } finally {
          await opened.page.close().catch(() => {})
        }
      }
      try {
        for (const [path, jobs] of byPage) {
          await visit(path, async (page) => {
            for (const job of jobs)
              await measureBlock({
                page,
                job,
                width,
                evidence,
                missing,
                inherit,
                pair: width === capture.widths[0]
              })
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

/** Open a hidden frame the way a visitor would (tab, slide, accordion); its fresh reading, or null. */
async function reveal(page, block, f) {
  for (let attempt = 0; attempt < REVEAL_TRIES; attempt++) {
    const r = await page.evaluate(revealFrame, { id: f.id, attempt })
    if (!r.did) return null
    await page.waitForTimeout(500)
    const m = (await page.evaluate(readFrames, { block, frames: [f] })).frames[f.id]
    if (!m?.shown) continue
    // A slide shows while it still moves in: read it again once the transition has ended.
    await page.waitForTimeout(1000)
    const settled = (await page.evaluate(readFrames, { block, frames: [f] })).frames[f.id]
    return { ...(settled?.shown ? settled : m), revealed: r.how }
  }
  return null
}

async function measureBlock({ page, job, width, evidence, missing, inherit = new Map(), pair = false }) {
  const read = await page.evaluate(readFrames, { block: job.block, frames: job.frames })
  // Read while every frame still shows: the card each list row's picture prints in (row-pairs.mjs).
  const rowFrames = job.frames.filter((f) => f.row).map((f) => ({ id: f.id, row: f.row }))
  const cards =
    pair && rowFrames.length
      ? await page.evaluate(readRowCards, { block: job.block, frames: rowFrames, texts: job.texts ?? [] })
      : {}
  const inSlot = new Set(job.rowSlots.flatMap((s) => s.ids))
  const later = []
  for (const f of job.frames) {
    // A frame two blocks list (a logo the header and the footer both hold) is measured once, where it was first emptied.
    if (evidence[f.id]?.widths[width]?.hidden) continue
    const m = read.frames[f.id] ?? { found: false }
    if (!m.found) missing.set(f.id, { frame: f, blockId: job.blockId })
    const rec = recOf(evidence, f.id, job.blockId, width, {
      page: job.path,
      ...m,
      ...(cards[f.id] ? { rowCard: cards[f.id] } : {})
    })
    if (!m.found) continue
    if (!m.shown) {
      later.push(f)
      continue
    }
    // A frame of a page sharing its layout with the exemplar page takes the exemplar frame's result: not emptied.
    if (inherit.has(f.id)) {
      rec.canHideFrom = inherit.get(f.id)
      continue
    }
    // Emptied and judged in the block that shows it (`host`), which is not always the block that lists it.
    if (!inSlot.has(f.id)) rec.hidden = await emptyAndJudge({ page, block: m.host ?? job.block, ids: [f.id] })
  }
  for (const slot of job.rowSlots) {
    const shown = slot.ids.filter((id) => evidence[id]?.widths[width]?.shown && !inherit.has(id))
    if (!shown.length) continue
    const h = await emptyAndJudge({ page, block: job.block, ids: shown })
    if (h)
      for (const id of shown)
        evidence[id].widths[width].hidden = { ...h, measuredAs: 'row-slot', slot: slot.key }
  }
  for (const f of later) {
    const m = await reveal(page, job.block, f)
    if (!m) continue
    const rec = recOf(evidence, f.id, job.blockId, width, { page: job.path, ...m })
    if (inherit.has(f.id)) rec.canHideFrom = inherit.get(f.id)
    else rec.hidden = await emptyAndJudge({ page, block: job.block, ids: [f.id] })
  }
}

/**
 * Frames whose picture is not in their own block, looked for in any block of this page, then in the page region
 * that holds it when no block does (a logo the template's own footer layout prints).
 */
async function findElsewhere({ page, path, width, evidence, missing }) {
  const frames = [...missing.values()].map((x) => x.frame)
  const read = await page.evaluate(readFrames, { block: null, frames, anywhere: true })
  for (const f of frames) {
    const m = read.frames[f.id]
    if (!m?.found || !m.shown) continue
    const { blockId } = missing.get(f.id)
    missing.delete(f.id)
    const rec = recOf(evidence, f.id, blockId, width, { page: path, ...m, measuredIn: m.host })
    rec.hidden = await emptyAndJudge({ page, block: m.host, ids: [f.id] })
  }
}
