import { wakeLazyContent } from '../render.mjs'

// The real box of every Joomla module wrapper (T4 renders id="Mod<N>") on each audited page, per viewport, rendered
// the same way the audit renders (same contexts, same lazy-content wake), so the boxes share its document coordinates.
// A slot of module N only counts as located when its element sits inside Mod<N>. `containers` are the article / blog
// item / contact boxes, used for entities that are not modules (the box holding the entity's own title).
// A page that does not open or read is returned in `failures` (url, viewport, error), never only logged: its slots
// cannot be located, so the measure that asked counts it as a failed page.

/** @returns {Promise<{ boxes: Record<string, any>, failures: { url: string, viewport: string, error: string }[] }>} */
export async function moduleBoxes({ chromium, openContext, findings }) {
  const browser = await chromium.launch()
  const out = {}
  const failures = []
  try {
    for (const vp of ['desktop', 'phone']) {
      const ctx = await openContext(browser, vp, { siteUrl: findings.site })
      for (const p of findings.pages) {
        const page = await ctx.newPage()
        try {
          await page.goto(p.url, { waitUntil: 'load', timeout: 45000 })
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
          await wakeLazyContent(page)
          const boxes = await page.evaluate(() => {
            const box = (e) => {
              const r = e.getBoundingClientRect()
              return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }
            }
            const CONTAINERS =
              '.com-content-article, .item-page, .blog-item, [itemprop=blogPost], .items-row .item, .item, .contact'
            const containers = [...document.querySelectorAll(CONTAINERS)]
              .map(box)
              .filter((r) => r.h >= 40 && r.w >= 40)
            return {
              containers,
              ...Object.fromEntries(
                [...document.querySelectorAll('[id^="Mod"]')]
                  .filter((e) => /^Mod\d+$/.test(e.id))
                  .map((e) => {
                    return [`module-${e.id.slice(3)}`, box(e)]
                  })
              )
            }
          })
          ;(out[p.n] ??= {})[vp] = boxes
        } catch (e) {
          const error = String(e?.message ?? e).split('\n')[0]
          failures.push({ url: p.url, viewport: vp, error })
          console.error(`[modules] ${p.url} ${vp}: ${error}`)
        } finally {
          await page.close()
        }
      }
      await ctx.close()
    }
  } finally {
    await browser.close()
  }
  return { boxes: out, failures }
}

/**
 * The pages whose module boxes failed, added to the audit's failures (once per page, every failed viewport named),
 * so the coverage file counts them under `pages.failed` and the policy holds Publish until a rerun reads them.
 */
export function addModuleBoxFailures(result, failures) {
  const byUrl = new Map()
  for (const f of failures ?? []) byUrl.set(f.url, [...(byUrl.get(f.url) ?? []), f])
  for (const [url, fs] of byUrl)
    result.failures.push({
      url,
      error: `module boxes not read (${fs.map((f) => `${f.viewport}: ${f.error}`).join('; ')})`
    })
  return result
}
