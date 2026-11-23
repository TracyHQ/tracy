// node perf/glyphw.mjs <url> <width> '<selector of a paragraph>' : the width of a fixed sentence set in that paragraph's own font (family, size, weight), nowrap
import { chromium } from 'playwright'
const [, , url, width, sel] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1200)
console.log(
  await p.evaluate((s) => {
    const el = [...document.querySelectorAll('p,h1,h2,h3,li,div')]
      .filter((e) => e.textContent.trim().startsWith(s))
      .pop()
    const c = getComputedStyle(el)
    const span = document.createElement('span')
    span.textContent =
      'The quick brown fox jumps over the lazy dog, Phasellus enim libero, blandit vel sapien vitae'
    span.style.cssText = `position:absolute;white-space:nowrap;font:${process.env.W || c.fontWeight} ${c.fontSize}/${c.lineHeight} ${c.fontFamily};letter-spacing:${c.letterSpacing};font-kerning:${c.fontKerning};font-feature-settings:${c.fontFeatureSettings}`
    el.parentElement.appendChild(span)
    const w = span.getBoundingClientRect().width
    return JSON.stringify({
      fam: c.fontFamily.slice(0, 60),
      size: c.fontSize,
      weight: c.fontWeight,
      w: Math.round(w * 10) / 10,
      kerning: c.fontKerning,
      rendering: c.textRendering
    })
  }, sel)
)
await b.close()
