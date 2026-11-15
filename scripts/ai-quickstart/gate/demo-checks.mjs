// The demo scan of the gate's renders (ticket #585) and three checks of the scan itself on a real run:
//   interfaceLetThrough  words the marker test flags that the demo scan's corpus counts as interface words (what the
//                        blank site keeps, the language strings the kit keeps) and so never reports: the strings the
//                        demo scan silently lets through
//   htmlVersusBrowser    the demo scan of the raw HTML against the scan of the browser's own read of the same pages:
//                        findings only one of them has (a block the browser joins or splits otherwise than the HTML
//                        reader, words a script writes)
//   pictureAddresses     pictures a page loads under a cache or resized path, whose file name is a demo picture's
//                        while the path match misses it
// Takes the corpus as input (`demoCorpus` of `rendered-scan.mjs`): no template is named here.
import { demoScan, observationsFromHtml } from '../rendered-scan.mjs'
import { normalise } from '../rendered-scan/normalise.mjs'

const RESIZED = /(?:^|\/)(?:cache|resized|thumbs?|_thumbs?|resize)(?:\/|$)|[_-]\d{2,4}x\d{2,4}(?=\.)/i
const bare = (s) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
const keyOf = (f) => `${f.kind}|${f.page}|${f.excerpt}`

/**
 * @param {{renders: object[], corpus: object, leaks: object[]}} input `leaks`: the marker test's text findings
 * @returns {Promise<{browser: object[], html: object[], checks: object}>}
 */
export async function demoChecks({ renders, corpus, leaks }) {
  const ok = renders.filter((r) => r.status === 200)
  const browser = dedupe(
    await demoScan({ pages: ok.map((r) => ({ path: r.pageType, observations: r.observations })), corpus })
  )
  const html = dedupe(
    await demoScan({
      pages: ok
        .filter((r) => r.html)
        .map((r) => ({ path: r.pageType, observations: observationsFromHtml(r.html) })),
      corpus
    })
  )
  const inBrowser = new Set(browser.map(keyOf))
  const inHtml = new Set(html.map(keyOf))
  const interfaceLetThrough = []
  const seen = new Set()
  for (const l of leaks) {
    const text = String(l.rest ?? l.value)
    const n = bare(normalise(text))
    if (!n || seen.has(n) || !corpus.interface.has(n)) continue
    seen.add(n)
    interfaceLetThrough.push({ value: text, page: l.page, place: l.place, source: l.source ?? null })
  }
  // The same blocks read twice: from the raw HTML (what the demo baseline was hashed from) and by the browser.
  let blocks = 0
  const blockDiffers = []
  for (const r of ok.filter((x) => x.html)) {
    const fromHtml = new Set(
      observationsFromHtml(r.html)
        .filter((o) => o.kind === 'block')
        .map((o) => o.value)
    )
    const fromBrowser = r.observations.filter((o) => o.kind === 'block')
    blocks += fromBrowser.length
    for (const o of fromBrowser)
      if (!fromHtml.has(o.value) && blockDiffers.length < 400)
        blockDiffers.push({
          page: r.pageType,
          theme: r.theme,
          width: r.width,
          value: o.value.slice(0, 80),
          visible: o.visible
        })
  }
  const demoNames = new Set([...corpus.pictures.files].map((f) => f.split('/').pop().toLowerCase()))
  const pictureAddresses = []
  for (const r of ok)
    for (const o of r.observations)
      if (o.kind === 'image' && RESIZED.test(o.value)) {
        const name = o.value.split(/[?#]/)[0].split('/').pop().toLowerCase()
        const base = name.replace(/[_-]\d{2,4}x\d{2,4}(?=\.)/, '')
        pictureAddresses.push({
          page: r.pageType,
          value: o.value,
          demoName: demoNames.has(name) || demoNames.has(base),
          caught: browser.some((f) => f.kind === 'demo_image' && f.page === r.pageType)
        })
      }
  return {
    browser,
    html,
    checks: {
      interfaceLetThrough,
      htmlVersusBrowser: {
        browser: browser.length,
        html: html.length,
        onlyBrowser: browser.filter((f) => !inHtml.has(keyOf(f))),
        onlyHtml: html.filter((f) => !inBrowser.has(keyOf(f))),
        blocks,
        blockDiffers
      },
      pictureAddresses
    }
  }
}

function dedupe(findings) {
  const out = new Map()
  for (const f of findings) if (!out.has(keyOf(f))) out.set(keyOf(f), f)
  return [...out.values()]
}
