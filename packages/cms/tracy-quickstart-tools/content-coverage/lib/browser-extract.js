// Runs INSIDE the page (Playwright page.evaluate). Self-contained: no imports, no closures.
// Reads the DOM only; it never clicks, types or changes anything the server could see.
// Returns every item a visitor can see or a crawler reads, hidden ones included, each with
// a selector, a document-space rectangle and whether it is visible at this viewport.
export function extractPage() {
  const INLINE = new Set([
    'A',
    'SPAN',
    'STRONG',
    'EM',
    'B',
    'I',
    'SMALL',
    'SUP',
    'SUB',
    'ABBR',
    'CODE',
    'MARK',
    'LABEL',
    'TIME',
    'U',
    'S',
    'Q',
    'CITE',
    'BR',
    'FONT',
    'BDI',
    'BDO',
    'DFN',
    'KBD',
    'VAR',
    'DEL',
    'INS',
    'WBR'
  ])
  const SKIP = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEMPLATE',
    'SVG',
    'CANVAS',
    'IFRAME',
    'OBJECT',
    'SELECT',
    'TEXTAREA',
    'HEAD'
  ])
  const BLOCK_DISPLAY =
    /^(block|flex|grid|inline-block|inline-flex|inline-grid|list-item|table|table-cell|table-row|flow-root)/
  const sx = window.scrollX,
    sy = window.scrollY,
    vw = window.innerWidth
  const items = []
  const styleCache = new Map()
  const cs = (el) => {
    let s = styleCache.get(el)
    if (!s) {
      s = getComputedStyle(el)
      styleCache.set(el, s)
    }
    return s
  }

  const blockish = (el) => {
    if (SKIP.has(el.tagName)) return true
    const d = cs(el).display
    if (d === 'none') return !INLINE.has(el.tagName)
    if (d === 'contents') return false
    return BLOCK_DISPLAY.test(d) || el.tagName === 'BUTTON'
  }
  const selectorOf = (el) => {
    const parts = []
    for (let n = el, depth = 0; n && n.nodeType === 1 && depth < 6; n = n.parentElement, depth++) {
      if (n.id && /^[A-Za-z][\w-]*$/.test(n.id)) {
        parts.unshift('#' + n.id)
        break
      }
      let part = n.tagName.toLowerCase()
      const cls = [...n.classList].filter((c) => /^[A-Za-z][\w-]*$/.test(c)).slice(0, 2)
      if (cls.length) part += '.' + cls.join('.')
      const p = n.parentElement
      if (p) {
        const same = [...p.children].filter((c) => c.tagName === n.tagName)
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(n) + 1})`
      }
      parts.unshift(part)
    }
    return parts.join(' > ')
  }
  const rectOf = (el) => {
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(r.left + sx),
      y: Math.round(r.top + sy),
      w: Math.round(r.width),
      h: Math.round(r.height)
    }
  }
  const visibleOf = (el) => {
    if (!el.checkVisibility || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      return false
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    // Off-canvas panels and inactive slides are usually translated out of the viewport.
    return r.right > 0 && r.left < vw - 1 && r.bottom + sy > 0
  }
  const roleOf = (el) => {
    if (el.closest('nav, [role=navigation], .navbar, .t4-megamenu, .menu, .nav, .t4-offcanvas, .breadcrumb'))
      return 'nav'
    if (/\b(btn|button)\b/i.test(el.className || '') || el.tagName === 'BUTTON') return 'button'
    return 'content'
  }
  // Slot fit (ADR 0039): how a picture is drawn in its box, and how many characters a text box holds.
  const canvas = document.createElement('canvas').getContext('2d')
  const px = (v) => parseFloat(v) || 0
  const pictureLook = (el) => {
    const s = cs(el)
    return el.tagName === 'IMG'
      ? { objectFit: s.objectFit, objectPosition: s.objectPosition }
      : { backgroundSize: s.backgroundSize, backgroundPosition: s.backgroundPosition }
  }
  const CASE = { uppercase: (t) => t.toUpperCase(), lowercase: (t) => t.toLowerCase() }
  const textLook = (el, value) => {
    const s = cs(el)
    const size = px(s.fontSize)
    const lineHeight = px(s.lineHeight) || size * 1.2
    const shown = (CASE[s.textTransform] ?? ((t) => t))(value)
    canvas.font = s.font || `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
    const charWidth = shown.length ? canvas.measureText(shown).width / shown.length + px(s.letterSpacing) : 0
    const inner = (n) => {
      const ns = cs(n)
      return n.clientWidth - px(ns.paddingLeft) - px(ns.paddingRight)
    }
    // A label shrunk to its words (inline, or a flex or grid item) may grow to its parent's width.
    const parent = el.parentElement
    const shrunk = /^inline/.test(s.display) || (parent && /flex|grid/.test(cs(parent).display))
    const width = Math.round(shrunk && parent ? inner(parent) : inner(el))
    const height = el.clientHeight - px(s.paddingTop) - px(s.paddingBottom)
    return {
      width,
      lines: Math.max(1, Math.round(height / lineHeight)),
      charWidth: Math.round(charWidth * 100) / 100,
      textTransform: s.textTransform
    }
  }
  const lookOf = (kind, el, extra) => {
    try {
      if (kind === 'image') return pictureLook(el)
      if (kind === 'text') return textLook(el, extra.value)
    } catch {}
    return undefined
  }
  const add = (kind, el, extra) => {
    items.push({
      kind,
      tag: el ? el.tagName.toLowerCase() : null,
      selector: el ? selectorOf(el) : null,
      rect: el ? rectOf(el) : null,
      visible: el ? visibleOf(el) : true,
      role: el ? roleOf(el) : 'head',
      look: el && (kind === 'image' || kind === 'text') ? lookOf(kind, el, extra) : undefined,
      ...extra
    })
  }

  // 1. Text grouped by block element: the text of a block minus the text of its nested blocks.
  const ownText = (el) => {
    let out = ''
    for (const c of el.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue
      else if (c.nodeType === 1) {
        if (SKIP.has(c.tagName)) continue
        if (c.tagName === 'BR') {
          out += ' '
          continue
        }
        out += blockish(c) ? ' ' : ownText(c)
      }
    }
    return out
  }
  for (const el of document.body.querySelectorAll('*')) {
    if (SKIP.has(el.tagName) || el.closest('svg, script, style, noscript, template')) continue
    if (!blockish(el) && el.parentElement && el !== document.body) continue
    const t = ownText(el).replace(/\s+/g, ' ').trim()
    if (!t) continue
    const a = el.tagName === 'A' ? el : el.querySelector(':scope > a')
    add('text', el, { value: t, href: a ? a.getAttribute('href') : null })
  }
  // 2. Attributes a visitor or a screen reader meets.
  for (const el of document.body.querySelectorAll(
    '[alt],[title],[placeholder],[aria-label],input[type=submit],input[type=button],input[type=reset],button[value]'
  )) {
    for (const attr of ['alt', 'title', 'placeholder', 'aria-label']) {
      const v = el.getAttribute(attr)
      if (v && v.trim()) add('attr', el, { attr, value: v.trim() })
    }
    if (
      (el.tagName === 'INPUT' || el.tagName === 'BUTTON') &&
      el.value &&
      /^(submit|button|reset)$/i.test(el.type)
    )
      add('attr', el, { attr: 'value', value: el.value.trim() })
  }
  // 3. Head: title, description, Open Graph, Twitter, icons.
  add('meta', null, { attr: 'title', value: document.title })
  for (const m of document.querySelectorAll(
    'meta[name=description], meta[name=keywords], meta[name=author], meta[property^="og:"], meta[name^="og:"], meta[name^="twitter:"], meta[property^="twitter:"]'
  )) {
    const name = m.getAttribute('name') || m.getAttribute('property')
    const v = m.getAttribute('content') || ''
    if (!v.trim()) continue
    if (/image$|image:url$|image:secure_url$/.test(name))
      add('image', null, { source: 'meta:' + name, value: v.trim() })
    else if (/:url$/.test(name)) add('link', null, { source: 'meta:' + name, value: v.trim(), role: 'head' })
    else add('meta', null, { attr: name, value: v.trim() })
  }
  for (const l of document.querySelectorAll(
    'link[rel~=icon], link[rel=apple-touch-icon], link[rel=apple-touch-icon-precomposed], link[rel=mask-icon]'
  )) {
    add('image', null, { source: 'icon:' + l.rel, value: l.getAttribute('href') })
  }
  // 4. Images: <img> (current + srcset + lazy attributes), <picture><source>, posters, CSS backgrounds.
  const srcsetUrls = (v) =>
    (v || '')
      .split(',')
      .map((s) => s.trim().split(/\s+/)[0])
      .filter(Boolean)
  for (const img of document.querySelectorAll('img')) {
    const seen = new Set()
    const cands = [
      ['img', img.currentSrc],
      ['img', img.getAttribute('src')],
      ...srcsetUrls(img.getAttribute('srcset')).map((u) => ['srcset', u])
    ]
    for (const a of ['data-src', 'data-lazy', 'data-original', 'data-lazy-src'])
      if (img.getAttribute(a)) cands.push(['lazy', img.getAttribute(a)])
    for (const u of srcsetUrls(img.getAttribute('data-srcset'))) cands.push(['lazy', u])
    for (const [source, v] of cands) {
      if (!v || v.startsWith('data:') || seen.has(v)) continue
      seen.add(v)
      add('image', img, { source, value: v })
    }
  }
  for (const s of document.querySelectorAll(
    'picture source[srcset], video source[src], video[src], audio[src], audio source[src]'
  )) {
    const host = s.closest('picture, video, audio') || s
    for (const u of s.tagName === 'SOURCE' && s.srcset
      ? srcsetUrls(s.getAttribute('srcset'))
      : [s.getAttribute('src')])
      add('image', host, { source: s.tagName.toLowerCase(), value: u })
  }
  for (const v of document.querySelectorAll('video[poster]'))
    add('image', v, { source: 'poster', value: v.getAttribute('poster') })
  for (const f of document.querySelectorAll('iframe[src]'))
    add('link', f, { source: 'iframe', value: f.getAttribute('src'), role: 'embed' })
  // Media a script opens later (a video modal reads data-src from the button): the URL is demo content too.
  for (const el of document.querySelectorAll(
    '[data-src]:not(img):not(iframe),[data-video],[data-video-id],[data-youtube],[data-url]'
  )) {
    for (const a of ['data-src', 'data-video', 'data-video-id', 'data-youtube', 'data-url']) {
      const v = el.getAttribute(a)
      if (v && v.trim() && !v.startsWith('#')) add('link', el, { source: a, value: v.trim(), role: 'embed' })
    }
  }
  for (const el of document.querySelectorAll('[data-bg],[data-background],[data-image],[data-bg-image]')) {
    for (const a of ['data-bg', 'data-background', 'data-image', 'data-bg-image'])
      if (el.getAttribute(a)) add('image', el, { source: 'data-bg', value: el.getAttribute(a) })
  }
  for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
    if (SKIP.has(el.tagName)) continue
    for (const pseudo of [null, '::before', '::after']) {
      const bg = pseudo ? getComputedStyle(el, pseudo).backgroundImage : cs(el).backgroundImage
      if (!bg || bg === 'none' || !bg.includes('url(')) continue
      for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g))
        if (!m[1].startsWith('data:')) add('image', el, { source: 'css-bg' + (pseudo || ''), value: m[1] })
    }
  }
  // 5. Link targets.
  for (const a of document.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href').trim()
    if (!h || h === '#' || /^javascript:/i.test(h)) continue
    add('link', a, {
      source: 'a',
      value: h,
      text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    })
  }
  return {
    url: location.href,
    title: document.title,
    bodyClass: document.body.className,
    docHeight: document.documentElement.scrollHeight,
    docWidth: document.documentElement.scrollWidth,
    items
  }
}

