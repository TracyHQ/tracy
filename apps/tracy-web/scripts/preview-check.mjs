#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
/**
 * The design system preview measured as a visitor sees it (Akemi, 14/10/2026): for each published
 * quickstart, the demo's page is built exactly as the Add site preview door builds it (same emitter,
 * same `wornPageOf`, stylesheets and fonts through a local copy of the asset door), opened in a
 * headless Chrome without and with each system, and compared (`design-system-preview-probe.js`).
 *
 *   node apps/tracy-web/scripts/preview-check.mjs --demos <demos.json> --out <dir> [--only <tag,…>]
 *        [--systems <id,…>] [--palette] [--scheme light|dark|light,dark] [--pages all|home|<path,…>]
 *        [--concurrency <n>] [--write]
 *
 * --scheme light,dark: both sides in one run, one after the other, as two runs of one side each would
 * (each side's files under <out>/<scheme>/; rows are written once every side is measured, see below).
 * --concurrency: how many pages are measured at once, each in a Chrome of its own (default
 * DEFAULT_CONCURRENCY). The rows, misses and files are the same as with --concurrency 1, in the same order:
 * each page is measured as it was alone, and the results are put together in declared-page order
 * (`inPool`, tracy-ds-slot/src/measure-pool.mjs).
 *
 * --pages: which of the pages the template declares are measured (`preview-pages.mjs`; Akemi,
 * 15/10/2026: a customer who wears a system gets the whole site restyled). `all`, the default, is
 * every declared page and is what a release measurement (--write) runs; `home` is the fast mode for a
 * quick check. Each page is measured plain and worn, every detector on each; with --write the file
 * lists every declared page (`previewPages`), so a page this run skipped or could not read stays
 * unmeasured on /ops. When any side or demo of the run measured a system on no page, or no page at all,
 * nothing of the run is written and it exits 1 (`tracy-ds-slot/src/measure-gaps.mjs`); rows are written once
 * every side and demo is measured.
 *
 * --palette: instead of judging, read each demo's palette (its home page and up to three pages its
 * menu links to, without a system), classify it by role (`tracy-ds-slot/src/auto-palette.mjs`) and
 * write `packages/design/tracy-ds-slot/templates/palette/<contract>.json`, which every emitter wears.
 *
 * demos.json: [{ "tag": "quickstart/ja-impact/j6", "platform": "joomla", "version": "1.0.2",
 *                "address": "https://ja-impact-joomla.tracy.site/" }, …]  (/api/ops/demos)
 *
 * Writes <out>/<slug>/<page>/{plain,worn-<system>}.png, <out>/<slug>/preview.json (`pages`: per
 * declared page; `systems`: the home page's, as before) and <out>/summary.json.
 * Needs Chrome ($CHROME or the Mac path). Reads the public demos only; writes nothing to them.
 *
 * The frame (probe 10, 18/10/2026): from LIVE_FRAME_SINCE (or with PREVIEW_PROBE_NEXT=1) every page, the
 * template's and the worn one, is opened in the LIVE frame both popups show since 0bcabb641f / 87242c0d96 (the
 * demo's own address, its scripts running, the slot laid in as the site proxy lays it: `preview-check/live-frame.mjs`).
 * Before it, the static frame below (`asTheFrameRuns`), unchanged, so no v9 file reads differently.
 */
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import {
  chromaOf,
  classifyPalette,
  lum,
  PALETTE_PROBE,
  SATURATED
} from '../../../packages/design/tracy-ds-slot/src/auto-palette.mjs'
import { loadContract } from '../../../packages/design/tracy-ds-slot/src/library.mjs'
import { writeWholeRun } from '../../../packages/design/tracy-ds-slot/src/measure-gaps.mjs'
import { concurrencyOf, inPool } from '../../../packages/design/tracy-ds-slot/src/measure-pool.mjs'
import { measurementPath, previewLineOf } from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { PREVIEW_PROBE_VERSION } from '../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'
import { emitFor, modesOf, quickstartContractOf } from '../src/lib/ds-slot.js'
import { assetKindOf, cssForPreview, stylesheetsToAssets } from '../src/sites/design-system-preview-assets.js'
import { previewPathOf } from '../src/sites/design-system-preview-links.js'
import {
  readDemoPage,
  slotOf,
  themeFoldersFor,
  withoutNoscriptNotices,
  wornPageOf
} from '../src/sites/design-system-preview-page.js'
import { COLOUR_IN_PAGE, comparePreview, previewProbeOf } from '../src/sites/design-system-preview-probe.js'
import { hostNamedAddress } from './preview-check/host-named.mjs'
import { LIVE_FRAME_SINCE, openLiveFrame, pressSideExpression } from './preview-check/live-frame.mjs'
import { measureBlockOf } from './preview-check/measure-block.mjs'
import { PICTURE_DOOR } from './preview-detectors/accent-leak.mjs'
import { detectAll, probeAll, runsNext } from './preview-detectors/index.mjs'
import { slotStatusColours, systemPaletteOf } from './preview-detectors/lib/system-palette.mjs'
import { WIDGETS_ON } from './preview-detectors/lib/widgets.mjs'
import { declaredPagesOf, pageSlugOf, pagesFor } from './preview-pages.mjs'

