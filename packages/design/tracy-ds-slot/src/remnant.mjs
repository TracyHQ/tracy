/**
 * How much of what a visitor SEES still wears the template's own colours under a worn system — by
 * area, off a photograph of the page, pictures left out.
 *
 * `follows` (probe.mjs) counts painted elements: a 760px hero ground and a caption's colour weigh the
 * same, and a kept band's text on its kept ground is not counted at all. So on WordPress Tracy
 * Business a page reported "92% follows" while ~90% of the first screen was the template's dark
 * hero, green topbar and orange words (12/10/2026, demodesignsystem.tracy.site under BMW). This reads
 * the screenshot instead: every pixel outside an image, video, canvas, frame or background picture,
 * its colour binned; the template's signature colours are the bins of its DEFAULT page; what is left
 * under a system is the share of pixels still in a signature bin that the system has no colour near.
 *
 * Two halves: `HISTOGRAM_PROBE` runs in the page (decodes a capture of that same page on a canvas),
 * `leftShare` is pure.
 */

/** Bin width per channel: 8 levels of 32 would merge #14171a and #262626; 32 levels of 8 keep them. */
export const BIN = 8

/**
 * Whether a box is laid BEHIND the page's flow: positioned with a negative z-index, it paints before
 * the in-flow boxes of its stacking context, so every opaque box over it hides it (JA Social II's
 * fixed backdrop photo, #features-bg at z-index -1). Pure: it runs in the page too.
 * @param {{ position: string, zIndex: string }} style  computed position and z-index
 */
export function paintsBehind(style) {
  return style.position !== 'static' && Number.parseInt(style.zIndex, 10) < 0
}

/**
 * In the page: the colour histogram of a capture (`png`, base64, taken at `scale`), pictures masked,
 * for the first screen (the top `screen` CSS pixels) and the whole page. Bins are `r,g,b` of the bin's
 * low corner; counts are pixels of the capture.
 * @param {string} png
 * @param {number} scale
 * @param {number} screen  CSS pixels of the first screen (the viewport height)
 */
export const histogramProbe = (png, scale, screen, mask = []) => `(async () => {
  const BIN = ${BIN}
  // bands the contract keeps whole (keepWhole) are the template's by agreement: masked like pictures,
  // out of the numerator and the denominator (spec decision 4)
  const MASK = ${JSON.stringify(mask)}
  const box = (e) => { const r = e.getBoundingClientRect(); return [r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY].map((v) => v * ${scale}) }
  const opaque = (e) => { const m = getComputedStyle(e).backgroundColor.match(/[\\d.]+/g); return !!m && (m.length < 4 || +m[3] > 0.9) && getComputedStyle(e).backgroundImage === 'none' }
  // a picture masks only where it shows: a solid box set over a background picture (JA Impact's orange
  // call band on its photo section) is a hole in that mask, its colour counted
  // a picture laid behind the page (paintsBehind: a fixed backdrop at a negative z-index) shows only
  // where nothing opaque is drawn over it: every opaque box of the page that is not its ancestor is a
  // hole, not only the boxes inside it
  ${paintsBehind.toString()}
  const all = [...document.querySelectorAll('*')]
  const pics = all
    .filter((e) => /^(IMG|VIDEO|CANVAS|IFRAME|PICTURE|OBJECT|EMBED)$/.test(e.tagName) || e.tagName.toLowerCase() === 'image' || /url\\(/.test(getComputedStyle(e).backgroundImage))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
    .map((e) => ({ r: box(e), holes: /^(IMG|VIDEO|CANVAS|IFRAME|PICTURE|OBJECT|EMBED)$/.test(e.tagName) ? [] : (paintsBehind(getComputedStyle(e)) ? all.filter((o) => o !== e && !o.contains(e)) : [...e.querySelectorAll('*')]).filter(opaque).map(box).filter((h) => h[2] > h[0] && h[3] > h[1]) }))
    .concat(MASK.flatMap((s) => { try { return [...document.querySelectorAll(s)] } catch { return [] } }).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }).map((e) => ({ r: box(e), holes: [] })))
  const img = new Image()
  img.src = 'data:image/png;base64,${png}'
  await img.decode()
  const cv = document.createElement('canvas')
  cv.width = img.width
  cv.height = img.height
  const cx = cv.getContext('2d', { willReadFrequently: true })
  cx.drawImage(img, 0, 0)
  const d = cx.getImageData(0, 0, cv.width, cv.height).data
  const top = Math.round(${screen} * ${scale})
  const page = {}
  const first = {}
  let pagePx = 0
  let firstPx = 0
  // a row's picture spans, so each pixel is tested against the few rects that cross its row
  for (let y = 0; y < cv.height; y++) {
    const spans = pics.filter((p) => y >= p.r[1] && y < p.r[3]).map((p) => ({ r: p.r, holes: p.holes.filter((h) => y >= h[1] && y < h[3]) }))
    for (let x = 0; x < cv.width; x++) {
      if (spans.some((p) => x >= p.r[0] && x < p.r[2] && !p.holes.some((h) => x >= h[0] && x < h[2]))) continue
      const i = (y * cv.width + x) * 4
      const k = (d[i] - (d[i] % BIN)) + ',' + (d[i + 1] - (d[i + 1] % BIN)) + ',' + (d[i + 2] - (d[i + 2] % BIN))
      page[k] = (page[k] || 0) + 1
      pagePx++
      if (y < top) { first[k] = (first[k] || 0) + 1; firstPx++ }
    }
  }
  return { page, pagePx, first, firstPx }
})()`

