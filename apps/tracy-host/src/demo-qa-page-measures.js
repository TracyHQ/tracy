/**
 * The measures a site check asks of the host's browser besides its verdicts (`measurePages: true` on
 * `POST /_host/demo-qa`): text that overflows its box, blocks far taller than a screen, pictures drawn out of shape,
 * and the links a page holds. They are read at 1440 and again at 390 on every page the run keeps, and answered as
 * `pageMeasures`, one entry per page and width:
 *   { path, width, links: [{ href, text, status }], textBoxes: [...], blocks: [...], pictures: [...], controls: [...],
 *     fields: [...], glued: [...], headings: [...], mainHeadings: [...], shownText, shownLinks: [...], shownPictures: [...] }
 * The shape is the one `apps/tracy-web/src/site-check/page-measures.js` documents; the judging stays there.
 */

import { readBrandStyle } from './demo-qa-brand-style.js'

const BRAND_STYLE_WIDTH = 1440
/** A box counts as overflowed only past this many pixels (the same tolerance the judge applies). */
export const OVERFLOW_TOLERANCE_PX = 2
/** A drawn picture is reported only when its ratio is this far from the file's (the judge decides at its own bound). */
export const STRETCH_REPORT_RATIO = 0.05
/** What one page and width may report, so an odd page cannot make the answer huge. */
export const MEASURE_CAPS = Object.freeze({
  links: 300,
  textBoxes: 40,
  blocks: 20,
  pictures: 40,
  controls: 40,
  fields: 40,
  glued: 20,
  headings: 40,
  shownLinks: 300,
  shownPictures: 100,
  shownText: 30000
})

/**
 * Runs inside the page (serialised by Playwright): it may use nothing from this module.
 * @param {{ tolerance: number, stretch: number, caps: { links: number, textBoxes: number, blocks: number, pictures: number } }} arg
 */
