/**
 * The in-page half of the site check's look read (`demo-qa-look.js`). Every function here is serialised by Playwright into
 * the page, so none may use anything from this module or from any other.
 */

/** Finds the template's light and dark mark, stops transitions, and says what the page opens on. */
export function beginLookInPage({ freezeId, switchSelector }) {
  const body = document.body
  const root = document.documentElement
  const style = document.getElementById('tracy-ds-slot')
  const hasClassMark = body.classList.contains('dark-active') || body.classList.contains('light-active')
  const attr = root.hasAttribute('data-theme')
    ? 'data-theme'
    : root.hasAttribute('data-bs-theme')
      ? 'data-bs-theme'
      : null
  const opening = hasClassMark
    ? body.classList.contains('dark-active')
      ? 'dark'
      : 'light'
    : attr
      ? root.getAttribute(attr)
      : 'only'
  if (!document.getElementById(freezeId)) {
    const freeze = document.createElement('style')
    freeze.id = freezeId
    // A smooth scroll has not arrived when the next line reads where the element is (Bootstrap sets it on the root).
    freeze.textContent = '*,*::before,*::after{transition:none!important;scroll-behavior:auto!important}'
    document.head.append(freeze)
  }
  return {
    opening,
    sides: hasClassMark || attr ? ['dark', 'light'] : ['only'],
    worn: Boolean(style?.sheet),
    // A switch on the page with no mark this read knows: only the side it opens on is read, and the judge says so.
    switchSeen: !hasClassMark && !attr && Boolean(document.querySelector(switchSelector))
  }
}

/** A press on the switch as far as a page's looks go (the template's script only moves this mark and keeps a cookie). */
export function putSideInPage(side) {
  const body = document.body
  const root = document.documentElement
  if (body.classList.contains('dark-active') || body.classList.contains('light-active')) {
    body.classList.toggle('dark-active', side === 'dark')
    body.classList.toggle('light-active', side === 'light')
  } else if (root.hasAttribute('data-theme')) root.setAttribute('data-theme', side)
  else if (root.hasAttribute('data-bs-theme')) root.setAttribute('data-bs-theme', side)
  void getComputedStyle(body).color
}

/** Leaves the page as it opened. Never throws. */
export function endLookInPage({ freezeId, opening, attrs }) {
  const body = document.body
  const root = document.documentElement
  if (opening !== 'only') {
    if (body.classList.contains('dark-active') || body.classList.contains('light-active')) {
      body.classList.toggle('dark-active', opening === 'dark')
      body.classList.toggle('light-active', opening === 'light')
    } else if (root.hasAttribute('data-theme')) root.setAttribute('data-theme', opening)
    else if (root.hasAttribute('data-bs-theme')) root.setAttribute('data-bs-theme', opening)
  }
  for (const attr of attrs) for (const el of document.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr)
  const sheet = document.getElementById('tracy-ds-slot')?.sheet
  if (sheet) sheet.disabled = false
  document.getElementById(freezeId)?.remove()
  scrollTo(0, 0)
}

/**
 * One side of the switch at one width: the words on a plain ground, the words on a picture and the logos (those two tagged for the host to shoot),
 * and the pictures a visitor sees on this side.
 * @param {{ caps: object, withLogos: boolean, overAttr: string, logoAttr: string,
 *   logoSelector: string }} arg
 */
