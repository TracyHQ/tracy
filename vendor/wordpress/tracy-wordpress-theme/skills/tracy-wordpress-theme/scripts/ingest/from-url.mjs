#!/usr/bin/env node
// Capture a live URL into a manifest bundle, then use from-html's full extraction pipeline.
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { JSDOM } from 'jsdom'
import { buildSpecPack } from './from-html.mjs'
import { CAPTURE_LIMITS, fetchBounded, stylesheetLinks } from '../lib/source-capture.mjs'
import { inferView } from '../lib/html-bundle.mjs'
import { cssFacts } from './source-font.mjs'

const args = process.argv.slice(2)
const flag = (n, d = null) => {
  const i = args.indexOf(n)
  return i === -1 ? d : args[i + 1]
}
const out = flag('--out')
const maxPagesRaw = flag('--max-pages', '30')
const maxPages = Number(maxPagesRaw)
const MAX_REDIRECT_HOPS = 10
if (!Number.isInteger(maxPages) || maxPages < 1) {
  console.error(`--max-pages must be a positive integer; got ${JSON.stringify(maxPagesRaw)}`)
  process.exit(2)
}
const sameOrigin = !args.includes('--allow-cross-origin')
const start = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '--out' && args[i - 1] !== '--max-pages' && args[i - 1] !== '--port')
if (!start || !out) {
  console.error('usage: from-url.mjs <start-url> --out <spec-pack-dir> [--max-pages 30] [--allow-cross-origin] [--render] [--port N] [--force]')
  process.exit(2)
}
const existing = ['page-map.json', 'reference.json', 'provenance.json'].filter((file) => existsSync(join(out, file)))
if (existing.length && !args.includes('--force')) {
  console.error(
    `spec-pack already exists at ${out} (${existing.join(', ')}). ` +
      `Re-running would discard any hand-completed palette, sections[] or shots. ` +
      `Pass --force to overwrite, or point --out at a new directory.`
  )
  process.exit(1)
}
let startUrl
try { startUrl = new URL(start) } catch { console.error(`not a valid URL: ${start}`); process.exit(2) }
if (!/^https?:$/.test(startUrl.protocol)) { console.error(`not an HTTP URL: ${start}`); process.exit(2) }

const SKIP_EXT = /\.(pdf|zip|jpe?g|png|gif|svg|webp|avif|mp4|webm|mp3|css|js|xml|json|ico|woff2?|ttf|otf)$/i
function normalize(value) {
  const url = new URL(value)
  url.hash = ''
  let s = url.toString()
  if (s.endsWith('/') && url.pathname !== '/') s = s.slice(0, -1)
  return s
}
function routePath(value) {
  const url = new URL(value)
  return url.pathname || '/'
}
function pageFilename(value) {
  const path = new URL(value).pathname.replace(/\/+$/, '')
  const last = path.split('/').filter(Boolean).pop()
  const base = (last || 'index').replace(/\.(html?|php)$/i, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()
  return `${base || 'index'}.html`
}
function extractLinks(html, base) {
  const links = new Set()
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim()
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue
    try {
      const abs = new URL(href, base)
      if (!/^https?:$/.test(abs.protocol) || SKIP_EXT.test(abs.pathname)) continue
      links.add(normalize(abs.toString()))
    } catch { /* ignore invalid links */ }
  }
  return [...links]
}
function ensureBase(html, finalUrl) {
  const escapeAttr = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const existingBase = html.match(/<base\b[^>]*>/i)
  if (existingBase) {
    const tag = existingBase[0]
    const href = /(\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
    const attr = tag.match(href)
    let absolute
    try { absolute = new URL(attr ? (attr[2] ?? attr[3] ?? attr[4]) : finalUrl, finalUrl).href }
    catch { absolute = finalUrl }
    const replacement = attr ? tag.replace(href, (_match, whitespace) => `${whitespace}href="${escapeAttr(absolute)}"`) : tag.replace(/\s*\/?>$/, (end) => ` href="${escapeAttr(absolute)}"${end}`)
    return html.replace(tag, replacement)
  }
  const tag = `<base href="${escapeAttr(finalUrl)}">`
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (m) => `${m}${tag}`)
  return `<!doctype html><html><head>${tag}</head>${html}`
}