const args = process.argv.slice(2)
const opt = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i === -1 ? fallback : args.splice(i, 2)[1]
}
const flag = (name) => {
  const i = args.indexOf(name)
  if (i === -1) return false
  args.splice(i, 1)
  return true
}
const DEMOS = opt('--demos')
const OUT = resolve(opt('--out', 'preview-check'))
const ONLY = (opt('--only') ?? '').split(',').filter(Boolean)
const SYSTEMS = (opt('--systems') ?? 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0').split(',').filter(Boolean)
const PALETTE = flag('--palette')
// --write: the judged rows into the preview block of each version's measurement file
const WRITE = flag('--write')
// the visitor's own light or dark: a WordPress theme's presets are light-dark() pairs; `light,dark` runs both
const SCHEMES = opt('--scheme', 'light').split(',').filter(Boolean)
// which declared pages: all (default, the release measurement), home (fast mode) or a list of paths
const PAGES = opt('--pages', 'all')
const ROOT = resolve(import.meta.dirname, '../../..')
const PALETTE_DIR = resolve(import.meta.dirname, '../../../packages/design/tracy-ds-slot/templates/palette')
const PORT = Number(opt('--port', '9611'))
/**
 * Pages measured at once, each in its own Chrome (~300-600 MB each). Measured on a 10-core, 16 GB Mac with one
 * Joomla stand: see DEFAULT_CONCURRENCY's note in the tdsr skill (§3, re-measuring a release).
 */
const DEFAULT_CONCURRENCY = 4
const CONCURRENCY = concurrencyOf(opt('--concurrency'), DEFAULT_CONCURRENCY)
// the live frame (probe 10): what both popups and Try on show, the page's scripts running;
// PREVIEW_FRAME=static|live forces one for a scratch comparison of the two
const LIVE = process.env.PREVIEW_FRAME
  ? process.env.PREVIEW_FRAME === 'live'
  : PREVIEW_PROBE_VERSION >= LIVE_FRAME_SINCE || runsNext()
// from probe 10 a third-party widget (a map, a chart, a frame of another origin) is left out of the blocks,
// texts and buttons the preview probe reads, as every detector leaves it out (lib/widgets.mjs)
const PREVIEW_PROBE = previewProbeOf({ widgets: WIDGETS_ON })
if (WRITE && process.env.PREVIEW_FRAME) {
  console.error('PREVIEW_FRAME is a scratch comparison: not with --write')
  process.exit(2)
}
if (!SCHEMES.length || SCHEMES.some((s) => s !== 'light' && s !== 'dark')) {
  console.error('--scheme takes light, dark or light,dark')
  process.exit(2)
}
if (!DEMOS) {
  console.error(
    'usage: preview-check.mjs --demos <demos.json> --out <dir> [--only tag,…] [--systems id,…] [--palette]'
  )
  process.exit(2)
}
// a stand at a loopback IP is read at localhost: a page served from a bare IP is one no customer has, and
// YouTube refuses some videos inside it (JA Spa /our-spa, PREV-1; preview-check/host-named.mjs)
const demos = JSON.parse(readFileSync(DEMOS, 'utf8'))
  .filter((d) => !ONLY.length || ONLY.includes(d.tag))
  .map((d) => ({ ...d, address: hostNamedAddress(d.address) }))
mkdirSync(OUT, { recursive: true })

// The pages served to the headless browser, and a local copy of the asset door: the frame's stylesheets
// and fonts come from this origin, as in the product.
/** @type {Map<string, string>} */
const pages = new Map()
/** @type {Map<string, string>} */
const demoOfTag = new Map(demos.map((d) => [d.tag, d.address]))
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  if (url.pathname === '/api/design-system/preview-asset') {
    // PREVIEW_ASSET_FAIL=1: the asset door answers 502 as dev's did on 14/10/2026, to cut a test fixture
    if (process.env.PREVIEW_ASSET_FAIL) return void res.writeHead(502).end()
    const address = demoOfTag.get(url.searchParams.get('quickstart') ?? '')
    const path = previewPathOf(url.searchParams.get('path'))
    const kind = path && assetKindOf(path)
    if (!address || !kind) return void res.writeHead(400).end()
    try {
      const r = await fetch(new URL(path, address))
      if (!r.ok) return void res.writeHead(r.status).end()
      if (kind === 'css') {
        const css = cssForPreview(await r.text(), {
          cssUrl: new URL(path, address).href,
          assetOf: (p) =>
            `http://127.0.0.1:${PORT}/api/design-system/preview-asset?quickstart=${encodeURIComponent(url.searchParams.get('quickstart') ?? '')}&path=${encodeURIComponent(p)}`
        })
        res.writeHead(200, { 'content-type': 'text/css' }).end(css)
      } else res.writeHead(200, { 'content-type': `font/${kind}` }).end(Buffer.from(await r.arrayBuffer()))
    } catch {
      res.writeHead(502).end()
    }
    return
  }
  if (url.pathname === PICTURE_DOOR) {
    // a picture of a demo read by the accent-leak probe (probe 10): from the page's own origin, so its
    // pixels can be read; only pictures of the demos measured, nothing else
    try {
      const u = new URL(url.searchParams.get('u') ?? '')
      const ok = [...demoOfTag.values()].some((a) => new URL(a).origin === u.origin)
      if (!ok || !/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(u.pathname)) return void res.writeHead(400).end()
      const r = await fetch(u)
      if (!r.ok) return void res.writeHead(r.status).end()
      res
        .writeHead(200, { 'content-type': r.headers.get('content-type') ?? 'application/octet-stream' })
        .end(Buffer.from(await r.arrayBuffer()))
    } catch {
      res.writeHead(502).end()
    }
    return
  }
  const html = pages.get(url.pathname)
  if (!html) return void res.writeHead(404).end()
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
})
await new Promise((ok) => server.listen(PORT, '127.0.0.1', ok))

