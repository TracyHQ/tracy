#!/usr/bin/env node
// Crawl a running site from its locale roots and ASSERT the acceptance policy, page by page:
//   • every internal link and image answers (200), unknown URLs answer 404
//   • exactly one H1 on 200 pages; <html lang> is a configured locale
//   • indexable pages: robots not noindex; canonical == this page's own URL per the canonical policy
//     (path + `canonicalQuery` params); one hreflang alternate per configured locale plus x-default,
//     each pointing at a 200 page whose <html lang> matches the alternate's language, and the
//     alternate for THIS page's locale equals its canonical
//   • noindex pages (search…): robots noindex, no alternates required
//   • not-found pages (/404): HTTP 404
//   • no console errors; no horizontal overflow at the given viewports
// The crawl must EXHAUST its queue: hitting --max with URLs left is `incomplete` and fails.
// Policy comes from template.config.json → audit {indexable, noindex, notFound, canonicalQuery}.
//
//   node tools/audit.mjs <base-url> <out-dir> [--config template.config.json] [--roots /,/ru]
//        [--viewports 1440,390] [--max 400] [--locales en,ru]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchBrowser } from './qa-browser.mjs'
const [base, outDir] = process.argv.slice(2)
const opt = (n, d) => {
  const i = process.argv.indexOf(n)
  return i >= 0 ? process.argv[i + 1] : d
}
if (!base || !outDir) {
  console.error(
    'usage: audit.mjs <base-url> <out-dir> [--config f] [--roots /,/ru] [--viewports 1440,390] [--max 400]'
  )
  process.exit(2)
}
const configFile = opt('--config', 'template.config.json')
const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {}
const policy = config.audit ?? {}
const LOCALES = (opt('--locales', '') || (config.locales ?? ['en']).join(',')).split(',')
const DEFAULT_LOCALE = config.defaultLocale ?? LOCALES[0]
const roots = opt('--roots', LOCALES.map((l) => (l === DEFAULT_LOCALE ? '/' : `/${l}`)).join(',')).split(',')
const viewports = opt('--viewports', '1440,390').split(',').map(Number)
// The ceiling belongs to the site being audited, not to this script: a template with a 240-post blog
// plus tags, categories, authors and pagination exhausts 400 long before the queue is empty, and the
// crawl then reports `incomplete` — which is a fail, correctly, but for the wrong reason. Declare it
// in template.config.json → audit.maxPages; --max still wins when given.
const MAX = Number(opt('--max', String(policy.maxPages ?? 400)))
const rx = (list, dflt) => (list ?? dflt).map((s) => new RegExp(s))
const RX = {
  indexable: rx(policy.indexable, ['^/(?!search)(?!404$).*']),
  noindex: rx(policy.noindex, ['^/search']),
  notFound: rx(policy.notFound, ['^/404$'])
}
const CANON_Q = policy.canonicalQuery ?? ['page']
mkdirSync(outDir, { recursive: true })
const origin = new URL(base).origin
const stripLocale = (p) => {
  const m = p.match(/^\/([a-z]{2})(?=\/|$)/)
  return m && LOCALES.includes(m[1]) && m[1] !== DEFAULT_LOCALE
    ? { locale: m[1], path: p.slice(m[0].length) || '/' }
    : { locale: DEFAULT_LOCALE, path: p }
}
const kindOf = (pathname) => {
  const { path: p } = stripLocale(pathname)
  if (RX.notFound.some((r) => r.test(p))) return 'notFound'
  if (RX.noindex.some((r) => r.test(p))) return 'noindex'
  if (RX.indexable.some((r) => r.test(p))) return 'indexable'
  return 'other'
}
const expectedCanonical = (u) => {
  const url = new URL(u, origin)
  const q = new URLSearchParams()
  for (const k of CANON_Q) {
    const v = url.searchParams.get(k)
    if (v && v !== '1') q.set(k, v)
  }
  return `${origin}${url.pathname}${q.toString() ? `?${q}` : ''}`
}
const seen = new Map()
const queue = [...roots]
const assets = new Map()
// The renderer is chosen once, in qa-browser.mjs: Playwright's own Chromium by default (the build
// the lockfile pins), the machine's Chrome only when asked for by RENDER_CHROME_CHANNEL, and no
// silent fallback either way. This file used to prefer the installed Chrome -- measured 2026-09-17,
// that is 152.0.7977.84 against the lockfile's 153.0.8010.12, and Chrome updates itself, so two
// runs a week apart could not be compared and nothing in the output said which had drawn them.
const browser = await launchBrowser()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
// Console "Failed to load resource" lines carry no URL, so failed sub-resources are taken from the
// response stream instead (with their URL), including favicons.
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text())
})
page.on('response', (r) => {
  if (r.status() >= 400 && r.request().resourceType() !== 'document') errors.push(`${r.status()} ${r.url()}`)
})
const norm = (href, from) => {
  try {
    const u = new URL(href, `${origin}${from}`)
    if (u.origin !== origin) return null
    if (/^\/(_emdash|_image|_astro)\//.test(u.pathname)) return null
    return u.pathname + (u.search || '')
  } catch {
    return null
  }
}
let incomplete = false
while (queue.length) {
  if (seen.size >= MAX) {
    incomplete = true
    break
  }
  const p = queue.shift()
  if (seen.has(p)) continue
  errors.length = 0
  const res = await page
    .goto(`${origin}${p}`, { waitUntil: 'networkidle', timeout: 60000 })
    .catch((e) => ({ status: () => 0, error: String(e) }))
  const status = res.status()
  const rec = {
    path: p,
    kind: kindOf(new URL(p, origin).pathname),
    status,
    h1: [],
    links: 0,
    errors: [],
    canonical: null,
    robots: null,
    hreflang: [],
    lang: null,
    overflow: {},
    findings: []
  }
  if (status === 200 || status === 404) {
    const m = await page.evaluate(() => ({
      h1: [...document.querySelectorAll('h1')].map((e) => e.textContent.trim()),
      links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
      imgs: [...document.querySelectorAll('img')].map((i) => i.currentSrc || i.src),
      canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href') ?? null,
      robots: document.querySelector('meta[name=robots]')?.getAttribute('content') ?? null,
      hreflang: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map((l) => ({
        lang: l.getAttribute('hreflang'),
        href: l.getAttribute('href')
      })),
      title: document.title,
      lang: document.documentElement.lang
    }))
    Object.assign(rec, {
      h1: m.h1,
      canonical: m.canonical,
      robots: m.robots,
      hreflang: m.hreflang,
      title: m.title,
      lang: m.lang
    })
    const internal = m.links.map((h) => norm(h, p)).filter(Boolean)
    rec.links = internal.length
    if (status === 200) for (const l of internal) if (!seen.has(l) && !queue.includes(l)) queue.push(l)
    for (const src of m.imgs) if (src && src.startsWith(origin)) assets.set(src, assets.get(src) ?? null)
    for (const w of viewports) {
      await page.setViewportSize({ width: w, height: 900 })
      await page.waitForTimeout(120)
      const sw = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth
      ])
      rec.overflow[w] = sw[0] > sw[1] ? sw[0] : 0
    }
    await page.setViewportSize({ width: 1440, height: 900 })
  }
  rec.errors = errors.slice(0, 5)
  seen.set(p, rec)
  console.log(
    `${status} ${rec.kind.padEnd(9)} ${p} h1=${rec.h1.length} links=${rec.links}${Object.values(rec.overflow).some(Boolean) ? ` OVERFLOW ${JSON.stringify(rec.overflow)}` : ''}${rec.errors.length ? ` errors=${rec.errors.length}` : ''}`
  )
}
// alternates: fetch each target once and read its <html lang>
const altCache = new Map()
async function altInfo(href) {
  if (altCache.has(href)) return altCache.get(href)
  let info = { status: 0, lang: null }
  try {
    const r = await fetch(href, { redirect: 'manual' })
    const t = await r.text()
    info = { status: r.status, lang: (t.match(/<html[^>]*\slang="([^"]*)"/) ?? [])[1] ?? null }
  } catch {}
  altCache.set(href, info)
  return info
}
for (const [src] of assets) {
  try {
    assets.set(src, (await fetch(src)).status)
  } catch {
    assets.set(src, 0)
  }
}
const unknown = []
const prefixes = LOCALES.map((l) => (l === DEFAULT_LOCALE ? '' : `/${l}`))
const notFoundProbes = (policy.notFoundProbes ?? ['/404']).flatMap((u) => prefixes.map((pre) => `${pre}${u}`))
for (const u of [
  '/does-not-exist',
  ...prefixes.filter(Boolean).map((pre) => `${pre}/does-not-exist`),
  ...notFoundProbes,
  ...(policy.unknownProbes ?? [])
]) {
  const r = await fetch(`${origin}${u}`, { redirect: 'manual' })
  unknown.push({ path: u, status: r.status })
}
await browser.close()
const pages = [...seen.values()]
const findings = []
const F = (path, issue) => findings.push({ path, issue })
for (const r of pages) {
  const p = new URL(r.path, origin).pathname
  if (r.kind === 'notFound') {
    if (r.status !== 404) F(r.path, `expected 404, got ${r.status}`)
    continue
  }
  if (r.status !== 200) {
    F(r.path, `status ${r.status}`)
    continue
  }
  if (r.h1.length !== 1) F(r.path, `h1 count ${r.h1.length}`)
  if (!LOCALES.includes(r.lang)) F(r.path, `<html lang="${r.lang}"> is not a configured locale`)
  for (const [w, v] of Object.entries(r.overflow)) if (v) F(r.path, `horizontal overflow at ${w}px (${v})`)
  if (r.errors.length) F(r.path, `console errors: ${r.errors[0]}`)
  const { locale } = stripLocale(p)
  if (r.lang && r.lang !== locale) F(r.path, `<html lang="${r.lang}"> but URL locale is ${locale}`)
  if (r.kind === 'noindex') {
    if (!/noindex/.test(r.robots ?? '')) F(r.path, `noindex page without robots noindex (${r.robots})`)
    continue
  }
  if (r.kind !== 'indexable') continue
  if (/noindex/.test(r.robots ?? '')) F(r.path, `indexable page marked noindex`)
  const want = expectedCanonical(r.path)
  if (!r.canonical) F(r.path, 'no canonical')
  else if (r.canonical !== want) F(r.path, `canonical ${r.canonical} != expected ${want}`)
  const langs = r.hreflang.map((h) => h.lang)
  for (const l of LOCALES) if (!langs.includes(l)) F(r.path, `missing hreflang ${l}`)
  if (!langs.includes('x-default')) F(r.path, 'missing hreflang x-default')
  for (const h of r.hreflang) {
    const info = await altInfo(h.href)
    if (info.status !== 200) F(r.path, `hreflang ${h.lang} -> ${h.href} answers ${info.status}`)
    else if (h.lang !== 'x-default' && info.lang !== h.lang)
      F(r.path, `hreflang ${h.lang} -> ${h.href} serves <html lang="${info.lang}">`)
    if (h.lang === locale && h.href !== want) F(r.path, `hreflang ${h.lang} (${h.href}) != canonical ${want}`)
  }
}
for (const [src, st] of assets) if (st !== 200) F(src, `asset ${st}`)
for (const u of unknown)
  if (u.status !== 404)
    F(
      u.path,
      notFoundProbes.includes(u.path) ? `expected 404, got ${u.status}` : `unknown url answered ${u.status}`
    )
if (incomplete) F('(crawl)', `incomplete: hit --max ${MAX} with ${queue.length} URL(s) still queued`)
const summary = {
  base,
  at: new Date().toISOString(),
  complete: !incomplete,
  pages: pages.length,
  ok: pages.filter((p) => p.status === 200).length,
  byKind: pages.reduce((a, p) => ((a[p.kind] = (a[p.kind] ?? 0) + 1), a), {}),
  assets: assets.size,
  assetsBroken: [...assets.values()].filter((s) => s !== 200).length,
  unknown,
  findings: findings.length,
  viewports,
  locales: LOCALES,
  policy: {
    indexable: policy.indexable,
    noindex: policy.noindex,
    notFound: policy.notFound,
    canonicalQuery: CANON_Q
  }
}
writeFileSync(
  path.join(outDir, 'audit.json'),
  JSON.stringify(
    { summary, findings, pages, assets: [...assets].map(([src, status]) => ({ src, status })) },
    null,
    2
  )
)
const md = [
  `# Audit — ${base} — ${summary.at}`,
  '',
  `Crawl ${summary.complete ? 'complete' : 'INCOMPLETE'} · pages ${summary.pages} (200: ${summary.ok}; ${Object.entries(
    summary.byKind
  )
    .map(([k, v]) => `${k} ${v}`)
    .join(', ')}) · assets ${summary.assets} (broken ${summary.assetsBroken}) · findings ${findings.length}`,
  '',
  '| Status | Kind | Path | H1 | Canonical ok | hreflang | Overflow | Errors |',
  '|---|---|---|---|---|---|---|---|',
  ...pages.map(
    (p) =>
      `| ${p.status} | ${p.kind} | \`${p.path}\` | ${p.h1[0] ?? ''} | ${p.kind === 'indexable' ? (p.canonical === expectedCanonical(p.path) ? 'yes' : 'NO') : 'n/a'} | ${p.hreflang.map((h) => h.lang).join(' ') || '—'} | ${
        Object.entries(p.overflow)
          .filter(([, v]) => v)
          .map(([w, v]) => `${w}:${v}`)
          .join(' ') || '—'
      } | ${p.errors.length} |`
  ),
  '',
  '## Findings',
  '',
  ...(findings.length ? findings.map((f) => `- \`${f.path}\` — ${f.issue}`) : ['none']),
  '',
  '## Unknown URLs',
  '',
  ...unknown.map((u) => `- \`${u.path}\` → ${u.status}`)
].join('\n')
writeFileSync(path.join(outDir, 'audit.md'), md + '\n')
console.log(JSON.stringify(summary))
process.exit(findings.length ? 1 : 0)
