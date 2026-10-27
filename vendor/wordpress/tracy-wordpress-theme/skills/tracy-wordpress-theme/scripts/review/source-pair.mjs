// source-pair.mjs — what the dark scans (leak-scan white/darktext, contrast-audit) read on a page,
// as records, and whether a record's counterpart on the SOURCE — read by the same collector, in the
// same mode, at the same width — draws a value within the scanner's colour tolerance.
//
// 🔒 A DARK SCAN IS COMPARED WITH THE SOURCE IN DARK, AS PARITY IS. The white-surface and contrast
// scans judged the site alone, so everything the source draws itself in dark came back every run:
// JA Vega /typography — a `spinner-grow text-light` at rgb(250,250,250), a primary card's header and
// text #c7ccd4 on #3b8bff (2.06) — and the home page's unselected carousel dots #e9ecef, each one the
// source's own value, measured on the source in dark (M4d, #27 item 2). After a fix moved the dots
// from #fff to the source's #e9ecef the old finding closed and a new one opened on the same dots.
// visual-qa.mjs now reads the source page with `inPageDarkRecords` once the source is read back dark,
// and passes the records to the scans; a record whose counterpart is certain is set apart as
// `sourceShared` with both measured values and the source element named — kept for audit, never a silent pass — and every
// other record stays a finding.
//
// What makes a counterpart certain (pairWithSource):
//   · the same WORDS (folded the way parity folds them: wptexturize's `…` is the source's `...`),
//     and either every place on the source that says them draws the same value, or both sides say
//     them at the same number of places and the place in the same order draws it — "Header" on two
//     cards pairs card for card, never with a card of another colour;
//   · an element with NO words (a carousel dot) pairs only by its tag and rendered size, in order,
//     and only when both sides have exactly as many visible elements of that tag and size.
// A class name, a colour the source uses on another element, other counts, the source in another
// mode or at another width: no counterpart. The bright-border scan pairs through the same function.
//
// `inPageDarkRecords` runs in the page (serialised by Playwright): it may use nothing from here.

/**
 * Every record the dark scans read on the page, in the page, with what pairs it:
 * `{ width, counts, white, darktext, contrast }`. `counts` is, for each identity (`t:<words>` or
 * `∅ TAG WxH` for an element without words), how many places on the page have it; each record
 * carries its `ident`, the order of its place among them (`nth`, from 1) and `count`.
 */
