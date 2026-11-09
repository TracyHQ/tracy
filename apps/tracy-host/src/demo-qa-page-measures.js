/**
 * The measures a site check asks of the host's browser besides its verdicts (`measurePages: true` on
 * `POST /_host/demo-qa`): text that overflows its box, blocks far taller than a screen, how much text each block prints
 * (with the item lengths of a list), pictures drawn out of shape, and the links a page holds. They are read at 1440 and again at 390 on every page the run keeps, and answered as
 * `pageMeasures`, one entry per page and width:
 *   { path, width, links: [{ href, text, status }], textBoxes: [...], blocks: [...], textBlocks: [...], pictures: [...], controls: [...],
 *     fields: [...], glued: [...], headingSpans: [...], headings: [...], mainHeadings: [...], minorHeadings: [...], hiddenHeadings: [...],
 *     selfLinks: [{ selector, text, href, holders: [{ tag, id, classes }] }], contentControls: [...], view, title, shownText,
 *     shownLinks: [{ href, text, clickable }], shownLinksClickable, shownPictures: [...],
 *     lists: [{ selector, items: [{ chars, text, pictures }] }],
 *     orphanRows: [{ selector, perRow, lastRow, rows, gap }], blankFooterColumns: [{ selector, width, height }], maps: [{ kind, lat?, lng?, address?, from }],
 *     phones: [{ text, digits, inTel, selector }], videoButtons: [{ selector, attribute, address }], brandStyle?, look? }
 * The shape is the one `apps/tracy-web/src/site-check/page-measures.js` documents; the judging stays there.
 */

