#!/usr/bin/env node
// from-url.mjs — a live site → a source folder this kit can already read.
//
//   node scripts/ingest/from-url.mjs <start-url> --out <dir> [--max-pages 30] [--no-assets]
//                                     [--allow-cross-origin] [--max-asset-mb 5]
//
// WHY. `references/source-inventory.md` says a URL source is inventoried "through the downloaded
// copy" — but nothing in this kit downloaded one, so every run invented its own way: how many
// pages, which links, whether assets came too. That is the step where `source.files` hashes come
// from, so an invented method means the contract cannot be reproduced later. The Joomla and
// WordPress skills have had a crawler for this all along; this is the same shape, aimed at what
// `inventory.mjs` reads instead of at a spec-pack.
//
// WHAT COMES BACK. Pages at the path the site serves them from (`/about/` → `about/index.html`),
// and — unless `--no-assets` — every same-origin stylesheet, script, image and font they
// reference, saved at ITS OWN path. Nothing is rewritten: a relative href in the saved HTML
// still resolves, because the folder mirrors the site's own layout. `inventory.mjs` can then
// hash the lot exactly as it would a design folder.
//
// WHAT IT WILL NOT DO. It stays on one origin unless told otherwise, and re-checks after
// redirects — a 302 to another host is refused rather than followed quietly, because
// `crawl.json` is the record a rights question gets answered from. It does not execute
// JavaScript: a site that renders its content client-side will come back thin, and the report
// says so rather than leaving you to discover it three phases later.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i === -1 ? fallback : args[i + 1]
}
const out = flag('--out')
const maxPages = Number(flag('--max-pages', '30'))
const maxAssetBytes = Number(flag('--max-asset-mb', '5')) * 1024 * 1024
const withAssets = !args.includes('--no-assets')
const sameOrigin = !args.includes('--allow-cross-origin')
const start = args.find(
  (a, i) => !a.startsWith('-') && !['--out', '--max-pages', '--max-asset-mb'].includes(args[i - 1])
)

if (!start || !out) {
  console.error(
    'usage: from-url.mjs <start-url> --out <dir> [--max-pages 30] [--no-assets] [--allow-cross-origin]'
  )
  process.exit(2)
}
if (!Number.isInteger(maxPages) || maxPages < 1) {
  console.error(`--max-pages must be a positive integer; got ${flag('--max-pages')}`)
  process.exit(2)
}
let startUrl
try {
  startUrl = new URL(start)
} catch {
  console.error(`not a valid URL: ${start}`)
  process.exit(2)
}

const SKIP_PAGE = /\.(pdf|zip|jpe?g|png|gif|svg|webp|avif|mp4|webm|mp3|css|js|xml|json|ico|woff2?|ttf|otf)$/i
const ASSET_ATTR =
  /(?:href|src|data-src)\s*=\s*["']([^"']+\.(?:css|js|mjs|jpe?g|png|gif|svg|webp|avif|ico|woff2?|ttf|otf))(?:\?[^"']*)?["']/gi
const ASSET_IN_CSS =
  /url\(\s*["']?([^"')]+\.(?:jpe?g|png|gif|svg|webp|avif|woff2?|ttf|otf|css))(?:\?[^"')]*)?["']?\s*\)/gi

/** Drop the hash and the tracking noise, so one page is fetched once. */
function normalise(u) {
  const url = new URL(u)
  url.hash = ''
  // The spread is NOT redundant, whatever a linter says: deleting from URLSearchParams while
  // iterating it live skips the next key. Measured — ?utm_source&utm_medium&utm_campaign comes
  // back still carrying utm_medium, and the same page is then crawled twice under two URLs.
  // oxlint-disable-next-line unicorn/no-useless-spread
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ref$)/i.test(key)) url.searchParams.delete(key)
  }
  let s = url.toString()
  if (s.endsWith('/') && url.pathname !== '/') s = s.slice(0, -1)
  return s
}

/**
 * Where a page is saved: the path the site serves it from, as a file.
 *
 * `/` → index.html, `/about` → about/index.html, `/a/b.html` → a/b.html. Keeping the site's own
 * shape is what lets the saved HTML's relative links keep working without rewriting a byte.
 */
function pagePath(url) {
  const path = new URL(url).pathname
  if (path === '/' || path === '') return 'index.html'
  const clean = path.replace(/^\/+|\/+$/g, '')
  return /\.(html?|php)$/i.test(clean) ? clean.replace(/\.php$/i, '.html') : `${clean}/index.html`
}

/** Where an asset is saved: its own path, so the markup that points at it still does. */
const assetPath = (url) => new URL(url).pathname.replace(/^\/+/, '') || 'index'