export function readLookSideInPage({ caps, withLogos, overAttr, logoAttr, logoSelector }) {
  const started = performance.now()
  const late = () => performance.now() - started > caps.sideMs
  const sheet = document.getElementById('tracy-ds-slot')?.sheet ?? null
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'BR', 'WBR'])
  // A class a script moves, or one that only numbers a row: neither says what the element is.
  const NOT_NAME =
    /^(?:active|current|show|showing|open|opened|in|fade|collapsed|collapsing|loaded|lazy|lazyload|lazyloaded|animated|wow|visible|hidden|hover|focus|disabled|selected|checked|sticky|fixed|scrolled|headroom.*|aos-.*|animate__.*|swiper-slide-.*|slick-.*|owl-.*|is-.*|.*-active|.*-current)$|\d{3,}/
  const STABLE_ID = /^[A-Za-z][\w-]*$/
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    return (
      r.width > 0 &&
      r.height > 0 &&
      (el.checkVisibility
        ? el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: false })
        : true)
    )
  }
  const clippedAway = (el, cs) => {
    const r = el.getBoundingClientRect()
    return (
      cs.clip === 'rect(0px, 0px, 0px, 0px)' ||
      cs.clipPath === 'inset(50%)' ||
      (r.width <= 1 && r.height <= 1)
    )
  }
  const nameOf = (el) => {
    const classes = [...el.classList].filter((c) => !NOT_NAME.test(c)).sort()
    return el.tagName.toLowerCase() + classes.map((c) => `.${c}`).join('')
  }
  const blocks = new WeakMap()
  const blockOf = (el) => {
    if (!el || el === document.body || el === document.documentElement) return 'page'
    if (blocks.has(el)) return blocks.get(el)
    const own =
      el.id && STABLE_ID.test(el.id) && !/[0-9a-f]{6,}|\d{5,}/i.test(el.id)
        ? `#${el.id}`
        : blockOf(el.parentElement)
    blocks.set(el, own)
    return own
  }
  const keyOf = (el) => {
    const chain = []
    for (let at = el, n = 0; at && at !== document.body && n < 3; at = at.parentElement, n++)
      chain.unshift(nameOf(at))
    return `${blockOf(el)}|${chain.join('>')}`
  }
  const selectorOf = (el) =>
    el.tagName.toLowerCase() +
    (el.id ? `#${el.id}` : '') +
    [...el.classList]
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join('')

  const canvas = new OffscreenCanvas(1, 1)
  const pen = canvas.getContext('2d', { willReadFrequently: true })
  const known = new Map()
  /** A computed colour as [r, g, b, a], whatever its colour space. */
  const rgbOf = (value) => {
    if (known.has(value)) return known.get(value)
    let answer = null
    const plain = /^rgba?\(([^)]+)\)$/.exec(value ?? '')
    if (plain) {
      const v = plain[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number)
      answer = [v[0], v[1], v[2], v[3] ?? 1]
    } else if (value) {
      pen.clearRect(0, 0, 1, 1)
      pen.fillStyle = value
      pen.fillRect(0, 0, 1, 1)
      const d = pen.getImageData(0, 0, 1, 1).data
      answer = [d[0], d[1], d[2], d[3] / 255]
    }
    known.set(value, answer)
    return answer
  }

  const every = [...document.body.querySelectorAll('*')].filter(
    (el) =>
      !SKIP.has(el.tagName.toUpperCase()) &&
      !(el.ownerSVGElement ?? el.closest('svg')?.contains(el.parentElement))
  )
  const side = { truncated: false }

  // ── Words, against what is painted behind them ──────────────────────────────────────────────────────────────────
  const PICTURES = ['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME', 'svg']
  /** A pseudo-element of `el` that paints over it: a veil of colour or gradient the template lays on its picture. */
  const veilOf = (el, which) => {
    const ps = getComputedStyle(el, which)
    if (!ps.content || ps.content === 'none' || Number(ps.opacity) === 0) return false
    const c = rgbOf(ps.backgroundColor)
    return Boolean((c && c[3] > 0) || (ps.backgroundImage && ps.backgroundImage !== 'none'))
  }
  /**
   * Whether the picture under the words is veiled (card AW): blurred by a filter, under a backdrop blur of a layer above it, or
   * covered by a pseudo-element veil, as a template's blurred background layer is.
   */
  const veiledAt = (stack, at) => {
    const pic = getComputedStyle(stack[at])
    if (/blur\(/.test(pic.filter)) return true
    if (stack.slice(0, at).some((e) => /blur\(/.test(getComputedStyle(e).backdropFilter || ''))) return true
    return veilOf(stack[at], '::before') || veilOf(stack[at], '::after')
  }
  /** What lies under the words at this point: a colour composed down the stack, or a picture. */
  const groundOf = (stack) => {
    const layers = []
    for (const [at, e] of stack.entries()) {
      if (PICTURES.includes(e.tagName)) {
        const img = e.tagName === 'PICTURE' ? (e.querySelector('img') ?? e) : e
        return {
          picture: true,
          src: img.currentSrc || img.src || null,
          ...(veiledAt(stack, at) ? { veiled: true } : {})
        }
      }
      const cs = getComputedStyle(e)
      if (cs.backgroundImage !== 'none') {
        const url = /url\("?([^")]+)"?\)/.exec(cs.backgroundImage)?.[1]
        return {
          picture: true,
          src: url && !url.startsWith('data:') ? new URL(url, location.href).href : null,
          ...(veiledAt(stack, at) ? { veiled: true } : {})
        }
      }
      const c = rgbOf(cs.backgroundColor)
      if (c && c[3] > 0) {
        layers.push(c)
        if (c[3] >= 1) break
      }
    }
    let colour = [255, 255, 255]
    for (const c of layers.reverse()) colour = colour.map((v, i) => Math.round(c[i] * c[3] + v * (1 - c[3])))
    return { picture: false, colour }
  }
  const held = []
  let walked = 0
  for (const el of every) {
    if (++walked > caps.textWalk || held.length >= caps.textRead || late()) {
      side.truncated = true
      break
    }
    const node = [...el.childNodes].find(
      (n) => n.nodeType === 3 && /[\p{L}\p{N}].*[\p{L}\p{N}]/su.test(n.textContent)
    )
    if (!node || !shown(el)) continue
    const cs = getComputedStyle(el)
    if (clippedAway(el, cs)) continue
    const fg = rgbOf(cs.color)
    if (!fg || fg[3] === 0) continue
    const r0 = el.getBoundingClientRect()
    scrollTo(0, Math.max(0, scrollY + r0.top - innerHeight / 2 + r0.height / 2))
    const range = document.createRange()
    range.selectNodeContents(node)
    const rect = [...range.getClientRects()].find((r) => r.width > 2 && r.height > 2)
    if (!rect || rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth)
      continue
    const stack = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const where = stack.indexOf(el)
    if (where < 0) continue
    const px = Number.parseFloat(cs.fontSize) || 0
    held.push({
      el,
      stack: stack.slice(where),
      fg,
      ground: groundOf(stack.slice(where)),
      large: px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700),
      text: node.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)
    })
  }
  scrollTo(0, 0)
  // The same elements with the brand style off: the template's own colours, so the judge can say which step made a fault.
  if (sheet) sheet.disabled = true
  for (const h of held) {
    h.fgOff = rgbOf(getComputedStyle(h.el).color)
    h.groundOff = groundOf(h.stack)
  }
  if (sheet) sheet.disabled = false
  const words = new Map()
  const over = new Map()
  for (const h of held) {
    const selector = selectorOf(h.el)
    if (h.ground.picture) {
      const id = `${keyOf(h.el)}|${h.fg}|${h.ground.src}`
      if (over.has(id)) continue
      if (over.size >= caps.over) {
        side.truncated = true
        continue
      }
      const n = over.size
      h.el.setAttribute(overAttr, String(n))
      over.set(id, {
        over: n,
        overImage: true,
        key: keyOf(h.el),
        fg: h.fg.slice(0, 3),
        fgOff: h.fgOff?.slice(0, 3) ?? null,
        large: h.large,
        selector,
        text: h.text,
        ...(h.ground.src ? { underSrc: h.ground.src } : {}),
        ...(h.ground.veiled ? { veiled: true } : {})
      })
      continue
    }
    const off = h.groundOff.picture ? null : h.groundOff.colour
    const id = `${h.fg}|${h.fgOff}|${h.ground.colour}|${off}|${h.large}`
    if (words.has(id)) {
      words.get(id).count++
      continue
    }
    if (words.size >= caps.words) {
      side.truncated = true
      continue
    }
    words.set(id, {
      fg: h.fg,
      fgOff: h.fgOff,
      bg: h.ground.colour,
      bgOff: off,
      large: h.large,
      selector,
      text: h.text,
      count: 1
    })
  }
  side.words = [...words.values()]
  side.over = [...over.values()]

  // ── Logos ───────────────────────────────────────────────────────────────────────────────────────────────────────
  side.logos = []
  if (withLogos) {
    const seen = new Set()
    for (const el of document.body.querySelectorAll(logoSelector)) {
      if (side.logos.length >= caps.logos) break
      if (!shown(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width < 10 || r.height < 8) continue
      const src = el.currentSrc || el.src?.baseVal || el.src || null
      const id = `${src}|${Math.round(r.width)}x${Math.round(r.height)}|${blockOf(el)}`
      if (seen.has(id)) continue
      seen.add(id)
      const n = side.logos.length
      el.setAttribute(logoAttr, String(n))
      side.logos.push({
        at: n,
        selector: selectorOf(el),
        ...(typeof src === 'string' ? { src: src.slice(0, 300) } : {})
      })
    }
  }

  // ── Pictures ────────────────────────────────────────────────────────────────────────────────────────────────────
  // A light or dark twin of a picture shows on one side only: the judge asks whether a stored picture shows on either.
  side.shownPictures = []
  for (const img of document.body.querySelectorAll('img')) {
    if (side.shownPictures.length >= caps.shownPictures) break
    if (shown(img)) side.shownPictures.push((img.currentSrc || img.src).slice(0, 300))
  }
  return side
}