/** The demo read over its public address, as `readDemoPage` reads a container. */
const publicFetch =
  (/** @type {string} */ address) => async (/** @type {any} */ url, /** @type {any} */ init) => {
    const u = new URL(String(url))
    return fetch(new URL(`${u.pathname}${u.search}`, address), { ...init, headers: {} })
  }

/** The preview the door would serve for one system (or, with no system, the page with an empty slot). */
/** A demo answers a first read slowly or with half a page now and then: one more try before a miss. */
async function compose(d, id, path = '/') {
  const first = await composeOnce(d, id, path)
  return 'miss' in first ? composeOnce(d, id, path) : first
}

async function composeOnce(d, id, path = '/') {
  const fit = quickstartContractOf({ platform: d.platform, tag: d.tag, version: d.version ?? null })
  if (!('contract' in fit)) return { miss: `NO_SLOT (${fit.reason})` }
  let slot = { bytes: '', globalCss: null }
  if (id) {
    const out = await emitFor({ platform: d.platform, contract: fit.contract, id })
    const s = out.ok ? slotOf(out) : null
    if (!s) return { miss: 'NO_SLOT (emit)' }
    slot = s
  }
  const pub = new URL(d.address)
  const page = await wornPageOf({
    platform: d.platform,
    bytes: slot.bytes,
    globalCss: id ? slot.globalCss : null,
    themes: themeFoldersFor(fit.template),
    inner: pub,
    pub,
    fetchImpl: publicFetch(d.address),
    waitMs: 30000,
    path,
    assetOf: (p) =>
      `http://127.0.0.1:${PORT}/api/design-system/preview-asset?quickstart=${encodeURIComponent(d.tag)}&path=${encodeURIComponent(p)}`
  })
  // WordPress without a system: the global styles block stays the theme's own
  if (!id && d.platform === 'wordpress' && 'miss' in page)
    return { html: await plainPageOf(d, path), template: fit.template, modes: modesOf(fit.contract) === true }
  return 'miss' in page
    ? { miss: page.miss }
    : {
        html: page.html,
        template: fit.template,
        modes: modesOf(fit.contract) === true,
        // the status colours the slot writes itself: the system's paint (slotStatusColours)
        status: id ? slotStatusColours(`${slot.bytes ?? ''}\n${JSON.stringify(slot.globalCss ?? '')}`) : []
      }
}

/**
 * The side the popup shows, as its Light | Dark switch paints it (14/10/2026): for a template whose
 * contract wears both sides (the door's x-tracy-ds-modes), the stage sets `data-theme` on the framed
 * page's root (design-system-stage.tsx `paintTheme`); the visitor's own scheme stays emulated too.
 * Measured without it, JA Vega WordPress on Light read clean while the popup showed a dark header and
 * hero with the template's gradient.
 */
async function paintSide(
  /** @type {any} */ chrome,
  /** @type {string} */ scheme,
  /** @type {boolean | undefined} */ modes
) {
  if (!modes) return
  await chrome.evaluate(
    `(async () => { document.documentElement.setAttribute('data-theme', ${JSON.stringify(scheme)}); await new Promise((r) => setTimeout(r, 400)); return 1 })()`
  )
}

/**
 * The static frame (probe 9 and before; the live frame replaces it from LIVE_FRAME_SINCE). The page as the Add site preview frame ran it: the door answers with `Content-Security-Policy:
 * sandbox` without allow-scripts, so no script of the demo runs and its <noscript> content shows
 * (14/10/2026: measured with scripts running, AOS revealed itself, a map script injected its own
 * font and T4 switched to its dark side, none of which a visitor of the preview sees). The probes
 * themselves run over DevTools, which the sandbox does not stop. A `<noscript>` that only tells a
 * visitor to turn JavaScript on is gone, as the door drops it (`withoutNoscriptNotices`); the template
 * page read straight off the demo (`plainPageOf`) has not been through the door.
 */
const asTheFrameRuns = (/** @type {string} */ html) =>
  withoutNoscriptNotices(html)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<\/?noscript\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')

/**
 * The colours the worn system paints with: the resolved `--ds-c-*` values of the worn page, and only
 * those (14/10/2026: every hex of the slot also held the template's own fallbacks, so a template
 * colour such as JA Sensei's #9c4ff0 counted as the system's and its leftovers went unseen; on
 * WordPress the slot is the global styles block, so no hex was read at all). Read in the page, so a
 * light-dark() pair resolves to the side the visitor's scheme shows. Status colours are left out.
 */
