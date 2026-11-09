// Runs INSIDE the page (Playwright page.evaluate) of an EmDash site fetched with `X-Tracy-Preview: pick`: every visible
// piece of text and every visible picture, each with the provenance stamp (`data-tracy-src`) of its nearest stamped
// ancestor. Self-contained: no imports, no closures. Reads the DOM only.
//
// A stamp reads `emdash:<collection>:<id>:<slug>[ field:<key>|block:<repeater>]` (templates' `src/lib/stamps.ts`).
// A text block is the words of one run of inline elements: its text nodes are joined, so `Hey<br/> there` is one item.
export function extractEmdashPage() {
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
    'MARK',
    'LABEL',
    'TIME',
    'U',
    'S',
    'ABBR',
    'BR',
    'CODE'
  ])
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME', 'OPTION', 'TITLE'])
  const norm = (s) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  const scroll = { x: window.scrollX, y: window.scrollY }
  const rectOf = (el) => {
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(r.x + scroll.x),
      y: Math.round(r.y + scroll.y),
      w: Math.round(r.width),
      h: Math.round(r.height)
    }
  }
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  }
  const stampOf = (el) => {
    const holder = el.closest('[data-tracy-src]')
    if (!holder) return null
    const [, collection, id, slug, field] =
      /^emdash:([a-z0-9_]+):([^:\s]+):(\S+)(?:\s+(?:field|block):(\S+))?/.exec(
        holder.getAttribute('data-tracy-src') ?? ''
      ) ?? []
    if (!collection) return null
    const raw = holder.getAttribute('data-tracy-src') ?? ''
    return { collection, id, slug, field: field ?? null, block: /\sblock:/.test(raw), exact: holder === el }
  }
  const zoneOf = (el) => {
    if (el.closest('header, [role="banner"]')) return 'header'
    if (el.closest('footer, [role="contentinfo"]')) return 'footer'
    if (el.closest('nav, [role="navigation"]')) return 'nav'
    return 'main'
  }
  const selectorOf = (el) => {
    const parts = []
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      const cls = typeof n.className === 'string' ? n.className.trim().split(/\s+/)[0] : ''
      parts.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : cls ? `.${cls}` : ''))
    }
    return parts.join(' > ')
  }
  // An inline-block element (a tag chip, a button) is a box of its own, unless it sits inside a sentence: then the
  // parent has words of its own around it and the sentence is the block.
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())
  const rootOf = (el) => {
    let n = el
    while (n.parentElement && n.parentElement !== document.body && INLINE.has(n.tagName)) {
      // An anchor is a box of its own (a button, a card link) unless the parent has words around it: then it is a link
      // inside a sentence and the sentence is the block. Other inline-block elements follow the same rule.
      const insideSentence = ownText(n.parentElement)
      const inline = n.tagName !== 'A' && getComputedStyle(n).display === 'inline'
      if (!inline && !insideSentence) break
      n = n.parentElement
    }
    return n
  }

  // Slot fit (ADR 0039): how a picture is drawn in its box, and how many characters a text box holds (browser-extract.js).
  const canvas = document.createElement('canvas').getContext('2d')
  const px = (v) => Number.parseFloat(v) || 0
  const pictureLook = (el) => {
    const s = getComputedStyle(el)
    return el.tagName === 'IMG'
      ? { objectFit: s.objectFit, objectPosition: s.objectPosition }
      : { backgroundSize: s.backgroundSize, backgroundPosition: s.backgroundPosition }
  }
  const textLook = (el, value) => {
    const s = getComputedStyle(el)
    const size = px(s.fontSize)
    const lineHeight = px(s.lineHeight) || size * 1.2
    const shownText =
      s.textTransform === 'uppercase'
        ? value.toUpperCase()
        : s.textTransform === 'lowercase'
          ? value.toLowerCase()
          : value
    canvas.font = s.font || `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
    const charWidth = shownText.length
      ? canvas.measureText(shownText).width / shownText.length + px(s.letterSpacing)
      : 0
    const inner = (n) => {
      const ns = getComputedStyle(n)
      return n.clientWidth - px(ns.paddingLeft) - px(ns.paddingRight)
    }
    const parent = el.parentElement
    const shrunk =
      s.display.startsWith('inline') || (parent && /flex|grid/.test(getComputedStyle(parent).display))
    const width = Math.round(shrunk && parent ? inner(parent) : inner(el))
    const height = el.clientHeight - px(s.paddingTop) - px(s.paddingBottom)
    return {
      width,
      lines: Math.max(1, Math.round(height / lineHeight)),
      charWidth: Math.round(charWidth * 100) / 100,
      textTransform: s.textTransform
    }
  }

  const items = []
  const roots = new Map()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = norm(node.nodeValue)
    const parent = node.parentElement
    if (
      !text ||
      !parent ||
      SKIP.has(parent.tagName.toUpperCase()) ||
      parent.closest('script, style, noscript, template, svg, [aria-hidden="true"][hidden]')
    )
      continue
    if (!shown(parent)) continue
    const root = rootOf(parent)
    const seen = roots.get(root)
    if (seen) {
      seen.parts.push(text)
      continue
    }
    roots.set(root, { root, first: parent, parts: [text] })
  }
  for (const { root, first, parts } of roots.values()) {
    const value = parts.join(' ')
    const rect = rectOf(root)
    items.push({
      kind: 'text',
      value,
      tag: root.tagName.toLowerCase(),
      zone: zoneOf(root),
      stamp: stampOf(first),
      inForm: Boolean(root.closest('form')),
      selector: selectorOf(root),
      rect,
      look: textLook(root, value),
      href: first.closest('a')?.getAttribute('href') ?? null
    })
  }

  const srcOf = (v) => {
    const m = /url\((['"]?)(.*?)\1\)/.exec(v ?? '')
    return m && !m[2].startsWith('data:') ? m[2] : null
  }
  const seenImg = new Set()
  for (const img of document.images) {
    const src = img.currentSrc || img.getAttribute('src') || ''
    if (!src || src.startsWith('data:') || !shown(img)) continue
    const k = `${src}|${Math.round(img.getBoundingClientRect().x)}|${Math.round(img.getBoundingClientRect().y + scroll.y)}`
    if (seenImg.has(k)) continue
    seenImg.add(k)
    items.push({
      kind: 'image',
      value: src,
      tag: 'img',
      zone: zoneOf(img),
      stamp: stampOf(img),
      selector: selectorOf(img),
      rect: rectOf(img),
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      alt: img.getAttribute('alt') ?? '',
      look: pictureLook(img)
    })
  }
  for (const el of document.querySelectorAll('body *')) {
    if (el.tagName === 'IMG' || SKIP.has(el.tagName.toUpperCase())) continue
    const src = srcOf(getComputedStyle(el).backgroundImage)
    if (!src || !shown(el)) continue
    items.push({
      kind: 'image',
      value: src,
      tag: el.tagName.toLowerCase(),
      zone: zoneOf(el),
      stamp: stampOf(el),
      selector: selectorOf(el),
      rect: rectOf(el),
      background: true,
      look: pictureLook(el)
    })
  }

  // Links: every visible anchor is an item (its address is what a visitor follows), and every anchor, visible or not,
  // feeds the crawl.
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') ?? ''
    if (!href || !shown(a)) continue
    items.push({
      kind: 'link',
      value: href,
      text: norm(a.textContent).slice(0, 80),
      tag: 'a',
      zone: zoneOf(a),
      stamp: stampOf(a),
      selector: selectorOf(a),
      rect: rectOf(a)
    })
  }
  const links = []
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') ?? ''
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue
    links.push(href)
  }
  const owner = document.querySelector('template[data-tracy-owner]')?.getAttribute('data-tracy-owner') ?? null
  return {
    items,
    links: [...new Set(links)],
    owner,
    title: document.title,
    text: document.body.innerText.slice(0, 200000),
    height: document.documentElement.scrollHeight
  }
}