export function measurePageInPage({ tolerance, stretch, caps }) {
  const viewWidth = innerWidth
  const viewHeight = innerHeight
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH', 'HEAD', 'META', 'LINK'])
  const selectorOf = (el) =>
    el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.classList[0] ? `.${el.classList[0]}` : '')
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    return (
      r.width > 0 &&
      r.height > 0 &&
      (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true)
    )
  }

  // A visually hidden element is there for a screen reader: clipped to nothing, so no visitor sees its text run past its box.
  const clippedAway = (el, cs) => {
    const r = el.getBoundingClientRect()
    return (
      cs.clip === 'rect(0px, 0px, 0px, 0px)' ||
      cs.clipPath === 'inset(50%)' ||
      (r.width <= 1 && r.height <= 1)
    )
  }
  const saidBy = (el) =>
    (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').replace(/\s+/g, ' ').trim()

  // Links: every anchor to a web address, once per address, fragment dropped. A hidden menu's link is still a link.
  const links = []
  const here = new URL(location.href)
  here.hash = ''
  const seenHref = new Set()
  for (const a of document.querySelectorAll('a[href]')) {
    let u
    try {
      u = new URL(a.href)
    } catch {
      continue
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
    u.hash = ''
    if (u.href === here.href || seenHref.has(u.href)) continue
    seenHref.add(u.href)
    const text = (a.innerText || a.getAttribute('aria-label') || a.title || '').replace(/\s+/g, ' ').trim()
    links.push({ href: u.href, text: text.slice(0, 80) })
    if (links.length >= caps.links) break
  }

  // Text boxes: only those that overflow, the rest is no finding and would only make the answer big.
  const textBoxes = []
  let walked = 0
  for (const el of document.body.querySelectorAll('*')) {
    if (++walked > 8000 || textBoxes.length >= caps.textBoxes) break
    if (SKIP.has(el.tagName.toUpperCase())) continue
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim())
    if (!own.length) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'inline' || cs.display === 'contents' || !shown(el) || clippedAway(el, cs)) continue
    const clipX = cs.overflowX === 'hidden' || cs.overflowX === 'clip'
    const clipY = cs.overflowY === 'hidden' || cs.overflowY === 'clip'
    // A clamp or an ellipsis cuts the text on purpose.
    const intended = (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') || cs.textOverflow === 'ellipsis'
    const clips = (clipX || clipY) && !intended
    const wide = el.scrollWidth - el.clientWidth
    const high = el.scrollHeight - el.clientHeight
    const cut = clips && ((clipX && wide > tolerance) || (clipY && high > tolerance))
    const range = document.createRange()
    range.selectNodeContents(el)
    let right = range.getBoundingClientRect().right
    // A clipping ancestor (below the page itself) hides what lies past its edge: that is its cut, not the screen's.
    for (let a = el; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX
      if (o !== 'visible') right = Math.min(right, a.getBoundingClientRect().right)
    }
    const past = right > viewWidth + tolerance
    if (!cut && !past) continue
    textBoxes.push({
      selector: selectorOf(el),
      text: own
        .map((n) => n.textContent)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80),
      boxWidth: el.clientWidth,
      boxHeight: el.clientHeight,
      contentWidth: el.scrollWidth,
      contentHeight: el.scrollHeight,
      clips: cut,
      right: Math.round(right)
    })
  }

  // Blocks: the page's sections. Walk down through wrappers that hold one child (or one child taking the page), then
  // take that level's children and every semantic section below it. Only blocks over two screens are reported.
  const kids = (el) => Array.from(el.children).filter((c) => !SKIP.has(c.tagName.toUpperCase()) && shown(c))
  let level = document.body
  for (let depth = 0; depth < 6; depth++) {
    const c = kids(level)
    const total = level.getBoundingClientRect().height
    const big = c.find((k) => k.getBoundingClientRect().height >= total * 0.95)
    if (c.length === 1 || (big && c.length > 0)) level = big ?? c[0]
    else break
  }
  const candidates = new Set(kids(level))
  for (const el of document.body.querySelectorAll('section,article,aside,header,footer,form,ul,ol,table'))
    candidates.add(el)
  const blocks = []
  for (const el of candidates) {
    if (blocks.length >= caps.blocks) break
    if (getComputedStyle(el).position === 'fixed' || !shown(el)) continue
    const height = Math.round(el.getBoundingClientRect().height)
    if (height > viewHeight * 2) blocks.push({ selector: selectorOf(el), height })
  }

  // Pictures drawn with a ratio other than their file's, where nothing crops them.
  const pictures = []
  for (const img of document.body.querySelectorAll('img')) {
    if (pictures.length >= caps.pictures) break
    const src = img.currentSrc || img.src
    if (!src || /\.svg(?:[?#]|$)/i.test(src) || !img.complete || img.naturalWidth < 8 || !shown(img)) continue
    const r = img.getBoundingClientRect()
    const fit = getComputedStyle(img).objectFit
    const off = Math.abs(r.width / r.height / (img.naturalWidth / img.naturalHeight) - 1)
    if (fit !== 'fill' || off <= stretch) continue
    pictures.push({
      selector: selectorOf(img),
      src: src.slice(0, 300),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      width: Math.round(r.width),
      height: Math.round(r.height),
      fit
    })
  }

  // Buttons a visitor cannot read or that lead nowhere. A drawing can be the words; a script's own toggle may hold `#`.
  const controls = []
  for (const el of document.body.querySelectorAll(
    'a.btn,a.button,button,input[type=submit],input[type=button],[role=button]'
  )) {
    if (controls.length >= caps.controls) break
    if (!shown(el) || clippedAway(el, getComputedStyle(el))) continue
    const text = saidBy(el)
    const drawn = el.querySelector('img,svg,i,[class*="icon"],[class*="toggler"]')
    const href = el.getAttribute('href')
    const scripted = Array.from(el.attributes).some((a) => a.name.startsWith('data-') || a.name === 'onclick')
    if (!text && !drawn) controls.push({ selector: selectorOf(el), fault: 'wordless', href, text })
    else if (el.tagName === 'A' && href === '#' && !scripted)
      controls.push({ selector: selectorOf(el), fault: 'nowhere', href, text: text.slice(0, 80) })
  }

  // Form fields nothing names: no label with words, no hint, no accessible name.
  const fields = []
  for (const el of document.body.querySelectorAll(
    'input:not([type=hidden],[type=submit],[type=button],[type=checkbox],[type=radio]),textarea,select'
  )) {
    if (fields.length >= caps.fields) break
    if (!shown(el)) continue
    const label = Array.from(el.labels ?? []).some((l) => l.innerText?.trim())
    if (label || el.placeholder?.trim() || el.getAttribute('aria-label')?.trim() || el.title?.trim()) continue
    fields.push({ selector: selectorOf(el), name: el.name ?? '' })
  }

  // Words that run into an inline highlight with no space between them. One letter set apart is a drop cap, not a word.
  const glued = []
  const LETTER_END = /\p{L}{2}$/u
  const LETTER_START = /^\p{L}{2}/u
  for (const el of document.body.querySelectorAll('*')) {
    if (glued.length >= caps.glued) break
    if (SKIP.has(el.tagName.toUpperCase()) || !shown(el)) continue
    const nodes = Array.from(el.childNodes)
    nodes.forEach((node, at) => {
      if (node.nodeType !== 1 || getComputedStyle(node).display !== 'inline') return
      const inner = node.textContent ?? ''
      const before = nodes[at - 1]
      const next = nodes[at + 1]
      const add = (left, right) =>
        glued.push({
          selector: selectorOf(el),
          text: `${left.slice(-20)}|${right.slice(0, 20)}`,
          around: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)
        })
      if (before?.nodeType === 3 && LETTER_END.test(before.textContent) && LETTER_START.test(inner))
        add(before.textContent, inner)
      if (next?.nodeType === 3 && LETTER_END.test(inner) && LETTER_START.test(next.textContent))
        add(inner, next.textContent)
    })
  }

  // The headings a visitor reads, for the judge to see whether one stops halfway.
  const headings = []
  for (const el of document.body.querySelectorAll('h1,h2')) {
    if (headings.length >= caps.headings) break
    if (!shown(el) || clippedAway(el, getComputedStyle(el))) continue
    const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim()
    if (text) headings.push(text.slice(0, 120))
  }

  // The main headings a visitor reads: a page should print one.
  const mainHeadings = []
  for (const el of document.body.querySelectorAll('h1')) {
    if (!shown(el) || clippedAway(el, getComputedStyle(el))) continue
    const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim()
    if (text) mainHeadings.push(text.slice(0, 120))
  }

  // What a visitor can see at all, for the judge to tell a stored field on the page from one that prints nowhere.
  const shownLinks = []
  for (const a of document.body.querySelectorAll('a[href]')) {
    if (shownLinks.length >= caps.shownLinks) break
    if (!shown(a) || clippedAway(a, getComputedStyle(a))) continue
    shownLinks.push({ href: a.href, text: saidBy(a).slice(0, 80) })
  }
  const shownPictures = []
  for (const img of document.body.querySelectorAll('img')) {
    if (shownPictures.length >= caps.shownPictures) break
    if (shown(img)) shownPictures.push((img.currentSrc || img.src).slice(0, 300))
  }
  const shownText = (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, caps.shownText)
  return {
    links,
    textBoxes,
    blocks,
    pictures,
    controls,
    fields,
    glued,
    headings,
    mainHeadings,
    shownText,
    shownLinks,
    shownPictures
  }
}

/** One width's measures, read in the page; null when the page would not answer (the entry is then left out). */
export async function readPageMeasures(page, width) {
  // Only colours can differ by the brand style, so one width answers for both, and a desktop page shows more of the template.
  const brandStyle = width === BRAND_STYLE_WIDTH ? await readBrandStyle(page) : null
  const measured = await page
    .evaluate(measurePageInPage, {
      tolerance: OVERFLOW_TOLERANCE_PX,
      stretch: STRETCH_REPORT_RATIO,
      caps: MEASURE_CAPS
    })
    .catch(() => null)
  return measured ? { width, ...measured, ...(brandStyle ? { brandStyle } : {}) } : null
}