function linksIn(html, base) {
  const links = new Set()
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim()
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue
    try {
      const abs = new URL(href, base)
      if (!/^https?:$/.test(abs.protocol)) continue
      if (SKIP_PAGE.test(abs.pathname)) continue
      links.add(normalise(abs.toString()))
    } catch {
      // An href the URL parser refuses is an href a browser would not follow either.
    }
  }
  return [...links]
}

function assetsIn(text, base, re) {
  const found = new Set()
  let m
  while ((m = re.exec(text)) !== null) {
    try {
      found.add(new URL(m[1], base).toString())
    } catch {
      // Same reasoning as above.
    }
  }
  return [...found]
}

const titleOf = (html) =>
  html
    .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    .replace(/\s+/g, ' ')
    .trim() ?? ''

async function save(dir, rel, body) {
  const target = join(dir, rel)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, body)
  return rel
}

// ── crawl ─────────────────────────────────────────────────────────────────────
const queue = [normalise(startUrl.toString())]
const queued = new Set(queue)
const pages = []
const failures = []
const assetQueue = new Set()

while (queue.length > 0 && pages.length < maxPages) {
  const url = queue.shift()
  let response
  let html
  try {
    response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'tracy-emdash-ingest/1.0' } })
    if (!response.ok) {
      failures.push({ url, status: response.status })
      continue
    }
    if (!/text\/html/i.test(response.headers.get('content-type') ?? '')) continue
    html = await response.text()
  } catch (error) {
    failures.push({ url, error: error.message })
    continue
  }

  const finalUrl = normalise(response.url || url)
  // The origin check at enqueue time cannot see through a redirect; without this re-check a 302
  // to another host enters the crawl while crawl.json still claims one origin.
  if (sameOrigin && new URL(finalUrl).origin !== startUrl.origin) {
    failures.push({ url, redirectedTo: finalUrl, reason: 'redirected off-origin' })
    continue
  }

  const file = await save(out, pagePath(finalUrl), html)
  pages.push({ file, url: finalUrl, title: titleOf(html), bytes: html.length })

  for (const link of linksIn(html, finalUrl)) {
    if (queued.has(link)) continue
    if (sameOrigin && new URL(link).origin !== startUrl.origin) continue
    queued.add(link)
    queue.push(link)
  }
  if (withAssets) for (const a of assetsIn(html, finalUrl, ASSET_ATTR)) assetQueue.add(a)
}

// ── assets ────────────────────────────────────────────────────────────────────
const assets = []
const assetSeen = new Set()
const pending = [...assetQueue]
while (pending.length > 0) {
  const url = pending.shift()
  if (assetSeen.has(url)) continue
  assetSeen.add(url)
  if (sameOrigin && new URL(url).origin !== startUrl.origin) continue
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'tracy-emdash-ingest/1.0' } })
    if (!response.ok) {
      failures.push({ url, status: response.status, kind: 'asset' })
      continue
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxAssetBytes) {
      failures.push({ url, kind: 'asset', reason: `larger than --max-asset-mb (${buffer.length} bytes)` })
      continue
    }
    const rel = await save(out, assetPath(url), buffer)
    assets.push({ file: rel, url, bytes: buffer.length })
    // A stylesheet points at fonts and images of its own; without this the design arrives
    // without its typeface and the first visual pass blames the template.
    if (/\.css$/i.test(url))
      for (const nested of assetsIn(buffer.toString('utf8'), url, ASSET_IN_CSS)) pending.push(nested)
  } catch (error) {
    failures.push({ url, error: error.message, kind: 'asset' })
  }
}

const report = {
  start: startUrl.toString(),
  crawledAt: new Date().toISOString(),
  sameOrigin,
  maxPages,
  pages,
  assets,
  failures
}
await save(out, 'crawl.json', `${JSON.stringify(report, null, 2)}\n`)

console.log(`from-url: ${pages.length} pages, ${assets.length} assets → ${out}`)
if (pages.length >= maxPages)
  console.log(`         ⚠ hit the --max-pages ${maxPages} ceiling; ${queue.length} URLs still in the queue`)
if (failures.length > 0) console.log(`         ${failures.length} failed fetches — see crawl.json`)
const thin = pages.filter((p) => p.bytes < 2000)
if (thin.length > 0) {
  console.log(`         ⚠ ${thin.length} pages under 2 KB: the site may render its content with JavaScript,`)
  console.log('           and this crawler does not run JS. Check one page before trusting the download.')
}
console.log(`next    : node tools/inventory.mjs ${out} <out.json>   (source.kind: url)`)
