// The measured minimum of one list, in the DOM only (no screenshot): on the live page, remove rows one at a time
// (from the last) and, at every width (the same page resized), read the boxes of the rows left: a full, centered or
// filling last line is right, a hole is not, a short last line pressed to the left is tried again with a centering
// rule injected and taken out. One page load per list. Read-only on the site: rows go in the browser only.
import { openFrozen, openKitContext } from './capture.mjs'
import { tryRowFix } from './row-fix.js'
import { readRowContext } from './row-context.js'
import { firstLineSpans, layoutCheck, matchRepeat, minOfCounts } from './rows.mjs'
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
 * @param {{chromium: object, siteUrl: string, hostHeader?: string, url: string, assigned: object[], source: string, listId: string, max: number, css?: string, repeat?: {path: number[], shape: string}, widths: number[], note?: string, hide?: object}} o
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
  note,
  repeat: given,
  hide
}) {
  const browser = await chromium.launch()
  const checks = {}
  let repeat = given ?? null
  const centered = {}
  const contexts = {}
  let fix = null
  try {
    const ctx = await openKitContext(browser, { width: widths[0], siteUrl, hostHeader })
    const opened = await openFrozen(ctx, url, assigned, hide, { wake: 'quick' })
    if (!opened.page) throw new Error(`${url}: ${opened.error}`)
    const { page } = opened
    if (!css && !repeat) {
      repeat = matchRepeat((await page.evaluate(readDetails))[source]?.repeats, max)
      if (!repeat) throw new Error(`no row set of ${max} rows in ${source}; pass --rows <css>`)
    }
    const args = { block: source, path: repeat?.path ?? [], shape: repeat?.shape, css }
    for (let keep = max; keep >= 1; keep--) {
      const left = await page.evaluate(keepRows, { ...args, keep })
      if (!left) throw new Error(`block ${source} not found on ${url}`)
      if (keep === max && left.total !== max)
        throw new Error(`expected ${max} rows in ${source}, found ${left.total}`)
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 })
        await page.waitForTimeout(250)
        const after = await page.evaluate(keepRows, { ...args, keep })
        // How the content around the rows is aligned, read once per width on the full set.
        if (keep === max) {
          const around = await page.evaluate(readRowContext, args)
          const spans = firstLineSpans(after.rows, after.container)
          contexts[width] = around ? { ...around, spans, centered: around.centered || spans } : null
        }
        const check = layoutCheck(after.rows, after.container, 6, contexts[width])
        ;(checks[keep] ??= {})[width] = check
        if (!check.leftPacked) continue
        // The trial of the centering fix: inject it, read the rows again, take it out.
        const tried = await page.evaluate(tryRowFix, args)
        if (!tried) continue
        await page.waitForTimeout(200)
        const again = await page.evaluate(keepRows, { ...args, keep })
        const fixed = layoutCheck(again.rows, again.container, 6, contexts[width])
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('style[data-kit-fix]')) el.remove()
        })
        ;(centered[keep] ??= {})[width] = { ok: fixed.ok, reason: fixed.reason, gap: check.gap }
        fix ??= { selector: tried.selector, display: tried.display, rule: tried.rule, matches: tried.matches }
      }
    }
    await page.close().catch(() => {})
    await ctx.close()
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
    context: contexts,
    fix: fix && {
      ...fix,
      verified: counts.every((n) => widths.every((w) => !checks[n][w]?.leftPacked || centered[n]?.[w]?.ok))
    },
    listId,
    measuredBy: 'dom',
    max,
    min,
    okCounts,
    layoutOkContiguous,
    checks,
    inSlider: repeat?.inSlider ?? null,
    rows: css ? { css } : { path: repeat?.path, shape: repeat?.shape },
    faithfulness: note ?? null
  }
}
