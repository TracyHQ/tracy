// Text runs of one page for content parity (http-parity.mjs, quickstart/verify-parity.mjs).
//
// Two ways to pick runs. `elements` (default) takes headings and the text of p/li/td-like
// elements — right for a CMS page, whose prose lives in those tags. `leaf` also takes the own
// text of every other element (a div, a span), because a design-tool export puts a price row or
// a card label in `<div><span>` and the element mode never sees it: a whole pricing table went
// missing from a port while the gate read "ok". Both modes drop chrome (header, nav, footer and
// the source framework's chrome, below) before reading, so column headings do not leak into every route as
// "missing".
//
// 🔒 AN <aside> IS NOT CHROME. A sidebar is content of the page it sits on, and the two sides do not
// write it alike: a Joomla T4 source puts its sidebar modules in `div.t4-col.sidebar-r`, a block
// theme in `<aside>`. Dropping `aside` removed the site's sidebar and kept the source's, so "Search",
// "Latest News" and "Popular Tags" read `missing` on a page that shows all three (JA Vega
// /featured-articles, M4d, #27 item 8). Both sides now read their sidebars; what a sidebar carries
// as navigation (`nav`, a menu block) is still dropped by the selectors below.
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { PROFILES } from './framework-selectors.mjs'

// Chrome selectors on both sides, from the source framework's selector profile
// (lib/framework-selectors.mjs). T4 renders the mega-menu panels and the footer columns as module
// positions outside <header>/<footer> (t4-megamenu, t4-section-footnav, off-canvas); T3 adds a topbar
// and an off-canvas panel its script moves to the body (`.t3-topbar`, `.t3-off-canvas`, #66). `CHROME`
// is the T4 list, what a caller that names no profile reads; a caller that knows the source's
// framework passes its profile's `chrome`.
export const CHROME = PROFILES.T4.chrome

// Letters of any script count: a Russian run normalised to nothing would be "contained" by
// every page.
export const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// textContent glues "for<br>next" into "fornext"; a line break is a space.
function textWithBreaks(el) {
  let t = ''
  for (const n of el.childNodes) {
    if (n.nodeType === 3) t += n.textContent
    else if (n.nodeType === 1) t += n.tagName === 'BR' ? ' ' : textWithBreaks(n)
  }
  return t
}

const TEXT_ELEMENTS = 'p, li, blockquote, figcaption, td, th, dd, dt, summary'

export function extractRuns(html, { minWords = 4, ignore = null, runs: mode = 'elements', chrome = CHROME } = {}) {
  if (typeof chrome !== 'string' || !chrome.trim()) throw new Error('extractRuns: chrome must be a non-empty selector list')
  const doc = new JSDOM(html).window.document
  for (const el of doc.querySelectorAll(`script, style, noscript, template, ${chrome}`)) el.remove()
  const runs = []
  const push = (t) => {
    const s = t.replace(/\s+/g, ' ').trim()
    if (!s) return
    if (ignore && ignore.test(s)) return
    runs.push(s)
  }
  const longEnough = (s) => s.split(' ').length >= minWords
  for (const h of doc.querySelectorAll('h1, h2, h3, h4')) push(textWithBreaks(h))
  for (const el of doc.querySelectorAll(TEXT_ELEMENTS)) {
    const s = el.textContent.replace(/\s+/g, ' ').trim()
    if (longEnough(s)) push(s)
  }
  if (mode === 'leaf') {
    // An element's own text: its direct text nodes plus inline children (span, b, a…), so a
    // sentence split over inline tags is one run, while block children are read on their own.
    const INLINE = new Set(['SPAN', 'B', 'I', 'EM', 'STRONG', 'A', 'SMALL', 'SUP', 'SUB', 'BR', 'MARK', 'ABBR', 'TIME'])
    const own = (el) => {
      let t = ''
      for (const n of el.childNodes) {
        if (n.nodeType === 3) t += n.textContent
        else if (n.nodeType === 1 && n.tagName === 'BR') t += ' '
        else if (n.nodeType === 1 && INLINE.has(n.tagName)) t += own(n)
      }
      return t.replace(/\s+/g, ' ').trim()
    }
    for (const el of doc.body.querySelectorAll('*')) {
      if (/^(H[1-4]|SCRIPT|STYLE)$/.test(el.tagName)) continue
      if (INLINE.has(el.tagName) && el.parentElement && own(el.parentElement).includes(own(el))) continue
      const s = own(el)
      if (longEnough(s)) push(s)
    }
  }
  const srcs = [...doc.querySelectorAll('img')].map((i) => i.getAttribute('src') || '').filter(Boolean)
  const images = srcs.map((s) => path.basename(s.split('?')[0])).filter(Boolean)
  // The URL path of each image (query and fragment dropped, host ignored, decoded): what
  // http-parity --media-map matches, where a basename cannot tell two `item-1.jpg` apart.
  const imagePaths = srcs
    .map((s) => {
      try {
        return decodeURIComponent(new URL(s, 'http://x/').pathname)
      } catch {
        return null
      }
    })
    .filter((p) => p && p !== '/')
  const fatal = /Fatal error|Warning: |Notice: |wp-die-message|Error 500/.test(html)
  const text = norm(doc.body ? doc.body.textContent : '')
  return { runs: [...new Set(runs)], images: [...new Set(images)], imagePaths: [...new Set(imagePaths)], fatal, text }
}
