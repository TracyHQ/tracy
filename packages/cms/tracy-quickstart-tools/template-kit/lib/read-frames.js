// In-page readers for the picture frames of one block (each function runs INSIDE the page, self-contained).
// A frame is found by the picture file the content map names for it: an <img> (src, srcset or currentSrc) or
// an element painting it as a CSS background. What is read is measured, never guessed from names: the box,
// whether it is shown, the picture's clear (transparent) share, whether it lies over another picture, the
// light/dark theme marker in its markup.
// An <img> kept invisible (opacity 0) while its holder paints a mask or background over the same spot is
// shown THROUGH that painter: the box is the painter's. Elements that paint over a frame are tagged
// `data-kit-painter` so an emptied frame that changes nothing can empty its real painter too.

/**
 * Tag and measure the frames `{id, path}` inside block `block`; with no block, inside any block of the page
 * (`host` names the block where the picture was found). With `anywhere`, a picture outside every block (a footer
 * logo the template's own layout prints) is found in the page region that holds it (`header`, `footer`, `aside`,
 * `nav`, `main`, else the body), which is tagged `region-<tag>` so it can be judged like a block. Pixel reads need
 * same-site pictures.
 */
export async function readFrames({ block, frames, anywhere = false }) {
  const roots = block
    ? [document.querySelector(`[data-kit-block="${block}"]`)].filter(Boolean)
    : [...document.querySelectorAll('[data-kit-block]'), ...(anywhere ? [document.body] : [])]
  if (!roots.length) return { found: false, frames: {} }
  const fileOf = (u) => {
    try {
      return decodeURIComponent(new URL(u, location.href).pathname).toLowerCase()
    } catch {
      return ''
    }
  }
  const URL_RE = /url\(["']?([^"')]+)["']?\)/g
  const bgUrls = (el) => [...getComputedStyle(el).backgroundImage.matchAll(URL_RE)].map((m) => m[1])
  const sources = (el) => {
    const out = el.tagName === 'IMG' ? [el.currentSrc, el.getAttribute('src')] : []
    if (el.tagName === 'IMG' || el.tagName === 'SOURCE')
      for (const part of String(el.getAttribute('srcset') ?? '').split(','))
        out.push(part.trim().split(/\s+/)[0])
    return [...out, ...bgUrls(el)].filter(Boolean).map(fileOf)
  }
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height }
  }
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    }
    return true
  }
  // What an element paints itself: a picture in its own background or mask, or in a ::before/::after.
  const paints = (e) => {
    const out = []
    for (const pseudo of [null, '::before', '::after']) {
      const s = getComputedStyle(e, pseudo)
      if (pseudo && (s.content === 'none' || s.content === 'normal')) continue
      const vals = [s.backgroundImage, s.maskImage, s.webkitMaskImage]
      if (vals.some((v) => /url\(/.test(v ?? ''))) out.push(pseudo ? pseudo.slice(2) : 'self')
    }
    return out
  }
  const overlap = (a, b) => {
    const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
    const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
    return w > 0 && h > 0 ? (w * h) / (a.width * a.height || 1) : 0
  }
  // The elements around a frame that paint a picture over most of it, no more than twice its size.
  const paintersOf = (el, b) => {
    const out = []
    for (let e = el, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) {
      const p = paints(e)
      const q = box(e)
      if (!p.length || !shown(e) || q.width * q.height > 2 * Math.max(1, b.width * b.height)) continue
      if (overlap(b, q) >= 0.5) out.push({ el: e, parts: p })
    }
    return out
  }
  const tag = (el, attr, id) => {
    const had = (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)
    if (!had.includes(id)) el.setAttribute(attr, [...had, id].join(' '))
  }
  const THEME = /(?:^|[-_])(light|dark)(?:[-_]|$)/i
  const themeOf = (el, root) => {
    for (let e = el, i = 0; e && e !== root && i < 4; e = e.parentElement, i++)
      for (const c of e.classList) {
        const m = c.match(THEME)
        if (m) return m[1].toLowerCase()
      }
    return null
  }
  const clearShare = async (url) => {
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      const s = Math.min(1, 128 / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * s))
      const h = Math.max(1, Math.round(img.naturalHeight * s))
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0, w, h)
      const px = g.getImageData(0, 0, w, h).data
      let clear = 0
      for (let i = 3; i < px.length; i += 4) if (px[i] < 16) clear++
      return { share: clear / (w * h), natural: { width: img.naturalWidth, height: img.naturalHeight } }
    } catch {
      return null
    }
  }
  const out = {}
  for (const f of frames) {
    const want = `/${String(f.path).replace(/^\/+/, '').toLowerCase()}`
    let els = []
    let root = null
    for (const r of roots) {
      const all = [r, ...r.querySelectorAll('*')].filter((el) => el.tagName === 'IMG' || bgUrls(el).length)
      els = all.filter((el) => sources(el).some((s) => s.endsWith(want)))
      if (els.length) {
        root = r
        break
      }
    }
    if (!els.length) {
      out[f.id] = { found: false }
      continue
    }
    const pictures = [root, ...root.querySelectorAll('*')].filter(
      (el) => el.tagName === 'IMG' || bgUrls(el).length
    )
    for (const el of els) tag(el, 'data-kit-frame', f.id)
    // Shown through a painter: the <img> itself is invisible, its holder paints over the same spot.
    const viaPainter = (el) => {
      if (el.tagName !== 'IMG' || shown(el)) return null
      if (Number(getComputedStyle(el).opacity) !== 0 || !el.parentElement || !shown(el.parentElement))
        return null
      return paintersOf(el.parentElement, box(el.parentElement))[0] ?? null
    }
    const el = els.find(shown) ?? els.find(viaPainter) ?? els[0]
    const via = shown(el) ? null : viaPainter(el)
    const b = via ? box(via.el) : box(el)
    for (const p of via ? [via] : paintersOf(el, b)) {
      tag(p.el, 'data-kit-painter', f.id)
      for (const part of p.parts) tag(p.el, `data-kit-paints-${part}`, f.id)
    }
    const url =
      el.tagName === 'IMG' ? el.currentSrc || el.src : bgUrls(el).find((u) => fileOf(u).endsWith(want))
    // Over another picture: an ancestor painting a background, or another shown picture, under most of its box.
    const over = pictures.some((p) => {
      if (p === el || el.contains(p) || !shown(p)) return false
      if (p.contains(el) && !bgUrls(p).length) return false
      if (via && (p === via.el || p.contains(via.el))) return false
      return overlap(b, box(p)) >= 0.5
    })
    if (root === document.body) {
      const region = el.closest('header, footer, aside, nav, main') ?? document.body
      if (!region.hasAttribute('data-kit-block'))
        region.setAttribute('data-kit-block', `region-${region.tagName.toLowerCase()}`)
      root = region
    }
    out[f.id] = {
      found: true,
      host: root.getAttribute('data-kit-block'),
      count: els.length,
      shown: els.some(shown) || !!via,
      paintedBy: via ? { how: via.parts.join('+'), tag: via.el.tagName.toLowerCase() } : null,
      asBackground: el.tagName !== 'IMG',
      box: {
        width: Math.round(b.width),
        height: Math.round(b.height),
        left: Math.round(b.left),
        top: Math.round(b.top)
      },
      theme: themeOf(el, root),
      over,
      pixels: url ? await clearShare(url) : null
    }
  }
  return { found: true, frames: out }
}

