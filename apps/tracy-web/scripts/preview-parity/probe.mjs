/**
 * What PREVIEW-PARITY reads off one page (the Design system popup's page, or the same page after Try on),
 * evaluated in the open page over DevTools once it has settled (cdp.mjs `open` with `still`: carousels on
 * their first slide, reveals played to their end). Kept to the four things a visitor tells apart at a
 * glance and a script or a stylesheet decides (Akemi, 17/10/2026: JA Essence's carousel cut, JA Vital and
 * Podcast's icons as empty squares in the popup but not on the page):
 *
 * - icons:  every glyph an icon font draws (a private-use character in ::before/::after or as the element's
 *           only text), by font family, and whether a face of that family loaded;
 * - fonts:  every web font family the page's words are set in (the first family of the stack with a face
 *           declared), the words in it, and whether a face of it loaded;
 * - boxes:  the page's large blocks (sections, header, footer, wide boxes up to six levels under the body),
 *           keyed by their place, with their size and whether they are seen;
 * - sliders: every carousel (Owl, Slick, Swiper, Bootstrap, or any box named carousel/slider), keyed the
 *           same way: whether its script built it, how many slides show, the first slide's width, its height.
 *
 * Joomla's flash messages (#system-message-container) are hidden while the page is read: they follow the session.
 *
 * Positions are not read: one block a few pixels taller moves every block under it, and an animation caught
 * a little earlier or later is not a difference a visitor sees. Sizes are.
 */