export function inPageDarkRecords({ min = '3.0' } = {}) {
  const MOTION_STATE = /^tracy-motion-(?:on|in|bold|done)$/
  const classes = (e) => String(e.className && e.className.toString ? e.className.toString() : '').trim().split(/\s+/).filter((c) => c && !MOTION_STATE.test(c))
  const fold = (s) =>
    String(s ?? '')
      .replace(/‑/g, '-')
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/…/g, '...')
      .replace(/—/g, '--')
      .replace(/–/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
  const parseRgb = (c) => {
    const m = c.match(/rgb\((\d+), (\d+), (\d+)/)
    return m ? [+m[1], +m[2], +m[3]] : null
  }
  const parse = (c) => {
    const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/)
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null
  }
  // the leak scan's visibility, unchanged
  const visible = (e) => {
    if (e.hidden) return false
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.4) return false
    if (!e.offsetParent && cs.position !== 'fixed') return false
    const r = e.getBoundingClientRect()
    return r.width > 4 && r.height > 4
  }
  // Words drawn at 0 px are no text a reader sees (#27 item 1): an icon link's label kept for screen
  // readers. A transparent fill is already below every alpha floor the scans use.
  const zeroSize = (cs) => parseFloat(cs.fontSize) === 0
  const ownWords = (e) =>
    [...e.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('')
      .trim()
  // ── identity: words and place, or tag and size ──
  const textOf = (e) => fold(e.textContent)
  const placeOf = new Map()
  const order = new Map() // ident → [place, …] in document order
  let places = 0
  const identOf = (e) => {
    const t = textOf(e)
    if (t) return `t:${t}`
    const r = e.getBoundingClientRect()
    return `∅ ${e.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`
  }
  const place = (e) => {
    if (placeOf.has(e)) return placeOf.get(e)
    const ident = identOf(e)
    const up = e.parentElement
    const p = ident.startsWith('t:') && up && up !== document.body && placeOf.has(up) && placeOf.get(up).ident === ident ? placeOf.get(up) : { ident, id: ++places }
    placeOf.set(e, p)
    const list = order.get(ident) ?? []
    if (!list.includes(p.id)) list.push(p.id)
    order.set(ident, list)
    return p
  }
  const all = [...document.body.querySelectorAll('*')]
  for (const e of all) if (visible(e)) place(e)
  const record = (e, i, extra) => {
    const p = place(e)
    return { el: i, tag: e.tagName, cls: classes(e).join('.'), ident: p.ident, text: p.ident.startsWith('t:') ? p.ident.slice(2) : '', ...extra }
  }
  const white = []
  const darktext = []
  const contrast = []
  // contrast (contrast-audit.mjs), unchanged but for the 0 px words
  const lin = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  const ratio = (a, b) => {
    const l1 = L(a)
    const l2 = L(b)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }
  const colorText = (c) => c[3] === 1 ? `rgb(${c.slice(0, 3).join(', ')})` : `rgba(${c.join(', ')})`
  const effBg = (e) => {
    for (let n = e; n; n = n.parentElement) {
      const cs = getComputedStyle(n)
      const c = parse(cs.backgroundColor)
      if (c && c[3] >= 0.55) return c
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null
    }
    return [17, 21, 31, 1]
  }
  all.forEach((e, i) => {
    const cs = getComputedStyle(e)
    // white surfaces (leak-scan white)
    if (visible(e)) {
      const c = parseRgb(cs.backgroundColor)
      if (c && c[0] > 225 && c[1] > 222 && c[2] > 216) {
        const k = (classes(e).join(' ') || e.tagName).slice(0, 44)
        white.push(record(e, i, { k, value: `rgb(${c})`, line: `bg rgb(${c[0]},${c[1]},${c[2]})  ${e.tagName}.${k}` }))
      }
    }
    const txt = ownWords(e)
    if (!txt || txt.length < 2 || zeroSize(cs)) return
    // near-black words on a dark surface (leak-scan darktext)
    if (visible(e)) {
      const fg = parseRgb(cs.color)
      if (fg && fg[0] * 0.299 + fg[1] * 0.587 + fg[2] * 0.114 <= 80) {
        let bg = [17, 21, 31]
        for (let n = e; n; n = n.parentElement) {
          const s = getComputedStyle(n).backgroundColor
          const bc = parseRgb(s)
          if (bc && s.includes('rgb(')) {
            bg = bc
            break
          }
        }
        if (bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114 <= 110) {
          const k = `${e.tagName}.${classes(e).join('.')}`.slice(0, e.tagName.length + 27)
          darktext.push(record(e, i, { k, value: `rgb(${fg})|rgb(${bg})`, line: `text rgb(${fg}) on rgb(${bg})  ${k}  "${txt.slice(0, 20)}"` }))
        }
      }
    }
    // text below the contrast floor (contrast-audit)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.4 || !e.offsetParent) return
    const rc = e.getBoundingClientRect()
    if (rc.width < 4 || rc.height < 6) return
    const fg = parse(cs.color)
    if (!fg || fg[3] < 0.4) return
    const bg = effBg(e)
    if (!bg) return
    const cr = ratio(fg, bg)
    if (cr >= parseFloat(min)) return
    const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 600)
    const k = `${e.tagName}.${classes(e).join('.')}`.slice(0, e.tagName.length + 31)
    const finding = { cr: cr.toFixed(2), need: large ? 3.0 : 4.5, k, txt: txt.slice(0, 24), fg: colorText(fg), bg: colorText(bg) }
    contrast.push(record(e, i, { k, value: `${finding.fg}|${finding.bg}`, finding }))
  })
  const counts = {}
  const nth = (r) => {
    const list = order.get(r.ident) ?? []
    const p = placeOf.get(all[r.el])
    return { nth: list.indexOf(p.id) + 1, count: list.length }
  }
  for (const [ident, list] of order) counts[ident] = list.length
  for (const list of [white, darktext, contrast]) for (const r of list) Object.assign(r, nth(r))
  return { width: innerWidth, counts, white, darktext, contrast }
}

/**
 * Why `source` cannot be compared with a page read at `width` in dark (null: it can). The source must
 * prove it is a dark counterpart: `mode: 'dark'` and the width it was read at, equal to the page's. A
 * source that says another mode or width — or does not say one, or a page whose width is unknown — is
 * no counterpart of anything; unproven metadata never sets a finding apart.
 */
export function sourceRefusal(source, { width = null } = {}) {
  if (!source) return null
  if (source.mode === undefined || source.mode === null) return 'the source does not say which mode it was read in'
  if (source.mode !== 'dark') return `the source was read in ${source.mode} mode, not in dark mode`
  if (typeof source.width !== 'number') return 'the source does not say at which width it was read'
  if (typeof width !== 'number') return 'the page width is unknown, so no source width can be shown to match it'
  if (source.width !== width) return `the source was read at width ${source.width}, the page at width ${width}`
  return null
}

