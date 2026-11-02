// Runs INSIDE the page (Playwright `page.evaluate`) after `findBlocks` tagged every block with
// `data-kit-block`: no imports, no closures over Node values.

/**
 * For every visible tagged block: its links, its visible words, every set of repeated rows in it and the skeleton
 * of its top levels (for telling pages of one layout).
 * A set of rows is two or more sibling elements of one shape (tag and classes, state classes ignored),
 * each with a box; for each set: how many rows, how many sit on the first visual line, and whether the
 * set lives in a slider or in tabs (then only one line or one tab shows at a time).
 */
export function readDetails() {
  const STATE = /^(active|show|current|selected|in|fade|is-|swiper-slide-|owl-|slick-|aos-)|^[a-z]+-\d+$/
  const SLIDER =
    '.owl-carousel, .swiper, .swiper-container, .slick-slider, .carousel, .splide, [data-ride="carousel"]'
  const TABS_PARENT = '.tab-content, .nav-tabs, .nav-pills, [role="tablist"]'
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return {
      left: Math.round(r.left + window.scrollX),
      top: Math.round(r.top + window.scrollY),
      width: Math.round(r.width),
      height: Math.round(r.height)
    }
  }
  const sig = (el) =>
    `${el.tagName}.${[...el.classList]
      .filter((c) => !STATE.test(c))
      .sort()
      .join('.')}`
  const pathFrom = (root, el) => {
    const idx = []
    for (let x = el; x && x !== root; x = x.parentElement)
      idx.unshift([...x.parentElement.children].indexOf(x))
    return idx
  }
  const out = {}
  for (const root of document.querySelectorAll('[data-kit-block]')) {
    if (!shown(root)) continue
    // Every shown link, in page order and keyed by its position: links that repeat a label and an address (four
    // icon links all pointing to `#`) are each listed.
    const links = []
    for (const a of root.querySelectorAll('a[href]')) {
      if (!shown(a)) continue
      const label = (a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || '')
        .replace(/\s+/g, ' ')
        .trim()
      links.push({ position: links.length, label, href: a.getAttribute('href') })
    }
    const texts = new Set()
    for (const el of root.querySelectorAll('*')) {
      if (!shown(el) || /^(SCRIPT|STYLE|NOSCRIPT|SVG)$/i.test(el.tagName)) continue
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (own.length >= 2) texts.add(own)
      for (const attr of ['placeholder', 'value']) {
        const v = el.tagName === 'INPUT' || el.tagName === 'BUTTON' ? el.getAttribute(attr) : null
        if (v && v.trim().length >= 2 && el.type !== 'hidden') texts.add(v.trim())
      }
    }
    const repeats = []
    for (const parent of [root, ...root.querySelectorAll('*')]) {
      if (parent.children.length < 2) continue
      const groups = new Map()
      for (const c of parent.children) {
        const r = c.getBoundingClientRect()
        // A row not rendered at all (in a closed tab) still counts; a rendered sliver (a spacer) does not.
        if (c.getClientRects().length && (r.width < 40 || r.height < 20)) continue
        const k = sig(c)
        if (!groups.has(k)) groups.set(k, [])
        groups.get(k).push(c)
      }
      for (const [k, rows] of groups) {
        if (rows.length < 2) continue
        const boxes = rows.filter(shown).map(box)
        const top = boxes.length ? Math.min(...boxes.map((b) => b.top)) : 0
        repeats.push({
          path: pathFrom(root, parent),
          shape: k,
          count: rows.length,
          shownCount: boxes.length,
          firstLine: boxes.filter((b) => Math.abs(b.top - top) <= 4).length,
          inSlider: !!parent.closest(SLIDER),
          inTabs: parent.matches(TABS_PARENT),
          container: box(parent),
          rows: boxes,
          // The first link of every row: tells a set of content items (each row opens a page) from the rest.
          rowLinks: rows.map((r) => (r.matches('a[href]') ? r : r.querySelector('a[href]'))?.href ?? null)
        })
      }
      if (repeats.length >= 40) break
    }
    // The skeleton of the block (no words): its containers with their classes, and every run of flowing content
    // (text, headings, lists, pictures, links) as one `~`. Two pages of one layout share it even when their words,
    // pictures and paragraph counts differ; a page that builds rows and columns in its content does not.
    // A wrapper with one child is passed through (it costs no level); four levels of containers are read.
    const FLOW =
      /^(P|H[1-6]|UL|OL|DL|BLOCKQUOTE|FIGURE|FIGCAPTION|IMG|PICTURE|SVG|VIDEO|IFRAME|TABLE|HR|PRE|SPAN|A|STRONG|EM|B|I|SMALL|LABEL|BUTTON|TIME|CITE|CODE|INPUT|SELECT|TEXTAREA)$/
    // A picture counts when it is laid out at all, not by its size: the read pass blocks images, so an unloaded
    // picture has no size there and would read as a different skeleton than the same page with its pictures.
    const MEDIA = /^(IMG|PICTURE|VIDEO|IFRAME|SVG)$/
    const present = (c) =>
      shown(c) ||
      (MEDIA.test(c.tagName) &&
        getComputedStyle(c).display !== 'none' &&
        getComputedStyle(c).visibility !== 'hidden')
    const skel = (el, depth, hops = 0) => {
      const kids = [...el.children].filter(
        (c) => present(c) && !/^(SCRIPT|STYLE|NOSCRIPT|BR|LINK|META|TEMPLATE)$/i.test(c.tagName)
      )
      if (kids.length === 1 && !FLOW.test(kids[0].tagName) && hops < 12)
        return `${sig(kids[0])}>${skel(kids[0], depth, hops + 1)}`
      if (depth > 4) return kids.length ? '…' : ''
      const parts = []
      for (const c of kids) {
        const one = FLOW.test(c.tagName) ? '~' : `${sig(c)}(${skel(c, depth + 1)})`
        if (parts.at(-1) !== one) parts.push(one)
      }
      return parts.join(',')
    }
    const skeleton = skel(root, 1).slice(0, 4000)
    // Every shown paragraph whole (inline markup included): the page's own count of a slot's paragraphs.
    const paragraphs = [...root.querySelectorAll('p')]
      .filter((p) => shown(p))
      .map((p) => (p.innerText || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length >= 2)
    // Every shown bullet whole: the page's own count of a slot's bullets.
    const bullets = [...root.querySelectorAll('li')]
      .filter((li) => shown(li) && !li.querySelector('li'))
      .map((li) => (li.innerText || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length >= 2)
    out[root.getAttribute('data-kit-block')] = {
      links,
      texts: [...texts],
      paragraphs,
      bullets,
      repeats,
      skeleton
    }
  }
  return out
}
