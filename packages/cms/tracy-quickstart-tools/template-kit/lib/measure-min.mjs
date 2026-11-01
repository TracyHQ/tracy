// The measured minimum of one list: on the live page, remove rows from the DOM one at a time (from the last),
// shoot the block at every width for every count, and check the layout of what is left. Read-only on the
// site: rows are removed in the browser only, never in the site's database.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { cropBox, cutImages, openFrozen, openKitContext, shootPng } from './capture.mjs'
import { tryRowFix } from './row-fix.js'
import { layoutCheck, matchRepeat, minOfCounts } from './rows.mjs'
import { readDetails } from './read-details.js'

/** Runs INSIDE the page: keep the first `keep` rows of the set, remove the rest, return the boxes left. */
export function keepRows({ block, path, shape, css, keep }) {
  const STATE = /^(active|show|current|selected|in|fade|is-|swiper-slide-|owl-|slick-|aos-)|^[a-z]+-\d+$/
  const sig = (el) =>
    `${el.tagName}.${[...el.classList]
      .filter((c) => !STATE.test(c))
      .sort()
      .join('.')}`
  const root = document.querySelector(`[data-kit-block="${block}"]`)
  if (!root) return null
  let rows
  if (css) rows = [...root.querySelectorAll(css)]
  else {
    let parent = root
    for (const i of path) parent = parent?.children[i]
    if (!parent) return null
    rows = [...parent.children].filter((c) => sig(c) === shape)
  }
  for (const r of rows.slice(keep)) r.remove()
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return {
      left: Math.round(r.left + window.scrollX),
      top: Math.round(r.top + window.scrollY),
      width: Math.round(r.width),
      height: Math.round(r.height)
    }
  }
  const left = rows.slice(0, keep)
  const container = left[0]?.parentElement ?? root
  return {
    rows: left.map(box).filter((b) => b.width > 0 && b.height > 0),
    container: box(container),
    block: box(root),
    total: rows.length
  }
}

/**
 * @param {{chromium: object, siteUrl: string, hostHeader?: string, url: string, assigned: object[], source: string, listId: string, max: number, css?: string, repeat?: {path: number[], shape: string}, widths: number[], out: string, note?: string, hide?: object}} o
 */
export async function measureMin({
  chromium,
  siteUrl,
  hostHeader,
  url,
  assigned,
  source,
  listId,
  max,
  css,
  widths,
  out,
  note,
  repeat: given,
  hide
}) {
  mkdirSync(join(out, 'images'), { recursive: true })
  const browser = await chromium.launch()
  const images = {}
  const checks = {}
  let repeat = given ?? null
  const centered = {}
  let fix = null
  try {
    for (const width of widths) {
      const ctx = await openKitContext(browser, { width, siteUrl, hostHeader })
      try {
        for (let keep = max; keep >= 1; keep--) {
          const opened = await openFrozen(ctx, url, assigned, hide)
          if (!opened.page) throw new Error(`${url}: ${opened.error}`)
          const { page } = opened
          try {
            if (!css && !repeat) {
              repeat = matchRepeat((await page.evaluate(readDetails))[source]?.repeats, max)
              if (!repeat) throw new Error(`no row set of ${max} rows in ${source}; pass --rows <css>`)
            }
            const left = await page.evaluate(keepRows, {
              block: source,
              path: repeat?.path ?? [],
              shape: repeat?.shape,
              css,
              keep
            })
            if (!left) throw new Error(`block ${source} not found on ${url}`)
            if (left.total !== max) throw new Error(`expected ${max} rows in ${source}, found ${left.total}`)
            await page.waitForTimeout(300)
            const after = await page.evaluate(keepRows, {
              block: source,
              path: repeat?.path ?? [],
              shape: repeat?.shape,
              css,
              keep
            })
            const height = await page.evaluate(() => document.documentElement.scrollHeight)
            const png = await shootPng(page, width, Math.min(height, 16000))
            const name = `${listId}-min-${keep}-${width}.jpg`
            const c = cropBox(after.block, width, Math.min(height, 16000))
            if (c) await cutImages(ctx, png, [{ name, ...c }], join(out, 'images'))
            ;(images[keep] ??= {})[width] = `images/${name}`
            const check = layoutCheck(after.rows, after.container)
            ;(checks[keep] ??= {})[width] = check
            if (check.leftPacked) {
              // The trial of the centering fix: inject it, read the rows again, shoot the block.
              const args = { block: source, path: repeat?.path ?? [], shape: repeat?.shape, css }
              const tried = await page.evaluate(tryRowFix, args)
              if (tried) {
                await page.waitForTimeout(200)
                const again = await page.evaluate(keepRows, { ...args, keep })
                const fixed = layoutCheck(again.rows, again.container)
                const cname = `${listId}-centered-${keep}-${width}.jpg`
                const c2 = cropBox(again.block, width, Math.min(height, 16000))
                if (c2)
                  await cutImages(
                    ctx,
                    await shootPng(page, width, Math.min(height, 16000)),
                    [{ name: cname, ...c2 }],
                    join(out, 'images')
                  )
                ;(centered[keep] ??= {})[width] = {
                  ok: fixed.ok,
                  reason: fixed.reason,
                  gap: check.gap,
                  image: `images/${cname}`
                }
                fix ??= {
                  selector: tried.selector,
                  display: tried.display,
                  rule: tried.rule,
                  matches: tried.matches
                }
              }
            }
          } finally {
            await page.close().catch(() => {})
          }
        }
      } finally {
        await ctx.close()
      }
    }
  } finally {
    await browser.close()
  }
  const okCounts = Object.keys(checks)
    .map(Number)
    .filter((n) => widths.every((w) => checks[n][w]?.ok))
    .sort((a, b) => a - b)
  // Every count from 1 to the maximum was measured: the minimum is the smallest that looks right.
  const { min, layoutOkContiguous } = minOfCounts(okCounts, max)
  const counts = Object.keys(checks).map(Number)
  const okIfCentered = counts.filter((n) =>
    widths.every((w) => checks[n][w]?.ok || (checks[n][w]?.leftPacked && centered[n]?.[w]?.ok))
  )
  const packed = counts.some((n) => widths.some((w) => checks[n][w]?.leftPacked))
  const centers = counts.some((n) => widths.some((w) => /centered/.test(checks[n][w]?.reason ?? '')))
  return {
    sparseRow: packed ? 'left-packed' : centers ? 'centers' : 'fills',
    minIfCentered: packed ? minOfCounts(okIfCentered, max).min : min,
    centered,
    fix: fix && {
      ...fix,
      verified: counts.every((n) => widths.every((w) => !checks[n][w]?.leftPacked || centered[n]?.[w]?.ok))
    },
    listId,
    max,
    min,
    okCounts,
    layoutOkContiguous,
    checks,
    images,
    inSlider: repeat?.inSlider ?? null,
    rows: css ? { css } : { path: repeat?.path, shape: repeat?.shape },
    faithfulness: note ?? null
  }
}
