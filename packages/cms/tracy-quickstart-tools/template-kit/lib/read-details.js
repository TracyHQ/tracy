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
    const links = []
    const seenLinks = new Set()
    for (const a of root.querySelectorAll('a[href]')) {
      const label = (a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || '')
        .replace(/\s+/g, ' ')
        .trim()
      const href = a.getAttribute('href')
      const key = `${label}|${href}`
      if (seenLinks.has(key) || !shown(a)) continue
      seenLinks.add(key)
      links.push({ label, href })
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
      if (own.length >= 2 && own.length <= 300) texts.add(own)
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
    // The skeleton of the block's top levels (shapes of shown elements, repeats collapsed, no words): two pages of
    // one layout share it even when their content differs.
    // A wrapper with one child is passed through (it costs no level); two levels of branching are read.
    const skel = (el, depth, hops = 0) => {
      const kids = [...el.children].filter(
        (c) => shown(c) && !/^(SCRIPT|STYLE|NOSCRIPT|BR)$/i.test(c.tagName)
      )
      if (kids.length === 1 && hops < 12) return `${sig(kids[0])}>${skel(kids[0], depth, hops + 1)}`
      if (depth > 2) return ''
      const parts = []
      for (const c of kids) {
        const one = `${sig(c)}${depth < 2 ? `(${skel(c, depth + 1)})` : ''}`
        if (parts.at(-1) !== one) parts.push(one)
      }
      return parts.join(',')
    }
    const skeleton = skel(root, 1).slice(0, 4000)
    out[root.getAttribute('data-kit-block')] = { links, texts: [...texts], repeats, skeleton }
  }
  return out
}
