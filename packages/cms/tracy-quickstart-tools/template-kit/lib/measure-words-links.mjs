// Two DOM readings per block, on the page the block was cut from at desktop width (nothing is screenshotted):
// the icon every link draws and how (read-words-links.js), and whether each piece of template words (fixed text no
// language string prints) can be taken off: the words are emptied in the DOM, the block's box, text and buttons
// read before and after, and the words put back. Writes words-links.json.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { openFrozen, openKitContext } from './capture.mjs'
import { textShift } from './empty-frame.mjs'
import { urlOfPath } from './kit-paths.mjs'
import { assignedAt, indexMap } from './map-index.mjs'
import { layoutOf } from './read-frames.js'
import { blankWords, readLinkIcons, restoreWords } from './read-words-links.js'

/** The verdict on taking a piece of words off, from what the DOM showed before and after. */
export function judgeWords({ emptied, bareControl, before, after }) {
  if (!emptied) return { canHide: null, reason: 'the words were not found in the block: measurement invalid' }
  if (bareControl) return { canHide: false, reason: 'a link or a button would be left with no words' }
  const shift = textShift(before, after)
  const heightChange = (after?.block?.height ?? 0) - (before?.block?.height ?? 0)
  if (shift.overlaps)
    return { canHide: false, reason: `${shift.overlaps} pairs of text or buttons now overlap` }
  return {
    canHide: true,
    reason:
      heightChange || shift.moved
        ? 'the words leave and the block closes up around them'
        : 'the words leave and nothing else moves'
  }
}

/** Per block: the page it is read on, its raw block name and the plain fixed texts to measure. */
export function wordsLinksPlan(kit, capture) {
  const desk = String(kit.widths[0])
  const pathOf = new Map(capture.pages.map((p) => [p.slug, p.path]))
  const plan = []
  for (const b of kit.blocks) {
    const at = capture.blocks[b.id]?.widths?.[desk]
    const slug = at?.shotOn ?? at?.pages?.[0]
    if (!slug) continue
    const words = (b.fixedText ?? []).filter((t) => !t.source?.constant).map((t) => t.text)
    if (!words.length && !(b.links ?? []).length) continue
    plan.push({ blockId: b.id, raw: capture.blocks[b.id].source, path: pathOf.get(slug), words })
  }
  return plan
}

/**
 * @param {{chromium: object, siteUrl: string, hostHeader?: string, kit: object, capture: object, map: object, out: string, hide?: object, log?: Function}} o
 */
export async function measureWordsLinks({
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
  const result = { links: {}, iconProbes: {}, words: {} }
  const byPage = new Map()
  for (const job of wordsLinksPlan(kit, capture)) {
    if (!byPage.has(job.path)) byPage.set(job.path, [])
    byPage.get(job.path).push(job)
  }
  const browser = await chromium.launch()
  try {
    const ctx = await openKitContext(browser, {
      width: Number(kit.widths[0]),
      siteUrl,
      hostHeader,
      skip: ['image', 'media']
    })
    for (const [path, jobs] of byPage) {
      const opened = await openFrozen(ctx, urlOfPath(path, siteUrl), assignedAt(idx, path), hide, {
        wake: 'quick'
      })
      if (!opened.page) {
        log('words-links: page failed', path, opened.error)
        continue
      }
      const page = opened.page
      try {
        for (const job of jobs) {
          const icons = await page.evaluate(readLinkIcons, { block: job.raw })
          if (icons) {
            result.links[job.blockId] = icons.links
            if (icons.probe) result.iconProbes[job.blockId] = icons.probe
          }
          for (const text of job.words) {
            const before = await page.evaluate(layoutOf, { block: job.raw })
            let verdict
            try {
              const r = await page.evaluate(blankWords, { block: job.raw, text })
              await page.waitForTimeout(100)
              const after = await page.evaluate(layoutOf, { block: job.raw })
              verdict = judgeWords({ ...r, before, after })
              const shift = textShift(before, after)
              verdict.evidence = {
                emptied: r.emptied,
                blockBefore: before?.block ?? null,
                blockAfter: after?.block ?? null,
                heightChange: (after?.block?.height ?? 0) - (before?.block?.height ?? 0),
                textMoved: shift.moved,
                textOverlaps: shift.overlaps
              }
            } finally {
              await page.evaluate(restoreWords)
            }
            ;(result.words[job.blockId] ??= {})[text] = { ...verdict, page: path, measuredBy: 'dom' }
          }
        }
      } finally {
        await page.close().catch(() => {})
      }
      log(
        'words-links',
        path,
        jobs.reduce((n, j) => n + j.words.length, 0),
        'words'
      )
    }
    await ctx.close()
  } finally {
    await browser.close()
  }
  writeFileSync(join(out, 'words-links.json'), `${JSON.stringify(result, null, 1)}\n`)
  return result
}