// Runs INSIDE the page after `extractPage`: each same-origin raster picture's own size and the share of its pixels
// under 250 alpha (`clear`); its ground is transparent when that share is at least 5%. A corner test alone (Tracy's
// `demoTransparency`) calls a photo with softened corners a cut-out: JA Boxing's 736x982 class thumbnails have 0.2%
// clear pixels, all in the corners. Slot fit (ADR 0039) declares a cut-out from this, never from the file extension.
// Self-contained, read-only.
export async function measurePictures(urls) {
  const out = {}
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const load = (src) =>
    new Promise((ok) => {
      const img = new Image()
      const timer = setTimeout(() => ok(null), 5000)
      img.onload = () => {
        clearTimeout(timer)
        ok(img)
      }
      img.onerror = () => {
        clearTimeout(timer)
        ok(null)
      }
      img.src = src
    })
  for (const url of urls) {
    let abs
    try {
      abs = new URL(url, location.href)
    } catch {
      continue
    }
    if (abs.origin !== location.origin) continue
    const img = await load(abs.href)
    if (!img || !img.naturalWidth || !img.naturalHeight) continue
    const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight))
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    let alpha = null
    let clear = null
    try {
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let n = 0
      for (let i = 3; i < px.length; i += 4) if (px[i] < 250) n++
      clear = Math.round((n / (px.length / 4)) * 1000) / 1000
      // A soft or rounded corner on a photo is not a cut-out: the ground is transparent when a twentieth of it is.
      alpha = clear >= 0.05
    } catch {}
    out[url] = { width: img.naturalWidth, height: img.naturalHeight, alpha, clear }
  }
  return out
}
