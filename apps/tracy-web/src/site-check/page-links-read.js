// What a page prints, read from its markup as a visitor's browser gets it, with no browser: its blocks of words (keyed as the
// host keys them, demo-baseline.js `textKey`), its internal links with the words they show and whether they stand in a heading,
// and its icon elements. For the site check's `reachable-pages` and `icon-glyphs` (reachable-pages.js). Pure.
import { textKey } from './demo-baseline.js'

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }
const decode = (text) => String(text).replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e) => ENTITIES[e])
const plain = (html) =>
  decode(String(html).replace(/<[^<>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
const bodyOf = (html) =>
  String(html ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

const BLOCK_TAGS = 'h[1-6]|p|li|a|span|td|th|strong|em|b|small|label|button|dt|dd|figcaption|blockquote'
const attr = (tag, name) =>
  new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')
    .exec(tag)
    ?.slice(2)
    .find((v) => v !== undefined) ?? null

/** The text keys of every block of words the page prints. */
export function textKeysOf(html) {
  const keys = new Set()
  const re = new RegExp(`<(${BLOCK_TAGS})\\b[^>]*>([\\s\\S]*?)</\\1>`, 'gi')
  for (const [, , inner] of bodyOf(html).matchAll(re)) {
    const words = plain(inner)
    if (words.length >= 3) keys.add(textKey(words))
  }
  return keys
}

/** The page's own heading words: its first main heading, else its title. */
export function headingOf(html) {
  const body = bodyOf(html)
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body)
  if (h1) return plain(h1[1])
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(String(html ?? ''))
  return title ? plain(title[1]) : ''
}

/** A link's address as a path of the site, or null for another site, a file, a fragment or a non-page scheme. */
export function sitePathOf(href, ownHosts = new Set()) {
  const raw = decode(String(href ?? '').trim())
  if (!raw || raw.startsWith('#') || /^(mailto|tel|sms|javascript|data|whatsapp):/i.test(raw)) return null
  let url
  try {
    url = new URL(raw, 'http://site.invalid/')
  } catch {
    return null
  }
  if (url.host !== 'site.invalid' && !ownHosts.has(url.host)) return null
  if (/\.(jpe?g|png|gif|webp|svg|ico|css|js|pdf|zip|mp4|webm|woff2?|ttf|xml|json|txt)$/i.test(url.pathname))
    return null
  if (/^\/(images|media|templates|administrator|plugins|cache)\//i.test(url.pathname)) return null
  if (/[?&](format|task|option=com_users|tmpl)=/i.test(url.search)) return null
  return `${url.pathname}${url.search}`
}

/**
 * The internal links the page shows, each with its words and whether it stands in a heading (a card's name).
 * @param {string} html
 * @param {Set<string>} [ownHosts] the hosts that are this site, beside relative addresses
 * @returns {{ path: string, words: string, inHeading: boolean }[]}
 */
export function linksOf(html, ownHosts = new Set()) {
  const out = []
  const body = bodyOf(html)
  const heading = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi
  const headed = new Set()
  for (const [, , inner] of body.matchAll(heading))
    for (const [a] of inner.matchAll(/<a\b[^>]*>/gi)) headed.add(a)
  for (const [, open, inner] of body.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/gi)) {
    const path = sitePathOf(attr(open, 'href'), ownHosts)
    if (path)
      out.push({ path, words: plain(inner) || attr(open, 'title') || '', inHeading: headed.has(open) })
  }
  return out
}

/** The class lists of the page's icon elements: an element whose classes name an icon of the Font Awesome families. */
export function iconClassesOf(html) {
  const out = []
  for (const [tag] of bodyOf(html).matchAll(/<(i|span|em)\b[^>]*>/gi)) {
    const cls = attr(tag, 'class')
    if (cls && /(?:^|\s)fa-[a-z0-9-]+/i.test(cls)) out.push(cls.trim())
  }
  return out
}