const SYSTEM_COLOURS_PROBE = `(() => {${COLOUR_IN_PAGE}
  const names = new Set()
  const walk = (list) => { for (const r of list) { try { if (r.cssRules) walk(r.cssRules) } catch {} const t = r.style ? r.style.cssText || '' : ''; for (const m of t.matchAll(/--ds-c-[\\w-]+/g)) names.add(m[0]) } }
  for (const sh of document.styleSheets) { try { walk(sh.cssRules) } catch {} }
  for (const e of document.querySelectorAll('[style*="--ds-c-"]')) for (const m of e.getAttribute('style').matchAll(/--ds-c-[\\w-]+/g)) names.add(m[0])
  const out = []
  for (const n of names) {
    // status colours (success, warn, danger) fall back to the template's own when the slot sets none:
    // read off the page they are not the system's paint (counting them hid JA Sensei's green login
    // switch); the ones the slot writes itself are added from its bytes (slotStatusColours)
    if (/^--ds-c-(success|warn|danger)\\b/.test(n)) continue
    if (!getComputedStyle(document.body).getPropertyValue(n).trim()) continue
    // a fresh element per role, no transition, important: a template's * { transition } or
    // i { color: … !important } left every role reading as the body's colour (JA Kinetic Joomla:
    // only #858273, 14/10/2026)
    const probe = document.createElement('span')
    probe.style.setProperty('transition', 'none', 'important')
    probe.style.setProperty('color', 'var(' + n + ', rgb(1, 2, 3))', 'important')
    document.body.appendChild(probe)
    const v = getComputedStyle(probe).color
    probe.remove()
    const c = ch(v)
    if (c && v !== 'rgb(1, 2, 3)') out.push('#' + [c.r, c.g, c.b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join(''))
  }
  return [...new Set(out)]
})()`

const assetLink = (/** @type {string} */ tag) => (/** @type {string} */ p) =>
  `http://127.0.0.1:${PORT}/api/design-system/preview-asset?quickstart=${encodeURIComponent(tag)}&path=${encodeURIComponent(p)}`

/** One more page of the demo, without a system, its stylesheets through the local asset door. */
async function plainPageOf(d, path) {
  const url = new URL(path, d.address)
  const raw = await (await fetch(url)).text()
  const one = raw.slice(0, (raw.search(/<\/html\s*>/i) + 1 || raw.length + 1) - 1 + 7)
  return stylesheetsToAssets(one, { base: url.href, assetOf: assetLink(d.tag) }).replace(
    /<head\b[^>]*>/i,
    (h) => `${h}<base href="${url.href}">`
  )
}

/** Several probes of one template's pages as one: declarations and variables united, usage summed. */
function mergeProbes(/** @type {any[]} */ all) {
  const out = {
    page: all[0].page,
    pageArea: all.reduce((a, p) => a + (p.pageArea ?? 0), 0),
    rules: [],
    vars: {},
    inline: {},
    use: {}
  }
  const seen = new Set()
  // a page on the other side of light from the first is the template's other look (JA Kinetic
  // WordPress's Blueprint home is light under its dark Terminal home). Every colour is classified
  // against the first page's ground, and a neutral one is a ground or a text by its side of light: the
  // Blueprint header's light ground, read against the dark page, became a band that turned the
  // system's text colour under the header's dark words (14/10/2026). Its neutral colours are the other
  // look's, like the probe's dark-mode blocks; a brand colour is the brand's on either side and stays.
  const side = (/** @type {string} */ h) => lum(h) > 0.4
  // a selector and property an earlier page already painted keep that page's colour: a later page
  // resolves the same rule through its own look's variables (JA Kinetic Joomla's Signal home: body,
  // .t4-content and .acm-hero are var(--bg), navy there), and its copy, emitted after the home page's,
  // won the cascade: the page took the system's surface instead of its ground and the content area a
  // grey mix (14/10/2026). The home page is the look a visitor gets; the others only add what it lacks.
  const claimed = new Set()
  for (const p of all) {
    const otherSide = p !== all[0] && side(p.page) !== side(all[0].page)
    const mine = new Set()
    for (const r of p.rules) {
      if (otherSide && chromaOf(r[2]) < SATURATED) continue
      // the same selector under another @media condition (index 6) is another rule
      const at = `${r[0]}|${r[1]}|${r[6] ?? ''}`
      if (claimed.has(at)) continue
      const k = `${at}|${r[2]}`
      if (seen.has(k)) continue
      seen.add(k)
      mine.add(at)
      out.rules.push(r)
    }
    for (const at of mine) claimed.add(at)
    Object.assign(out.vars, p.vars)
    for (const [k, n] of Object.entries(p.inline)) out.inline[k] = (out.inline[k] ?? 0) + n
    for (const [h, u] of Object.entries(p.use)) {
      const o = (out.use[h] ??= { area: 0, text: 0, grounds: {}, border: 0 })
      o.area += u.area
      o.text += u.text
      o.border += u.border
      if (u.wide) o.wide = true
      for (const [g, n] of Object.entries(u.grounds)) o.grounds[g] = (o.grounds[g] ?? 0) + n
    }
  }
  return out
}