const queue = [normalize(startUrl.toString())]
const seen = new Set(queue)
const found = []
const failures = []
const redirectRules = []
const ownersByPath = new Map()
while (queue.length && found.length < maxPages) {
  const requestedUrl = queue.shift()
  let current = requestedUrl
  const chain = []
  const visited = new Set()
  let response
  try {
    for (let hop = 0; ; hop++) {
      if (visited.has(current)) throw new Error(`redirect loop at ${current}`)
      visited.add(current)
      response = await fetchBounded(current, { timeoutMs: CAPTURE_LIMITS.requestTimeoutMs, maxBytes: CAPTURE_LIMITS.pageBytes, includeContentType: true })
      if (response.status >= 300 && response.status < 400) {
        if (!response.location) throw new Error(`${current}: a ${response.status} answer with no Location`)
        if (hop >= MAX_REDIRECT_HOPS) throw new Error(`redirect hop bound (${MAX_REDIRECT_HOPS}) exceeded at ${current}`)
        const next = new URL(response.location, current).toString()
        if (sameOrigin && new URL(next).origin !== startUrl.origin) {
          failures.push({ url: requestedUrl, redirectedTo: next, reason: 'redirected off-origin', status: response.status, chain: [...chain, { from: current, status: response.status, location: response.location, to: next }] })
          response = null
          break
        }
        chain.push({ from: current, status: response.status, location: response.location, to: next })
        current = next
        continue
      }
      break
    }
  } catch (e) {
    failures.push({ url: requestedUrl, error: e.message, chain })
    continue
  }
  if (!response) continue
  const finalParsed = new URL(current)
  finalParsed.hash = ''
  const finalUrl = finalParsed.toString()
  if (sameOrigin && new URL(finalUrl).origin !== startUrl.origin) {
    failures.push({ url: requestedUrl, redirectedTo: finalUrl, reason: 'redirected off-origin', chain })
    continue
  }
  if (response.status < 200 || response.status >= 300) {
    failures.push({ url: requestedUrl, status: response.status, finalUrl, chain })
    continue
  }
  if (!/text\/html/i.test(response.contentType)) {
    failures.push({ url: requestedUrl, status: response.status, finalUrl, reason: `non-HTML content type: ${response.contentType || '(missing)'}`, chain })
    continue
  }
  const html = ensureBase(response.body.toString('utf8'), finalUrl)
  const path = routePath(finalUrl)
  const owner = ownersByPath.get(path)
  if (owner) {
    if (normalize(owner.url) !== normalize(finalUrl)) failures.push({ url: requestedUrl, requestedUrl, finalUrl, status: response.status, chain, reason: `query variant of ${path}` })
    else for (const hop of chain) redirectRules.push({ from: routePath(hop.from), to: path, status: hop.status, reason: `captured redirect from ${hop.from}` })
    continue
  }
  for (const hop of chain) redirectRules.push({ from: routePath(hop.from), to: path, status: hop.status, reason: `captured redirect from ${hop.from}` })
  const file = pageFilename(finalUrl)
  const page = { file, requestedUrl, url: finalUrl, path, status: response.status, chain, html, view: inferView(file, html), bytes: html.length }
  found.push(page)
  ownersByPath.set(path, page)
  for (const link of extractLinks(html, finalUrl)) {
    if (seen.has(link) || (sameOrigin && new URL(link).origin !== startUrl.origin)) continue
    seen.add(link)
    queue.push(link)
  }
}

if (!found.length) {
  console.error(`crawl found no HTML pages at ${start}`)
  for (const f of failures.slice(0, 5)) console.error(`  ${f.url} → ${f.status ?? f.error ?? f.reason}`)
  process.exit(1)
}

const usedNames = new Set()
for (const p of found) {
  const stem = p.file.replace(/\.html$/, '')
  let n = 2
  while (usedNames.has(p.file)) p.file = `${stem}-${n++}.html`
  usedNames.add(p.file)
}
// Preserve the source root as the only WordPress front page when it was captured.
if (found.some((p) => p.path === '/')) {
  for (const page of found) page.view = page.path === '/' ? 'front-page' : (page.view === 'front-page' ? 'page' : page.view)
} else {
  found.sort((a, b) => b.bytes - a.bytes)
  found[0].view = 'front-page'
  for (const page of found.slice(1)) if (page.view === 'front-page') page.view = 'page'
}
found.sort((a, b) => a.file.localeCompare(b.file))

