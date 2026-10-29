/**
 * The overlap safety net of a brief build (spec TracyHQ/tracy#189): a picture the build placed that lies over a heading, a
 * paragraph, a button or the logo, at any of the widths a visitor uses, is found here so the build can take it off.
 *
 * Only a browser knows where a picture lands, and only the host has one (`browser.js`; tracy-web has none), so this is
 * the browser half: open a page at each width and read, for every picture of the build (`src` under a folder the caller
 * names), which words it covers. A picture covers words when its VISIBLE pixels lie on them:
 *
 *   a transparent picture (a figure on a clear ground) covers words where its opaque pixels fall on them, whether it is
 *   painted above or below them: a figure behind a headline still makes it unreadable
 *   an opaque picture covers words only where it is painted above them (the browser's own hit test says so): a caption
 *   the template sets over a photo is the template's design, not an overlap
 *   a backdrop (an opaque picture as wide as the page) is the ground the words are written on, never an overlap
 *
 * `overlapFindings` (pure) turns the reads into the pictures to take off, each with the widths and words it covered. The
 * undo is the head block's `pictures` (`leftoverHeadBlock`): the picture is hidden wherever it is shown, nothing else
 * of the page moves. No template, class or trade is named.
 */

/** The widths a visitor uses: desktop, small laptop, tablet, phone. */
export const OVERLAP_WIDTHS = Object.freeze([1440, 1024, 768, 390])
/** A word block counts as covered from this share of its sampled points. */
export const COVERED_SHARE = 0.1
/** An opaque picture at least this share of the viewport wide is a backdrop. */
const BACKDROP_SHARE = 0.9

/**
 * Runs in the page: every picture under `folder` and the words it covers.
 * @param {{folder: string, coveredShare: number, backdropShare: number}} args
 */
function readInPage({ folder, coveredShare, backdropShare }) {
  const view = { width: window.innerWidth }
  const shown = (el) => {
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return (
      s.display !== 'none' &&
      s.visibility !== 'hidden' &&
      Number(s.opacity) > 0.05 &&
      r.width > 2 &&
      r.height > 2
    )
  }
  const WORDS = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,button,a.btn,.btn,[role="button"],input[type="submit"]'
  const LOGO = '[class*="logo"],[class*="brand"],[id*="logo"]'
  const targets = []
  for (const el of document.querySelectorAll(`${WORDS},${LOGO}`)) {
    if (!shown(el)) continue
    const isLogo = el.matches(LOGO)
    const text = (el.innerText || el.value || '').trim()
    if (!isLogo && !text) continue
    // The innermost block only: a paragraph inside a list item is read once.
    if (!isLogo && el.querySelector(WORDS)) continue
    const kind = isLogo
      ? 'logo'
      : /^H\d$/.test(el.tagName)
        ? 'heading'
        : el.matches('button,a.btn,.btn,[role="button"],input[type="submit"]')
          ? 'button'
          : 'text'
    targets.push({ el, kind, text: text.slice(0, 80), rect: el.getBoundingClientRect() })
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const out = []
  for (const img of document.querySelectorAll('img')) {
    const src = img.currentSrc || img.src || ''
    if (!src.includes(folder) || !img.complete || !img.naturalWidth || !shown(img)) continue
    const r = img.getBoundingClientRect()
    let alpha = null
    try {
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    } catch {
      alpha = null
    }
    const at = (x, y) => (alpha ? alpha[(y * canvas.width + x) * 4 + 3] : 255)
    // Where a page point falls in the picture, after its object-fit (fill, contain or cover, centred).
    const fit = getComputedStyle(img).objectFit
    const sx = r.width / img.naturalWidth
    const sy = r.height / img.naturalHeight
    const scale = fit === 'contain' ? Math.min(sx, sy) : fit === 'cover' ? Math.max(sx, sy) : null
    const toImage = (px, py) => {
      if (!scale) return [Math.floor((px - r.left) / sx), Math.floor((py - r.top) / sy)]
      const ox = r.left + (r.width - img.naturalWidth * scale) / 2
      const oy = r.top + (r.height - img.naturalHeight * scale) / 2
      return [Math.floor((px - ox) / scale), Math.floor((py - oy) / scale)]
    }
    const inside = (x, y) => x >= 0 && y >= 0 && x < img.naturalWidth && y < img.naturalHeight
    let clear = false
    if (alpha)
      for (let y = 0; y < img.naturalHeight && !clear; y += Math.max(1, Math.floor(img.naturalHeight / 24)))
        for (let x = 0; x < img.naturalWidth; x += Math.max(1, Math.floor(img.naturalWidth / 24)))
          if (at(x, y) < 32) {
            clear = true
            break
          }
    if (!clear && r.width >= backdropShare * view.width) continue
    const covers = []
    for (const t of targets) {
      if (t.el.contains(img) || img.contains(t.el)) continue
      const left = Math.max(r.left, t.rect.left)
      const right = Math.min(r.right, t.rect.right)
      const top = Math.max(r.top, t.rect.top)
      const bottom = Math.min(r.bottom, t.rect.bottom)
      if (right <= left || bottom <= top) continue
      let hit = 0
      let total = 0
      for (let i = 0; i < 12; i += 1)
        for (let j = 0; j < 4; j += 1) {
          const px = t.rect.left + ((i + 0.5) * t.rect.width) / 12
          const py = t.rect.top + ((j + 0.5) * t.rect.height) / 4
          total += 1
          if (px < left || px > right || py < top || py > bottom) continue
          const [x, y] = toImage(px, py)
          if (!inside(x, y) || at(x, y) < 64) continue
          if (!clear) {
            const above = document.elementFromPoint(px, py)
            if (!(above === img || img.contains(above))) continue
          }
          hit += 1
        }
      if (hit / total >= coveredShare)
        covers.push({ kind: t.kind, text: t.text, share: Number((hit / total).toFixed(2)) })
    }
    if (covers.length)
      out.push({
        src: new URL(src, location.href).pathname.replace(/^\/+/, ''),
        clear,
        box: {
          left: Math.round(r.left),
          top: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height)
        },
        covers
      })
  }
  return out
}