import { readBrandStyle } from './demo-qa-brand-style.js'
import { readLook } from './demo-qa-look.js'

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
  textBlocks: 80,
  listItems: 40,
  headingSpans: 60,
  pictures: 40,
  controls: 40,
  fields: 40,
  glued: 20,
  headings: 40,
  selfLinks: 20,
  contentControls: 150,
  shownLinks: 300,
  shownPictures: 100,
  shownText: 30000,
  lists: 60,
  orphanRows: 20,
  blankFooterColumns: 20,
  maps: 10,
  phones: 40,
  videoButtons: 40
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
  // A carousel clone can have a full box while an ancestor clips every pixel; page scrolling is not clipping.
  const clippedByAncestor = (el) => {
    const r = el.getBoundingClientRect()
    let { left, right, top, bottom } = r
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const cs = getComputedStyle(parent)
      const box = parent.getBoundingClientRect()
      if (/^(hidden|clip)$/.test(cs.overflowX)) {
        left = Math.max(left, box.left)
        right = Math.min(right, box.right)
      }
      if (/^(hidden|clip)$/.test(cs.overflowY)) {
        top = Math.max(top, box.top)
        bottom = Math.min(bottom, box.bottom)
      }
      if (right <= left || bottom <= top) return true
    }
    return false
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
    // The element's own text only: a child (a code line in its own scrolling box) is read as itself, inside its clip.
    const range = document.createRange()
    let left = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    for (const n of own) {
      range.selectNodeContents(n)
      const r = range.getBoundingClientRect()
      left = Math.min(left, r.left)
      right = Math.max(right, r.right)
    }
    let fixed = false
    // A clipping ancestor (below the page itself) hides what lies past its edge: that is its cut, not the screen's.
    for (let a = el; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const acs = getComputedStyle(a)
      if (acs.overflowX !== 'visible') right = Math.min(right, a.getBoundingClientRect().right)
      if (acs.position === 'fixed') fixed = true
    }
    // Fixed text wholly past the edge is a closed panel parked off screen: no visitor can scroll to it.
    const parked = fixed && left >= viewWidth
    const past = !parked && right > viewWidth + tolerance
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

  // The text each block prints, and for a list the length of each item: the judge holds them to the same block on the demo
  // (`text-fill`). Characters of the shown text, spaces squashed.
  const textBlocks = []
  const said = (el) => (el.innerText ?? '').replace(/\s+/g, ' ').trim().length
  for (const el of candidates) {
    if (textBlocks.length >= caps.textBlocks) break
    if (getComputedStyle(el).position === 'fixed' || !shown(el)) continue
    const chars = said(el)
    if (!chars) continue
    const list = /^(UL|OL)$/.test(el.tagName.toUpperCase())
    const items = list
      ? Array.from(el.children)
          .filter((li) => li.tagName.toUpperCase() === 'LI' && shown(li))
          .slice(0, caps.listItems)
          .map(said)
      : null
    textBlocks.push({ selector: selectorOf(el), chars, ...(items ? { items } : {}) })
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
    // What the visitor sees beside the highlight: elements and comments that print nothing (a break a theme hides on a narrow
    // screen) are stepped over, a break that shows ends the line and so is not text.
    const nodes = Array.from(el.childNodes).filter(
      (n) => n.nodeType === 3 || (n.nodeType === 1 && getComputedStyle(n).display !== 'none')
    )
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

  // The smaller headings a visitor reads, and the main ones kept for a screen reader: what a separator is looked for in.
  const minorHeadings = []
  for (const el of document.body.querySelectorAll('h3,h4,h5,h6')) {
    if (minorHeadings.length >= caps.headings) break
    if (!shown(el) || clippedAway(el, getComputedStyle(el))) continue
    const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim()
    if (text) minorHeadings.push(text.slice(0, 120))
  }
  const hiddenHeadings = []
  for (const el of document.body.querySelectorAll('h1,h2')) {
    if (hiddenHeadings.length >= caps.headings) break
    const cs = getComputedStyle(el)
    if (shown(el) && !clippedAway(el, cs)) continue
    if (cs.display === 'none' || el.closest('[hidden]')) continue
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text) hiddenHeadings.push(text.slice(0, 120))
  }

  // Headings and titles with the words a span in them paints, and its colour: the judge holds a heading the demo marks with an
  // accent span to one (`accent-emphasis`). A title is a heading tag, or an element classed as a title outside one.
  const headingSpans = []
  for (const el of document.body.querySelectorAll('h1,h2,h3,h4,h5,h6,[class*="title"],[class*="heading"]')) {
    if (headingSpans.length >= caps.headingSpans) break
    if (!/^H[1-6]$/.test(el.tagName.toUpperCase()) && el.closest('h1,h2,h3,h4,h5,h6')) continue
    if (!shown(el) || clippedAway(el, getComputedStyle(el))) continue
    const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim()
    if (!text || text.length > 300) continue
    const spans = Array.from(el.querySelectorAll('span'))
      .filter((sp) => shown(sp) && (sp.innerText ?? '').trim())
      .slice(0, 6)
      .map((sp) => ({
        text: sp.innerText.replace(/\s+/g, ' ').trim().slice(0, 80),
        color: getComputedStyle(sp).color
      }))
    headingSpans.push({ text: text.slice(0, 200), color: getComputedStyle(el).color, spans })
  }

  // Buttons that lead to the page they are on. A menu marks the current page on purpose, and a fragment moves down the page.
  const selfLinks = []
  const pathOf = (u) =>
    u.pathname
      .replace(/^\/index\.php(?=\/|$)/, '')
      .replace(/\/+$/, '')
      .toLowerCase() + u.search
  const herePath = pathOf(new URL(location.href))
  const MENU =
    'nav,[role="navigation"],.navbar,.nav,.menu,.mod-menu,.t4-megamenu,.t3-megamenu,.breadcrumb,.pagination,.wp-block-navigation'
  for (const a of document.body.querySelectorAll(
    'a.btn,a.button,a[class*="btn"],a[class*="button"],a[role="button"],a.readmore,.readmore a'
  )) {
    if (selfLinks.length >= caps.selfLinks) break
    if (!shown(a) || clippedAway(a, getComputedStyle(a))) continue
    if (a.closest(MENU) || a.hasAttribute('aria-current')) continue
    // The site-wide header and footer are on every page, so a button there points to its own page on that page by design.
    // A header or footer inside the page's own content (an article's heading block) is the page's, not shared.
    const shared = a.closest('header,footer,[role="banner"],[role="contentinfo"]')
    if (shared && !shared.closest('main,article,section,[role="main"]')) continue
    // A bare # goes nowhere, which is its own finding (`controls`).
    if (a.href.includes('#')) continue
    let to
    try {
      to = new URL(a.href)
    } catch {
      continue
    }
    if (to.origin !== location.origin || pathOf(to) !== herePath) continue
    // What holds it, nearest first, so the judge can tell a container the kit names (ADR 0044, decision 29).
    const holders = []
    for (let el = a.parentElement; el && el !== document.body && holders.length < 12; el = el.parentElement)
      holders.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: [...el.classList].slice(0, 8)
      })
    selfLinks.push({ selector: selectorOf(a), text: saidBy(a).slice(0, 80), href: a.href, holders })
  }

  // The controls of the page's own content, named by what holds them, for the judge to compare a page the write step created
  // with the template's content pages. Not the header, the footer or a menu, which every page shares; not a plain link in a line.
  const contentControls = []
  const seenControls = new Set()
  const NOT_NAME =
    /^(?:active|current|show|open|in|fade|collapsed|loaded|lazy|lazyloaded|animated|wow|hover|focus|disabled|selected|aos-.*|is-.*|.*-active|.*-current)$|\d{3,}/
  const nameOf = (el) =>
    el.tagName.toLowerCase() +
    [...el.classList]
      .filter((c) => !NOT_NAME.test(c))
      .sort()
      .map((c) => `.${c}`)
      .join('')
  const SHARED = `header,footer,[role="banner"],[role="contentinfo"],#t4-header,#t4-footer,.t4-header,.t4-footer,${MENU}`
  for (const el of document.body.querySelectorAll(
    'a[href],button,[role="button"],input:not([type=hidden]),select,textarea'
  )) {
    if (contentControls.length >= caps.contentControls) break
    if (el.closest(SHARED) || !shown(el) || clippedAway(el, getComputedStyle(el))) continue
    if (el.tagName === 'A' && !el.classList.length && el.closest('p,td,blockquote')) continue
    const up = el.parentElement
    const key = [up?.parentElement, up, el]
      .filter((n) => n && n !== document.body)
      .map(nameOf)
      .join('>')
    if (seenControls.has(key)) continue
    seenControls.add(key)
    contentControls.push({ key, text: saidBy(el).slice(0, 60) })
  }
  const views = [...document.body.classList].filter((c) => c.startsWith('view-')).sort()

  // The main headings a visitor reads: a page should print one.
  const mainHeadings = []
  for (const el of document.body.querySelectorAll('h1')) {
    if (!shown(el) || clippedAway(el, getComputedStyle(el)) || clippedByAncestor(el)) continue
    const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim()
    if (text) mainHeadings.push(text.slice(0, 120))
  }

  // What a visitor can see at all, for the judge to tell a stored field on the page from one that prints nowhere.
  const shownLinks = []
  for (const a of document.body.querySelectorAll('a[href]')) {
    if (shownLinks.length >= caps.shownLinks) break
    const style = getComputedStyle(a)
    if (!shown(a) || clippedAway(a, style)) continue
    // Whether a click reaches it: a link made plain text (`pointer-events: none`) leads nowhere a visitor can go.
    shownLinks.push({ href: a.href, text: saidBy(a).slice(0, 80), clickable: style.pointerEvents !== 'none' })
  }
  const shownPictures = []
  for (const img of document.body.querySelectorAll('img')) {
    if (shownPictures.length >= caps.shownPictures) break
    if (shown(img)) shownPictures.push((img.currentSrc || img.src).slice(0, 300))
  }
  const shownText = (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, caps.shownText)

  // Lists a visitor sees as rows of items: two or more shown siblings of one shape (tag and classes, state classes aside), with
  // the words and pictures of each item, for the judge to count a list's printed items and find an empty one (`list-rows`).
  const STATE =
    /^(?:active|current|show|open|in|fade|selected|is-.*|.*-active|aos-.*|swiper-slide-.*|slick-.*|owl-.*)$|\d{2,}/
  const shapeOf = (el) =>
    `${el.tagName.toLowerCase()}${[...el.classList]
      .filter((c) => !STATE.test(c))
      .sort()
      .map((c) => `.${c}`)
      .join('')}`
  const picturesIn = (el) =>
    [...el.querySelectorAll('img')].filter(
      (img) => (img.currentSrc || img.getAttribute('src') || '').trim() && shown(img)
    ).length +
    [el, ...el.querySelectorAll('*')].filter(
      (n) => /url\(/.test(getComputedStyle(n).backgroundImage) && shown(n)
    ).length
  // Owl inserts extra copies around its original items for looping. A plain `.cloned` class proves nothing: only
  // an Owl item directly under an Owl stage inside its carousel, with canonical siblings present, is a copy.
  // Keep original siblings distinct even when their words and pictures are identical, and exclude copied subtrees
  // so a nested list inside a clone cannot become a competing row-count candidate.
  const owlCopy = (el) => {
    const copy = el.closest('.owl-item.cloned')
    const stage = copy?.parentElement
    return Boolean(
      stage?.matches('.owl-stage') &&
        stage.closest('.owl-carousel') &&
        [...stage.children].some((item) => item.matches('.owl-item:not(.cloned)'))
    )
  }
  const lists = []
  for (const parent of document.body.querySelectorAll('*')) {
    if (lists.length >= caps.lists) break
    if (SKIP.has(parent.tagName.toUpperCase()) || parent.children.length < 2 || owlCopy(parent)) continue
    const groups = new Map()
    for (const c of parent.children) {
      if (SKIP.has(c.tagName.toUpperCase()) || !shown(c) || owlCopy(c)) continue
      const shape = shapeOf(c)
      groups.set(shape, [...(groups.get(shape) ?? []), c])
    }
    for (const [shape, items] of groups) {
      if (items.length < 2 || lists.length >= caps.lists) continue
      lists.push({
        selector: `${selectorOf(parent)}>${shape}`,
        items: items.slice(0, caps.listItems).map((it) => ({
          chars: (it.innerText ?? '').replace(/\s+/g, ' ').trim().length,
          text: (it.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
          pictures: picturesIn(it)
        }))
      })
    }
  }

  // Orphan card rows: a grid, or a flex row that wraps, of three or more cards of one shape and about one width (each at least
  // 120 x 80, so no tag cloud or menu), laid out in two or more rows whose full rows hold the same number of cards, and whose
  // last row holds fewer, starting at the first row's left edge and leaving at least half a card of empty width on its right.
  // A last row that is centred or stretched to the edge is the template's choice, not a hole (`orphan-row`).
  const near = (a, b, px) => Math.abs(a - b) <= px
  const inFlow = (el) => !/^(?:absolute|fixed)$/.test(getComputedStyle(el).position)
  const SLIDES =
    '[class*="carousel"],[class*="swiper"],[class*="slick"],[class*="splide"],[class*="owl-"],[class*="glide"]'
  // Joomla's category list owns its items and navigation directly; another list's pager proves nothing.
  const finalPaginationOf = (box) => {
    const owner = box.closest('.com-content-category-blog')
    if (!owner) return null
    const items = [...owner.children].filter((c) => c.matches('.com-content-category-blog__items'))
    const navigation = [...owner.children].filter((c) => c.matches('.com-content-category-blog__navigation'))
    if (items.length !== 1 || navigation.length !== 1 || box.parentElement !== items[0]) return null
    if (!box.matches('.items-row') || owner.querySelectorAll('.items-row').length !== 1) return null
    const holders = [...navigation[0].children].filter((c) =>
      c.matches('.com-content-category-blog__pagination')
    )
    if (holders.length !== 1) return null
    const navs = holders[0].querySelectorAll('nav[aria-label]')
    if (navs.length !== 1 || navs[0].parentElement !== holders[0]) return null
    const pagers = navs[0].querySelectorAll('ul.pagination')
    if (pagers.length !== 1) return null
    const direct = pagers[0].parentElement === navs[0]
    const wrapped =
      pagers[0].parentElement.matches('.pagination') && pagers[0].parentElement.parentElement === navs[0]
    if (!direct && !wrapped) return null
    const controls = [...pagers[0].children]
    if (controls.length < 6 || controls.some((c) => !c.matches('li.page-item'))) return null
    const disabled = (c) => c.matches('.disabled') && !c.querySelector('a,button')
    if (!disabled(controls.at(-2)) || !disabled(controls.at(-1))) return null
    // Only the result offset may vary: Itemid, category and filters still identify the list.
    const listQuery = (url) => {
      const params = new URLSearchParams(url.search)
      params.delete('start')
      params.sort()
      return params.toString()
    }
    const pages = []
    for (const item of controls.slice(2, -2)) {
      const text = item.textContent.trim()
      if (!/^[1-9]\d*$/.test(text)) return null
      const current = item.querySelector('[aria-current="true"],[aria-current="page"]')
      const a = item.querySelector('a[href]')
      let href = null
      if (!current) {
        if (!a || !shown(a)) return null
        const url = new URL(a.href)
        if (
          url.origin !== location.origin ||
          url.pathname !== location.pathname ||
          listQuery(url) !== listQuery(location) ||
          url.hash ||
          url.pathname + url.search === location.pathname + location.search
        )
          return null
        href = url.pathname + url.search
      }
      pages.push({ number: Number(text), current: Boolean(current), href })
    }
    const current = pages.filter((p) => p.current)
    if (
      current.length !== 1 ||
      current[0].number <= 1 ||
      new Set(pages.map((p) => p.number)).size !== pages.length ||
      !pages.some((p) => !p.current && p.number < current[0].number) ||
      pages.some((p) => p.number > current[0].number)
    )
      return null
    const own = selectorOf(owner)
    const itemSelector = `${own} > .com-content-category-blog__items`
    const navSelector = `${own} > .com-content-category-blog__navigation`
    return {
      schemaVersion: 'tracy-final-pagination/v1',
      association: {
        owner: own,
        items: itemSelector,
        grid: `${itemSelector} > ${selectorOf(box)}`,
        navigation: navSelector,
        pager: `${navSelector} > .com-content-category-blog__pagination > nav[aria-label] > ${direct ? '' : '.pagination > '}ul.pagination`
      },
      listCount: 1,
      pagerCount: 1,
      pages,
      next: { disabled: true, href: null },
      end: { disabled: true, href: null },
      reason: 'the last page has fewer remaining results than columns'
    }
  }
  const orphanRows = []
  for (const box of document.body.querySelectorAll('*')) {
    if (orphanRows.length >= caps.orphanRows) break
    if (SKIP.has(box.tagName.toUpperCase()) || box.children.length < 3) continue
    const cs = getComputedStyle(box)
    const grid = /grid/.test(cs.display)
    const wraps = /flex/.test(cs.display) && cs.flexDirection === 'row' && cs.flexWrap === 'wrap'
    if ((!grid && !wraps) || !shown(box) || box.closest(`${MENU},${SLIDES}`)) continue
    const items = Array.from(box.children).filter(
      (c) => !SKIP.has(c.tagName.toUpperCase()) && shown(c) && inFlow(c)
    )
    if (items.length < 3 || items.some((it) => shapeOf(it) !== shapeOf(items[0]))) continue
    const rects = items.map((it) => it.getBoundingClientRect())
    const cardWidth = rects[0].width
    if (rects.some((r) => r.width < 120 || r.height < 80 || !near(r.width, cardWidth, cardWidth * 0.1)))
      continue
    const rows = []
    for (const r of rects) {
      const row = rows.find((rw) => near(rw.top, r.top, 4))
      if (row) row.cards.push(r)
      else rows.push({ top: r.top, cards: [r] })
    }
    if (rows.length < 2) continue
    rows.sort((a, b) => a.top - b.top)
    for (const row of rows) row.cards.sort((a, b) => a.left - b.left)
    const perRow = rows[0].cards.length
    const last = rows[rows.length - 1].cards
    if (perRow < 2 || rows.slice(0, -1).some((row) => row.cards.length !== perRow) || last.length >= perRow)
      continue
    const first = rows[0].cards
    if (!near(last[0].left, first[0].left, 4)) continue
    const gap = Math.round(first[first.length - 1].right - last[last.length - 1].right)
    if (gap < cardWidth * 0.5) continue
    const pagination = finalPaginationOf(box)
    orphanRows.push({
      selector: selectorOf(box),
      perRow,
      lastRow: last.length,
      rows: rows.length,
      gap,
      ...(pagination ? { pagination } : {})
    })
  }

  // Blank footer columns: in the site footer (not an article's own footer), a column of a row laid out side by side (a flex row
  // or a grid, the column at least 100 px wide and sharing its line with a sibling) that holds markup but prints no words, no
  // link, no picture, no icon and no control, while a sibling column prints something (`blank-footer-column`). A column with
  // no markup at all is the template's spacer.
  const PRINTS = 'img,svg,picture,video,canvas,iframe,object,embed,input,select,textarea,button,[role="img"]'
  const paintedIn = (el) =>
    [el, ...el.querySelectorAll('*')].some((n) => {
      if (n !== el && !shown(n)) return false
      if (/url\(/.test(getComputedStyle(n).backgroundImage)) return true
      return ['::before', '::after'].some((which) => {
        const ps = getComputedStyle(n, which)
        if (!ps.content || ps.content === 'none' || ps.content === 'normal') return false
        const glyph = /^["']/.test(ps.content) && ps.content.slice(1, -1).trim() !== ''
        // A mask paints only the colour under it: one over a see-through ground shows nothing.
        const clear =
          ps.backgroundColor === 'transparent' ||
          /^rgba\([^,]+,[^,]+,[^,]+,\s*0(?:\.0+)?\s*\)$/.test(ps.backgroundColor) ||
          /\/\s*0(?:\.0+)?\s*\)$/.test(ps.backgroundColor)
        const masked = /url\(/.test(ps.maskImage || '') && !clear
        return glyph || /url\(/.test(ps.backgroundImage) || masked
      })
    })
  const blank = (col) =>
    !(col.innerText ?? '').replace(/[\s\u200b-\u200d\ufeff]+/g, '') &&
    !Array.from(col.querySelectorAll(PRINTS)).some(shown) &&
    !paintedIn(col)
  const blankFooterColumns = []
  const FOOTER = 'footer,[role="contentinfo"],#t4-footer,.t4-footer,#t3-footer,.t3-footer'
  for (const footer of document.body.querySelectorAll(FOOTER)) {
    if (footer.parentElement?.closest(FOOTER) || footer.closest('main,article,[role="main"]')) continue
    for (const row of [footer, ...footer.querySelectorAll('*')]) {
      if (blankFooterColumns.length >= caps.blankFooterColumns) break
      const cs = getComputedStyle(row)
      if (!/grid/.test(cs.display) && !(/flex/.test(cs.display) && cs.flexDirection.startsWith('row')))
        continue
      const cols = Array.from(row.children).filter(
        (c) => !SKIP.has(c.tagName.toUpperCase()) && shown(c) && inFlow(c)
      )
      if (cols.length < 2) continue
      const rects = cols.map((c) => c.getBoundingClientRect())
      const empty = cols.map(blank)
      if (empty.every(Boolean)) continue
      cols.forEach((col, at) => {
        const r = rects[at]
        const beside = rects.some((o, k) => k !== at && near(o.top, r.top, 4))
        if (!empty[at] || !beside || r.width < 100 || !col.children.length) return
        if (blankFooterColumns.length < caps.blankFooterColumns)
          blankFooterColumns.push({
            selector: selectorOf(col),
            width: Math.round(r.width),
            height: Math.round(r.height)
          })
      })
    }
  }

  // Maps the page draws: a frame or link opening a maps address, an element carrying coordinates, or a script configuring one,
  // with the coordinates or address each names, for the judge to hold them to the demo's and the brief's (`map-location`).
  const MAPS_URL =
    /(?:google\.[a-z.]+\/maps|maps\.google\.|openstreetmap\.org|maps\.apple\.com|bing\.com\/maps)/i
  const NUM = '(-?\\d{1,3}\\.\\d{3,})'
  const pairIn = (text) => {
    const t = String(text ?? '')
    const pair = (lat, lng) => ({ lat: Number(lat), lng: Number(lng) })
    const at = /@(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/.exec(t)
    if (at) return pair(at[1], at[2])
    const q = /[?&](?:q|ll|center|query)=(-?\d{1,3}\.\d{3,})(?:,|%2C)\s*(-?\d{1,3}\.\d{3,})/i.exec(t)
    if (q) return pair(q[1], q[2])
    const place = /!3d(-?\d{1,3}\.\d{3,})!4d(-?\d{1,3}\.\d{3,})/.exec(t)
    if (place) return pair(place[1], place[2])
    const embed = /!2d(-?\d{1,3}\.\d{3,})!3d(-?\d{1,3}\.\d{3,})/.exec(t)
    if (embed) return pair(embed[2], embed[1])
    // A script names them in its own shape ("latitude":{"0":"12.5"}, lat: 12.5): the first number of each key, near it.
    const lat = new RegExp(`lat(?:itude)?\\b[^\\n]{0,24}?${NUM}`, 'i').exec(t)
    const lng = new RegExp(`(?:lng|lon|longitude)\\b[^\\n]{0,24}?${NUM}`, 'i').exec(t)
    return lat && lng ? { lat: Number(lat[1]), lng: Number(lng[1]) } : null
  }
  const addressIn = (url) => {
    try {
      const q =
        new URL(url, location.href).searchParams.get('q') ??
        new URL(url, location.href).searchParams.get('query')
      return q && !/^\s*-?\d{1,3}\.\d+\s*,/.test(q) ? q.slice(0, 120) : null
    } catch {
      return null
    }
  }
  const maps = []
  const addMap = (kind, pair, address, from) => {
    if (maps.length < caps.maps && (pair || address))
      maps.push({
        kind,
        ...(pair ? { lat: pair.lat, lng: pair.lng } : {}),
        ...(address ? { address } : {}),
        from: from.slice(0, 120)
      })
  }
  for (const f of document.querySelectorAll('iframe[src]')) {
    const src = f.getAttribute('src') || ''
    if (MAPS_URL.test(src)) addMap('frame', pairIn(src), addressIn(src), src)
  }
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || ''
    if (MAPS_URL.test(href)) addMap('link', pairIn(href), addressIn(href), href)
  }
  for (const el of document.querySelectorAll('[data-lat],[data-latitude]')) {
    const lat = Number(el.getAttribute('data-lat') ?? el.getAttribute('data-latitude'))
    const lng = Number(
      el.getAttribute('data-lng') ?? el.getAttribute('data-lon') ?? el.getAttribute('data-longitude')
    )
    if (Number.isFinite(lat) && Number.isFinite(lng)) addMap('element', { lat, lng }, null, selectorOf(el))
  }
  for (const sc of document.querySelectorAll('script:not([src])')) {
    const text = sc.textContent ?? ''
    if (!/map/i.test(text) || !/lat/i.test(text)) continue
    addMap('script', pairIn(text), null, 'inline script')
  }

  // Phone numbers the page prints, and whether each sits inside a tel: link (`phone-callable`).
  const phones = []
  const PHONE = /\+?\d[\d\s().-]{6,}\d/g
  const phoneWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (
    let node = phoneWalker.nextNode();
    node && phones.length < caps.phones;
    node = phoneWalker.nextNode()
  ) {
    const host = node.parentElement
    if (!host || SKIP.has(host.tagName.toUpperCase()) || !shown(host)) continue
    for (const m of String(node.textContent).matchAll(PHONE)) {
      const digits = m[0].replace(/\D/g, '')
      if (digits.length < 7 || digits.length > 15) continue
      const tel = host.closest('a[href^="tel:"]')
      phones.push({ text: m[0].trim().slice(0, 40), digits, inTel: Boolean(tel), selector: selectorOf(host) })
    }
  }
  // Shown elements that open a video player: the address an attribute names (`empty-video-buttons` judges which name no video).
  const videoButtons = []
  const VIDEO_HOST = /(?:youtube(?:-nocookie)?\.com|youtu\.be|vimeo\.com)/i
  const VIDEO_ATTRS = ['data-src', 'href', 'src', 'data-video', 'data-url', 'data-href', 'data-video-url']
  const videoSelector = VIDEO_ATTRS.map((a) => `[${a}]`).join(',')
  for (const el of document.querySelectorAll(videoSelector)) {
    if (videoButtons.length >= caps.videoButtons) break
    if (!shown(el)) continue
    const attribute = VIDEO_ATTRS.find((a) => VIDEO_HOST.test(el.getAttribute(a) || ''))
    if (attribute)
      videoButtons.push({ selector: selectorOf(el), attribute, address: el.getAttribute(attribute) })
  }
  return {
    links,
    textBoxes,
    blocks,
    textBlocks,
    headingSpans,
    pictures,
    controls,
    fields,
    glued,
    headings,
    mainHeadings,
    minorHeadings,
    hiddenHeadings,
    selfLinks,
    contentControls,
    view: views.join(' '),
    title: document.title,
    shownText,
    shownLinks,
    shownLinksClickable: true,
    shownPictures,
    lists,
    orphanRows,
    blankFooterColumns,
    maps,
    phones,
    videoButtons
  }
}

/** How long a page's own transitions may hold back a measure. */
export const TRANSITIONS_MS = 1500

/**
 * The look read paints whole pages hidden to shoot a logo, and an element with a CSS transition comes back over time. Read at once,
 * such an element, a share button with `transition: all` for one, counts as not shown. Runs inside the page: it may use nothing from
 * this module. A looping animation is no transition, and does not hold this back.
 */
export const transitionsDoneInPage = (maxMs) =>
  Promise.race([
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a instanceof CSSTransition)
        .map((a) => a.finished.catch(() => {}))
    ),
    new Promise((resolve) => setTimeout(resolve, maxMs))
  ]).then(() => {})

/** One width's measures, read in the page; null when the page would not answer (the entry is then left out). */
export async function readPageMeasures(page, width) {
  // Only colours can differ by the brand style, so one width answers for both, and a desktop page shows more of the template.
  const brandStyle = width === BRAND_STYLE_WIDTH ? await readBrandStyle(page) : null
  const look = await readLook(page, width)
  await page.evaluate(transitionsDoneInPage, TRANSITIONS_MS).catch(() => {})
  const measured = await page
    .evaluate(measurePageInPage, {
      tolerance: OVERFLOW_TOLERANCE_PX,
      stretch: STRETCH_REPORT_RATIO,
      caps: MEASURE_CAPS
    })
    .catch(() => null)
  return measured
    ? { width, ...measured, ...(brandStyle ? { brandStyle } : {}), ...(look ? { look } : {}) }
    : null
}
