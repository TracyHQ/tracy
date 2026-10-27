/**
 * Words laid straight on a photograph that the system recoloured into the photograph's tones (Akemi's
 * eye check of JA Tour, 17/10/2026: the tour cards' "ALASKA" label, light on the template, took a dim
 * slate under Moxie and sank into the picture). The base probe and every contrast rule stop at a
 * picture: they have no colour to hold the words against. veil-text reads words over a veil only.
 *
 * In the page: every text whose own words lie on a photograph (an image, or the background picture of a
 * block narrower than the page; a full-width band's picture is a texture or a fade its ground shows through)
 * with no fill in between, its colour and its box. Then (`read`) the page is shot with every text made
 * transparent, as flow.mjs reads a picture's ground, and each text's ground is the mean colour of its box
 * on that shot: the photograph the visitor sees under the words.
 * A finding is a text that reads under `FLOOR` on its photograph on the worn page and read at least that on
 * the template's page. Without a shot (a box below the 30000 px a capture holds) the words are held against
 * the side the template chose: light words were set for a dark photograph (`DARK`), dark words for a light
 * one (`LIGHT`), mid-tone words are left out. That guess was the whole detector until JA Resume's menu
 * (18/10/2026): dark words the template laid on its dark hero photograph, all but unreadable on the
 * template's own page, read as set for a light photograph, so the system's light menu over that photograph,
 * the one that reads, was the finding.
 */
import { byPath, dist, hex, lum, PAGE_HELPERS, ratio } from './lib/colour.mjs'

export const kind = 'photo-text'
/** Dormant until the preview probe reaches this version (index.mjs). */
export const since = 10

export const PHOTO_LIMITS = Object.freeze({
  floor: 3,
  /** words within this channel distance of their colour on the template's page were not recoloured */
  sameColour: 6,
  /** a dark photograph's tone, and a light one's */
  dark: { r: 51, g: 51, b: 51, a: 1 },
  light: { r: 224, g: 224, b: 224, a: 1 },
  /** light words from this luminance, dark words up to that one */
  lightFrom: 0.4,
  darkTo: 0.1
})

export const probe = `(() => {${PAGE_HELPERS}
  // a photograph: an image element, or a background picture on a block narrower than the page. A full-width
  // band's background picture is most often a texture or a faded photo the band's ground shows through (JA Tour's
  // world map dots and masthead fade): its words follow the band's ground, which the other rules judge
  const photo = (x, r) => /^(IMG|VIDEO|PICTURE|CANVAS)$/.test(x.tagName) || (/url\\(/.test(getComputedStyle(x).backgroundImage) && r.width < W * 0.9)
  // every photograph of the page with its box (the probe reads below the first screen too)
  const pics = []
  for (const x of document.querySelectorAll('body *')) {
    const r = x.getBoundingClientRect()
    if (r.width >= 40 && r.height >= 40 && photo(x, r)) pics.push({ x, r })
  }
  const covers = (r, px, py) => px >= r.left && px <= r.right && py >= r.top && py <= r.bottom
  // words an ancestor that clips its overflow cuts away are not seen: a carousel's slides off its window (JA Vogue
  // 1.0.7 home-6, 18/10/2026: the Owl stage runs left of its window, the hidden slides' words lay over the
  // next column's photograph)
  const clipped = (e, px, py) => { for (let x = e.parentElement; x && x !== document.body && x !== document.documentElement; x = x.parentElement) { const xs = getComputedStyle(x); if (/hidden|clip|scroll|auto/.test(xs.overflowX + ' ' + xs.overflowY) && !covers(x.getBoundingClientRect(), px, py)) return true } return false }
  const out = []
  for (const e of document.querySelectorAll('body *')) {
    if (out.length >= 300) break
    // words of an inline SVG drawing (its <text>) are painted by the drawing's fill and belong to the picture, as
    // words inside an <img> do (JA Kinetic WP's drawn terminal laid over its picture, 20/10/2026; an SVG <text>
    // has no innerText either, and reading one threw, leaving the page unmeasured)
    if (e.closest('svg')) continue
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || (parseFloat(cs.fontSize) || 0) < 8) continue
    // the words' own lines (an element's box may hold a picture beside them: JA Seven's article paragraph
    // holds its lead image above its words, 18/10/2026), else the element's box
    let t = null
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue
      const rg = document.createRange()
      rg.selectNodeContents(n)
      for (const q of rg.getClientRects()) {
        if (q.width < 1 || q.height < 1) continue
        t = t ? { left: Math.min(t.left, q.left), top: Math.min(t.top, q.top), right: Math.max(t.right, q.right), bottom: Math.max(t.bottom, q.bottom) } : { left: q.left, top: q.top, right: q.right, bottom: q.bottom }
      }
    }
    const tb = t ? { left: t.left, top: t.top, width: t.right - t.left, height: t.bottom - t.top } : r
    const px = tb.left + tb.width / 2, py = tb.top + tb.height / 2
    if (clipped(e, px, py)) continue
    // up the ancestors: a fill (or a veil, veil-text's) first means a colour ground; a picture of that
    // ancestor (its own background, or an image inside it laid under the words) first means a photograph
    let on = null
    for (let x = e; x && x !== document.documentElement && !on; x = x.parentElement) {
      const xs = getComputedStyle(x)
      if (/url\\(/.test(xs.backgroundImage) && photo(x, x.getBoundingClientRect())) on = 'picture'
      else if (pics.some((p) => p.x !== x && x.contains(p.x) && !p.x.contains(e) && covers(p.r, px, py))) on = 'picture'
      else { const f = ch(xs.backgroundColor); if (f && f.a > 0.3) on = 'fill' }
    }
    if (on !== 'picture') continue
    out.push({ path: pathOf(e), at: label(e), text: e.innerText.trim().slice(0, 30), colour: ch(cs.color), box: [tb.left, tb.top + scrollY, tb.width, tb.height].map(Math.round) })
  }
  return out
})()`