/**
 * Read one page at every width: the pictures under `folder` that cover words.
 * @param {import('playwright').Page} page - a page already opened on the site
 * @param {string} url
 * @param {{folder?: string, widths?: readonly number[], height?: number, settleMs?: number}} [options]
 * @returns {Promise<Array<{width: number, src: string, clear: boolean, box: object, covers: any[]}>>}
 */
export async function readPictureOverlaps(page, url, options = {}) {
  const { folder = 'tracy-content/', widths = OVERLAP_WIDTHS, height = 900, settleMs = 300 } = options
  const out = []
  for (const width of widths) {
    await page.setViewportSize({ width, height })
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForTimeout(settleMs)
    const found = await page.evaluate(readInPage, {
      folder,
      coveredShare: COVERED_SHARE,
      backdropShare: BACKDROP_SHARE
    })
    for (const f of found) out.push({ width, ...f })
  }
  return out
}

/**
 * The pictures to take off: each picture that covered words at any width, once, with every width and word it covered.
 * @param {Array<{width: number, src: string, covers: Array<{kind: string, text: string}>}>} reads
 * @returns {Array<{src: string, widths: number[], covers: Array<{kind: string, text: string}>}>}
 */
export function overlapFindings(reads) {
  const by = new Map()
  for (const r of reads ?? []) {
    const f = by.get(r.src) ?? { src: r.src, widths: [], covers: [] }
    if (!f.widths.includes(r.width)) f.widths.push(r.width)
    for (const c of r.covers ?? [])
      if (!f.covers.some((x) => x.kind === c.kind && x.text === c.text))
        f.covers.push({ kind: c.kind, text: c.text })
    by.set(r.src, f)
  }
  return [...by.values()].map((f) => ({ ...f, widths: f.widths.sort((a, b) => b - a) }))
}
