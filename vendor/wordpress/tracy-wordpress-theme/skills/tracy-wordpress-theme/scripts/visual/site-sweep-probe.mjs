// What site-sweep.mjs reads from ONE loaded page at ONE width and scheme: plain properties only, no pictures.
// `probeInPage` runs in the page (it is serialised, so it holds no import and no outer name); it returns
// plain data, and every comparison between the two sides is made outside, in site-sweep-judge.mjs.
//
//   overflow  the document's scroll width past the viewport, and the widest element that reaches past it
//   bg        the page background a person sees: the first painted background walking up from the main
//             content, and the same at the left edge of the viewport (the colour left and right of the content)
//   root      what the root element says about the scheme (the dark hook's attribute or class), resolved, and the
//             colours on the landmark surfaces (header, main, first card, sidebar, footer) a person sees
//   header    the header's height, the inset of each control by ROLE (logo, menu button, search, theme toggle, call
//             to action), where the content below starts, and the header pictures that did not load
//   chips     small painted labels (category chips, tags): text, section, ordinal inputs and the paint
//
// `cfg` = { parts: {overflow, bg, root, header, chips}, marks: [{kind:'attr', name, dark, light}|{kind:'class', name}],
//           selectors: {header?, main?} }

/** Runs in the page. */
export function probeInPage(cfg) {
  const parts = cfg.parts ?? {}
  const timing = {}
  const lap = (key, fn) => {
    const start = performance.now()
    try {
      return fn()
    } finally {
      timing[key] = Math.round((performance.now() - start) * 10) / 10
    }
  }
  const doc = document.documentElement
  const iw = doc.clientWidth
  const ih = window.innerHeight
  const style = (e) => getComputedStyle(e)
  const r1 = (n) => Math.round(n * 10) / 10
  const nameOf = (e) => {
    const cls = String(e.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2)
    return `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${cls.map((c) => `.${c}`).join('')}`
  }
  // painted for a person: laid out, not hidden, not faded out, anywhere up to `stop`
  const shown = (e, stop = null) => {
    const r = e.getBoundingClientRect()
    if (r.width <= 1 || r.height <= 1) return false
    // a copy parked beside the viewport (an off-canvas menu) is not on the page a person sees
    if (r.right <= 0 || r.left >= iw) return false
    for (let a = e; a && a !== stop; a = a.parentElement) {
      const s = style(a)
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false
      if (a.getAttribute('aria-hidden') === 'true' || a.hasAttribute('hidden')) return false
    }
    return true
  }
  const pick = (sel) => {
    if (!sel) return null
    try {
      return document.querySelector(sel)
    } catch {
      return null
    }
  }
  // a page with no stylesheet at all is the web server's own answer (an Apache 404), not a page of the site; the runner reads it
  // before it adds its own freeze stylesheet (`window.__sweepBare`)
  const out = { iw, timing, title: document.title, bare: window.__sweepBare ?? document.querySelectorAll('link[rel~="stylesheet"], style').length === 0 }

  // the body's first font family and which web fonts are loaded: a source that renders in a system fallback where the port
  // loads its web font is not a source to compare text-width-driven layout with
  const family = (e) => (style(e).fontFamily.split(',')[0] ?? '').replace(/["']/g, '').trim()
  out.fonts = { body: family(document.body), loaded: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))] }

  if (parts.overflow) {
    lap('overflow', () => {
      const scroll = document.scrollingElement || doc
      out.over = scroll.scrollWidth - iw
      out.culprit = null
      if (out.over <= 1) return
      let best = null
      let count = 0
      for (const e of document.body.querySelectorAll('*')) {
        const r = e.getBoundingClientRect()
        if (!r.width || !r.height || r.right <= iw + 1) continue
        const s = style(e)
        if (s.visibility === 'hidden' || s.display === 'none') continue
        // an element inside a clipping ancestor that ends within the viewport, or inside a fixed one, does not widen the page
        let clipped = false
        for (let a = e; a && a !== doc; a = a.parentElement) {
          const as = style(a)
          if (as.position === 'fixed') clipped = true
          else if (a !== e && /hidden|clip|auto|scroll/.test(as.overflowX) && a.getBoundingClientRect().right <= iw + 1) clipped = true
          if (clipped) break
        }
        if (clipped) continue
        count++
        if (!best || r.right > best.right) best = { selector: nameOf(e), right: r1(r.right), width: r1(r.width), over: r1(r.right - iw), text: (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) }
      }
      out.culprit = best ? { ...best, offenders: count } : null
    })
  }

  if (parts.bg) {
    lap('bg', () => {
      const painted = (c) => {
        const m = /^rgba?\(([^)]*)\)$/.exec(c)
        if (!m) return c !== 'transparent'
        const p = m[1].split(/[,/ ]+/).filter(Boolean)
        return p.length < 4 || parseFloat(p[3]) > 0
      }
      const parseColor4 = (c) => {
        const m = /^rgba?\(([^)]*)\)$/.exec(c)
        const p = m ? m[1].split(/[,/ ]+/).filter(Boolean) : []
        return p.length < 4 ? 1 : parseFloat(p[3])
      }
      // `solid` = a flat colour a person sees as that colour: no picture on the painted box and no fade between it and the page
      const walk = (start) => {
        for (let e = start; e; e = e.parentElement) {
          const st = style(e)
          const c = st.backgroundColor
          if (painted(c) || st.backgroundImage !== 'none') {
            let faded = false
            for (let a = e; a; a = a.parentElement) if (parseFloat(style(a).opacity) < 1) faded = true
            const alpha = parseColor4(c)
            return { color: painted(c) ? c : 'transparent', at: nameOf(e), solid: painted(c) && st.backgroundImage === 'none' && !faded && alpha === 1 }
          }
        }
        // nothing paints: the canvas, which is white unless the page asks for a dark colour scheme and the system has one
        const scheme = style(doc).colorScheme
        const darkCanvas = /dark/.test(scheme) && (!/light/.test(scheme) || matchMedia('(prefers-color-scheme: dark)').matches)
        return { color: darkCanvas ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)', at: 'canvas', solid: true }
      }
      const main = pick(cfg.selectors?.main) || document.querySelector('main, [role="main"], #t4-content, .t3-mainbody, #content') || document.body
      out.bgContent = walk(main)
      const edge = document.elementFromPoint(4, Math.max(0, Math.min(ih - 5, 450)))
      // a form control or a picture under the sample is not the page: start from what holds it
      const holder = edge && /^(input|select|textarea|button|img|svg|video|iframe|canvas)$/i.test(edge.tagName) ? edge.parentElement : edge
      out.bgEdge = walk(holder ?? document.body)
      // which part of the page the sample fell in: a short page on one side puts the footer under the point where the other has content
      out.bgEdge.land = holder?.closest?.('footer, [role="contentinfo"], .t4-footer, #t3-footer') ? 'footer' : holder?.closest?.('header, [role="banner"], .t4-header, #t3-header') ? 'header' : 'content'
    })
  }

  if (parts.root) {
    lap('root', () => {
      // what the root says, as a meaning: 'dark', 'light', another raw value, or null when it says nothing
      const says = []
      for (const m of cfg.marks ?? []) {
        if (m.kind === 'class') says.push(doc.classList.contains(m.name) ? 'dark' : null)
        else {
          const raw = doc.getAttribute(m.name)
          says.push(raw == null || raw === '' ? null : raw === m.dark ? 'dark' : raw === m.light || raw === 'light' ? 'light' : raw)
        }
      }
      out.says = says.find((x) => x !== null) ?? null
    })
    // the colours a person sees on the landmark surfaces, paired outside by landmark name: the surface (first painted
    // background walking up from the landmark) and the colour of the first words inside it
    lap('surfaces', () => {
      const painted = (c) => {
        const m = /^rgba?\(([^)]*)\)$/.exec(c)
        if (!m) return c !== 'transparent'
        const p = m[1].split(/[,/ ]+/).filter(Boolean)
        return p.length < 4 || parseFloat(p[3]) > 0
      }
      const alphaOf = (c) => {
        const m = /^rgba?\(([^)]*)\)$/.exec(c)
        const p = m ? m[1].split(/[,/ ]+/).filter(Boolean) : []
        return p.length < 4 ? 1 : parseFloat(p[3])
      }
      // a landmark that paints nothing itself but is filled (most of its width and height) by a child that does (a wrapper group) shows that child's colour; a sidebar column stretched to the row's height is judged by the card in it, whatever its height
      const fillerOf = (e, tall = true) => {
        const r = e.getBoundingClientRect()
        const queue = [...e.children].map((c) => [c, 1])
        while (queue.length) {
          const [c, depth] = queue.shift()
          const cr = c.getBoundingClientRect()
          if (cr.width >= r.width * 0.7 && (!tall || cr.height >= r.height * 0.8) && shown(c, doc)) {
            const st = style(c)
            if (painted(st.backgroundColor) || st.backgroundImage !== 'none') return c
            if (depth < 3) queue.push(...[...c.children].map((x) => [x, depth + 1]))
          }
        }
        return null
      }
      const surfaceOf = (start, tall = true) => {
        const filler = !painted(style(start).backgroundColor) && style(start).backgroundImage === 'none' ? fillerOf(start, tall) : null
        if (filler) start = filler
        for (let e = start; e; e = e.parentElement) {
          const st = style(e)
          if (painted(st.backgroundColor) || st.backgroundImage !== 'none') {
            let faded = false
            for (let a = e; a; a = a.parentElement) if (parseFloat(style(a).opacity) < 1) faded = true
            return { color: painted(st.backgroundColor) ? st.backgroundColor : 'transparent', at: nameOf(e), solid: painted(st.backgroundColor) && st.backgroundImage === 'none' && !faded && alphaOf(st.backgroundColor) === 1 }
          }
        }
        const scheme = style(doc).colorScheme
        const darkCanvas = /dark/.test(scheme) && (!/light/.test(scheme) || matchMedia('(prefers-color-scheme: dark)').matches)
        return { color: darkCanvas ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)', at: 'canvas', solid: true }
      }
      // the words in a landmark and their colour: up to eight distinct texts, so the two sides are compared on the SAME words
      const textOf = (root) => {
        const seen = new Map()
        for (const e of root.querySelectorAll('h1, h2, h3, h4, p, a, li, span, label, button')) {
          const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim()
          if (own.length < 3 || own.length > 60 || !shown(e, doc)) continue
          const key = own.toLowerCase()
          const hit = seen.get(key)
          if (hit) hit.n++
          else seen.set(key, { t: own, tag: e.tagName.toLowerCase(), color: style(e).color, at: nameOf(e), n: 1 })
        }
        // a word that stands twice in the landmark cannot be told from its twin on the other side: only a word that stands once is a pair
        return [...seen.values()].filter((x) => x.n === 1).slice(0, 8)
      }
      const first = (sel, ok = () => true) => {
        try {
          return [...document.querySelectorAll(sel)].find((e) => shown(e, doc) && ok(e)) ?? null
        } catch {
          return null
        }
      }
      const main = pick(cfg.selectors?.main) || document.querySelector('main, [role="main"], #t4-content, .t3-mainbody, #content') || document.body
      const header = pick(cfg.selectors?.header) || first('header, [role="banner"], .t4-header, #t3-header, .t3-header', (e) => !e.closest('main, article, aside, footer, [role="main"]'))
      const own = (e) => painted(style(e).backgroundColor)
      const card = [...main.querySelectorAll('section, article, .card, [class*="card"], .wp-block-group, .wp-block-post')].find((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 150 && r.height > 80 && shown(e, doc) && own(e) && textOf(e).length
      })
      // a sidebar is a narrow column beside the content: a layout class on the page wrapper ("sidebar-left") is not one
      const side = first('aside, [role="complementary"], .sidebar, #sidebar, [class*="sidebar"]', (e) => e.getBoundingClientRect().width > 80 && e.getBoundingClientRect().width <= iw * 0.6 && !e.contains(main))
      const footer = first('footer, [role="contentinfo"], .t4-footer, #t3-footer', (e) => !e.closest('main, article'))
      const land = { header, main: main === document.body ? null : main, card, sidebar: side, footer }
      const sf = {}
      for (const [name, e] of Object.entries(land)) {
        if (!e) continue
        sf[name] = { ...surfaceOf(e, name !== 'sidebar'), texts: textOf(e), el: nameOf(e) }
      }
      out.surfaces = sf
    })
  }

  if (parts.header) {
    lap('header', () => {
      let h = pick(cfg.selectors?.header)
      if (!h) {
        const cands = [...document.querySelectorAll('header, [role="banner"], .t4-header, #t3-header, .t3-header')].filter((e) => shown(e) && !e.closest('main, article, aside, footer, [role="main"]'))
        h = cands.find((e) => !cands.some((o) => o !== e && o.contains(e))) ?? null
      }
      if (!h) {
        out.header = null
        return
      }
      const hr = h.getBoundingClientRect()
      const paintedBg = (c) => {
        const m = /^rgba?\(([^)]*)\)$/.exec(c)
        if (!m) return c !== 'transparent'
        const p = m[1].split(/[,/ ]+/).filter(Boolean)
        return p.length < 4 || parseFloat(p[3]) > 0
      }
      // where a person sees the control begin and end: its box when it paints one, else what it draws (words, icon, bars) —
      // a hamburger button with invisible padding is where its bars are
      const ink = (c) => {
        const box = c.getBoundingClientRect()
        const s = style(c)
        if (paintedBg(s.backgroundColor) || (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none')) return { left: box.left, right: box.right }
        let left = Infinity
        let right = -Infinity
        const take = (r) => {
          if (r.width >= 2 && r.height >= 2) {
            left = Math.min(left, r.left)
            right = Math.max(right, r.right)
          }
        }
        const range = document.createRange()
        // a label clipped to a pixel for screen readers draws nothing
        const clipped = (el) => {
          const cs = style(el)
          return cs.clipPath !== 'none' || (cs.clip !== 'auto' && cs.position === 'absolute')
        }
        for (const n of c.childNodes) if (n.nodeType === 3 && n.textContent.trim()) (range.selectNodeContents(n), take(range.getBoundingClientRect()))
        for (const d of c.querySelectorAll('*')) {
          const ds = style(d)
          if (ds.display === 'none' || ds.visibility === 'hidden' || clipped(d)) continue
          const drawn = /^(svg|img|canvas|picture|video)$/i.test(d.tagName) || paintedBg(ds.backgroundColor) || (parseFloat(ds.borderTopWidth) > 0 && ds.borderTopStyle !== 'none') || [...d.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
          if (drawn) take(d.getBoundingClientRect())
        }
        return left === Infinity ? { left: box.left, right: box.right } : { left, right }
      }
      // the type a person reads in a control: the element that draws its words (the first with a text node of its own, else the control)
      const typeOf = (c) => {
        let t = null
        const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent.trim()) continue
          const el = n.parentElement
          const cs = style(el)
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.clipPath !== 'none' || (cs.clip !== 'auto' && cs.position === 'absolute')) continue
          t = el
          break
        }
        if (!t) return null
        const cs = style(t)
        return { size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) || cs.fontWeight, spacing: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0, transform: cs.textTransform }
      }
      // an icon button with no name: two or more thin bars (the three-bar menu icon)
      const bars = (c) =>
        [...c.querySelectorAll('*')].filter((d) => {
          const r = d.getBoundingClientRect()
          return r.height > 0 && r.height <= 6 && r.width >= 8
        }).length >= 2
      const controls = []
      const ctas = []
      const nav = []
      for (const c of h.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"]')) {
        const r = c.getBoundingClientRect()
        if (r.width < 8 || r.height < 8 || r.left < -1 || r.right > iw + 1 || r.bottom < 0 || r.top > ih) continue
        if (!shown(c, doc)) continue
        const seen = ink(c)
        const label = (c.getAttribute('aria-label') || c.getAttribute('title') || c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30)
        const tag = `${c.parentElement?.getAttribute('class') ?? ''} ${c.getAttribute('aria-label') ?? ''} ${c.getAttribute('title') ?? ''} ${c.getAttribute('class') ?? ''} ${c.id} ${c.getAttribute('type') ?? ''} ${label}`.toLowerCase()
        const isLink = c.tagName === 'A'
        // the role a person gives the control: the same role on both sides is the same control. Only the roles that can be told
        // apart without a selector of the port's own: a logo is a link that holds a picture or says so in its name, a menu button
        // sits outside every list item (a submenu toggle is not the menu button)
        let role = null
        if (/theme|dark.?mode|colou?r.?scheme|scheme|\bmode\b/.test(tag) && !isLink) role = 'theme-toggle'
        else if (c.matches('input[type="search"]') || /search|tìm/.test(tag) || c.closest('[role="search"], form[action*="search"]')) role = 'search' // language-allow: regex matching Vietnamese labels
        else if (/burger|hamburger|toggler|nav-?toggle|menu-?toggle|drawer-?toggle|offcanvas|\bmenu\b|navbar-toggle/.test(tag) && !isLink && !c.closest('li, ul, ol') && !/sub-?menu|dropdown|expand|show the/.test(tag)) role = 'menu-button'
        else if (!isLink && !c.closest('li, ul, ol') && bars(c)) role = 'menu-button'
        else if (isLink && (/logo|brand|site-?name|site-?title/.test(tag) || (c.querySelector('img') && !/social|facebook|twitter|instagram|linkedin|youtube|rss|feed/.test(tag))) && r.top < 200) role = 'logo'
        const callToAction = (c.tagName === 'A' || c.tagName === 'BUTTON') && /(^|[\s_-])(btn|button|cta)([\s_-]|$)|wp-element-button|subscribe/.test(tag) && !/toggle|menu|search/.test(tag)
        const item = { left: r1(seen.left), right: r1(iw - seen.right), center: r1((seen.left + seen.right) / 2), width: r1(seen.right - seen.left), name: nameOf(c), text: label, type: typeOf(c) }
        if (callToAction && !role) ctas.push(item)
        // a link inside the header's navigation is read for its type, paired outside by its words
        if (!role && !callToAction && isLink && c.closest('nav, [role="navigation"]') && label && nav.length < 10) nav.push({ text: label, type: item.type, center: item.center })
        controls.push({ role, left: seen.left, right: seen.right, boxLeft: r.left, boxRight: r.right, name: nameOf(c), text: label, type: item.type, icon: !label || bars(c) || !!c.querySelector('svg, img'), height: r.height })
      }
      // one control per role: the first in document order (the logo, the menu button, the search, the toggle, the call to action)
      const byRole = {}
      for (const c of controls) if (c.role && !byRole[c.role]) byRole[c.role] = { left: r1(c.left), right: r1(iw - c.right), center: r1((c.left + c.right) / 2), width: r1(c.right - c.left), name: c.name, text: c.text, type: c.type }
      // the controls no role was found for that are only an icon (no words): the pairing of last resort when one side lacks a role the other has
      const unroled = controls.filter((c) => !c.role && c.icon && c.height <= 90).slice(0, 12).map((c) => ({ left: r1(c.left), right: r1(iw - c.right), center: r1((c.left + c.right) / 2), width: r1(c.right - c.left), name: c.name, text: c.text }))
      // where the page's own content starts: the first heading, picture or paragraph below the header
      let contentTop = null
      for (const e of document.querySelectorAll('h1, h2, h3, img, p')) {
        if (h.contains(e) || e.closest('header, nav, footer, [role="banner"], .t4-header, .t4-offcanvas, .je-drawer, .cloned')) continue
        const r = e.getBoundingClientRect()
        if (r.width > 8 && r.height > 8 && r.top >= hr.bottom - 1) {
          contentTop = r1(r.top)
          break
        }
      }
      // a header picture that did not load, or that a stylesheet swapped (`content: url(...)`) for a file that may not exist
      const broken = []
      for (const i of h.querySelectorAll('img')) {
        const swapped = /^url\(["']?([^"')]+)/.exec(style(i).content)
        const holder = i.closest('a[href], button')
        const control = holder ? nameOf(holder) : null
        if (swapped) broken.push({ src: new URL(swapped[1], document.baseURI).href, how: 'swapped by content:url()', control })
        else if (i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src)) broken.push({ src: i.currentSrc || i.src, how: 'did not load', control })
      }
      out.header = {
        selector: nameOf(h),
        height: r1(hr.height),
        // where the header block ends, from the top of the page: a top bar the port puts inside <header> and the source outside it is part of it
        bottom: r1(hr.bottom),
        controls: byRole,
        ctas,
        nav,
        unroled,
        // where every visible control is (its centre), recognised or not: a control one side lacks may be the other side's control under another name
        places: controls.map((c) => r1((c.left + c.right) / 2)),
        // a role the header mentions anywhere in its markup, found or not as a control: a control missing on one side is a defect only when the markup has no trace of it
        traces: Object.fromEntries(Object.entries({ 'theme-toggle': /theme|dark.?mode|moon|\bsun\b/i, search: /search/i, 'menu-button': /burger|hamburger|toggler|menu-?toggle|offcanvas|drawer/i }).map(([k, re]) => [k, re.test(h.outerHTML.slice(0, 40000))])),
        iw,
        contentTop,
        broken
      }
    })
  }

  if (parts.chips) {
    lap('chips', () => {
      const painted = (c) => {
        const m = /^rgba?\(([^)]*)\)$/.exec(c)
        if (!m) return c !== 'transparent'
        const p = m[1].split(/[,/ ]+/).filter(Boolean)
        return p.length < 4 || parseFloat(p[3]) > 0
      }
      const hasBorder = (s) => parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' && painted(s.borderTopColor)
      const text = (e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()
      const out2 = []
      const seen = new Set()
      const ord = new Map()
      const chipSel = cfg.selectors?.chips ?? null
      // headings drawn as pills are chips too: they pass the same tests as any other candidate (painted, small box, few words)
      const candidates = chipSel ? [...document.querySelectorAll(chipSel)] : [...document.body.querySelectorAll('a, span, li, small, em, strong, div, p, h1, h2, h3, h4, h5, h6')]
      const boxes = []
      for (const e of candidates) {
        // a link with no words of its own (an icon) is named by what a screen reader says: the other side may draw the same chip with a word in it
        const label = text(e) || (e.tagName === 'A' ? (e.getAttribute('aria-label') || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim() : '')
        if (!label || label.length > 28 || label.split(' ').length > 3) continue
        // the element that holds the words: its text is its own, not a child's wrapper of block content
        if (e.children.length > 2 || (!chipSel && ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && e.children.length !== 1)) continue
        if (e.querySelector('svg, img, picture')) continue
        if (e.closest('header, nav, [role="banner"], [role="navigation"], .pagination, .cloned, button, input, select, [aria-hidden="true"], [hidden], [role="progressbar"], [role="status"], .progress, .spinner-border, .spinner-grow')) continue
        if (!shown(e, doc)) continue
        // climb a single-child chain holding the same words, up to the box that is painted
        let box = null
        for (let n = e, i = 0; n && i < 4 && n !== document.body; n = n.parentElement, i++) {
          if (i > 0 && text(n) !== label) break
          const s = style(n)
          if (painted(s.backgroundColor) || hasBorder(s)) {
            box = n
            break
          }
        }
        if (!box || seen.has(box)) continue
        const br = box.getBoundingClientRect()
        if (br.width < 12 || br.width > 200 || br.height < 12 || br.height > 44) continue
        // a call-to-action button is not a chip, unless it says it is one
        if (/(^|[-_\s])(btn|button)([-_\s]|$)/.test(`${box.className} ${e.className}`) && !/badge|tag|chip|cat|label|pill/.test(`${box.className} ${e.className}`)) continue
        seen.add(box)
        const bs = style(box)
        // the element that draws the words: a wrapper holding one child and no words of its own is not it
        let t = e
        while (![...t.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && t.children.length === 1) t = t.children[0]
        const es = style(t)
        // the padding a person sees: the gap between the painted box and the words, whichever element carries the padding
        const range = document.createRange()
        range.selectNodeContents(e)
        const tr = range.getBoundingClientRect()
        const inset = [tr.top - br.top, br.right - tr.right, br.bottom - tr.bottom, tr.left - br.left].map(r1)
        // the section a chip belongs to: the nearest enclosing block that holds a heading of its own
        let key = ''
        for (let n = box.parentElement; n && n !== document.body; n = n.parentElement) {
          const hd = [...n.querySelectorAll('h1, h2, h3, h4, h5')].find((x) => !x.contains(box) && text(x).length > 8)
          if (hd) {
            key = text(hd).slice(0, 60)
            break
          }
        }
        const region = box.closest('footer, [role="contentinfo"], .t4-footer') ? 'footer' : 'body'
        const base = `${region}|${key}|${label}`
        const n = (ord.get(base) ?? 0) + 1
        ord.set(base, n)
        out2.push({
          text: label,
          region,
          key,
          n,
          bg: bs.backgroundColor,
          color: es.color,
          padding: bs.padding,
          inset,
          radius: bs.borderTopLeftRadius,
          font: `${es.fontSize}`,
          letterSpacing: es.letterSpacing === 'normal' ? '0px' : es.letterSpacing,
          weight: es.fontWeight,
          transform: es.textTransform,
          border: hasBorder(bs) ? `${bs.borderTopWidth} ${bs.borderTopColor}` : 'none',
          w: r1(br.width),
          h: r1(br.height),
          // the words' own width: a box that is wider only because its words are is a text-metrics effect, not a size defect
          textW: r1(tr.width),
          name: nameOf(box)
        })
        boxes.push(box)
      }
      // a painted box inside another painted box that holds the same words (a painted <li> around a painted <a>) is ONE chip:
      // the inner box when the two are the same size (it is the one on top), else both stay and are marked nested
      const drop = new Set()
      out2.forEach((a, i) =>
        out2.forEach((b, j) => {
          if (i === j || a.text !== b.text || !boxes[i].contains(boxes[j]) || boxes[i] === boxes[j]) return
          if (Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2) drop.add(i)
          else {
            a.nested = true
            b.nested = true
          }
        })
      )
      out.chips = out2.filter((_, i) => !drop.has(i))
    })
  }
  return out
}
