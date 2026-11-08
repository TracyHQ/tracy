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
  // Zebra classes (`cat-list-row0` / `cat-list-row1`, `odd` / `even`) alternate between rows of one set: state too.
  const STATE =
    /^(active|show|current|selected|in|fade|is-|swiper-slide-|owl-|slick-|aos-)|^[a-z]+-\d+$|(?:^|-)row\d$|^(?:odd|even)$/
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
  // A row's shape: a modifier of one of its own classes (`plan--featured` beside `plan`, a highlighted card) is a
  // variant of the row, not a shape of its own. Only the row sets use it; the body skeleton keeps every class.
  const rowSig = (el) =>
    `${el.tagName}.${[...el.classList]
      .filter((c) => !STATE.test(c) && !(c.includes('--') && el.classList.contains(c.split('--')[0])))
      .sort()
      .join('.')}`
  const pathFrom = (root, el) => {
    const idx = []
    for (let x = el; x && x !== root; x = x.parentElement)
      idx.unshift([...x.parentElement.children].indexOf(x))
    return idx
  }
  // Pictures: the file a URL names (no query or fragment, no leading slash), and what each element paints.
  const fileOf = (u) => {
    // A data: URI is an inline icon, not a picture file.
    if (/^data:/i.test(String(u).trim())) return ''
    try {
      return decodeURIComponent(new URL(u, location.href).pathname).replace(/^\/+/, '')
    } catch {
      return ''
    }
  }
  const URL_RE = /url\(["']?([^"')]+)["']?\)/g
  const MIN_PICTURE = 40
  const bgFiles = (el, pseudo) => {
    const s = getComputedStyle(el, pseudo)
    if (pseudo && (s.content === 'none' || s.content === 'normal')) return []
    return [...String(s.backgroundImage).matchAll(URL_RE)].map((m) => fileOf(m[1])).filter(Boolean)
  }
  const visible = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    }
    return true
  }
  const opaque = (el) => {
    const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/)
    if (!m) return false
    const parts = m[1].split(/[ ,/]+/).filter(Boolean)
    return parts.length < 4 || Number(parts[3]) >= 0.95
  }
  const describe = (el) =>
    `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList]
      .filter((c) => !STATE.test(c))
      .map((c) => `.${c}`)
      .join('')}`
  // Layers outside every block that paint a picture (a page-wide background drawn by the template's settings): read
  // once, then each block checks whether one shows through it.
  const layers = []
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('[data-kit-block]') || el.querySelector('[data-kit-block]')) continue
    const pos = getComputedStyle(el).position
    if (pos !== 'fixed' && pos !== 'absolute') continue
    const files = [...bgFiles(el, null), ...bgFiles(el, '::before'), ...bgFiles(el, '::after')]
    const r = el.getBoundingClientRect()
    if (!files.length || r.width < MIN_PICTURE || r.height < MIN_PICTURE || !visible(el)) continue
    layers.push({ el, files, fixed: pos === 'fixed' })
  }
  /**
   * Every picture a block shows at least 40px each way: an <img> or a CSS background (the element's own, its ::before
   * or ::after) inside the block, and a background painted behind the block by an ancestor or a layer outside every
   * block that shows through it (nothing opaque between them). `painter` names the element; `behind` marks one
   * outside the block.
   */
  const picturesOf = (root) => {
    const out = []
    const seen = new Set()
    const add = (file, via, el, behind, r) => {
      const key = `${file}|${describe(el)}`
      if (!file || seen.has(key)) return
      seen.add(key)
      out.push({
        position: out.length,
        file,
        via,
        painter: describe(el),
        behind,
        box: { width: Math.round(r.width), height: Math.round(r.height) }
      })
    }
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const r = el.getBoundingClientRect()
      if (r.width < MIN_PICTURE || r.height < MIN_PICTURE || !visible(el)) continue
      if (el.tagName === 'IMG')
        add(fileOf(el.currentSrc || el.getAttribute('src') || ''), 'img', el, false, r)
      for (const pseudo of [null, '::before', '::after'])
        for (const f of bgFiles(el, pseudo)) add(f, 'background', el, false, r)
    }
    // Is anything opaque between the block and a painter behind it (the block itself, its ancestors below `stop`,
    // or a child covering most of the block)?
    const rb = root.getBoundingClientRect()
    // A picture or a solid colour covering most of the block hides what lies behind it.
    const coverChild = [root, ...root.querySelectorAll('*')].some((c) => {
      const r = c.getBoundingClientRect()
      return (
        (opaque(c) || bgFiles(c, null).length > 0) &&
        r.width * r.height >= 0.9 * rb.width * rb.height &&
        visible(c)
      )
    })
    if (coverChild) return out
    const coveredBelow = (stop) => {
      for (let e = root; e && e !== stop; e = e.parentElement) if (opaque(e)) return true
      return false
    }
    for (let a = root.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const files = bgFiles(a, null)
      if (files.length && !coveredBelow(a))
        for (const f of files) add(f, 'background', a, true, a.getBoundingClientRect())
    }
    for (const { el, files, fixed } of layers) {
      const r = el.getBoundingClientRect()
      const top = r.top + (fixed ? 0 : scrollY)
      const btop = rb.top + scrollY
      // A fixed layer stays behind whatever scrolls past it; another layer must overlap most of the block.
      const over = fixed
        ? 1
        : (Math.max(0, Math.min(r.right, rb.right) - Math.max(r.left, rb.left)) *
            Math.max(0, Math.min(top + r.height, btop + rb.height) - Math.max(top, btop))) /
          Math.max(1, rb.width * rb.height)
      if (over < 0.5) continue
      let common = el.parentElement
      while (common && !common.contains(root)) common = common.parentElement
      if (coveredBelow(common)) continue
      for (const f of files) add(f, 'background', el, true, r)
    }
    return out
  }
  const out = {}
  for (const root of document.querySelectorAll('[data-kit-block]')) {
    if (!shown(root)) continue
    // Every shown link, in page order and keyed by its position: links that repeat a label and an address (four
    // icon links all pointing to `#`) are each listed. A link of a block rendered inside this one (a call-to-action
    // module an article layout prints) is that block's, read there once. The page a pagination marks as the current one
    // (`aria-current`, address `#`: Joomla's own pagination layout) goes nowhere by design.
    const ofRoot = (el) => el.closest('[data-kit-block]') === root
    const links = []
    for (const a of root.querySelectorAll('a[href]')) {
      if (!shown(a) || !ofRoot(a)) continue
      const label = (a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || '')
        .replace(/\s+/g, ' ')
        .trim()
      const current =
        /^#?$/.test(a.getAttribute('href') ?? '') &&
        /^(true|page)$/.test(a.getAttribute('aria-current') ?? '')
      links.push({
        position: links.length,
        label,
        href: a.getAttribute('href'),
        ...(current ? { current: true } : {})
      })
    }
    const texts = new Set()
    // How many shown elements print each text: a text printed by three elements is three slots, never one.
    const textCounts = {}
    for (const el of root.querySelectorAll('*')) {
      if (!shown(el) || /^(SCRIPT|STYLE|NOSCRIPT|SVG)$/i.test(el.tagName)) continue
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (own.length >= 2) {
        texts.add(own)
        textCounts[own] = (textCounts[own] ?? 0) + 1
      }
      for (const attr of ['placeholder', 'value']) {
        const v = el.tagName === 'INPUT' || el.tagName === 'BUTTON' ? el.getAttribute(attr) : null
        if (v && v.trim().length >= 2 && el.type !== 'hidden') texts.add(v.trim())
      }
    }
    // Every shown clickable element that is not a link with an address (a button, an element acting as one, a submit
    // input) with its label and what it opens: a modal or panel it targets, the form it sends, or a script.
    const clickables = []
    for (const el of root.querySelectorAll(
      'button, [role="button"], [role="tab"], a:not([href]), a[href^="#"][data-bs-toggle], a[href^="#"][data-toggle], a[href^="#"][data-bs-slide], a[href^="#"][data-slide], form a[href="#"], a[href^="javascript:" i], input[type="submit"], input[type="button"]'
    )) {
      if (!shown(el) || !ofRoot(el)) continue
      const label = (
        el.innerText ||
        el.value ||
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
      if (!label) continue
      // A link with a real address is read as a link, even when it also toggles a menu.
      const href = el.tagName === 'A' ? (el.getAttribute('href') ?? '').trim() : ''
      if (href && !/^(#|javascript:)/i.test(href)) continue
      // A bare `#` link styled as a button (`role="button"`, no toggle, slide, form or handler) is read once, as the
      // link it is: one going nowhere is a dead link of the template, not a second, undeclared control.
      if (
        href === '#' &&
        !el.getAttribute('onclick') &&
        !el.closest('form') &&
        !el.matches('[data-bs-toggle], [data-toggle], [data-bs-slide], [data-slide]')
      )
        continue
      // A toggle names its panel by data-bs-target, aria-controls, or (a tab or collapse link) its own #fragment;
      // Bootstrap 3 and 4 (a T3 template) spell the attributes without "bs-".
      const toggle = el.getAttribute('data-bs-toggle') || el.getAttribute('data-toggle')
      // A carousel control (`data-bs-slide`, `data-slide`) moves the carousel its #fragment names.
      const slide = el.getAttribute('data-bs-slide') || el.getAttribute('data-slide')
      const opens =
        el.getAttribute('data-bs-target') ||
        el.getAttribute('data-target') ||
        el.getAttribute('aria-controls') ||
        ((toggle || slide) && /^#[\w-]/.test(href) ? href : null) ||
        null
      // A menu heading opens the submenu next to it.
      const submenu =
        el.getAttribute('aria-haspopup') === 'true' &&
        !!el.parentElement?.querySelector(':scope > .dropdown-menu, :scope > ul, :scope > div > ul')
      let target = null
      if (submenu && !opens) target = { kind: 'submenu' }
      else if (opens) {
        let held = null
        try {
          held = document.querySelector(opens.startsWith('#') || opens.startsWith('.') ? opens : `#${opens}`)
        } catch {}
        const map = !!held?.querySelector('iframe[src*="map"], [id*="map" i], [class*="map" i]')
        target = {
          kind: toggle || (slide ? 'slide' : 'panel'),
          element: opens,
          shows: map ? 'map' : null
        }
      } else if (el.type === 'submit' && el.form)
        target = { kind: 'form', action: el.form.getAttribute('action') }
      // A `#` link inside a form (the stars of a rating form), or a plain button of a form with its own handler (a
      // newsletter's `<input type="button" onclick="submit…">`), is a control of that form: its script sends it.
      else if (
        el.closest('form') &&
        ((el.tagName === 'A' && href === '#') || (el.type === 'button' && el.getAttribute('onclick')))
      )
        target = { kind: 'form', action: el.closest('form').getAttribute('action') }
      // A handler in its own attribute, an address that only runs a script (`javascript:void(0)`, bound by the
      // template's script), or a `<button type="button">` (no default action: only a listener, often bound on the
      // document, gives it one — a dark mode toggle): either way a script decides what it does.
      else if (
        el.getAttribute('onclick') ||
        /^javascript:/i.test(href) ||
        (el.tagName === 'BUTTON' && el.type === 'button')
      )
        target = { kind: 'script' }
      clickables.push({ position: clickables.length, label, tag: el.tagName.toLowerCase(), target })
    }
    const repeats = []
    for (const parent of [root, ...root.querySelectorAll('*')]) {
      if (parent.children.length < 2) continue
      const groups = new Map()
      for (const c of parent.children) {
        const r = c.getBoundingClientRect()
        // A row not rendered at all (in a closed tab) still counts; a rendered sliver (a spacer) does not.
        if (c.getClientRects().length && (r.width < 40 || r.height < 20)) continue
        const k = rowSig(c)
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
          rowLinks: rows.map((r) => (r.matches('a[href]') ? r : r.querySelector('a[href]'))?.href ?? null),
          // Every link of every row (a card may lead with its category before its title link), at most six.
          rowHrefs: rows.map((r) =>
            (r.matches('a[href]') ? [r] : [...r.querySelectorAll('a[href]')]).slice(0, 6).map((a) => a.href)
          ),
          // Rows inside another tagged block nested in this one (a sidebar module in the component area) are
          // that block's rows, not this block's.
          nested: parent.closest('[data-kit-block]') !== root
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
    // An embedded map in the block: a frame opening a maps address, or an element carrying coordinates (reach-checks.mjs).
    const MAPS_URL =
      /(?:google\.[a-z.]+\/maps|maps\.google\.|openstreetmap\.org|maps\.apple\.com|bing\.com\/maps)/i
    const maps = []
    for (const f of root.querySelectorAll('iframe[src]'))
      if (MAPS_URL.test(f.getAttribute('src') || ''))
        maps.push({ what: `iframe ${String(f.getAttribute('src')).slice(0, 120)}` })
    for (const el of root.querySelectorAll('[data-lat],[data-latitude],[data-lng],[data-longitude]'))
      maps.push({ what: `${el.tagName.toLowerCase()} with coordinates` })
    // A listing's page-size control (`limit`, the CMS's own name for it): the number of items a page shows.
    const limit = root.querySelector('select[name="limit"], select[name$="[limit]"]')
    const pageSizeControl = limit && Number(limit.value) > 0 ? Number(limit.value) : null
    out[root.getAttribute('data-kit-block')] = {
      maps: maps.slice(0, 5),
      ...(pageSizeControl ? { pageSizeControl } : {}),
      links,
      texts: [...texts],
      textCounts,
      clickables,
      pictures: picturesOf(root),
      paragraphs,
      bullets,
      repeats,
      skeleton
    }
  }
  return out
}
