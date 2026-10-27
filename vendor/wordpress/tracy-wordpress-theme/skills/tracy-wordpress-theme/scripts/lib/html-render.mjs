// html-render.mjs — serve a design folder on a local origin and render its pages in a browser.
//
// Two things a spec-pack needs that no parser can produce: the DOM as the viewer sees it (a canvas
// export fills its `{{ }}` bindings only when its runtime runs) and computed styles at the two
// viewports and two colour modes the design contract is written in. Both come from here.
//
//   serveStatic(dir)                      — node:http static server on 127.0.0.1, a free port, no
//                                            directory traversal, content types by extension
//   renderSite({ origin, pages, outDir }) — Playwright Chromium: per page, the filled DOM at
//                                            1440/light (`rendered/<slug>--1440-light.html`), a
//                                            JPEG per viewport × mode, measurements (computed
//                                            styles of body / headings / first section / primary
//                                            button, container width, overflow, fonts), console
//                                            errors, and — for chrome links whose href is `#` —
//                                            the URL their click handler navigates to, captured
//                                            by aborting the navigation request (the page stays).
//
// The browser is Playwright's Chromium (`npx playwright install chromium`); RENDER_CHROME_PATH
// points at another executable. Network is whatever the source needs — a canvas export loads
// React from unpkg — and a page that never fills (text under `minText`) is reported as
// `booted: false` so the caller can fall back to the static binder rather than ship a skeleton.

import { createServer } from 'node:http'
import { createReadStream, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, sep, extname } from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8'
}

/** Serve `dir` read-only on 127.0.0.1. Resolves to `{ origin, port, close }`. */
export function serveStatic(dir, { port = 0 } = {}) {
  const root = resolve(dir)
  const server = createServer((req, res) => {
    let pathname
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
    } catch {
      res.writeHead(400).end()
      return
    }
    const target = resolve(root, '.' + pathname)
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403).end()
      return
    }
    let file = target
    let info = existsSync(file) ? statSync(file) : null
    if (info?.isDirectory()) {
      file = join(file, 'index.html')
      info = existsSync(file) ? statSync(file) : null
    }
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
      return
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-store'
    })
    createReadStream(file).pipe(res)
  })
  return new Promise((resolveP, reject) => {
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const p = server.address().port
      resolveP({ origin: `http://127.0.0.1:${p}`, port: p, close: () => new Promise((r) => server.close(r)) })
    })
  })
}

const VIEWPORTS = [
  { id: '1440', width: 1440, height: 900 },
  { id: '390', width: 390, height: 844 }
]
const MODES = ['light', 'dark']

