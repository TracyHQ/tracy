// The rendered pages the built site check reads (ticket #601): crawled from a locally built site's base address, or
// read from a folder of saved rendered pages (so a test needs no site). A page is `{path, url, status, html, note?}`;
// `path` is the page's address below the base, `/` for the home page, without Joomla's `index.php` part.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { linksOf, treeOf } from './html-read.mjs'
import { fetchLocal, onBase, pooled } from './local-fetch.mjs'

export const MAX_PAGES = 200
export const CONCURRENCY = 4
const ASSET =
  /\.(css|js|mjs|json|xml|txt|png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|gz|woff2?|ttf|mp4|webm|mp3)$/i

/** A page address below the base: `/`, `/about`, `/services/coaching`. */
export function pagePathOf(pathname, basePath = '/') {
  let p = String(pathname ?? '/')
  try {
    p = decodeURIComponent(p)
  } catch {
    // A broken escape stays as it is written.
  }
  const root = basePath.replace(/\/$/, '')
  if (root && p.startsWith(root)) p = p.slice(root.length)
  p = p
    .replace(/^\/index\.php(?=\/|$)/, '')
    .replace(/\/index\.php$/, '')
    .replace(/\/index\.html?$/, '/')
    .replace(/\.html?$/, '')
  p = `/${p.replace(/^\/+|\/+$/g, '')}`
  return p
}

/** The pages of a folder of saved rendered pages: `index.html` is the home page, `about.html` is `/about`. */
export function pagesOfFolder(dir) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const file = path.join(d, name)
      if (statSync(file).isDirectory()) walk(file)
      else if (/\.html?$/i.test(name)) {
        const rel = path.relative(dir, file).split(path.sep).join('/')
        out.push({ path: pagePathOf(`/${rel}`), url: rel, status: 200, html: readFileSync(file, 'utf8') })
      }
    }
  }
  walk(dir)
  return out
}

/** The page addresses a page links to on the base. */
function nextOf(page, base) {
  if (!page.html) return []
  const out = []
  for (const { href } of linksOf(treeOf(page.html))) {
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(href)) continue
    let url
    try {
      url = new URL(href, page.url)
    } catch {
      continue
    }
    if (!onBase(url, base) || ASSET.test(url.pathname)) continue
    url.hash = ''
    url.search = ''
    out.push(url.href)
  }
  return out
}

/**
 * The pages of a locally built site: the home page, every `seeds` address, and every page they link to on the base,
 * at most `max`, `limit` requests at a time.
 */
export async function crawlSite(base, { seeds = [], max = MAX_PAGES, limit = CONCURRENCY, fetchImpl } = {}) {
  const seen = new Set()
  const pages = []
  let capped = false
  let wave = [base.href, ...seeds.map((s) => new URL(s.replace(/^\//, ''), base).href)]
  while (wave.length && pages.length < max) {
    const all = [...new Set(wave)].filter((u) => !seen.has(u))
    const todo = all.slice(0, max - pages.length)
    if (todo.length < all.length) capped = true
    for (const u of todo) seen.add(u)
    const got = await pooled(todo, limit, async (u) => {
      const res = await fetchLocal(base, u, { fetchImpl })
      return { ...res, path: pagePathOf(new URL(res.url).pathname, base.pathname) }
    })
    const fresh = got.filter((p) => !pages.some((q) => q.path === p.path && q.status === p.status))
    pages.push(...fresh)
    wave = fresh.filter((p) => p.status === 200).flatMap((p) => nextOf(p, base))
  }
  return { pages, capped }
}