/**
 * The source counterpart of one record, or why there is none. `records` are the source's records of
 * the same kind, `counts` its places per identity, `same(sourceRecord)` whether it draws the record's
 * value. Words: certain when every source place of them draws it, or when both sides have the same
 * number of places and the one in the same order draws it. No words (`textless: true` only): the same
 * tag and size, the same number on both sides, the one in the same order.
 */
export function pairWithSource(record, records, counts, same, { textless = true } = {}) {
  const ident = record.ident ?? (record.text ? `t:${record.text}` : null)
  const words = Boolean(ident?.startsWith('t:'))
  if (!ident || (!words && !textless)) return { match: false, reason: 'the element says no words to pair by' }
  const n = counts?.[ident] ?? 0
  if (!n) return { match: false, reason: words ? 'the source says these words nowhere' : 'the source has no visible element of this tag and size' }
  const hits = (records ?? []).filter((r) => (r.ident ?? (r.text ? `t:${r.text}` : null)) === ident && same(r))
  const drawn = new Set(hits.map((r) => r.nth ?? r.place))
  if (words && drawn.size >= n) return { match: true, by: 'every place', source: hits[0] }
  if (typeof record.nth === 'number' && record.count === n) {
    const hit = hits.find((r) => r.nth === record.nth)
    if (hit) return { match: true, by: 'order', source: hit }
  }
  if (!hits.length) return { match: false, reason: 'the source draws another value here' }
  return { match: false, reason: `ambiguous: ${drawn.size} of ${n} source places draw this, the page has ${record.count ?? '?'} and the one in the same order does not` }
}

/** The source element a match names: `TAG.class.class`. */
export const sourceLabel = (r) => `${r.tag}${r.cls ? '.' + r.cls : ''}`

// The parity colour comparator uses ±8/255 per RGB channel. Scans use the same tolerance for RGB
// and alpha (alpha deltas are scaled to 0–255): small renderer/token rounding differences are
// source-shared, while parse failures or larger deltas leave the scan finding open.
export const SOURCE_COLOUR_TOLERANCE = 8
export function coloursWithinTolerance(site, source, tolerance = SOURCE_COLOUR_TOLERANCE) {
  const sitePair = String(site ?? '').split('|')
  const sourcePair = String(source ?? '').split('|')
  if (sitePair.length !== sourcePair.length) return false
  if (sitePair.length > 1) {
    return sitePair.length === 2 && sitePair.every((value, i) => coloursWithinTolerance(value, sourcePair[i], tolerance))
  }
  const parse = (value) => {
    const text = String(value ?? '').trim().toLowerCase()
    const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(text)?.[1]
    if (hex) {
      const expanded = hex.length <= 4 ? [...hex].map((x) => x + x).join('') : hex
      const channels = expanded.match(/.{2}/g).map((x) => parseInt(x, 16))
      return [channels[0], channels[1], channels[2], channels[3] === undefined ? 1 : channels[3] / 255]
    }
    const fn = /^rgba?\((.*)\)$/i.exec(text)?.[1]
    if (fn === undefined) return null
    let parts
    if (fn.includes(',')) parts = fn.split(',').map((x) => x.trim())
    else {
      const [channels, alpha] = fn.split('/').map((x) => x.trim())
      parts = [...channels.split(/\s+/), ...(alpha === undefined ? [] : [alpha])]
    }
    if (parts.length < 3 || parts.length > 4) return null
    const channel = (v) => {
      if (/^-?(?:\d+\.?\d*|\.\d+)%$/.test(v)) return parseFloat(v) * 2.55
      if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(v)) return Number(v)
      return NaN
    }
    const alpha = (v) => {
      if (v === undefined) return 1
      if (/^(?:\d+\.?\d*|\.\d+)%$/.test(v)) return parseFloat(v) / 100
      if (/^(?:\d+\.?\d*|\.\d+)$/.test(v)) return Number(v)
      return NaN
    }
    const out = [channel(parts[0]), channel(parts[1]), channel(parts[2]), alpha(parts[3])]
    return out.every(Number.isFinite) && out.slice(0, 3).every((n) => n >= 0 && n <= 255) && out[3] >= 0 && out[3] <= 1 ? out : null
  }
  const a = parse(site)
  const b = parse(source)
  return Boolean(a && b && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tolerance) && Math.abs(a[3] - b[3]) * 255 <= tolerance)
}