const pageSlug = (file) =>
  String(file)
    .replace(/\.html?$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

async function launch() {
  const { chromium } = await import('playwright')
  if (process.env.RENDER_CHROME_PATH) return chromium.launch({ executablePath: process.env.RENDER_CHROME_PATH })
  return chromium.launch()
}

// Runs inside the page: computed styles the design contract is written against.
function measureInPage() {
  const cs = (el) => (el ? getComputedStyle(el) : null)
  const pick = (el, props) => {
    const s = cs(el)
    return s ? Object.fromEntries(props.map((p) => [p, s[p]])) : null
  }
  const TYPE = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color']
  const opaque = (s) => s && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent'
  const main = document.querySelector('main, [role="main"]') || document.body
  const firstSection = main.querySelector(':scope > section') || main.querySelector(':scope > div') || main
  // Band rhythm: a section's top padding may sit on the section or on its container child; the
  // most common non-zero value across the page's sections is the rhythm.
  const rhythm = new Map()
  for (const sec of main.querySelectorAll(':scope > section, :scope > div')) {
    const cands = [sec, ...[...sec.children].slice(0, 2)].map((e) => parseFloat(cs(e).paddingTop) || 0)
    const top = Math.max(...cands)
    if (top > 0) rhythm.set(top, (rhythm.get(top) ?? 0) + 1)
  }
  const sectionY = [...rhythm.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null
  const bodyLink =
    main.querySelector('p a[href]') ||
    main.querySelector('li a[href]') ||
    [...main.querySelectorAll('a[href]')].find((a) => !opaque(cs(a))) ||
    main.querySelector('a[href]')
  const button =
    [...document.querySelectorAll('header a, header button')].find((a) => opaque(cs(a)) && a.textContent.trim()) ||
    [...main.querySelectorAll('a, button')].find((a) => opaque(cs(a)) && a.textContent.trim())
  const widths = new Map()
  for (const el of main.querySelectorAll('*')) {
    const w = parseFloat(cs(el).maxWidth)
    if (w >= 600 && w <= 2000) widths.set(w, (widths.get(w) ?? 0) + 1)
  }
  const container = [...widths.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const fonts = [...new Set([...document.querySelectorAll('body *')].slice(0, 3000).map((e) => cs(e).fontFamily))].slice(0, 12)
  return {
    title: document.title,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientWidth: document.documentElement.clientWidth,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    textLength: document.body.innerText.trim().length,
    fonts,
    body: pick(document.body, ['color', 'backgroundColor', 'fontFamily', 'fontSize', 'lineHeight']),
    h1: pick(document.querySelector('h1'), TYPE),
    h2: pick(document.querySelector('h2'), TYPE),
    h3: pick(document.querySelector('h3'), TYPE),
    p: pick(main.querySelector('p'), TYPE),
    link: pick(bodyLink, ['color']),
    section: { ...pick(firstSection, ['backgroundColor']), paddingTop: sectionY == null ? null : `${sectionY}px`, paddingBottom: sectionY == null ? null : `${sectionY}px` },
    button: pick(button, ['backgroundColor', 'color', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderRadius', 'fontSize', 'fontWeight']),
    buttonText: button ? button.textContent.trim() : null,
    container: container ? `${container}px` : null
  }
}

// Runs inside the page: tag every chrome anchor whose href is not a real target, for the probe.
function tagProbeTargets(marker) {
  const label = (a) => {
    const kids = [...a.children].filter((c) => c.textContent.trim())
    return (kids.length >= 2 ? kids[0] : a).textContent.replace(/\s+/g, ' ').trim()
  }
  const chrome = [...document.querySelectorAll('header, footer, nav, [role="banner"], [role="contentinfo"]')]
  const header = document.querySelector('header, [role="banner"]')
  if (header) {
    let bar = header.previousElementSibling
    while (bar && !bar.querySelector('a')) bar = bar.previousElementSibling
    if (bar) chrome.push(bar)
  }
  const all = []
  const added = []
  let n = document.querySelectorAll(`[${marker}]`).length
  for (const root of chrome)
    for (const a of root.querySelectorAll('a')) {
      const href = a.getAttribute('href') || ''
      if (!a.hasAttribute(marker)) {
        if (href && href !== '#' && !href.startsWith('#')) continue
        a.setAttribute(marker, String(n++))
        added.push(a)
      }
      const entry = { id: a.getAttribute(marker), label: label(a), region: root.tagName.toLowerCase() }
      all.push(entry)
      if (added.includes(a)) entry.added = true
    }
  return { all, added: all.filter((e) => e.added).map(({ added: _a, ...e }) => e) }
}

// Runs inside the page: the filled document, without the runtime's own furniture.
function snapshotInPage() {
  const clone = document.documentElement.cloneNode(true)
  for (const el of clone.querySelectorAll('script, x-dc, helmet, [data-dc-editor]')) el.remove()
  return '<!DOCTYPE html>\n' + clone.outerHTML
}

/**
 * Render pages. `pages`: `[{ file }]` (paths relative to the served dir). Writes into `outDir`
 * and returns `[{ file, slug, booted, snapshot, shots, measurements, errors, probed }]`.
 * `darkAttr` is the attribute set on `<html>` for dark mode (`data-theme="dark"`). `probePages`
 * (a Set of files) limits the link probe to those pages — the chrome is the same on every page.
 */
export async function renderSite({
  origin,
  pages,
  outDir,
  viewports = VIEWPORTS,
  modes = MODES,
  darkAttr = 'data-theme',
  probe = true,
  probePages = null,
  minText = 200,
  timeout = 45000,
  fontProbe = null,
  log = () => {}
}) {
  mkdirSync(outDir, { recursive: true })
  const browser = await launch()
  const results = []
  try {
    for (const { file, route = '/', sourceFile = file } of pages) {
      const slug = pageSlug(file)
      const url = `${origin}/${file.split('/').map(encodeURIComponent).join('/')}`
      const context = await browser.newContext({
        viewport: { width: viewports[0].width, height: viewports[0].height },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce'
      })
      const page = await context.newPage()
      const errors = []
      const failedFontRequests = []
      page.on('requestfailed', (request) => {
        const requestUrl = request.url()
        if (request.resourceType() === 'font' || /fonts\.(googleapis|gstatic|bunny)|\.(woff2?|ttf|otf|eot)(\?|$)/i.test(requestUrl)) failedFontRequests.push({ url: requestUrl.slice(0, 300), resourceType: request.resourceType(), error: request.failure()?.errorText ?? 'failed' })
      })
      page.on('response', (response) => {
        const request = response.request(), requestUrl = response.url()
        if (response.status() >= 400 && (request.resourceType() === 'font' || /fonts\.(googleapis|gstatic|bunny)|\.(woff2?|ttf|otf)(\?|$)/i.test(requestUrl))) failedFontRequests.push({ url: requestUrl.slice(0, 300), resourceType: request.resourceType(), status: response.status() })
      })
      page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
      page.on('pageerror', (e) => errors.push(String(e)))
      // 4xx/5xx responses, minus the canvas runtime's own noise: <image-slot> prefetches its raw
      // `{{ x.img }}` template src before binding, and looks for a .image-slots.state.json file.
      page.on('response', (r) => r.status() >= 400 && !probeState.probing && !/%7B%7B|\.image-slots\.state\.json$/.test(r.url()) && errors.push(`${r.status()} ${r.url()}`))
      const probeState = { probing: false, captured: null }
      await page.route('**/*', (route) => {
        const req = route.request()
        if (probeState.probing && req.isNavigationRequest() && req.frame() === page.mainFrame()) {
          probeState.captured = req.url()
          return route.abort('aborted')
        }
        return route.continue()
      })
      const result = { file, slug, url, booted: false, snapshot: null, shots: {}, measurements: {}, errors, probed: [], fontPages: [] }
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout })
        await page.waitForFunction((n) => document.body && document.body.innerText.trim().length > n, minText, { timeout: Math.min(timeout, 20000) }).catch(() => {})
        await page.evaluate(() => document.fonts.ready).catch(() => {})
        const textLength = await page.evaluate(() => document.body.innerText.trim().length)
        result.booted = textLength >= minText
        const doProbe = probe && result.booted && (!probePages || probePages.has(file))
        // Tag the chrome anchors first so the snapshot carries the probe ids, then snapshot the
        // filled DOM before any probe click changes state.
        if (doProbe) await page.evaluate(tagProbeTargets, 'data-probe')
        const html = await page.evaluate(snapshotInPage)
        const snapPath = join('rendered', `${slug}--${viewports[0].id}-light.html`)
        mkdirSync(join(outDir, 'rendered'), { recursive: true })
        writeFileSync(join(outDir, snapPath), html)
        result.snapshot = snapPath
        for (const mode of modes) {
          await page.emulateMedia({ colorScheme: mode })
          await page.evaluate(([attr, m]) => document.documentElement.setAttribute(attr, m), [darkAttr, mode])
          for (const vp of viewports) {
            await page.setViewportSize({ width: vp.width, height: vp.height })
            await page.waitForTimeout(150)
            const key = `${vp.id}-${mode}`
            result.measurements[key] = await page.evaluate(measureInPage)
            if (fontProbe && mode === 'light' && (vp.width === 1440 || vp.width === 390)) result.fontPages.push(await fontProbe(page, { file: sourceFile, route, url, width: vp.width, failedRequests: [...failedFontRequests] }))
            const shot = join('rendered', `${slug}--${key}.jpg`)
            await page.screenshot({ path: join(outDir, shot), fullPage: true, type: 'jpeg', quality: 70 })
            result.shots[key] = shot
          }
        }
        await page.emulateMedia({ colorScheme: 'light' })
        await page.evaluate(([attr]) => document.documentElement.setAttribute(attr, 'light'), [darkAttr])
        await page.setViewportSize({ width: viewports[0].width, height: viewports[0].height })
        if (doProbe) result.probed = await probeLinks(page, probeState, url, log)
      } catch (e) {
        errors.push(`render: ${e.message}`)
      }
      log(`${result.booted ? 'ok' : 'SKELETON'} ${file}${errors.length ? ` (${errors.length} error(s))` : ''}`)
      results.push(result)
      await context.close()
    }
  } finally {
    await browser.close()
  }
  return results
}

/**
 * Click every chrome anchor whose href is `#` and record where its handler navigates. A click
 * that opens a panel instead (a mega menu) exposes new anchors, which are probed as its children.
 * Returns `[{ id, label, region, target, children: [...] }]`; `target` is null when nothing navigated.
 */
async function probeLinks(page, state, url, log) {
  const marker = 'data-probe'
  const roots = (await page.evaluate(tagProbeTargets, marker)).all
  const probeOne = async (id) => {
    state.captured = null
    state.probing = true
    try {
      await page.click(`[${marker}="${id}"]`, { timeout: 1500, force: true, noWaitAfter: true })
      await page.waitForTimeout(200)
    } catch {
      /* not clickable: no target */
    } finally {
      state.probing = false
    }
    if (page.url() !== url || (await page.evaluate(() => document.body.innerText.trim().length).catch(() => 0)) < 50) {
      // The abort did not hold (or the handler replaced the document): come back.
      await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(300)
      await page.evaluate(tagProbeTargets, marker).catch(() => {})
    }
    return state.captured
  }
  const out = []
  for (const item of roots) {
    const target = await probeOne(item.id)
    const entry = { ...item, target, children: [] }
    if (!target) {
      // Did the click reveal new anchors (a panel)? Probe them as children, then close the panel.
      const revealed = (await page.evaluate(tagProbeTargets, marker)).added
      for (const child of revealed) {
        const t = await probeOne(child.id)
        entry.children.push({ ...child, target: t })
      }
      if (revealed.length) await probeOne(item.id)
    }
    out.push(entry)
  }
  log(`probed ${out.length} chrome link(s), ${out.filter((o) => o.target).length} navigate`)
  return out
}