export const PARITY_PROBE = `(() => {
  // Joomla's flash messages (#system-message-container: "Please login first" after a guest redirect, "Saved")
  // belong to the session, not to the page: one load shows them and the next does not (JA Kinetic 1.0.8's
  // /pages/profile, a message in Try on and none in the popup, dot-1 at probe 10, 18/10/2026). Both sides are
  // read without them, then they are put back as they were
  const flash = [...document.querySelectorAll('#system-message-container')].map((e) => [e, e.style.getPropertyValue('display'), e.style.getPropertyPriority('display')])
  for (const [e] of flash) e.style.setProperty('display', 'none', 'important')
  try {
  const vw = innerWidth
  const seen = (e) => { if (!e.getClientRects().length) return false; if (e.checkVisibility && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false; const r = e.getBoundingClientRect(); return r.width >= 2 && r.height >= 2 }
  // a third-party map's own drawing (Google Maps: .gm-style, its error card .gm-err-container) loads its own
  // face (Roboto) and controls when its script answers, which differs between loads: not the template's page
  // (JA Smallbiz 1.0.3 home, 19/10/2026)
  const thirdParty = (x) => !!x.closest('.gm-style, .gm-err-container')
  // the slot's own carrier (Try on writes it as a module, often a div.mod-custom in a template module column;
  // the popup carries it another way) is not page content: it never shifts a sibling's key (JA Rent 1.0.4
  // topbar-1, 19/10/2026)
  const carrier = (x) => x.id !== 'tracy-ds-slot' && x.children.length <= 2 && !!x.querySelector(':scope > style#tracy-ds-slot, :scope > link#tracy-ds-slot')
  // a key two documents of the same page share: the nearest id, then the tag and first class of each level
  // with its place among siblings of that tag and class
  const step = (e) => { const c = [...e.classList].find((x) => /^[a-zA-Z][\\w-]*$/.test(x) && !/^(owl-|slick-|swiper-|active|show|in|loaded|aos-|animate|wow|fade|collapse|js-|is-|has-)/.test(x)); const sel = e.tagName.toLowerCase() + (c ? '.' + c : ''); const sib = e.parentElement ? [...e.parentElement.children].filter((x) => x === e || (x.tagName === e.tagName && (!c || x.classList.contains(c)) && !carrier(x))) : [e]; return sib.length > 1 ? sel + ':' + (sib.indexOf(e) + 1) : sel }
  const keyOf = (e) => { const parts = []; for (let x = e; x && x !== document.body && x !== document.documentElement; x = x.parentElement) { if (x.id && /^[a-zA-Z][\\w-]*$/.test(x.id) && !/\\d{3,}/.test(x.id)) { parts.unshift('#' + x.id); return parts.join(' > ') } parts.unshift(step(x)) } return parts.join(' > ') }
  const faces = [...document.fonts]
  const fam = (s) => s.replace(/^["']|["']$/g, '').trim().toLowerCase()
  const declared = new Set(faces.map((f) => fam(f.family)))
  const loaded = new Set(faces.filter((f) => f.status === 'loaded').map((f) => fam(f.family)))
  const firstWeb = (stack) => stack.split(',').map(fam).find((f) => declared.has(f)) ?? null
  const pua = (t) => { const s = (t || '').replace(/^["']|["']$/g, '').trim(); if (!s || s === 'none' || s === 'normal') return false; const cp = s.codePointAt(0); return [...s].length <= 2 && ((cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000) }
  const icons = {}
  const sliderSel = '.owl-carousel, .slick-slider, .swiper, .swiper-container, .carousel, [class*="carousel"]:not([class*="carousel-"]), [class*="slider"]:not([class*="slider-"])'
  const inSlider = (e) => Boolean(e.parentElement && e.parentElement.closest(sliderSel))
  let n = 0
  for (const e of document.body.querySelectorAll('*')) {
    if (++n > 6000) break
    if (!seen(e) || thirdParty(e)) continue
    for (const p of ['::before', '::after']) {
      const cs = getComputedStyle(e, p)
      if (!pua(cs.content)) continue
      const f = cs.fontFamily.split(',')[0].replace(/^["']|["']$/g, '').trim()
      const k = (icons[f] ??= { glyphs: 0, ok: loaded.has(fam(f)), at: keyOf(e) })
      k.glyphs++
    }
    if (e.children.length === 0 && pua(e.textContent)) {
      const f = getComputedStyle(e).fontFamily.split(',')[0].replace(/^["']|["']$/g, '').trim()
      const k = (icons[f] ??= { glyphs: 0, ok: loaded.has(fam(f)), at: keyOf(e) })
      k.glyphs++
    }
  }
  const fonts = {}
  const words = [...document.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, a, li, span, button, label, td, blockquote, figcaption, .btn')].slice(0, 1500)
  for (const e of words) {
    if (thirdParty(e)) continue
    if (![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim().length > 1)) continue
    if (!seen(e)) continue
    const f = firstWeb(getComputedStyle(e).fontFamily)
    if (!f) continue
    const k = (fonts[f] ??= { words: 0, ok: loaded.has(f), at: keyOf(e) })
    k.words++
  }
  const blockSel = 'header, footer, main, nav, section, article, aside, [class*="section"], [class*="t4-"], [id]'
  const boxes = {}
  const depth = (e) => { let d = 0; for (let x = e; x && x !== document.body; x = x.parentElement) d++; return d }
  for (const e of document.body.querySelectorAll(blockSel)) {
    if (Object.keys(boxes).length >= 600) break
    if (depth(e) > 6 || inSlider(e) || carrier(e) || thirdParty(e) || e.closest('script, style, template, noscript, svg')) continue
    const k = keyOf(e)
    if (boxes[k]) continue
    if (!seen(e)) { boxes[k] = { w: 0, h: 0, seen: false }; continue }
    const r = e.getBoundingClientRect()
    if (r.width >= vw * 0.3 && r.height >= 40) boxes[k] = { w: Math.round(r.width), h: Math.round(r.height), seen: true }
  }
  const sliders = {}
  for (const c of document.body.querySelectorAll(sliderSel)) {
    if (Object.keys(sliders).length >= 40) break
    if (inSlider(c) || !seen(c)) continue
    const r = c.getBoundingClientRect()
    if (r.width < 120 || r.height < 40) continue
    const built = c.classList.contains('owl-loaded') || c.classList.contains('slick-initialized') || c.classList.contains('swiper-initialized') || c.classList.contains('swiper-container-initialized') || Boolean(c.querySelector('.owl-stage, .slick-track, .swiper-wrapper[style], .carousel-item.active, .carousel-inner'))
    const items = [...c.querySelectorAll('.owl-item, .slick-slide, .swiper-slide, .carousel-item')]
    const pool = items.length ? items : [...(c.firstElementChild && c.children.length === 1 ? c.firstElementChild.children : c.children)]
    const showing = pool.filter((i) => { if (!seen(i)) return false; const q = i.getBoundingClientRect(); const w = Math.min(q.right, r.right) - Math.max(q.left, r.left); const h = Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top); return w > q.width * 0.6 && h > 20 })
    sliders[keyOf(c)] = { built, showing: showing.length, itemW: Math.round(showing[0]?.getBoundingClientRect().width ?? 0), h: Math.round(r.height), w: Math.round(r.width) }
  }
  // the system the page wears, as the slot names itself: a page read without it measured nothing
  const slot = [...document.querySelectorAll('style')].map((x) => /tracy-ds-slot: ([A-Za-z0-9:-]+)/.exec(x.textContent || '')?.[1]).find(Boolean) ?? null
  return { width: vw, height: document.documentElement.scrollHeight, slot, icons, fonts, boxes, sliders }
  } finally {
    for (const [e, v, pr] of flash) v ? e.style.setProperty('display', v, pr) : e.style.removeProperty('display')
  }
})()`