/** --palette: one template's palette, classified, into its contract's palette file. */
async function paletteOfDemo(d, slug) {
  const chrome = chromes[0]
  const fit = quickstartContractOf({ platform: d.platform, tag: d.tag, version: d.version ?? null })
  if (!('contract' in fit)) throw new Error(`NO_SLOT (${fit.reason})`)
  const plain = await compose(d, null)
  if ('miss' in plain) throw new Error(`plain: ${plain.miss}`)
  pages.set(`/${slug}/plain`, plain.html)
  await chrome.open(`http://127.0.0.1:${PORT}/${slug}/plain`, 1440)
  const probes = [await chrome.evaluate(PALETTE_PROBE)]
  const links =
    await chrome.evaluate(`(() => [...new Set([...document.querySelectorAll('header a[href], nav a[href], .t4-megamenu a[href]')]
    .map((a) => { try { const u = new URL(a.getAttribute('href'), ${JSON.stringify(d.address)}); return u.host === ${JSON.stringify(new URL(d.address).host)} && u.pathname !== '/' && !/\\.(jpe?g|png|pdf|zip)$/i.test(u.pathname) ? u.pathname : null } catch { return null } })
    .filter(Boolean))].slice(0, 3))()`)
  for (const [i, path] of (links ?? []).entries()) {
    try {
      pages.set(`/${slug}/page-${i}`, await plainPageOf(d, path))
      await chrome.open(`http://127.0.0.1:${PORT}/${slug}/page-${i}`, 1440)
      probes.push(await chrome.evaluate(PALETTE_PROBE))
    } catch {}
  }
  const contract = loadContract(fit.contract)
  const roles = Object.fromEntries(
    (contract.paletteRoles ?? [])
      .filter((/** @type {any} */ h) => h.colour)
      .map((/** @type {any} */ h) => [String(h.colour).toLowerCase(), h.role])
  )
  const selectors = Object.fromEntries(
    (contract.paletteRoles ?? [])
      .filter((/** @type {any} */ h) => h.selector)
      .map((/** @type {any} */ h) => [h.selector, h.role])
  )
  const auto = classifyPalette(mergeProbes(probes), { roles, selectors })
  const file = { source: `${d.tag}@${d.version}`, pages: ['/', ...(links ?? [])], ...auto }
  // a demo that answered half a page (an error, a slow first hit) reads almost no palette: the file
  // it already has stays (JA Impact WordPress, 14/10/2026: one bad read wrote 3 rules over 131)
  const at = join(PALETTE_DIR, `${fit.contract}.json`)
  let had = 0
  try {
    had = JSON.parse(readFileSync(at, 'utf8')).rules?.length ?? 0
  } catch {}
  if (had && auto.rules.length < had / 2)
    throw new Error(`read ${auto.rules.length} rules where the file has ${had}: kept the file`)
  mkdirSync(PALETTE_DIR, { recursive: true })
  writeFileSync(join(PALETTE_DIR, `${fit.contract}.json`), `${JSON.stringify(file)}\n`)
  return {
    contract: fit.contract,
    rules: auto.rules.length,
    vars: auto.vars.length,
    inline: auto.inline.length,
    pages: file.pages.length
  }
}

/** The most element labels a row keeps per kind (`unique` says how many there were). */
const WHERE_MAX = 300

/** One judged system of one page as the measurement file's preview row. */
const previewRowOf = (
  /** @type {string} */ system,
  /** @type {string} */ page,
  /** @type {any} */ f,
  /** @type {string} */ scheme
) => ({
  system,
  scheme,
  page,
  probeVersion: PREVIEW_PROBE_VERSION,
  kept: f.kept.length,
  keptShare: Math.min(1, f.keptShare),
  glare: f.glare.length,
  keptText: f.keptText.length,
  lowText: f.lowText.length,
  lostButtons: f.lostButtons.length,
  failedFonts: f.conformance.failedFonts.length,
  empty: f.conformance.empty.length,
  docs: f.conformance.docs ?? 1,
  detectors: Object.fromEntries(
    Object.entries(f.detectors ?? {}).map(([kind, r]) => {
      // every distinct element (probe 6): the judge counts unique issues by these, and a row that
      // named only 8 of its 115 borders left the other 107 to be counted once per finding
      const labels = [...new Set(r.findings.map((/** @type {any} */ x) => String(x?.at ?? x)))]
      return [
        kind,
        {
          count: r.count,
          unique: labels.length,
          where: labels.slice(0, WHERE_MAX),
          // the findings the system broke on a page the template had right (`by: 'system'`): a fix in
          // the slot contract, still this template's to make
          bySystem: r.findings.filter((/** @type {any} */ x) => x?.by === 'system').length
        }
      ]
    })
  )
})

/**
 * The judged rows into the version's measurement file: one row per system and page, rows of the same
 * system and scheme replaced, and the declared page list (`previewPages`) beside them, so a page
 * without a row is unmeasured on /ops, never a pass.
 */