const rgbOf = (hex) => {
  const x = String(hex ?? '').replace('#', '')
  const f = x.length === 3 ? [...x].map((c) => c + c).join('') : x.slice(0, 6)
  return /^[0-9a-f]{6}$/i.test(f) ? [0, 2, 4].map((i) => Number.parseInt(f.slice(i, i + 2), 16)) : null
}
const binRgb = (k) => k.split(',').map((v) => Number(v) + BIN / 2)
const far = (a, b, tol) => a.some((v, i) => Math.abs(v - b[i]) > tol)

/**
 * The template's signature: the bins of its default page that cover at least `min` of the measured
 * (non-picture) pixels.
 * @param {Record<string, number>} hist
 * @param {number} total
 */
export function signature(hist, total, min = 0.003) {
  return Object.entries(hist)
    .filter(([, n]) => total > 0 && n / total >= min)
    .map(([k]) => k)
}

/**
 * Of the pixels a worn page shows (pictures left out), the share still in one of the template's
 * signature bins with no colour of the system within `tol` (max channel distance). 0 = nothing of the
 * template's own colours is left; 1 = the page looks as it did.
 * @param {Record<string, number>} hist   the worn page's histogram
 * @param {number} total                  its pixel count
 * @param {string[]} sig                  signature bins of the default page
 * @param {string[]} systemColours        hex colours the worn system paints with (tokens, band colours)
 * @returns {{ share: number | null, worst: { bin: string, share: number }[] }}
 */
export function leftShare(hist, total, sig, systemColours, tol = 20) {
  if (!total) return { share: null, worst: [] }
  const sys = systemColours.map(rgbOf).filter(Boolean)
  const sigRgb = sig.map((k) => [k, binRgb(k)])
  let left = 0
  const worst = {}
  for (const [k, n] of Object.entries(hist)) {
    const c = binRgb(k)
    if (!sigRgb.some(([, s]) => !far(c, s, BIN))) continue
    if (sys.some((s) => !far(c, s, tol))) continue
    left += n
    worst[k] = (worst[k] ?? 0) + n
  }
  return {
    share: Math.round((left / total) * 1000) / 1000,
    worst: Object.entries(worst)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([bin, n]) => ({ bin: `rgb(${bin})`, share: Math.round((n / total) * 1000) / 1000 }))
  }
}
