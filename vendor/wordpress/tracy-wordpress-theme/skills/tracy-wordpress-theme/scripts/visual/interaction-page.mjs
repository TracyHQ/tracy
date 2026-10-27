// The in-page half of interaction-parity.mjs: one script, installed in the page as `window.__ia`, that READS the
// page — what a header holds, which controls open a panel, what is visible and where — and never decides. Every
// verdict is Node's (interaction-parity.mjs); every action (click, tap, hover) is a real pointer there too.
//
// Visibility here is geometry and style, not wishes: a box counts as shown when it has size, its own and its
// ancestors' display/visibility/opacity allow it, and no overflow-clipping ancestor (or the viewport) hides more
// than half of it. A drill-down menu that slides its parent level out of its panel therefore shows no parent row;
// an accordion that keeps it shows it.
import { MENU_BUTTON_WORDS, SUBMENU_WORDS } from '../lib/control-pairing.mjs'

export const HELPERS = `window.__iaWords = ${JSON.stringify({ menu: MENU_BUTTON_WORDS, submenu: SUBMENU_WORDS })};` + String.raw`
window.__ia = (() => {
  const BURGER = '[data-offcanvas-trigger], [data-bs-toggle="offcanvas"], [data-toggle="offcanvas"], .off-canvas-toggle, .navbar-toggler, .wp-block-navigation__responsive-container-open, button[aria-controls][aria-expanded], [class*="hamburger"], [class*="burger"], .menu-toggle, button[aria-label*="menu" i], a[aria-label*="menu" i]'
  const HEADER = 'header, [role="banner"], #t4-header, .t4-header, .tracy-header, .t3-header'
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim()
  const label = (el) => norm(el.innerText || el.textContent) || norm(el.getAttribute('aria-label')) || norm(el.getAttribute('title')) || norm(el.querySelector('img')?.getAttribute('alt'))
  const key = (s) => norm(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim()
  const area = (r) => Math.max(0, r.width) * Math.max(0, r.height)
  const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  const hiddenStyle = (n) => { const c = getComputedStyle(n); return c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) < 0.05 }
  const vis = (el) => {
    if (!el || !el.isConnected) return false
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.tagName === 'TEMPLATE' || n.hasAttribute('hidden') || hiddenStyle(n)) return false
    }
    const full = area(r)
    if (inter(r, { left: 0, top: -1e9, right: innerWidth, bottom: 1e9 }) < full * 0.5) return false
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const c = getComputedStyle(n)
      if (c.overflowX === 'visible' && c.overflowY === 'visible') continue
      const b = n.getBoundingClientRect()
      const clip = { left: c.overflowX === 'visible' ? -1e9 : b.left, right: c.overflowX === 'visible' ? 1e9 : b.right, top: c.overflowY === 'visible' ? -1e9 : b.top, bottom: c.overflowY === 'visible' ? 1e9 : b.bottom }
      if (inter(r, clip) < full * 0.5) return false
    }
    return true
  }
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round((r.left + scrollX) * 10) / 10, y: Math.round((r.top + scrollY) * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, cx: r.left + r.width / 2, cy: r.top + r.height / 2 } }
  const inHeader = (el) => Boolean(el.closest(HEADER)) || el.getBoundingClientRect().top < 220
  // a submenu's own toggle (core/navigation, Bootstrap dropdown caret) sits in a list item of the nav: it opens one branch, not the menu
  const SUB_RE = new RegExp(window.__iaWords.submenu, 'i')
  const MENU_RE = new RegExp(window.__iaWords.menu, 'i')
  /** A control that opens ONE branch: named so, or the disclosure beside a link (its label is the link's, the control only carries the chevron), or whose panel sits in the same wrapper as a link. */
  const isDisclosure = (el) => {
    if (SUB_RE.test([el.getAttribute('aria-label'), el.getAttribute('title'), String(el.className), norm(el.textContent)].join(' '))) return true
    const wrap = el.parentElement
    if (!wrap) return false
    // a small control beside a link that has words (not a logo) is that link's chevron; a menu button is wider, or sits beside a logo
    const r = el.getBoundingClientRect()
    if (r.width <= 40 && !MENU_RE.test(String(el.className)) && [...wrap.children].some((c) => c !== el && c.tagName === 'A' && c.getAttribute('href') && norm(c.textContent) && !c.querySelector('img, svg') && !/logo|brand/i.test(String(c.className)))) return true
    const id = el.getAttribute('aria-controls')
    const target = id && document.getElementById(id)
    return Boolean(target) && wrap.contains(target) && Boolean(wrap.querySelector(':scope > a[href]'))
  }
  const isBurger = (el) => !el.closest('li') && !isDisclosure(el)
  // an icon-only control made of bars (three thin boxes) is the menu button whatever it is called
  const bars = (c) => [...c.querySelectorAll('*')].filter((d) => { const r = d.getBoundingClientRect(); return r.height > 0 && r.height <= 6 && r.width >= 8 }).length >= 2
  const shapeBurger = () => [...document.querySelectorAll('button, [role="button"], a[role="button"], summary')].find((el) => vis(el) && inHeader(el) && isBurger(el) && !norm(el.innerText || el.textContent) && bars(el) && !el.matches('[class*="search"], [class*="theme"], [class*="toggle-theme"]')) || null
  const burger = () => [...document.querySelectorAll(BURGER)].find((el) => vis(el) && inHeader(el) && isBurger(el)) || shapeBurger()
  const links = (el) => [...el.querySelectorAll('a')].filter(vis).length

  // ── panels ────────────────────────────────────────────────────────────────────────────
  const PANELS = '.offcanvas, [class*="off-canvas"], [class*="offcanvas"], [role="dialog"], [aria-modal="true"], .wp-block-navigation__responsive-container, .navbar-collapse, nav, [class*="mobile-menu"], [class*="menu-panel"]'
  const panel = (trigger) => {
    const id = trigger && trigger.getAttribute('aria-controls')
    const named = id && document.getElementById(id)
    if (named && vis(named) && links(named) >= 2) return named
    const found = [...document.querySelectorAll(PANELS)].filter((el) => vis(el) && links(el) >= 2)
    const fixed = found.filter((el) => ['fixed', 'absolute'].includes(getComputedStyle(el).position))
    const pool = fixed.length ? fixed : found
    return pool.sort((a, b) => links(b) - links(a))[0] || null
  }
  // A menu item is a list item, or the wrapper of a disclosure that is not one (a link with a chevron button beside it and the panel that button opens,
  // all in one div): marked here with a property of the node — nothing the page can see changes.
  const markItems = () => {
    for (const ctl of document.querySelectorAll('button[aria-expanded][aria-controls], a[aria-expanded][aria-controls]')) {
      const wrap = ctl.parentElement
      const target = document.getElementById(ctl.getAttribute('aria-controls'))
      if (wrap && target && wrap.contains(target) && wrap.tagName !== 'LI' && !wrap.closest('li') ) wrap.__iaItem = true
    }
  }
  const isItem = (el) => el.tagName === 'LI' || el.__iaItem === true
  const itemsIn = (root) => { markItems(); return [...root.querySelectorAll('*')].filter(isItem) }
  const parentLi = (li) => { for (let p = li.parentElement; p; p = p.parentElement) if (isItem(p)) return p; return null }
  const topItems = (root) => itemsIn(root).filter((x) => !parentLi(x))
  const lisOf = (scope) => { const base = isItem(scope) ? scope : null; return itemsIn(scope).filter((li) => { const p = parentLi(li); return base ? p === base : (!p || !scope.contains(p)) }) }
  const childLis = (li) => itemsIn(li).filter((x) => parentLi(x) === li)
  const expandable = (li) => childLis(li).length > 0
  const rowOf = (li) => li.querySelector(':scope > a, :scope > button, :scope > span, :scope > div:not(:has(ul))') || li
  /** The control that opens a submenu: a dedicated toggle beside the row's link wins over a link that also navigates (a parent whose own page is a real href). */
  const ctlOf = (li) => {
    const all = [...li.querySelectorAll(':scope > button, :scope > [aria-expanded], :scope > .dropdown-toggle, :scope > [class*="toggle"], :scope > [class*="caret"], :scope > [class*="chevron"], :scope > [class*="expand"], :scope > [class*="arrow"], :scope > * > button')]
    const navigates = (el) => el.tagName === 'A' && /^(?!#|javascript:)\S/i.test(el.getAttribute('href') || '')
    return all.find((el) => !navigates(el)) || all[0] || li.querySelector(':scope > a') || rowOf(li)
  }
  /** The keys of every row nested under a list item (its submenus' rows, not the back rows): what a branch holds identifies it when its own label was renamed. */
  const isBackLi = (li) => isBack(rowOf(li)) || BACK_CLASS.test(li.getAttribute('class') || '')
  const leavesOf = (li) => itemsIn(li).filter((x) => !isBackLi(x)).map((x) => key(label(rowOf(x)))).filter(Boolean).slice(0, 60)
  const resolve = (root, path) => {
    let scope = root
    for (const i of path) { const list = lisOf(scope).filter(expandable); scope = list[i]; if (!scope) return null }
    return scope
  }

  const rows = (root) => {
    const out = []
    for (const li of itemsIn(root)) {
      const row = rowOf(li)
      if (!vis(row)) continue
      let depth = 0
      for (let p = parentLi(li); p && root.contains(p); p = parentLi(p)) depth++
      out.push({ el: row, label: label(row), key: key(label(row)), depth, expandable: expandable(li) })
    }
    return out
  }
  /** A row the topmost element at its centre is not part of, inside the drawer panel: another level is drawn over it (rows out of the viewport cannot be hit-tested and stay candidates). */
  const covered = (row, within) => {
    const r = row.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false
    const t = document.elementFromPoint(x, y)
    return Boolean(t) && !row.contains(t) && !t.contains(row) && within.contains(t)
  }
  /** ctx = {scope, root, drilled}: in a drill-down level (a back control is shown) the rows of the levels above are replaced by the open one, not overlapped by it. */
  const overlaps = (list, ctx = null) => {
    const out = []
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i].el, b = list[j].el
      if (a === b || a.contains(b) || b.contains(a)) continue
      if (ctx && ctx.drilled && ctx.scope && [a, b].some((x) => (x === rowOf(ctx.scope) || !ctx.scope.contains(x)) && covered(x, ctx.root))) continue
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
      const o = inter(ra, rb)
      if (o > 4) out.push({ a: list[i].label, b: list[j].label, area: Math.round(o) })
    }
    return out
  }
  const BACK = /^(←|‹|«|<|back\b|return\b|previous\b|prev\b)/i
  const BACK_CLASS = /(^|[^a-z])(back|return|prev)([^a-z]|$)/i
  const isBack = (el) => BACK.test(label(el)) || BACK.test(norm(el.getAttribute('aria-label'))) || BACK_CLASS.test(el.getAttribute('class') || '')
  // one back control, however its parts (button, icon, label) are marked up: a match inside another match is the same control
  const backControls = (root) => {
    const all = [...root.querySelectorAll('button, a, [role="button"], li, span')].filter((el) => vis(el) && isBack(el) && !el.querySelector('button, a, [role="button"], li'))
    // one a visitor sees: a back row of a level that has slid out from under the open one is in the DOM and in the viewport, and something else is drawn over it
    return all.filter((el) => !all.some((o) => o !== el && o.contains(el)) && !covered(el, root))
  }
  const backControl = (root) => [...root.querySelectorAll('button, a, [role="button"], li, span')].filter(vis).find(isBack) || null

  // ── colour ────────────────────────────────────────────────────────────────────────────
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const parse = (value) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = value; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
  // fillStyle of an unparsable value keeps the previous one; parse twice with two seeds to tell a black from a failure
  const parseColor = (value) => { const a = parse(value); cx.fillStyle = '#fff'; cx.fillStyle = value; cx.clearRect(0, 0, 1, 1); cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return d[0] === a[0] && d[1] === a[1] && d[2] === a[2] ? a : null }
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat([1]) }
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  /** The colour behind an element: its ancestors' backgrounds composited from the first opaque one down; null when an image or gradient is in the way. */
  const backdrop = (el) => {
    const layers = []
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = getComputedStyle(n)
      if (c.backgroundImage && c.backgroundImage !== 'none') return null
      const bg = parseColor(c.backgroundColor)
      if (!bg) return null
      layers.push({ bg, opacity: Number(c.opacity) })
      if (bg[3] >= 1) break
    }
    const root = getComputedStyle(document.documentElement)
    let base = layers[layers.length - 1].bg[3] >= 1 ? layers.pop().bg : (/dark/.test(root.colorScheme) && !/light/.test(root.colorScheme) ? [0, 0, 0, 1] : [255, 255, 255, 1])
    while (layers.length) { const l = layers.pop(); base = over(l.bg, base) }
    return base
  }
  const contrast = (root) => {
    const seen = new Set(), failing = [], unmeasured = []
    let min = Infinity, examined = 0
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const el = t.parentElement
      if (!el || seen.has(el) || !norm(t.textContent) || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || !vis(el)) continue
      seen.add(el)
      const bg = backdrop(el)
      const text = norm(t.textContent).slice(0, 40)
      if (!bg) { unmeasured.push(text); continue }
      const c = getComputedStyle(el)
      const fg = parseColor(c.color)
      if (!fg) { unmeasured.push(text); continue }
      let opacity = 1
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity)
      fg[3] *= opacity
      const r = ratio(over(fg, bg), bg)
      examined++
      min = Math.min(min, r)
      if (r < 4.5) failing.push({ text, ratio: Math.round(r * 100) / 100, color: c.color, background: 'rgb(' + bg.slice(0, 3).map(Math.round).join(', ') + ')' })
    }
    return { examined, min: min === Infinity ? null : Math.round(min * 100) / 100, failing: failing.slice(0, 10), failingCount: failing.length, unmeasured: unmeasured.slice(0, 10), unmeasuredCount: unmeasured.length }
  }

  // ── effective theme ───────────────────────────────────────────────────────────────────
  const theme = () => {
    const root = document.documentElement, body = document.body
    const bg = backdrop(body) || backdrop(root)
    const l = bg ? lum(bg) : null
    const flag = [root.getAttribute('data-theme'), root.getAttribute('data-bs-theme'), root.getAttribute('data-color-mode'), root.className, body.className].join(' ')
    return { luminance: l === null ? null : Math.round(l * 1000) / 1000, theme: l === null ? 'unknown' : l < 0.25 ? 'dark' : 'light', flags: norm(flag).slice(0, 120) }
  }
  const TOGGLE = '[data-theme-toggle], [data-toggle-theme], .theme-toggle, .tracy-theme-toggle, .dark-mode-toggle, .darkmode-toggle, #theme-toggle, .t4-darkmode, [class*="theme-toggle"], [class*="dark-toggle"], [class*="mode-toggle"], [class*="color-mode"], [class*="darkmode"], button[aria-label*="theme" i], button[aria-label*="dark" i], button[aria-label*="mode" i], a[aria-label*="dark" i], [title*="dark mode" i], [title*="theme" i]'
  const toggle = () => [...document.querySelectorAll(TOGGLE)].find((el) => vis(el)) || null

  // ── header band ───────────────────────────────────────────────────────────────────────
  const headerEl = () => [...document.querySelectorAll(HEADER)].find((el) => vis(el) && !el.closest('main, article, aside, footer, section')) || null
  const SEARCH = 'search, form[role="search"], form[aria-label*="search" i], .mod-finder, form.form-search, .wp-block-search, [type="search"], .search-toggle, [class*="search-toggle"], [class*="search-icon"], button[aria-label*="search" i], a[aria-label*="search" i], [aria-label*="search" i][role="button"]'
  const PRIMARY = '.btn-primary, .wp-block-button a, .wp-block-button__link, a.btn, a[class*="cta"], a[class*="button"], .button'
  const LOGO = 'a[rel="home"], .logo, .navbar-brand, .site-title, .wp-block-site-logo, .wp-block-site-title, [class*="logo"], [class*="brand"], .site-name'
  // a social-icon row is "logos only" or lists brand icons, a body can be "wp-custom-logo": neither is the site logo
  const NOT_LOGO = '.wp-block-social-links, [class*="social"], [class*="logos-only"], body, html'
  const isLogo = (el) => el.matches(LOGO) && !el.matches(NOT_LOGO) && !el.closest('.wp-block-social-links, [class*="social"]')
  const inLogo = (el, h) => { for (let n = el; n && n !== h && n.nodeType === 1; n = n.parentElement) if (isLogo(n)) return true; return false }
  const first = (root, sel, accept = () => true) => [...root.querySelectorAll(sel)].find((el) => vis(el) && accept(el)) || null
  const header = () => {
    const h = headerEl()
    if (!h) return null
    const controls = {}
    const assigned = []
    const pick = (name, el) => { if (el) { assigned.push(el); controls[name] = { ...box(el), label: label(el).slice(0, 40) } } }
    const hb = burger()
const logoEl = first(h, LOGO, isLogo) || first(h, 'a:has(img)', (el) => !el.closest('.wp-block-social-links, [class*="social"]'))
    // a logo is what it paints: its image (or svg), not the figure/link wrapper around it (a wider wrapper is not a moved logo)
    pick('logo', (logoEl && [...logoEl.querySelectorAll('img, svg')].find((e) => vis(e))) || logoEl)
    if (controls.logo && logoEl) controls.logo.label = label(logoEl).slice(0, 40) || controls.logo.label
    pick('primary', first(h, PRIMARY, (el) => !inLogo(el, h)))
    pick('toggle', first(h, TOGGLE))
    pick('search', first(h, SEARCH))
    pick('hamburger', hb && h.contains(hb) ? hb : null)
    // the band the header's content paints: a wrapper's own padding or margin below its last row is spacing, not header
    const own = h.getBoundingClientRect()
    const clear = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c)
    const painted = (e) => {
      if (/^(IMG|SVG|VIDEO|CANVAS|INPUT|BUTTON|SELECT|TEXTAREA|HR|PICTURE)$/i.test(e.tagName)) return true
      if ([...e.childNodes].some((n) => n.nodeType === 3 && norm(n.textContent))) return true
      const c = getComputedStyle(e)
      return (parseFloat(c.borderBottomWidth) > 0 && c.borderBottomStyle !== 'none' && !clear(c.borderBottomColor)) || !clear(c.backgroundColor) || c.backgroundImage !== 'none'
    }
    const rs = [...h.querySelectorAll('*')].filter((e) => vis(e) && e.getBoundingClientRect().width >= 2 && e.getBoundingClientRect().height >= 2 && painted(e)).map((e) => e.getBoundingClientRect())
    // a header that paints itself (background, bottom border) is its own box; one that rests on the page's background is what its content paints
    const bottom = painted(h) || !rs.length ? own.bottom : Math.min(own.bottom, Math.max(...rs.map((r) => r.bottom)))
    // the controls no role was recognised for — an icon with no name, a boxed button — so a role one side has and the other lacks can be paired by edge and shape
    const unroled = [...h.querySelectorAll('a[href], button, [role="button"], summary')].filter((el) => {
      if (!vis(el) || assigned.some((a) => a === el || a.contains(el) || el.contains(a)) || el.closest('li, nav') || isDisclosure(el)) return false
      const c = getComputedStyle(el)
      const iconOnly = !norm(el.innerText || el.textContent) && Boolean(el.querySelector('svg, img, i, span') || bars(el))
      const boxed = Boolean(norm(el.innerText || el.textContent)) && (!clear(c.backgroundColor) || (parseFloat(c.borderTopWidth) > 0 && c.borderTopStyle !== 'none'))
      return iconOnly || boxed
    }).slice(0, 12).map((el) => ({ ...box(el), label: label(el).slice(0, 40), icon: !norm(el.innerText || el.textContent) }))
    return { box: box(h), content: { h: Math.round(Math.max(0, bottom - own.top) * 10) / 10 }, controls, unroled }
  }
  /**
 * The header's entries — the row of text links a visitor reads as the menu, whatever markup holds them (one list, or a list plus link-and-chevron
 * wrappers) — and which of them is the CURRENT one on THIS side: marked (aria-current, or the class a menu system gives its current item, on the link or
 * its item) or styled (a mark the other entries do not share: colour, weight, underline, a bar under it). Each side is read on its own; Node compares.
 */
  const navCurrent = () => {
    const h = headerEl() || document
    const clear = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c)
    const inPanel = (a) => a.closest('li li, [class*="dropdown-menu"], [class*="submenu"], [class*="sub-menu"], [class*="__panel"], [class*="mega-dropdown"], [role="dialog"], [aria-modal="true"]')
    const cands = [...h.querySelectorAll('a[href]')].filter((a) => vis(a) && norm(a.textContent) && !a.matches(PRIMARY) && !a.closest('.wp-block-buttons, .wp-block-button') && !/^(tel|mailto):/i.test(a.getAttribute('href')) && !inLogo(a, h) && !inPanel(a) && !a.querySelector('img, svg'))
    // the nav row: the most links on one line (their centres within 12 px)
    const rowsBy = []
    for (const a of cands) { const r = a.getBoundingClientRect(), cy = r.top + r.height / 2; const row = rowsBy.find((x) => Math.abs(x.cy - cy) <= 12); if (row) row.list.push(a); else rowsBy.push({ cy, list: [a] }) }
    const row = rowsBy.sort((x, y) => y.list.length - x.list.length)[0]
    const as = row && row.list.length >= 2 ? row.list.sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left) : []
    if (!as.length) return { links: 0, current: [], marked: [], entries: [] }
    const MARK = /(^|[\s_-])(current|active|is-current|current-menu-item|current-menu-ancestor|current-menu-parent|current_page_item|current_page_ancestor|current-page-ancestor)([\s_-]|$)/i
    const itemOf = (a) => a.closest('li') || a.parentElement
    const bar = (el, pseudo) => { const c = getComputedStyle(el, pseudo); const hgt = parseFloat(c.height); return c.content !== 'none' && hgt > 0 && hgt <= 4 && !clear(c.backgroundColor) ? 'bar' : '' }
    const style = (a) => { const it = itemOf(a), c = getComputedStyle(a), p = getComputedStyle(it); return [c.color, c.fontWeight, c.textDecorationLine, c.borderBottomWidth + c.borderBottomColor, c.backgroundColor, p.backgroundColor, p.borderBottomWidth + p.borderBottomColor, bar(a, '::after'), bar(a, '::before'), bar(it, '::after'), bar(it, '::before')].join('|') }
    const styles = as.map(style)
    const counts = new Map(); for (const x of styles) counts.set(x, (counts.get(x) || 0) + 1)
    const modal = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]
    // a mark is what a MINORITY of the entries carry while most share one look (a three-entry nav with three looks has no mark)
    const markable = as.length >= 3 && modal[1] * 2 > as.length
    const entries = as.map((a, i) => {
      const it = itemOf(a)
      const explicit = (a.getAttribute('aria-current') && a.getAttribute('aria-current') !== 'false') || MARK.test(String(a.className)) || MARK.test(String(it.className || '')) || (it !== a.parentElement && MARK.test(String(a.parentElement.className || '')))
      const styled = markable && styles[i] !== modal[0]
      let path = ''
      try { path = new URL(a.href, location.href).pathname.replace(/\/index\.php(?=\/|$)/, '').replace(/\/+$/, '') || '/' } catch {}
      return { label: label(a).slice(0, 40), path, explicit: Boolean(explicit), styled: Boolean(styled) }
    })
    return { links: as.length, current: entries.filter((e) => e.explicit || e.styled).map((e) => e.label), marked: entries.filter((e) => e.explicit).map((e) => e.label), entries }
  }

  // ── responsive inventory: every button / link, shown or hidden, and the lines its label takes ──────────────
  /** The rendered lines of an element's text: line boxes of its text nodes, clustered by top. */
  const lineCount = (el) => {
    const tops = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!norm(t.textContent) || (t.parentElement && !vis(t.parentElement))) continue
      const range = document.createRange()
      range.selectNodeContents(t)
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue
        if (!tops.some((y) => Math.abs(y - r.top) < r.height * 0.5)) tops.push(r.top)
      }
    }
    return tops.length
  }
  /** Text as read: a <br> and a block boundary are a space, an inline element is not. */
  const textOf = (el) => {
    let out = ''
    for (const n of el.childNodes) {
      if (n.nodeType === 3) out += n.data
      else if (n.nodeType === 1) {
        if (n.tagName === 'BR') out += ' '
        else if (!['SCRIPT', 'STYLE'].includes(n.tagName)) { const block = getComputedStyle(n).display.startsWith('inline') ? '' : ' '; out += block + textOf(n) + block }
      }
    }
    return out
  }
  const BUTTONISH = 'a[href], a:not([href]), button, [role="button"], input[type="submit"], input[type="button"]'
  /** One row per label: seen (in the DOM at all), shown (some copy of it is), and the most lines a shown copy takes. */
  const inventory = () => {
    const rows = new Map()
    for (const el of document.querySelectorAll(BUTTONISH)) {
      if (el.closest('footer, template, script, noscript')) continue
      // a link of the page's own banner or breadcrumb that sits in the first 220 px is not a control of the header: it pairs with the header's link of the same words by name only
      if (!el.matches(PRIMARY) && !el.closest('.wp-block-buttons, .wp-block-button') && !el.closest(HEADER) && el.closest('main, article, [role="main"], [class*="breadcrumb"], [aria-label*="breadcrumb" i], [class*="page-title"], [class*="page-header"]')) continue
      const inH = inHeader(el) || el.matches(PRIMARY) || Boolean(el.closest('.wp-block-buttons, .wp-block-button'))
      if (!inH) continue
      const text = norm(textOf(el)) || norm(el.getAttribute('aria-label')) || norm(el.getAttribute('value')) || norm(el.getAttribute('title'))
      const k = key(text)
      if (!k) continue
      const row = rows.get(k) || { key: k, label: text.slice(0, 40), copies: 0, shown: false, lines: 0, w: 0, h: 0 }
      row.copies++
      if (vis(el)) {
        row.shown = true
        const n = lineCount(el)
        if (n >= row.lines) { row.lines = n; const b = box(el); row.w = b.w; row.h = b.h }
      }
      rows.set(k, row)
    }
    return [...rows.values()].slice(0, 120)
  }

  // ── forms: what is required, what blocks the submit, how a disabled submit looks ─────────────────────────
  const FIELD = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]):not([type="search"]), textarea, select'
  const SUBMIT = 'button[type="submit"], input[type="submit"], .wpcf7-submit, button:not([type]), [type="submit"]'
  const fieldLabel = (c) => {
    const id = c.id && document.querySelector('label[for="' + CSS.escape(c.id) + '"]')
    const wrap = c.closest('label')
    const own = id ? label(id) : wrap ? norm((wrap.innerText || wrap.textContent).replace(c.value || '', '')) : ''
    const prior = !own && c.closest('p, div, li, fieldset, .form-group, .wpcf7-form-control-wrap')
    const near = prior ? norm(((prior.parentElement && prior.parentElement.querySelector('label')) || prior).textContent) : ''
    return norm(own || c.getAttribute('aria-label') || near || c.getAttribute('placeholder') || c.getAttribute('name') || '').slice(0, 240)
  }
  const isRequired = (c) => {
    if (c.required || c.getAttribute('aria-required') === 'true') return true
    const acc = c.type === 'checkbox' ? c.closest('.wpcf7-acceptance') : null
    return Boolean(acc) && !acc.classList.contains('optional')
  }
  /** A site-search form (the header's search box, a CMS finder module): compared as the header's search control, not as a form. */
  const isSearchForm = (f) => {
    if (f.getAttribute('role') === 'search' || f.matches('.wp-block-search, .search-form, [class*="finder"], [class*="search"]')) return true
    if (/search|finder/i.test(f.getAttribute('action') || '')) return true
    const fs = [...f.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select')]
    return fs.length === 1 && (fs[0].type === 'search' || /^(s|q|search|searchword|query|keys)$/i.test(fs[0].name || ''))
  }
  const formEls = () => [...document.forms].filter((f) => vis(f) && !isSearchForm(f) && [...f.querySelectorAll(FIELD)].filter((c) => c.type !== 'search').length > 0)
  // a script-driven form has a button that is not type=submit (CMS newsletter modules): it is the submit when nothing else is and it says so
  const SCRIPT_SUBMIT = 'input[type="button"], button[type="button"], a.btn, [role="button"]'
  const SAYS_SUBMIT = /subscribe|submit|send|sign.?up|sign.?in|log.?in|join|register|save|apply|post|go|\u0111\u0103ng|g\u1eedi/i // Vietnamese 'post' and 'send', escaped
  // or its own click handler submits THIS form by name (a Joomla filter form's icon button: onclick="document.adminForm.submit()", or this.form.submit())
  const submitsOwnForm = (b, f) => {
    const js = b.getAttribute('onclick') || ''
    if (/\bthis\.form\.submit\(\s*\)/.test(js)) return true
    const m = js.match(/\bdocument\.(?:forms\[\s*['"]([^'"]+)['"]\s*\]|forms\.([\w$]+)|([\w$]+))\.submit\(\s*\)/)
    const n = m && (m[1] || m[2] || m[3])
    return Boolean(n) && n !== 'forms' && (n === f.getAttribute('name') || n === f.id)
  }
  const scriptSubmit = (f) => [...f.querySelectorAll(SCRIPT_SUBMIT)].find((b) => vis(b) && (SAYS_SUBMIT.test(label(b) || b.getAttribute('value') || '') || /submit|subbutton/i.test(String(b.className)) || submitsOwnForm(b, f))) || null
  const submitOf = (f) => [...f.querySelectorAll(SUBMIT)].find((b) => vis(b)) || [...f.querySelectorAll(SUBMIT)][0] || scriptSubmit(f)
  const submitState = (b) => {
    if (!b) return null
    const c = getComputedStyle(b)
    let opacity = 1
    for (let n = b; n && n.nodeType === 1; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity)
    const disabled = b.disabled === true || b.getAttribute('aria-disabled') === 'true' || b.hasAttribute('disabled') || /\b(disabled|is-disabled)\b/.test(b.className)
    return { disabled, label: label(b) || b.getAttribute('value') || '', style: { opacity: Math.round(opacity * 100) / 100, color: c.color, background: c.backgroundColor, border: c.borderTopColor + ' ' + c.borderTopWidth, cursor: c.cursor, pointerEvents: c.pointerEvents, filter: c.filter } }
  }
  const formInfo = (f, index) => {
    const seenRadio = new Set()
    const fields = []
    ;[...f.querySelectorAll(FIELD)].filter((c) => c.type !== 'search').forEach((c, i) => {
      if (c.type === 'radio') { if (seenRadio.has(c.name)) return; seenRadio.add(c.name) }
      fields.push({ i, key: key(fieldLabel(c)) || key(c.name), label: fieldLabel(c), type: c.tagName === 'TEXTAREA' ? 'textarea' : c.tagName === 'SELECT' ? 'select' : c.type, required: isRequired(c), nativeRequired: c.required === true, shown: vis(c) || (c.type === 'checkbox' && vis(c.closest('label') || c)), checked: c.checked === true })
    })
    // the landmark a visitor meets the form in: a tie-breaker when two forms have the same fields
    const region = f.closest('footer, [role="contentinfo"]') ? 'footer' : f.closest('header, [role="banner"]') ? 'header' : f.closest('aside, [role="complementary"]') ? 'aside' : f.closest('main, [role="main"], article') ? 'main' : 'page'
    return { index, region, method: (f.getAttribute('method') || 'get').toLowerCase(), action: f.getAttribute('action') || '', fields, submit: submitState(submitOf(f)), invalid: [...f.querySelectorAll(FIELD)].filter((c) => !c.checkValidity()).map((c) => key(fieldLabel(c))).slice(0, 8) }
  }
  const forms = () => formEls().map(formInfo)
  const formField = (index, i) => {
    const f = formEls()[index]
    const c = f && [...f.querySelectorAll(FIELD)].filter((x) => x.type !== 'search')[i]
    if (!c) return null
    const target = vis(c) ? c : c.closest('label') || c.parentElement
    target.scrollIntoView({ block: 'center' })
    return { ...box(target), type: c.type, tag: c.tagName.toLowerCase(), checked: c.checked === true }
  }
  const submitBox = (index) => { const f = formEls()[index]; const b = f && submitOf(f); if (!b) return null; const t = vis(b) ? b : b.parentElement; t.scrollIntoView({ block: 'center' }); return box(t) }
  // this form's own submit events (the page records each one with the element it fired on) and the plugin lifecycle that carries it, when a supported one does
  const submitsOf = (index) => { const f = formEls()[index]; const l = (window.__iaSubmits || []).filter((s) => s.form === f); return { events: l.length, ok: l.filter((s) => s.ok).length } }
  // The one supported plugin lifecycle is Contact Form 7, and only through ITS per-instance marker: the hidden _wpcf7_unit_tag field this form carries
  // (exactly one such field, a value no other form on the page has). The plugin id (_wpcf7) is shared by every embed of the same form and proves nothing.
  // AcyMailing (mod_acym, a Joomla source's subscribe form) is the second: its script posts new FormData(form) of the form whose id is the value
  // of its own hidden acyformname field (media/com_acym/js/module.min.js), so that field — one per form, equal to the form's id, on no other
  // form of the page — is its per-instance marker.
  const lifecycle = (index) => {
    const forms = formEls()
    const f = forms[index]
    if (!f) return null
    if (!f.closest('.wpcf7')) {
      const acym = f.querySelectorAll('input[name="acyformname"]')
      if (!acym.length) return null
      const unit = acym.length === 1 ? acym[0].value : ''
      if (!unit || unit !== f.id) return { kind: 'acym', id: null, unit: null, why: 'the form carries no single acyformname marker equal to its own id' }
      const shared = forms.filter((g) => g !== f && Array.from(g.querySelectorAll('input[name="acyformname"]')).some((i) => i.value === unit)).length
      return { kind: 'acym', id: unit, unit: shared ? null : unit, why: shared ? 'another form on the page carries the same acyformname' : null }
    }
    const one = (form, name) => { const l = form.querySelectorAll('input[name="' + name + '"]'); return l.length === 1 ? l[0].value : null }
    const id = one(f, '_wpcf7')
    const unit = one(f, '_wpcf7_unit_tag')
    if (!id || !unit) return { kind: 'cf7', id: id || null, unit: null, why: 'the form carries no single _wpcf7 / _wpcf7_unit_tag marker' }
    const shared = forms.filter((g) => g !== f && Array.from(g.querySelectorAll('input[name="_wpcf7_unit_tag"]')).some((i) => i.value === unit)).length
    return { kind: 'cf7', id, unit: shared ? null : unit, why: shared ? 'another form on the page carries the same _wpcf7_unit_tag' : null }
  }
  const formState = (index) => { const f = formEls()[index]; return f ? formInfo(f, index) : null }
  const fillSelect = (index, i) => {
    const f = formEls()[index]
    const c = f && [...f.querySelectorAll(FIELD)].filter((x) => x.type !== 'search')[i]
    if (!c || c.tagName !== 'SELECT') return false
    const o = [...c.options].find((x) => x.value && !x.disabled)
    if (!o) return false
    c.value = o.value
    c.dispatchEvent(new Event('input', { bubbles: true }))
    c.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  // ── carousels ─────────────────────────────────────────────────────────────────────────
  const CAROUSEL = '.swiper, .swiper-container, .slick-slider, .owl-carousel, .splide, .carousel, [data-ride="carousel"], [data-bs-ride="carousel"], [aria-roledescription="carousel"], [class*="slideshow"], [class*="carousel"], [class*="slider"]'
  const ITEM = '.swiper-slide, .slick-slide, .owl-item, .splide__slide, .carousel-item, [aria-roledescription="slide"]'
  const CLONE = /\b(swiper-slide-duplicate|slick-cloned|cloned|clone|splide__slide--clone)\b/i
  const DOTS = '.swiper-pagination-bullet, .slick-dots button, .owl-dot, .splide__pagination button, .carousel-indicators [data-bs-slide-to], .carousel-indicators li, [data-slide-to], [class*="pagination"] button, [class*="dots"] button, [class*="dot"][role="button"], [role="tab"]'
  const ARROWS = '.swiper-button-next, .swiper-button-prev, .slick-next, .slick-prev, .owl-next, .owl-prev, .splide__arrow, .carousel-control-next, .carousel-control-prev, [aria-label*="next" i], [aria-label*="previous" i], [aria-label*="prev" i], [class*="arrow"], [class*="-next"], [class*="-prev"]'
  const THUMBS = '[class*="thumb"] img, [class*="thumb"] button, .swiper-thumbs .swiper-slide, [class*="thumbnail"]'
  const itemKey = (el) => key(label(el)).slice(0, 60) + '|' + (el.querySelector('img')?.getAttribute('src') || el.querySelector('img')?.getAttribute('data-src') || '')
  /** The slides of a carousel root: library slides, or the children of the scroll-snap / overflow track inside it (itself or a descendant list). */
  const itemsOf = (el) => {
    const items = [...el.querySelectorAll(ITEM)].filter((i) => !CLONE.test(i.className) && !i.closest('[hidden], template'))
    if (items.length >= 2) return { items, kind: 'library' }
    const track = [el, ...el.querySelectorAll('ul, ol, div')].find((t) => {
      const c = getComputedStyle(t)
      if (!(c.overflowX === 'auto' || c.overflowX === 'scroll') || !(t.scrollWidth > t.clientWidth * 1.2)) return false
      return [...t.children].filter((k) => k.getBoundingClientRect().width > 0).length >= 3
    })
    if (track) return { items: [...track.children].filter((k) => k.getBoundingClientRect().width > 0), kind: 'scroller' }
    // a script-driven track (transform / fade, no scroll): a container whose same-tag children are not all on show at once
    const NOT_ITEM = /^(SCRIPT|STYLE|TEMPLATE|BUTTON|NAV|UL|OL)$/i
    for (const t of [el, ...el.querySelectorAll('div, ul, ol, section')]) {
      const kids = [...t.children].filter((k) => !/^(SCRIPT|STYLE|TEMPLATE)$/i.test(k.tagName))
      const byTag = new Map()
      for (const k of kids) byTag.set(k.tagName, [...(byTag.get(k.tagName) || []), k])
      const group = [...byTag.values()].sort((a, b) => b.length - a.length)[0]
      if (!group || group.length < 2) continue
      if (!group.every((k) => norm(k.textContent) || k.querySelector('img, picture, svg, video'))) continue
      if (group.some((k) => NOT_ITEM.test(k.tagName) && k.tagName !== 'UL' && k.tagName !== 'OL')) continue
      const c = getComputedStyle(t)
      const clipped = /^(hidden|clip|auto|scroll)$/.test(c.overflowX)
      const onShow = group.filter((k) => vis(k)).length
      if (onShow >= group.length && !clipped) continue
      if (onShow < 1) continue
      return { items: group, kind: 'track' }
    }
    return null
  }
  // a known library marks a carousel it has initialised; a carousel without one has nothing to wait for beyond its items and controls holding still
  const LIB = [['.swiper', '.swiper-initialized, .swiper-container-initialized', () => window.Swiper], ['.slick-slider', '.slick-initialized', () => window.jQuery?.fn?.slick], ['.owl-carousel', '.owl-loaded', () => window.jQuery?.fn?.owlCarousel], ['.splide', '.is-initialized', () => window.Splide], ['.carousel', '.carousel-item', () => window.bootstrap?.Carousel]]
  // only a library the page has loaded has an "initialised" state to wait for
  const readyOf = (el) => { for (const [lib, mark, loaded] of LIB) { if (loaded() && (el.matches(lib) || el.querySelector(lib))) { const root = el.matches(lib) ? el : el.querySelector(lib); return Boolean(root.matches(mark) || root.querySelector(mark) || root.swiper || window.bootstrap?.Carousel?.getInstance?.(root)) } } return true }
  // ONE enumeration of carousels and ONE identity per element: a carousel (and each of its controls) is numbered when first read and keeps that id on every later
  // read and click, so a preceding empty slider-like root, a clone or a re-ordered control cannot shift what a later step means.
  let seq = 0
  const idOf = (el, slot) => (el[slot] ??= ++seq)
  const carouselRoots = () => {
    const found = []
    const roots = [...document.querySelectorAll(CAROUSEL)].filter((el) => vis(el) && !el.closest('header, nav, footer'))
    for (const el of roots) {
      if (found.some((f) => f.el.contains(el) || el.contains(f.el))) { const idx = found.findIndex((f) => el.contains(f.el)); if (idx >= 0) found.splice(idx, 1); else continue }
      const got = itemsOf(el)
      if (!got) continue
      found.push({ el, items: got.items, kind: got.kind })
    }
    return found
  }
  const carouselById = (id) => carouselRoots().find((f) => f.el.__iaCarousel === id)?.el ?? null
  const controlsIn = (f) => {
    const scope = f.el.parentElement && f.el.parentElement.querySelectorAll ? f.el.parentElement : f.el
    const uniq = (sel) => [...f.el.querySelectorAll(sel), ...scope.querySelectorAll(sel)].filter((d, i, a) => a.indexOf(d) === i && vis(d))
    const dots = uniq(DOTS)
    const arrows = uniq(ARROWS).filter((d) => !f.items.includes(d) && !f.items.some((it) => it.contains(d) && !f.el.contains(d)))
    const thumbs = [...scope.querySelectorAll(THUMBS)].filter((d) => vis(d))
    return { dots, arrows, thumbs }
  }
  /** This carousel's own supported pause; the name of the mechanism, or null when there is none. Nothing outside the carousel is touched. */
  const pauseCarousel = (id) => {
    const el = carouselById(id)
    if (!el) return null
    const inner = (sel) => (el.matches(sel) ? el : el.querySelector(sel))
    try {
      const bs = window.bootstrap?.Carousel?.getInstance?.(el) || window.bootstrap?.Carousel?.getInstance?.(inner('.carousel'))
      if (bs) { bs.pause(); return 'bootstrap' }
      const sw = (inner('.swiper') || el).swiper
      if (sw?.autoplay && typeof sw.autoplay.stop === 'function') { sw.autoplay.stop(); return 'swiper' }
      const $ = window.jQuery
      const sl = inner('.slick-slider')
      if ($ && sl) { $(sl).slick('slickPause'); return 'slick' }
      const ow = inner('.owl-carousel')
      if ($ && ow) { $(ow).trigger('stop.owl.autoplay'); return 'owl' }
    } catch { /* a pause that throws is no pause */ }
    return null
  }
  /** The keys of the items shown inside this carousel's box right now (null when the carousel is gone). */
  const shownIn = (id) => {
    const el = carouselById(id)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const items = itemsOf(el)?.items ?? [...el.children]
    return items.filter((i) => { const b = i.getBoundingClientRect(); const o = inter(b, r); return b.width > 0 && o >= area(b) * 0.5 && !getComputedStyle(i).visibility.match(/hidden/) && Number(getComputedStyle(i).opacity) > 0.05 }).map(itemKey)
  }
  /** The visible controls of this carousel, each with its own id (the same id on every read) and its box. */
  const controlBoxesOf = (id) => {
    const f = carouselRoots().find((x) => x.el.__iaCarousel === id)
    if (!f) return []
    const ident = (d) => [d.getAttribute('aria-label'), d.getAttribute('title'), d.getAttribute('data-slide'), d.getAttribute('data-bs-slide'), String(d.getAttribute('class') || ''), label(d)].filter(Boolean).join(' ').slice(0, 120)
    const c = controlsIn(f)
    const pick = (list, kind) => list.map((d) => ({ id: idOf(d, '__iaControl'), kind, label: ident(d), ...box(d) }))
    return [...pick(c.dots, 'dot'), ...pick(c.arrows, 'arrow'), ...pick(c.thumbs, 'thumb')].slice(0, 24)
  }
  const carousels = () =>
    carouselRoots().map((f, index) => {
      const c = controlsIn(f)
      return { index, id: idOf(f.el, '__iaCarousel'), ready: readyOf(f.el), kind: f.kind, items: f.items.length, keys: f.items.map(itemKey), dots: c.dots.length, arrows: c.arrows.length, thumbs: c.thumbs.length, box: box(f.el) }
    })
  return { topItems, itemsIn, carouselById, shownIn, controlBoxesOf, pauseCarousel, submitsOf, lifecycle, submitBox, isBackLi, leavesOf, itemsOf, inventory, forms, formField, formState, fillSelect, vis, box, label, key, burger, panel, resolve, lisOf, childLis, expandable, rowOf, ctlOf, rows, overlaps, covered, backControl, backControls, contrast, theme, toggle, header, navCurrent, carousels, CAROUSEL, ITEM, CLONE, DOTS, ARROWS, THUMBS, itemKey, headerEl, inHeader, norm, area, inter, links, HEADER }
})()
`