/** Decodes the three shots of a logo and reads each logo pixel against the ground it sits on. */
export async function logoPixelsInPage({ ground, black, white, maxPixels }) {
  const decode = async (b64) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bmp.width, bmp.height)
    const pen = canvas.getContext('2d')
    pen.drawImage(bmp, 0, 0)
    const data = pen.getImageData(0, 0, bmp.width, bmp.height).data
    bmp.close()
    return data
  }
  const [g, b, w] = await Promise.all([ground, black, white].map(decode))
  const ch = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const lum = (r, gr, bl) => 0.2126 * ch(r) + 0.7152 * ch(gr) + 0.0722 * ch(bl)
  const total = g.length / 4
  const step = Math.max(1, Math.floor(total / maxPixels))
  let ink = 0
  let seen = 0
  let under2 = 0
  let under3 = 0
  const ratios = []
  const sum = { ink: [0, 0, 0], ground: [0, 0, 0], n: 0 }
  for (let p = 0; p < g.length; p += 4 * step) {
    seen++
    // Against black a pixel shows its colour times its alpha, against white that plus what shines through.
    const alpha = 1 - (w[p] - b[p] + (w[p + 1] - b[p + 1]) + (w[p + 2] - b[p + 2])) / (3 * 255)
    if (alpha < 0.5) continue
    ink++
    const c = [b[p] / alpha, b[p + 1] / alpha, b[p + 2] / alpha].map((v) => Math.min(255, v))
    const a = lum(c[0], c[1], c[2])
    const d = lum(g[p], g[p + 1], g[p + 2])
    const ratio = (Math.max(a, d) + 0.05) / (Math.min(a, d) + 0.05)
    ratios.push(ratio)
    if (ratio < 3) under3++
    if (ratio < 2) {
      under2++
      sum.n++
      for (let i = 0; i < 3; i++) {
        sum.ink[i] += c[i]
        sum.ground[i] += g[p + i]
      }
    }
  }
  if (!ink) return { ink: 0, share: 0 }
  ratios.sort((x, y) => x - y)
  const mean = (v) => v.map((x) => Math.round(x / Math.max(1, sum.n)))
  return {
    ink,
    share: Number((ink / seen).toFixed(3)),
    under2: Number((under2 / ink).toFixed(3)),
    under3: Number((under3 / ink).toFixed(3)),
    median: Number(ratios[Math.floor(ratios.length / 2)].toFixed(2)),
    ...(sum.n ? { faintInk: mean(sum.ink), faintGround: mean(sum.ground) } : {})
  }
}