function writePreviewRows(d, row) {
  // the line, whatever slug the demo row spells it with (Tracy Base is `tracy` on its Add site card)
  const line = previewLineOf({ platform: d.platform, tag: d.tag })
  if (!line) return console.log(`  ${d.tag} names no template line: rows not written`)
  const file = resolve(
    ROOT,
    measurementPath({
      cms: d.platform,
      template: line.template,
      tag: `${line.template}/${line.cmsDir}`,
      version: d.version
    })
  )
  let doc
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return console.log(`  no measurement file at ${file}`)
  }
  const rows = Object.entries(row.pages).flatMap(([page, p]) =>
    Object.entries(p.systems ?? {})
      .filter(([, f]) => !f.miss)
      .map(([system, f]) => previewRowOf(system, page, f, row.scheme))
  )
  const measured = new Set(rows.map((r) => r.system))
  const keep = (doc.preview ?? []).filter((r) => !(measured.has(r.system) && r.scheme === row.scheme))
  doc.preview = [...keep, ...rows]
  doc.previewPages = row.pagesDeclared
  if (row.pagesNote) doc.previewPagesNote = row.pagesNote
  else delete doc.previewPagesNote
  const misses = (doc.previewMisses ?? []).filter((m) => m.scheme !== row.scheme)
  doc.previewMisses = [...misses, ...row.misses.map((m) => ({ ...m, scheme: row.scheme }))]
  if (!doc.previewMisses.length) delete doc.previewMisses
  doc.previewMeasuredAt = new Date().toISOString()
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)
}

/** A page's identity across addresses: Joomla's menu item or WordPress's page id, else its final path. */
const pageKeyOf = (/** @type {string} */ html, /** @type {string} */ path) => {
  const body = /<body\b[^>]*\bclass\s*=\s*["']([^"']*)["']/i.exec(html)?.[1] ?? ''
  return /\b(item-\d+|page-id-\d+|postid-\d+)\b/.exec(body)?.[1] ?? path
}

/**
 * One page of a demo open in the frame, wearing `id` (null: the template's own page): the live frame from
 * probe 10 (`openLiveFrame`), the static one (`compose` + `asTheFrameRuns`, served at `key`) before it; the
 * popup's Light | Dark pressed for a template that wears both sides.
 */
async function view({ chrome, scheme }, d, id, path, key, draws) {
  if (LIVE) {
    const live = await openLiveFrame(chrome, {
      d,
      id,
      path,
      draws,
      scheme,
      parentOrigin: `http://127.0.0.1:${PORT}`,
      fetchImpl: publicFetch(d.address)
    })
    if (!('miss' in live) && live.modes) await chrome.evaluate(pressSideExpression(live.sides, scheme))
    return live
  }
  const page = await compose(d, id, path)
  if ('miss' in page) return page
  pages.set(key, asTheFrameRuns(page.html))
  await chrome.open(`http://127.0.0.1:${PORT}${key}`, 1440, { scheme })
  await paintSide(chrome, scheme, page.modes)
  return page
}

/**
 * One declared page of a demo, plain and worn under each system, every detector on each, in the Chrome `c`
 * gives (a pool slot's own: nothing here is shared with another page measured at the same time).
 * @param {{ chrome: any, scheme: string }} c
 * @returns {Promise<{ systems: Record<string, any> }>}
 */
async function measurePage(c, d, slug, path, dir) {
  const { chrome, scheme } = c
  const pageKey = `/${slug}/${pageSlugOf(path)}`
  // one server answer per document for the template's page and every worn one (live frame: a random list)
  /** @type {Map<string, string>} */
  const draws = new Map()
  const plain = await view(c, d, null, path, `${pageKey}/plain`, draws)
  if ('miss' in plain) throw new Error(`plain: ${plain.miss}`)
  const plainProbe = await chrome.evaluate(PREVIEW_PROBE)
  const plainData = await probeAll(chrome)
  await chrome.shot(join(dir, 'plain.png'))
  /** @type {Record<string, any>} */
  const systems = {}
  for (const id of SYSTEMS) {
    const key = `${pageKey}/worn-${id.replace(/[^a-z0-9]/gi, '').slice(-12)}`
    const worn = await view(c, d, id, path, key, draws)
    if ('miss' in worn) {
      systems[id] = { miss: worn.miss }
      continue
    }
    if (process.env.PREVIEW_SAVE) writeFileSync(join(dir, 'worn.html'), worn.html)
    const wornProbe = await chrome.evaluate(PREVIEW_PROBE)
    const wornData = await probeAll(chrome)
    // the resolved roles, plus the status colours the slot writes itself (the probe leaves status out)
    const resolved = (await chrome.evaluate(SYSTEM_COLOURS_PROBE)) ?? []
    const statusColours = (worn.status ?? []).filter((c) => !resolved.includes(c))
    const systemColours = [...resolved, ...statusColours]
    // the system's own colours, from the library: the page's `--ds-c-*` resolve to the template's
    // palette when its rules beat the slot (unworn-page)
    const systemPalette = systemPaletteOf(ROOT, id)
    // PREVIEW_WHY=<selector>: every rule that sets a colour on the first such element, for a finding's cause
    if (process.env.PREVIEW_WHY)
      writeFileSync(
        join(dir, 'why.json'),
        JSON.stringify(
          await chrome.evaluate(
            `(() => { const el = document.querySelector(${JSON.stringify(process.env.PREVIEW_WHY)}); if (!el) return null; const out = []; const walk = (l) => { for (const r of l) { if (r.cssRules && !r.selectorText) { try { walk(r.cssRules) } catch {} continue } if (!r.selectorText) continue; let m = false; try { m = el.matches(r.selectorText) } catch {} if (m && /background|color/.test(r.cssText)) out.push(r.cssText.slice(0, 300)) } }; for (const s of document.styleSheets) { try { walk(s.cssRules) } catch {} } return { bg: getComputedStyle(el).backgroundColor, rules: out.slice(-40) } })()`
          ),
          null,
          2
        )
      )
    // PREVIEW_EVAL=<file>: an expression of that file evaluated on the worn page, for a finding's cause
    if (process.env.PREVIEW_EVAL)
      writeFileSync(
        join(dir, `eval-${key.split('/').pop()}.json`),
        JSON.stringify(await chrome.evaluate(readFileSync(process.env.PREVIEW_EVAL, 'utf8')), null, 2)
      )
    await chrome.shot(join(dir, `${key.split('/').pop()}.png`))
    const found = comparePreview(wornProbe, plainProbe, systemColours)
    found.said = wornProbe.said
    found.systemColours = systemColours
    // PREVIEW_DATA=1: every detector's raw probe data, plain and worn, to cut a test fixture from
    if (process.env.PREVIEW_DATA)
      writeFileSync(
        join(dir, `data-${key.split('/').pop()}.json`),
        JSON.stringify({
          source: `${d.tag}@${d.version} ${id} ${scheme} ${path}`,
          systemColours,
          systemPalette,
          plain: plainData,
          worn: wornData,
          // the preview probe's own answer (comparePreview's input: kept, glare, texts, buttons)
          preview: { plain: plainProbe, worn: wornProbe }
        })
      )
    found.detectors = detectAll(
      { base: wornProbe, data: wornData, html: worn.html },
      { base: plainProbe, data: plainData, html: plain.html },
      { systemColours, systemPalette, statusColours, scheme }
    )
    found.conformance.docs = (worn.html.match(/<\/html\s*>/gi) ?? []).length
    systems[id] = found
  }
  return { systems }
}