/** The shot's scale: a 1440 px page is read at 720 px, enough for the mean colour of a word's box. */
const SHOT_SCALE = 0.5

/**
 * The photograph under each text: the page shot with every text transparent (pictures made eager first, as
 * flow.mjs does), the mean colour of each text's box read off it in the page. Texts and transitions come
 * back as they were. @param {any} chrome @param {any[]} data
 */
export async function read(chrome, data) {
  if (!Array.isArray(data) || !data.length || typeof chrome?.capture !== 'function') return data
  await chrome.evaluate(
    `(async () => { const imgs = [...document.images].filter((i) => i.loading === 'lazy' || !i.complete); for (const i of imgs) i.loading = 'eager'; await Promise.race([Promise.all(imgs.map((i) => i.decode().catch(() => 0))), new Promise((r) => setTimeout(r, 8000))]); const st = document.createElement('style'); st.id = 'ds-photo-ground'; st.textContent = '*,*::before,*::after,*::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;transition:none!important}'; document.head.appendChild(st); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return imgs.length })()`
  )
  let png = ''
  try {
    png = await chrome.capture(SHOT_SCALE)
  } finally {
    await chrome.evaluate(
      `(async () => { const st = document.getElementById('ds-photo-ground'); if (st) { st.textContent = '*,*::before,*::after{transition:none!important}'; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); st.remove() } return 1 })()`
    )
  }
  if (!png) return data
  const grounds = await chrome.evaluate(`(async () => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + ${JSON.stringify(png)}
    await img.decode()
    const cv = document.createElement('canvas')
    cv.width = img.naturalWidth
    cv.height = img.naturalHeight
    const cx = cv.getContext('2d', { willReadFrequently: true })
    cx.drawImage(img, 0, 0)
    return ${JSON.stringify(data.map((d) => d.box ?? null))}.map((b) => {
      if (!b) return null
      const X = Math.max(0, Math.floor(b[0] * ${SHOT_SCALE})), Y = Math.max(0, Math.floor(b[1] * ${SHOT_SCALE}))
      const W = Math.min(cv.width - X, Math.max(1, Math.round(b[2] * ${SHOT_SCALE}))), H = Math.min(cv.height - Y, Math.max(1, Math.round(b[3] * ${SHOT_SCALE})))
      if (W < 1 || H < 1) return null
      const d = cx.getImageData(X, Y, W, H).data
      const m = [0, 0, 0]
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += d[i + k]
      const n = d.length / 4
      return { r: Math.round(m[0] / n), g: Math.round(m[1] / n), b: Math.round(m[2] / n), a: 1 }
    })
  })()`)
  return data.map((d, i) => (grounds?.[i] ? { ...d, ground: grounds[i] } : d))
}

/** The stand-in photograph the template set these words for, or null for mid-tone words. @param {any} c */
export const photoFor = (c, t = PHOTO_LIMITS) =>
  !c ? null : lum(c) >= t.lightFrom ? t.dark : lum(c) <= t.darkTo ? t.light : null

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }, t = PHOTO_LIMITS) {
  const plainOf = byPath(plain?.data)
  const findings = []
  for (const w of worn?.data ?? []) {
    const was = plainOf.get(w.path)
    if (!was?.colour || !w.colour) continue
    // words the system left in the template's own colour were not recoloured: under the system's face the
    // box only lies over another stretch of the same photograph (JA Impact WordPress's fund card excerpts,
    // #dee2e6 on the template's page and worn, 3.05:1 there and 2.88:1 where the narrower lines end,
    // 19/10/2026). The template's choice of words on its photograph is not the system's finding
    if (dist(w.colour, was.colour) <= t.sameColour) continue
    // the photograph each page shows under the words, else the stand-in the template's colour implies
    const shot = w.ground && was.ground
    const photo = shot ? null : photoFor(was.colour, t)
    if (!shot && !photo) continue
    const now = ratio(w.colour, shot ? w.ground : photo)
    const then = ratio(was.colour, shot ? was.ground : photo)
    if (now >= t.floor || then < t.floor) continue
    findings.push({
      at: w.at,
      text: w.text,
      why: `${hex(was.colour)} became ${hex(w.colour)} on a photograph${shot ? ` (${hex(w.ground)}: ${now.toFixed(2)}:1, was ${then.toFixed(2)}:1)` : ''}`,
      by: 'system'
    })
  }
  return { count: findings.length, findings }
}