/** The repeated row sets of a block and its box: what a hidden frame may break. */
export function layoutOf({ block }) {
  const root = document.querySelector(`[data-kit-block="${block}"]`)
  if (!root) return null
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return {
      left: Math.round(r.left + scrollX),
      top: Math.round(r.top + scrollY),
      width: Math.round(r.width),
      height: Math.round(r.height)
    }
  }
  const sig = (el) =>
    `${el.tagName}.${[...el.classList]
      .filter((c) => !/^[a-z]+-\d+$/.test(c))
      .sort()
      .join('.')}`
  const sets = []
  for (const parent of [root, ...root.querySelectorAll('*')]) {
    if (parent.children.length < 2) continue
    const groups = new Map()
    for (const c of parent.children) {
      const b = box(c)
      if (b.width < 40 || b.height < 20) continue
      if (!groups.has(sig(c))) groups.set(sig(c), [])
      groups.get(sig(c)).push(b)
    }
    for (const [shape, rows] of groups) if (rows.length >= 2) sets.push({ shape, rows })
    if (sets.length >= 40) break
  }
  // Every piece of text and every button, tagged once so the same element is found again after a frame is emptied.
  const marks = []
  let n = 0
  for (const el of root.querySelectorAll('*')) {
    const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())
    if (!own && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) continue
    const b = box(el)
    if (b.width < 1 || b.height < 1) continue
    if (!el.hasAttribute('data-kit-t'))
      el.setAttribute('data-kit-t', `${n++}-${Math.random().toString(36).slice(2, 6)}`)
    marks.push({ key: el.getAttribute('data-kit-t'), ...b })
    if (marks.length >= 300) break
  }
  return { block: box(root), sets, marks }
}