/** One console line for a judged system of one page. */
const lineOf = (/** @type {any} */ s) =>
  s?.miss
    ? `miss ${s.miss}`
    : `kept ${s.kept.length} (${s.keptShare}) glare ${s.glare.length} keptText ${s.keptText.length} lowText ${s.lowText.length} lostButtons ${s.lostButtons.length} fonts✗ ${s.conformance.failedFonts.length} empty ${s.conformance.empty.length} docs ${s.conformance.docs}${Object.entries(
        s.detectors ?? {}
      )
        .filter(([, r]) => r.count)
        .map(([k, r]) => ` ${k} ${r.count}`)
        .join('')}`

// third-party URLs every measured template's contract fails at once, as flow.mjs does (preview-check/measure-block.mjs)
const blocked = measureBlockOf(
  demos.map((d) => {
    const fit = quickstartContractOf({ platform: d.platform, tag: d.tag, version: d.version ?? null })
    return 'contract' in fit ? loadContract(fit.contract) : null
  })
)
// one Chrome per pool slot, each with its own profile and its own tab: a page never shares a browser with
// another page measured at the same time (the live frame's document rewrite is per browser)
const chromes = await Promise.all(
  Array.from({ length: PALETTE ? 1 : CONCURRENCY }, () => browser(9450 + (PORT % 50), { block: blocked }))
)
/** @type {{ label: string, d: any, row: any }[]} every side and demo measured, written together at the end */
const runs = []
for (const scheme of SCHEMES) {
  // two sides in one run: each side's files where a run of that side alone with --out <out>/<scheme> puts them
  const out = SCHEMES.length > 1 ? join(OUT, scheme) : OUT
  const summary = []
  for (const d of demos) {
    const slug = d.tag.replace(/^quickstart\//, '').replace(/\//g, '-')
    const dir = join(out, slug)
    mkdirSync(dir, { recursive: true })
    if (PALETTE) {
      try {
        const r = await paletteOfDemo(d, slug)
        console.log(
          `${slug.padEnd(28)} ${r.contract}: ${r.rules} rules, ${r.vars} vars, ${r.inline} inline, ${r.pages} pages`
        )
      } catch (e) {
        console.log(`${slug.padEnd(28)} ERROR ${String(e?.message ?? e)}`)
      }
      continue
    }
    const row = await measureDemo(d, slug, dir, scheme)
    runs.push({ label: `${slug} ${d.version} ${scheme}`, d, row })
    summary.push(row)
  }
  if (!PALETTE) writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2))
  // --palette reads no side: once is the whole run
  if (PALETTE) break
}
for (const chrome of chromes) await chrome.close?.()
server.close()
// a run that measured too little anywhere would leave the file looking whole (measure-gaps.mjs): the gaps of
// every side and demo first, then every row at once or none (light written before dark measured nothing left
// light's new rows beside dark's old ones)
const gaps = WRITE ? writeWholeRun(runs, SYSTEMS, (r) => writePreviewRows(r.d, r.row)) : []
if (gaps.length) console.error(`nothing written, the run measured too little:\n  ${gaps.join('\n  ')}`)
process.exit(gaps.length ? 1 : 0)