// Capture every linked stylesheet and its imports under the same limits and origin policy as the page crawl.
const stylesheetMap = { urls: {}, finalUrls: {}, localPaths: {}, localUrls: {}, assets: {}, gaps: [] }
const cssByUrl = new Map()
const fontByUrl = new Map()
let cssBytes = 0
let importCount = 0
const cssHash = (url) => createHash('sha256').update(url).digest('hex')
const noHashUrl = (value) => { const u = new URL(value); u.hash = ''; return u.href }
const queueCss = []
for (const page of found) {
  let hrefs = []
  let baseUrl = page.url
  try {
    const doc = new JSDOM(page.html, { url: page.url }).window.document
    baseUrl = doc.baseURI
    hrefs = stylesheetLinks(page.html)
  }
  catch (e) { stylesheetMap.gaps.push({ url: page.url, reason: e.message }); continue }
  for (const href of hrefs) {
    try { queueCss.push({ url: noHashUrl(new URL(href, baseUrl).href), page }) }
    catch { stylesheetMap.gaps.push({ url: `${page.url} (${href})`, reason: 'invalid stylesheet URL' }) }
  }
  for (const style of new JSDOM(page.html, { url: page.url }).window.document.querySelectorAll('style')) for (const imported of cssFacts(style.textContent ?? '').imports) {
    if (importCount >= CAPTURE_LIMITS.imports) { stylesheetMap.gaps.push({ url: `${page.url} (${imported})`, reason: `more than ${CAPTURE_LIMITS.imports} stylesheet imports` }); continue }
    importCount++
    try { queueCss.push({ url: noHashUrl(new URL(imported, baseUrl).href), page, importedFrom: `${page.url} inline style`, depth: 1 }) }
    catch { stylesheetMap.gaps.push({ url: `${page.url} (${imported})`, reason: 'invalid inline @import URL' }) }
  }
  if (hrefs.length > CAPTURE_LIMITS.sheetsPerRoute) stylesheetMap.gaps.push({ url: page.url, reason: `more than ${CAPTURE_LIMITS.sheetsPerRoute} stylesheets on one page` })
}
for (let i = 0; i < queueCss.length; i++) {
  const item = queueCss[i]
  const url = noHashUrl(item.url)
  if (cssByUrl.has(url)) continue
  if (sameOrigin && new URL(url).origin !== startUrl.origin) {
    stylesheetMap.gaps.push({ url, reason: 'off-origin stylesheet is outside the capture policy' })
    continue
  }
  if (cssByUrl.size >= CAPTURE_LIMITS.files) {
    stylesheetMap.gaps.push({ url, reason: `more than ${CAPTURE_LIMITS.files} captured files` })
    continue
  }
  if ((item.depth ?? 0) > CAPTURE_LIMITS.depth) {
    stylesheetMap.gaps.push({ url, reason: `stylesheet imports exceed the depth bound (${CAPTURE_LIMITS.depth})` })
    continue
  }
  let current = url, response = null
  try {
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      response = await fetchBounded(current, { timeoutMs: CAPTURE_LIMITS.requestTimeoutMs, maxBytes: CAPTURE_LIMITS.sheetBytes, includeContentType: true })
      if (response.status >= 300 && response.status < 400 && response.location) {
        const next = noHashUrl(new URL(response.location, current).href)
        if (sameOrigin && new URL(next).origin !== startUrl.origin) throw new Error(`redirected off-origin to ${next}`)
        if (hop === MAX_REDIRECT_HOPS) throw new Error(`redirect hop bound (${MAX_REDIRECT_HOPS}) exceeded`)
        current = next
        continue
      }
      break
    }
    if (!response || response.status !== 200) throw new Error(`the site answered ${response?.status ?? 'nothing'}`)
    if (response.contentType && !/text\/css|application\/css/i.test(response.contentType)) throw new Error(`unexpected content type ${response.contentType}`)
    const text = response.body.toString('utf8')
    cssBytes += response.body.length
    if (cssBytes > CAPTURE_LIMITS.totalBytes) throw new Error(`captured stylesheets exceed ${CAPTURE_LIMITS.totalBytes} bytes`)
    const local = `_captured-css/${cssHash(url)}.css`
    cssByUrl.set(url, { url, finalUrl: current, local, text })
    stylesheetMap.urls[url] = `pages/${local}`
    stylesheetMap.finalUrls[url] = current
    stylesheetMap.localPaths[`/${local}`] = `pages/${local}`
    stylesheetMap.localUrls[`/${local}`] = current
    for (const imported of cssFacts(text).imports) {
      if (importCount >= CAPTURE_LIMITS.imports) { stylesheetMap.gaps.push({ url: `${url} (${imported})`, reason: `more than ${CAPTURE_LIMITS.imports} stylesheet imports` }); continue }
      importCount++
      try { queueCss.push({ url: noHashUrl(new URL(imported, current).href), page: item.page, importedFrom: url, depth: (item.depth ?? 0) + 1 }) }
      catch { stylesheetMap.gaps.push({ url: `${url} (${imported})`, reason: 'invalid @import URL' }) }
    }
  } catch (e) { stylesheetMap.gaps.push({ url, reason: e.message }) }
}
// Capture font files declared by @font-face. Other CSS resources keep their original absolute URL.
for (const css of cssByUrl.values()) {
  for (const src of cssFacts(css.text).fontFaces.flatMap((face) => face.srcs)) {
    let url
    try { url = noHashUrl(new URL(src, css.finalUrl).href) }
    catch { stylesheetMap.gaps.push({ url: `${css.url} (${src})`, reason: 'invalid @font-face source URL' }); continue }
    if (!/^https?:$/.test(new URL(url).protocol)) continue
    if (fontByUrl.has(url)) continue
    if (sameOrigin && new URL(url).origin !== startUrl.origin) {
      stylesheetMap.gaps.push({ url, reason: 'off-origin font file is outside the capture policy' })
      continue
    }
    if (cssByUrl.size + fontByUrl.size >= CAPTURE_LIMITS.files) {
      stylesheetMap.gaps.push({ url, reason: `more than ${CAPTURE_LIMITS.files} captured files` })
      continue
    }
    let current = url, response = null
    try {
      for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
        response = await fetchBounded(current, { timeoutMs: CAPTURE_LIMITS.requestTimeoutMs, maxBytes: CAPTURE_LIMITS.fileBytes, includeContentType: true })
        if (response.status >= 300 && response.status < 400 && response.location) {
          const next = noHashUrl(new URL(response.location, current).href)
          if (sameOrigin && new URL(next).origin !== startUrl.origin) throw new Error(`redirected off-origin to ${next}`)
          if (hop === MAX_REDIRECT_HOPS) throw new Error(`redirect hop bound (${MAX_REDIRECT_HOPS}) exceeded`)
          current = next
          continue
        }
        break
      }
      if (!response || response.status !== 200) throw new Error(`the site answered ${response?.status ?? 'nothing'}`)
      const bytes = response.body.length
      if (cssBytes + bytes > CAPTURE_LIMITS.totalBytes) throw new Error(`captured stylesheets and font files exceed ${CAPTURE_LIMITS.totalBytes} bytes`)
      cssBytes += bytes
      const pathname = new URL(current).pathname
      const ext = /\.[a-z0-9]{1,8}$/i.exec(pathname)?.[0]?.toLowerCase() ?? '.bin'
      const local = `_captured-css/${cssHash(url)}${ext}`
      fontByUrl.set(url, { url, finalUrl: current, local, body: response.body })
      stylesheetMap.assets[url] = `pages/${local}`
    } catch (e) { stylesheetMap.gaps.push({ url, reason: `@font-face file was not captured (${e.message})` }) }
  }
}
const rewriteCssUrls = (css, text) => {
  const fontSources = new Set(cssFacts(text).fontFaces.flatMap((face) => face.srcs).flatMap((src) => {
    try { return [noHashUrl(new URL(src, css.finalUrl).href)] } catch { return [] }
  }))
  return text.replace(/url\(\s*(?:(['"])(.*?)\1|([^'")\s]+))\s*\)/gi, (match, quote, quoted, bare) => {
    const raw = (quoted ?? bare ?? '').trim()
    if (!raw || /^data:/i.test(raw)) return match
    let absolute
    try { absolute = noHashUrl(new URL(raw, css.finalUrl).href) }
    catch { return match }
    if (fontSources.has(absolute)) {
      const asset = fontByUrl.get(absolute)
      return asset ? `url("/${asset.local}")` : `url("${absolute}")`
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return match
    return `url("${new URL(raw, css.finalUrl).href}")`
  })
}
for (const page of found) {
  const doc = new JSDOM(page.html, { url: page.url }).window.document
  for (const link of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
    let absolute
    try { absolute = noHashUrl(new URL(link.getAttribute('href'), doc.baseURI).href) } catch { continue }
    const captured = cssByUrl.get(absolute)
    if (captured) link.setAttribute('href', `/${captured.local}`)
  }
  for (const style of doc.querySelectorAll('style')) {
    let text = style.textContent ?? ''
    for (const imported of cssFacts(text).imports) {
      try {
        const captured = cssByUrl.get(noHashUrl(new URL(imported, doc.baseURI).href))
        if (captured) text = text.replace(imported, `/${captured.local}`)
      } catch { /* capture gap is recorded above */ }
    }
    style.textContent = text
  }
  page.html = `<!doctype html>\n${doc.documentElement.outerHTML}`
}
for (const css of cssByUrl.values()) {
  let text = css.text
  const facts = cssFacts(text)
  for (const imported of facts.imports) {
    try {
      const absolute = noHashUrl(new URL(imported, css.finalUrl).href)
      const captured = cssByUrl.get(absolute)
      if (captured) text = text.replace(imported, `/${captured.local}`)
    } catch { /* gap recorded when discovered */ }
  }
  css.text = rewriteCssUrls(css, text)
}

const host = startUrl.hostname.replace(/^www\./, '').split('.')[0].replace(/[^a-z0-9-]/gi, '').toLowerCase()
const slug = /^[a-z][a-z0-9-]*$/.test(host) ? host : 'site'
const capture = join(out, 'reference', 'capture')
const pagesDir = join(capture, 'pages')
await mkdir(pagesDir, { recursive: true })
for (const page of found) await writeFile(join(pagesDir, page.file), page.html)
await mkdir(join(pagesDir, '_captured-css'), { recursive: true })
for (const css of cssByUrl.values()) await writeFile(join(pagesDir, css.local), css.text)
for (const font of fontByUrl.values()) await writeFile(join(pagesDir, font.local), font.body)
await writeFile(join(capture, 'stylesheet-map.json'), JSON.stringify(stylesheetMap, null, 2) + '\n')
await writeFile(join(capture, 'manifest.json'), JSON.stringify({
  template: { name: slug, title: slug.replace(/^./, (c) => c.toUpperCase()) },
  theme: { palette: { light: { primary: null, secondary: null, body_bg: null, text: null }, dark: null }, fonts: { body: null, heading: null } },
  templateParts: ['header', 'footer'],
  pages: found.map((p) => ({ file: p.file, path: p.path, view: p.path === '/' ? 'front-page' : p.view, url: p.url, status: p.status }))
}, null, 2) + '\n')
const provenanceSource = {
  kind: 'url', start: startUrl.toString(), origin: startUrl.origin, crawled: found.length, sameOrigin, failures,
  pages: found.map(({ file, requestedUrl, url, path, status, chain }) => ({ file, requestedUrl, url, path, status, chain }))
}
try {
  await buildSpecPack({
    src: capture, out, render: args.includes('--render') && !args.includes('--no-render'),
    port: Number(flag('--port', 0)) || 0, force: args.includes('--force'),
    packKind: 'html', adapter: 'from-url', provenanceSource, redirectRules,
    log: (m) => console.error(m)
  })
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
await writeFile(join(out, 'reference', 'crawl.json'), JSON.stringify({ start: startUrl.toString(), crawledAt: new Date().toISOString(), pages: found.map(({ html, ...p }) => p), failures }, null, 2) + '\n')
console.error(`from-url: captured ${found.length} page(s) from ${startUrl.origin}${failures.length ? ` (${failures.length} failed)` : ''}`)
