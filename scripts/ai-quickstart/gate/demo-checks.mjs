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
  // A page answers as it should (the not found page with 404): every such page is scanned.
  const ok = renders.filter((r) => r.status === (r.expected ?? 200))
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
  // The same blocks read twice: from the raw HTML (what the demo baseline was hashed from) and by the browser. The
  // browser applies the page's stylesheet (`text-transform` writes capitals the HTML does not hold), so both sides are
  // compared in the scan's own spelling (`normalise`: case folded, spacing one space), as its matcher compares them.
  const blockCompare = compareBlocks(ok)
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
        ...blockCompare
      },
      pictureAddresses
    }
  }
}

/**
 * The blocks of words of each render as the browser read them, against the raw HTML's, in the scan's spelling:
 * `blocks` read, `rawDiffers` (byte for byte), and `blockDiffers` the ones that still differ once normalised.
 */
export function compareBlocks(renders) {
  let blocks = 0
  let rawDiffers = 0
  const blockDiffers = []
  for (const r of renders.filter((x) => x.html)) {
    const fromHtml = observationsFromHtml(r.html).filter((o) => o.kind === 'block')
    const raw = new Set(fromHtml.map((o) => o.value))
    const spelled = new Set(fromHtml.map((o) => normalise(o.value)))
    for (const o of (r.observations ?? []).filter((x) => x.kind === 'block')) {
      blocks += 1
      if (!raw.has(o.value)) rawDiffers += 1
      if (!spelled.has(normalise(o.value)) && blockDiffers.length < 400)
        blockDiffers.push({
          page: r.pageType,
          theme: r.theme,
          width: r.width,
          value: o.value.slice(0, 80),
          visible: o.visible
        })
    }
  }
  return { blocks, rawDiffers, blockDiffers }
}

function dedupe(findings) {
  const out = new Map()
  for (const f of findings) if (!out.has(keyOf(f))) out.set(keyOf(f), f)
  return [...out.values()]
}

/**
 * The demo scan on a control site's renders: the untouched human quickstart (the negative control: the scan must find
 * its demo) or the blank site before the write (it must find none).
 * @returns {Promise<{status: 'run', pages: number, renders: number, findings: number, byKind: object, sample: object[]}>}
 */
export async function controlOf(renders, corpus) {
  const ok = renders.filter((r) => r.status === (r.expected ?? 200))
  const findings = dedupe(
    await demoScan({ pages: ok.map((r) => ({ path: r.path, observations: r.observations })), corpus })
  )
  const byKind = {}
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1
  return {
    status: 'run',
    pages: new Set(renders.map((r) => r.path)).size,
    renders: renders.length,
    failed: renders.length - ok.length,
    findings: findings.length,
    byKind,
    sample: findings.slice(0, 12).map((f) => ({ kind: f.kind, page: f.page, excerpt: f.excerpt }))
  }
}