/**
 * Every wanted page of one demo on one side: each page's address read and its twins found first, in declared
 * order (a page that is another page under a second address is not measured), then the distinct pages measured
 * CONCURRENCY at a time, and the row put together in declared order, as a serial run puts it together.
 */
async function measureDemo(d, slug, dir, scheme) {
  const started = Date.now()
  const declared = await declaredPagesOf(d, { root: ROOT })
  const wanted = pagesFor(PAGES, declared.pages)
  const row = {
    tag: d.tag,
    platform: d.platform,
    version: d.version,
    scheme,
    // which frame the pages were read in: `live` (probe 10, scripts running) or `static` (before it)
    frame: LIVE ? 'live' : 'static',
    pageSource: declared.source,
    // a multilingual site's sampling rule (preview-pages.mjs localeSampleOf), and its locale twins
    pagesNote: declared.note ?? null,
    localeTwins: declared.locales?.twins ?? {},
    // the declared pages, less the ones this run found to be another page under a second address
    pagesDeclared: [...declared.pages],
    /** @type {Record<string, any>} */
    pages: {},
    /** @type {Record<string, string>} */
    sameAs: {},
    /** @type {{ page: string, system?: string, reason: string }[]} */
    misses: [],
    systems: {}
  }
  console.log(
    `${slug} (${scheme}): ${declared.pages.length} declared pages (${declared.source.join(' + ') || 'no contract: home only'}), measuring ${wanted.length}, ${Math.min(CONCURRENCY, wanted.length)} at a time`
  )
  if (declared.note)
    console.log(`  ${declared.note}; twins per locale ${JSON.stringify(declared.locales?.twins ?? {})}`)
  // the address the demo answers each page at (a redirect followed); a plain read of the stand, so read
  // together, and the twins decided after, in declared order
  const reads = await inPool(wanted, CONCURRENCY, async (path) => {
    try {
      const read = await readDemoPage({
        inner: new URL(d.address),
        publicOrigin: new URL(d.address).origin,
        fetchImpl: publicFetch(d.address),
        waitMs: 30000,
        path
      })
      if ('miss' in read) throw new Error(read.miss)
      return { read }
    } catch (e) {
      return { error: String(e?.message ?? e) }
    }
  })
  // whether a page already measured is the same page (Joomla's home item under its menu route, a login a
  // profile sends to)
  /** @type {Map<string, string>} */
  const seen = new Map()
  /** @type {({ path: string, error: string } | { path: string, twin: string } | { path: string, at: string })[]} */
  const plan = wanted.map((path, i) => {
    const r = reads[i]
    if ('error' in r) return { path, error: r.error }
    const key = pageKeyOf(r.read.html, r.read.path)
    const twin = seen.get(key)
    if (twin) return { path, twin }
    seen.set(key, path)
    return { path, at: r.read.path }
  })
  const todo = plan.filter((x) => 'at' in x)
  const measured = await inPool(todo, CONCURRENCY, async (x, _, slot) => {
    const pageDir = join(dir, pageSlugOf(x.path))
    mkdirSync(pageDir, { recursive: true })
    const t0 = Date.now()
    try {
      const m = await measurePage({ chrome: chromes[slot], scheme }, d, slug, x.at, pageDir)
      for (const [system, f] of Object.entries(m.systems))
        console.log(
          `  ${x.path.padEnd(40)} ${system.slice(0, 14).padEnd(14)} ${lineOf(f)} (${Math.round((Date.now() - t0) / 1000)}s)`
        )
      return { measured: m }
    } catch (e) {
      console.log(`  ${x.path.padEnd(40)} NOT MEASURED ${String(e?.message ?? e)}`)
      return { error: String(e?.message ?? e) }
    }
  })
  /** @type {Map<string, any>} */
  const byPath = new Map(todo.map((x, i) => [x.path, measured[i]]))
  for (const x of plan) {
    if ('error' in x) {
      row.misses.push({ page: x.path, reason: x.error })
      console.log(`  ${x.path.padEnd(40)} NOT MEASURED ${x.error}`)
      continue
    }
    if ('twin' in x) {
      row.sameAs[x.path] = x.twin
      row.pagesDeclared = row.pagesDeclared.filter((p) => p !== x.path)
      console.log(`  ${x.path.padEnd(40)} same page as ${x.twin}`)
      continue
    }
    const r = byPath.get(x.path)
    if ('error' in r) {
      row.misses.push({ page: x.path, reason: r.error })
      continue
    }
    row.pages[x.path] = { at: x.at, ...r.measured }
    for (const [system, f] of Object.entries(r.measured.systems))
      if (f.miss) row.misses.push({ page: x.path, system, reason: f.miss })
  }
  // the home page's systems where they always were, for preview-gate and older readers
  row.systems = row.pages['/']?.systems ?? {}
  if (!row.pages['/']) row.error = row.misses.find((m) => m.page === '/')?.reason ?? 'home page not measured'
  row.seconds = Math.round((Date.now() - started) / 1000)
  writeFileSync(join(dir, 'preview.json'), JSON.stringify(row, null, 2))
  console.log(
    `${slug.padEnd(28)} ${scheme}: ${Object.keys(row.pages).length} pages measured, ${row.misses.length} misses, ${Object.keys(row.sameAs).length} same-as, ${row.seconds}s`
  )
  return row
}
