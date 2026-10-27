// The `heights` check of site-sweep.mjs, the reading half: per route × width, on both sides, the page height and the top-level BANDS of the page
// (header, each band of main in order, footer) with their y and height and, inside each band, the boxes a height difference can be told from
// (children, columns, padding, font, picture box). The comparison is site-sweep-heights-judge.mjs.
//
// WHY. A port's page is taller or shorter than the source's at some widths because the layout steps at other widths (a breakpoint at 992 instead of
// 1200, a container width step, a column count, a padding step, an image ratio, a band printed twice or missing). No other check measures it.
//
// READING. Every cell is a FRESH load at its own width (a page that was resized keeps a layout a script sized at the first width), read after
// `document.fonts.ready`, after a scroll through the page that loads the pictures in it, and when the layout is quiet: three readings 250 ms apart
// that agree, not before 1.5 s, not after a ceiling (a layout that never settles is NOT-MEASURED, never a defect).
import { withPage, mapLimit, withTimeout } from '../lib/browser.mjs'
import { DARK_DERIVED_REASON, darkPassGap } from './site-sweep-judge.mjs'
import { readSide } from './site-sweep-source-cache.mjs'

export const HEIGHTS_ID = 'heights'
export const HEIGHT_WIDTHS_EXTRA = [576, 992]
const SIDE_TIMEOUT_MS = 150000
const QUIET_STEP_MS = 250
const QUIET_MIN_MS = 1200
const QUIET_STABLE = 3
const QUIET_CEILING_MS = 7000
const IMAGES_CEILING_MS = 5000
const HEIGHT = 900

/** The widths the heights check reads: the sweep's own, plus 576 and 992 (where Bootstrap-style layouts step) unless the widths were given by hand. */
export function heightsWidths(widths, explicit = false) {
  return [...new Set(explicit ? widths : [...widths, ...HEIGHT_WIDTHS_EXTRA])].sort((a, b) => a - b)
}

/**
 * In the page: the flow of the page as bands. cfg: { selectors: {header?, main?, footer?}, shapeOnly? }.
 * → { doc, title, finalPath, lands, bands: [{kind: 'pre'|'header'|'band'|'footer'|'post', y, h, tree}] } (tree is absent with shapeOnly).
 */
export function heightsInPage(cfg) {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'META', 'BR'])
  const WRAPPER = /(^|\s)(entry-content|post-content|wp-block-post-content|content-inner|page-content|t4-section|t4-content-inner|site-main|site-content)(\s|$)/
  const px = (v) => parseFloat(v) || 0
  const r1 = (n) => Math.round(n * 10) / 10
  const pick = (sel) => {
    if (!sel) return null
    try {
      return document.querySelector(sel)
    } catch {
      return null
    }
  }
  const csMemo = new Map()
  const cs = (e) => {
    let s = csMemo.get(e)
    if (!s) csMemo.set(e, (s = getComputedStyle(e)))
    return s
  }
  // `landmarks`: the header and the footer (and what holds them) are bands even when they are out of flow (an overlay header), so that the two sides read them alike
  let header = null
  let footer = null
  const onPath = (k) => (header && k.contains(header)) || (footer && k.contains(footer))
  // ---- what is SEEN. One rule for every reading of a box (its words, its heading, its font, its pictures, its identity): a thing has ink when it is
  // displayed (no display:none, visibility, opacity:0 on it or above it), painted (the text colour is not transparent) and not cut away by a box that clips it
  // (overflow, clip, clip-path, a clip box of a pixel or less — the screen-reader-only idiom — or a place left of / above the page). No size is evidence of no
  // ink: a 12 px picture or a 2 px line of text is seen. The same rule runs when the depth or the budget of the tree folds a subtree into one leaf.
  const alphaOf = (c) => {
    if (!c || c === 'transparent') return 0
    const m = /^(?:rgba?|color)\((.*)\)$/.exec(c.trim())
    if (!m) return 1
    const parts = m[1].split(/[\s,/]+/).filter(Boolean)
    const a = /\//.test(m[1]) || parts.length === 4 ? parts[parts.length - 1] : '1'
    return /%$/.test(a) ? parseFloat(a) / 100 : parseFloat(a)
  }
  const BOUNDLESS = { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity }
  const meet = (a, b) => (a ? { l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) } : b)
  // the box a clip-path: inset(...) leaves of an element, or null
  const insetOf = (r, v) => {
    const m = /^inset\(([^)]*)\)/.exec(v)
    if (!m) return null
    const side = (t, whole) => (/%$/.test(t) ? (parseFloat(t) / 100) * whole : parseFloat(t) || 0)
    const w = m[1].split(/\s+round\s+/)[0].split(/\s+/).filter(Boolean)
    const [t, rt = t, bt = t, lt = rt] = w
    return { l: r.left + side(lt, r.width), t: r.top + side(t, r.height), r: r.right - side(rt, r.width), b: r.bottom - side(bt, r.height) }
  }
  // the box an element cuts ITS OWN painting to (clip on a positioned box, clip-path: inset), or null
  const ownCut = (e, s) => {
    let box = null
    if (s.clip && s.clip !== 'auto' && (s.position === 'absolute' || s.position === 'fixed')) {
      const r = e.getBoundingClientRect()
      const m = /^rect\(([^)]*)\)/.exec(s.clip)
      if (m) {
        const [t, rt, bt, lt] = m[1].split(/[\s,]+/).filter(Boolean).map((x) => (x === 'auto' ? NaN : parseFloat(x)))
        box = { l: Number.isNaN(lt) ? r.left : r.left + lt, t: Number.isNaN(t) ? r.top : r.top + t, r: Number.isNaN(rt) ? r.right : r.left + rt, b: Number.isNaN(bt) ? r.bottom : r.top + bt }
      }
    }
    if (s.clipPath && s.clipPath !== 'none') {
      const c = insetOf(e.getBoundingClientRect(), s.clipPath)
      if (c) box = meet(box, c)
    }
    return box
  }
  // → null when the element is not displayed, else the box (viewport coordinates) its painting is cut to ({±Infinity} when nothing cuts it)
  const shownMemo = new Map()
  const shownBox = (e) => {
    if (shownMemo.has(e)) return shownMemo.get(e)
    let clip = BOUNDLESS
    let hidden = false
    const own = cs(e)
    if (own.display === 'none' || own.visibility === 'hidden' || own.visibility === 'collapse') hidden = true
    let mode = own.position
    let via = null
    for (let a = e; a && !hidden; via = a, a = a.parentElement) {
      const s = cs(a)
      if (s.display === 'none' || parseFloat(s.opacity) === 0) hidden = true
      // what a closed <details> holds besides its first <summary>, and what a box with content-visibility: hidden holds, is not shown (its boxes keep their size)
      if (a.localName === 'details' && !a.open && via && via !== [...a.children].find((c) => c.localName === 'summary')) hidden = true
      if (a !== e && s.contentVisibility === 'hidden') hidden = true
      const cut = ownCut(a, s)
      if (cut) clip = meet(clip, cut)
      if (a !== document.body && a !== document.documentElement) {
        // a box cuts its own content; an absolutely positioned box is cut by the box it is placed in, not by the boxes it only sits inside
        const applies = a === e || (mode === 'fixed' ? false : mode === 'absolute' ? s.position !== 'static' : true)
        const ox = s.overflowX !== 'visible'
        const oy = s.overflowY !== 'visible'
        if (applies && (ox || oy)) {
          const r = a.getBoundingClientRect()
          clip = meet(clip, { l: ox ? r.left + a.clientLeft : -Infinity, t: oy ? r.top + a.clientTop : -Infinity, r: ox ? r.left + a.clientLeft + a.clientWidth : Infinity, b: oy ? r.top + a.clientTop + a.clientHeight : Infinity })
        }
      }
      if (a !== e && mode !== 'fixed') {
        if (s.position === 'absolute' || s.position === 'fixed') mode = s.position
        else if (mode === 'absolute' && s.position !== 'static') mode = 'static'
      }
    }
    const res = hidden ? null : clip
    shownMemo.set(e, res)
    return res
  }
  // does a box (a DOMRect) show any of itself inside `clip`? No size is asked: a hairline or a 12 px box that shows is ink. The page has no room left of or above its origin.
  const showsIn = (r, clip) => {
    if (!clip) return false
    const w = Math.min(r.right, clip.r) - Math.max(r.left, clip.l)
    const h = Math.min(r.bottom, clip.b) - Math.max(r.top, clip.t)
    return w > 0 && h > 0 && r.right + scrollX > 0 && r.bottom + scrollY > 0
  }
  const within = (r, clip) => r.left >= clip.l && r.right <= clip.r && r.top >= clip.t && r.bottom <= clip.b
  const FORM = 'input, textarea, select'
  const range = document.createRange()
  const crop = (r, clip) => ({ left: Math.max(r.left, clip.l), right: Math.min(r.right, clip.r), top: Math.max(r.top, clip.t), bottom: Math.min(r.bottom, clip.b) })
  // the parts of a run of text (a text node, laid out at its own place or shifted by dx/dy) that show inside `clip`: the words — at an edge the letters — whose boxes
  // show, and the boxes of those parts cut to the clip. → { text, rects }
  const partsOf = (n, clip, dx = 0, dy = 0, ok = null) => {
    const move = (r) => ({ left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy })
    range.selectNodeContents(n)
    const rects = [...range.getClientRects()].map(move)
    if (!rects.some((r) => showsIn(r, clip))) return { text: '', rects: [] }
    if (!ok && rects.every((r) => within(r, clip) && showsIn(r, clip))) return { text: n.data, rects: rects.map((r) => crop(r, clip)) }
    // `ok`: a further question of a run of letters that only the browser can answer (is it painted there?)
    const at = (a, b) => {
      range.setStart(n, a)
      range.setEnd(n, b)
      return [...range.getClientRects()].map(move).filter((r) => showsIn(r, clip) && (!ok || ok(crop(r, clip))))
    }
    const words = []
    const seenRects = []
    for (const m of n.data.matchAll(/\S+/g)) {
      const a = m.index
      const b = a + m[0].length
      const wr = at(a, b)
      if (!wr.length) continue
      let kept = ''
      for (let i = a; i < b; i++) {
        const cr = at(i, i + 1)
        if (cr.length) {
          kept += n.data[i]
          seenRects.push(...cr.map((r) => crop(r, clip)))
        }
      }
      words.push(kept)
    }
    return { text: words.join(' '), rects: seenRects }
  }
  // Does `el` paint inside `box` (viewport coordinates)? Only the browser can say where a clip-path url(#…), a mask or a shape's own geometry cuts a drawing, so it is asked:
  // at the centre of every CSS pixel of the box first (the common answer: a hit), and — when none hit — again on grids of a quarter of a CSS pixel across and two pixels along (and the other way
  // round), so that a stripe the antialiasing still paints (narrower than a pixel) is found. A point outside the window is scrolled into it. → true (a point hit el), false (nothing of el can show: the box is empty, or its clip is), 'unk' (it could not be asked in full: a shape that takes no pointer, a page that cannot scroll there, the budget of questions spent). No answer is no
  // evidence that nothing is drawn: 'unk' is never taken for absence, and never for a picture's identity. (A grid that finds nothing says 'unk' too, unless the clip around the shape is empty by measure: ink thinner than a sixteenth of a pixel, or a speck under a pixel both ways, is below what the grids ask and is never taken for absence.)
  const HITS_MAX = 300000
  let hitsLeft = HITS_MAX
  const hitAt = (box, el, fine = false) => {
    const w = box.r - box.l
    const h = box.b - box.t
    if (!(w > 0 && h > 0)) return false
    if (cs(el).pointerEvents === 'none') return 'unk'
    if (emptyClip(el)) return false
    const sx0 = scrollX
    const sy0 = scrollY
    let blind = false
    let found = false
    const scan = (stepX, stepY) => {
      let nx = Math.max(1, Math.ceil(w / stepX))
      let ny = Math.max(1, Math.ceil(h / stepY))
      if (nx * ny > hitsLeft) {
        const f = Math.sqrt(Math.max(0, hitsLeft) / (nx * ny))
        nx = Math.max(1, Math.floor(nx * f))
        ny = Math.max(1, Math.floor(ny * f))
        blind = true
      }
      for (let gy = 0; gy < ny && !found && hitsLeft > 0; gy++) {
        const py = box.t + sy0 + ((gy + 0.5) * h) / ny
        for (let gx = 0; gx < nx && !found && hitsLeft > 0; gx++) {
          const px0 = box.l + sx0 + ((gx + 0.5) * w) / nx
          let x = px0 - scrollX
          let y = py - scrollY
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
            scrollTo(Math.max(0, px0 - innerWidth / 2), Math.max(0, py - innerHeight / 2))
            x = px0 - scrollX
            y = py - scrollY
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
              blind = true
              continue
            }
          }
          hitsLeft--
          if (document.elementsFromPoint(x, y).includes(el)) found = true
        }
      }
    }
    try {
      // (a stripe narrower than a pixel is found by a grid fine across it and a pixel along it, in either direction; a speck smaller than a pixel both ways is not asked for)
      scan(1, 1)
      if (!found && !blind) scan(0.25, 2)
      if (!found && !blind) scan(2, 0.25)
      // (a shape cut by a clip-path or a mask that only the browser can place: a stripe of a sixteenth of a pixel — the least that changes a colour — is looked for too, along
      // and across; what the budget does not reach is 'unk', never empty)
      if (fine && !found && !blind) scan(8, 1 / 16)
      if (fine && !found && !blind) scan(1 / 16, 8)
    } finally {
      if (scrollX !== sx0 || scrollY !== sy0) scrollTo(sx0, sy0)
    }
    return found ? true : blind || hitsLeft <= 0 ? 'unk' : 'unk'
  }
  // A grid that finds nothing is no evidence that nothing is drawn (a clip narrower than any grid, a speck): the answer is 'unk' unless the clip itself is empty — a clip-path
  // url(#…) around the shape (or the shape) whose clipPath holds no shape of any area (measured by the browser, not guessed from the markup's numbers).
  const emptyClip = (el) => {
    for (let a = el; a; a = a.parentElement) {
      const m = /^url\(["']?#([^"')]+)["']?\)/.exec(cs(a).clipPath || '')
      const cp = m && a.ownerSVGElement ? a.ownerSVGElement.ownerDocument.getElementById(m[1]) : null
      if (cp && cp.localName === 'clipPath') {
        // (every part of the clip has no area, or lies wholly beside the shape in the shape's own user space — measured by the browser, a clip whose own transform or units
        // move it is not judged)
        const own = (() => {
          try {
            const b = el.getBBox()
            const g = (parseFloat(cs(el).strokeWidth) || 0) / 2 + 1
            return { l: b.x - g, t: b.y - g, r: b.x + b.width + g, b: b.y + b.height + g }
          } catch {
            return null
          }
        })()
        // (no transform of any kind — an attribute, a CSS `transform`, `translate`, `rotate`, `scale` or an `offset-path` — on the clipPath, on any part of it, on the shape or on any
        // element between the shape and the element that carries the clip, and no nested svg or viewBox on the way: the clip is placed in the user space of the element that
        // references it and the shape's box in its own, so with one they are not in one coordinate space and the disjoint proof is unavailable — the answer stays 'unk')
        const moves = (n) => {
          if (n.getAttribute('transform')) return true
          const c = cs(n)
          return [c.transform, c.translate, c.rotate, c.scale, c.offsetPath].some((v) => v && v !== 'none')
        }
        const between = (() => {
          for (let n = el; n; n = n.parentElement) {
            if (moves(n) || (n !== el && n.localName === 'svg') || (n === a && a.localName === 'svg')) return false
            if (n === a) return true
          }
          return false
        })()
        const plain = cp.getAttribute('clipPathUnits') !== 'objectBoundingBox' && !moves(cp) && between
        const none = [...cp.children].every((k) => {
          try {
            const b = k.getBBox()
            if (!(b.width > 0 && b.height > 0)) return true
            // (the whole subtree of the part: a transformed shape in a group of the clip moves with the group's box, which `getBBox` of the part does not say; a `use` is another place's shape)
            if (plain && (k.localName === 'use' || [...k.querySelectorAll('*')].some(moves))) return false
            return plain && own && !moves(k) && (b.x >= own.r || b.x + b.width <= own.l || b.y >= own.b || b.y + b.height <= own.t)
          } catch {
            return false
          }
        })
        if (none) return true
      }
      if (a.localName === 'svg') break
    }
    return false
  }
  // the svgs a letter of which could not be placed by the browser: their drawing is of uncertain identity
  const unkSvg = new Set()
  const cutByPaintServer = (e, top) => {
    for (let a = e; a && a !== top; a = a.parentElement) {
      const c = cs(a)
      if ((c.clipPath && c.clipPath !== 'none' && !/^inset\(/.test(c.clipPath)) || (c.maskImage && c.maskImage !== 'none')) return true
    }
    return false
  }
  const textMemo = new Map()
  // the part of a text node that shows: nothing when its parent is not displayed or its text is not painted. A window of one CSS pixel or less cannot show a glyph
  // (the screen-reader-only idiom). The text of an svg is painted by SVG paint: its fill or its stroke (with their opacity), on the element that holds the letters; it
  // is cut by the clip-paths and masks around it, which the browser is asked about, letter by letter.
  const SVG_TEXT = new Set(['text', 'tspan', 'textPath', 'a'])
  const shownParts = (n) => {
    if (textMemo.has(n)) return textMemo.get(n)
    let out = { text: '', rects: [] }
    const p = n.parentElement
    const svgRoot = p && p.ownerSVGElement
    if (p && n.data.trim() && !SKIP.has(p.tagName) && !p.closest('textarea, select, option, optgroup, datalist, noscript, template')) {
      const clip = shownBox(p)
      const s = cs(p)
      if (svgRoot || p.matches('svg')) {
        // (title, desc, style and the like hold no glyphs; text outside a text element is not drawn)
        const filled = s.fill !== 'none' && alphaOf(s.fill) > 0 && parseFloat(s.fillOpacity) > 0
        const stroked = s.stroke !== 'none' && alphaOf(s.stroke) > 0 && parseFloat(s.strokeWidth) > 0 && parseFloat(s.strokeOpacity) > 0
        if (svgRoot && SVG_TEXT.has(p.localName) && p.closest('text') && clip && (filled || stroked) && px(s.fontSize) > 0 && !(clip.r - clip.l <= 1 && clip.b - clip.t <= 1)) {
          const cut = cutByPaintServer(p, svgRoot.parentElement)
          out = partsOf(n, clip, 0, 0, cut ? (r) => {
            const got = hitAt(r, p)
            if (got === 'unk') unkSvg.add(svgRoot)
            return got !== false
          } : null)
        }
      } else {
        const fill = s.webkitTextFillColor || s.color
        if (clip && alphaOf(fill) > 0 && px(s.fontSize) > 0 && !(clip.r - clip.l <= 1 && clip.b - clip.t <= 1)) out = partsOf(n, clip)
      }
    }
    textMemo.set(n, out)
    return out
  }
  const shownText = (n) => shownParts(n).text
  const canvas = document.createElement('canvas').getContext('2d')
  // the words of a form control that show. The text of a field is drawn inside its content box: its place is measured with the control's own font, a letter at
  // a time, and only the letters inside the clip count. A value is painted with the control's colour, a placeholder with its own (a transparent value does not
  // hide a visible placeholder).
  const controlText = (i) => {
    if (i.type === 'hidden') return ''
    const clip = shownBox(i)
    if (!clip) return ''
    const s = cs(i)
    const fillOf = (st) => st.webkitTextFillColor || st.color
    let text = ''
    let color = fillOf(s)
    if (i.matches('select')) text = i.selectedOptions[0]?.textContent ?? ''
    else if (i.matches('input') && /^(submit|button|reset)$/.test(i.type)) text = i.value
    else if (i.matches('input') && !/^(text|search|email|url|tel|number|password|)$/.test(i.type)) return ''
    else if (i.value) text = i.type === 'password' ? '' : i.value
    else {
      // a placeholder is shown only while the field is empty
      text = i.placeholder ?? ''
      const ph = getComputedStyle(i, '::placeholder')
      color = fillOf(ph)
    }
    if (!i.matches('textarea')) text = text.replace(/\s+/g, ' ').trim()
    if (!text || alphaOf(color) === 0 || px(s.fontSize) <= 0) return ''
    const r = i.getBoundingClientRect()
    const cl = r.left + i.clientLeft + px(s.paddingLeft)
    const ct = r.top + i.clientTop + px(s.paddingTop)
    const cw = i.clientWidth - px(s.paddingLeft) - px(s.paddingRight)
    const ch = i.clientHeight - px(s.paddingTop) - px(s.paddingBottom)
    const view = meet(clip, { l: cl, t: ct, r: cl + cw, b: ct + ch })
    if (i.matches('textarea')) {
      // the lines of a textarea are laid out inside it where they cannot be measured: the same text is laid out in a copy of its box (its own wrapping, white space and
      // scroll), out of sight, and read there
      const mirror = document.createElement('div')
      Object.assign(mirror.style, { position: 'absolute', left: '-99999px', top: '0', visibility: 'hidden', boxSizing: 'content-box', width: `${cw}px`, padding: '0', border: '0', whiteSpace: s.whiteSpace, overflowWrap: s.overflowWrap, wordBreak: s.wordBreak, font: s.font, letterSpacing: s.letterSpacing, wordSpacing: s.wordSpacing, textTransform: s.textTransform, textIndent: s.textIndent, lineHeight: s.lineHeight, tabSize: s.tabSize })
      const node = document.createTextNode(text)
      mirror.append(node)
      document.body.append(mirror)
      const mr = mirror.getBoundingClientRect()
      const got = partsOf(node, view, cl - mr.left - i.scrollLeft, ct - mr.top - i.scrollTop)
      mirror.remove()
      return got.text
    }
    canvas.font = s.font || `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
    const total = canvas.measureText(text).width
    const lh = s.lineHeight === 'normal' ? px(s.fontSize) * 1.2 : px(s.lineHeight)
    const x0 = /^(center)$/.test(s.textAlign) ? cl + (cw - total) / 2 : /^(right|end)$/.test(s.textAlign) ? cl + cw - total : cl
    const y0 = ct + (ch - lh) / 2
    const box = (a, b) => ({ left: x0 + a, right: x0 + b, top: y0, bottom: y0 + lh })
    if (within(box(0, total), view) && showsIn(box(0, total), view)) return text
    let kept = ''
    for (let k = 0; k < text.length; k++) if (showsIn(box(canvas.measureText(text.slice(0, k)).width, canvas.measureText(text.slice(0, k + 1)).width), view)) kept += text[k]
    return kept
  }
  // the words a visitor sees under `e`: the parts of the text nodes that show, then the form controls that show; a break between boxes keeps their words apart
  const blockOf = (p) => {
    while (p && cs(p).display === 'inline') p = p.parentElement
    return p
  }
  const seenMemo = new Map()
  // `outs`: boxes out of flow under `e` whose words are read as leaves of their own — not part of the words of `e`
  const seen = (e, outs = null) => {
    if (!outs && seenMemo.has(e)) return seenMemo.get(e)
    let t = ''
    let last = null
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (outs && outs.some((o) => o.contains(n))) continue
      const v = shownText(n)
      if (!v.trim()) continue
      const b = blockOf(n.parentElement)
      if (last && b !== last) t += ' '
      last = b
      t += v
    }
    for (const i of [e, ...e.querySelectorAll(FORM)]) {
      if (!i.matches?.(FORM) || (outs && outs.some((o) => o.contains(i)))) continue
      const v = controlText(i)
      if (v) t += ` ${v}`
    }
    if (!outs) seenMemo.set(e, t)
    return t
  }
  // where a leaf is PAINTED: the box of the letters that show (or, for a field, the field), else of the picture cut to the part that shows. The box of the element holds its
  // padding and its margin's room; what a visitor sees stands where the ink is.
  const inkOf = (e, outs = null) => {
    const rects = []
    let part = false
    if (e.matches(MEDIA)) {
      const clip = shownBox(e)
      if (clip) {
        const r = e.getBoundingClientRect()
        const c = crop(r, clip)
        // cut by a clip: only a part of the picture shows (the edge of a window it slides in)
        if (Math.abs(c.left - r.left) > 1 || Math.abs(c.right - r.right) > 1 || Math.abs(c.top - r.top) > 1 || Math.abs(c.bottom - r.bottom) > 1) part = true
        rects.push(c)
      }
    } else {
      const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (outs && outs.some((o) => o.contains(n))) continue
        const sp = shownParts(n)
        if (!sp.text.trim()) continue
        rects.push(...sp.rects)
        // some of its letters are cut away by a clip (the edge of a window the text slides in)
        if (squash(sp.text).length < squash(n.data).length) part = true
      }
      for (const i of [e, ...e.querySelectorAll(FORM)]) if (i.matches?.(FORM) && !(outs && outs.some((o) => o.contains(i))) && controlText(i)) rects.push(crop(i.getBoundingClientRect(), shownBox(i)))
    }
    if (!rects.length) return null
    const l = Math.min(...rects.map((q) => q.left))
    const t = Math.min(...rects.map((q) => q.top))
    return { x: r1(l + scrollX), y: r1(t + scrollY), w: r1(Math.max(...rects.map((q) => q.right)) - l), h: r1(Math.max(...rects.map((q) => q.bottom)) - t), ...(part ? { part: true } : {}) }
  }
  // The structure around a leaf, read from the page itself (it survives the folding of the tree): the boxes around it, up to five levels, with the element each is (`tag`, and the
  // `role` the page gave it) and whether each lays its children in a row (`row`), and — when the leaf, or a box around it, is one of several boxes of the same size standing in one row (the slides of a carousel, the cards of a grid) — which one
  // (`sl`, with its box `sr`) and which box holds them (`sc`).
  const ancestry = (e) => {
    const ab = []
    let sl = null
    let sc = null
    let sr = null
    let x = e
    for (let d = 0; d < 5 && x && x !== document.body; d++, x = x.parentElement) {
      const p = x.parentElement
      if (!p) break
      const pr = p.getBoundingClientRect()
      const sibs = p.children.length <= 40 ? [...p.children].filter((o) => !SKIP.has(o.tagName) && cs(o).display !== 'none') : []
      const rx = x.getBoundingClientRect()
      const rects = sibs.map((o) => o.getBoundingClientRect())
      const same = rects.filter((q, i) => sibs[i] !== x && Math.abs(q.width - rx.width) <= 2 && Math.abs(q.height - rx.height) <= 2 && Math.abs(q.top - rx.top) <= 2 && q.width > 0)
      // (the OUTERMOST such box within five levels: a slide, not a row of things inside it)
      if (same.length) {
        sl = idOf(x)
        sc = idOf(p)
        sr = { x: r1(rx.left + scrollX), y: r1(rx.top + scrollY), w: r1(rx.width), h: r1(rx.height) }
      }
      const first = rects[0]
      const cols = first ? rects.filter((q) => Math.min(q.bottom, first.bottom) - Math.max(q.top, first.top) >= 0.3 * Math.min(q.height, first.height)).length : 0
      ab.push({ x: r1(pr.left + scrollX), y: r1(pr.top + scrollY), w: r1(pr.width), h: r1(pr.height), row: cols > 1, cols, tag: p.tagName.toLowerCase(), role: p.getAttribute('role') || undefined })
    }
    return { ab, ...(sl !== null ? { sl, sc, sr } : {}) }
  }
  // `inline` text (strong, a, em in a line of words) is part of the text block that holds it, not a box of its own — unless it carries a picture
  const kidsOf = (e, landmarks = false) =>
    [...e.children].filter((k) => {
      if (SKIP.has(k.tagName)) return false
      const s = cs(k)
      if (s.display === 'none') return false
      if (s.display === 'inline' && !landmarks && !k.matches('img, svg, video, picture, iframe, canvas') && !k.querySelector('img, svg, video, picture, iframe')) return false
      if ((s.position === 'absolute' || s.position === 'fixed') && !(landmarks && onPath(k))) return false
      // a box under a pixel high is a box when it holds something seen (a hairline of text, a rule); an empty one is a spacer
      return landmarks && onPath(k) ? true : k.getBoundingClientRect().height >= 1 || holdsInk(k)
    })
  const holdsInk = (k) => seen(k).trim() !== '' || [...(k.matches(MEDIA) ? [k] : []), ...k.querySelectorAll(MEDIA)].some(mediaInk)
  const sigOf = (e) => {
    const cls = typeof e.className === 'string' ? e.className.split(/\s+/).filter((c) => c && !/^(is-|has-|align|wp-elements|js-|active|show|in$)/.test(c) && !/\d{2,}/.test(c)) : []
    return e.tagName.toLowerCase() + cls.slice(0, 3).map((c) => `.${c}`).join('')
  }
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  // the first heading under `e` that shows words (a hidden one, or one with only a picture, is not the heading of the band)
  const headingOf = (e) => {
    for (const h of e.matches('h1,h2,h3,h4,h5,h6') ? [e] : e.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      const t = norm(seen(h))
      if (t) return t.slice(0, 48)
    }
    return ''
  }
  const squash = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  const textOf = (e) => norm(seen(e)).slice(0, 48)
  const vpad = (s) => px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth)
  // ---- pictures: a box has ink when it is displayed, a part of it shows inside the clip, and what it draws is painted — an empty or fully transparent
  // image, an svg with nothing to paint, draws nothing. A picture whose pixels cannot be read (another origin, not loaded yet, a video, a frame) is taken as painted:
  // there is no evidence it is not. `assetOf` is the picture a visitor sees.
  const MEDIA = 'img, svg, video, picture, iframe, canvas'
  const SHAPES = 'path, rect, circle, ellipse, line, polyline, polygon, text, image, use, foreignObject'
  // a shape of an svg draws when it is displayed, not faded out (itself or above it inside the svg), has a paint, and the part of it that is drawn shows inside ITS OWN
  // clip (the boxes around it, its own clip-path), not the svg's alone. → true, false, or 'unk' (the browser could not be asked in full, see hitAt)
  const shapeDraws = (el, m) => {
    for (let a = el; a && a !== m.parentElement; a = a.parentElement) if (cs(a).display === 'none' || parseFloat(cs(a).opacity) === 0) return false
    const st = cs(el)
    if (st.visibility === 'hidden' || st.visibility === 'collapse') return false
    const clip = shownBox(el)
    if (!clip) return false
    const grow = Math.max(0.5, parseFloat(st.strokeWidth) / 2 || 0)
    const b = el.getBoundingClientRect()
    if (!showsIn({ left: b.left - grow, right: b.right + grow, top: b.top - grow, bottom: b.bottom + grow }, clip)) return false
    // the letters of a text are what is painted: each by the paint of the element that holds it (a tspan may have no fill where its text has one)
    if (el.matches('text')) {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) if (shownText(n).trim()) return true
      return unkSvg.has(m) ? 'unk' : false
    }
    const filled = !el.matches('line') && st.fill !== 'none' && alphaOf(st.fill) > 0 && parseFloat(st.fillOpacity) > 0
    const stroked = st.stroke !== 'none' && alphaOf(st.stroke) > 0 && parseFloat(st.strokeWidth) > 0 && parseFloat(st.strokeOpacity) > 0
    if (!el.matches('image, use, foreignObject') && !filled && !stroked) return false
    // a clip-path that is not an inset (a url(#clip), a circle, a polygon) or a mask cuts the shape where only the browser can say: ask it, at every pixel of the part
    // that should show.
    if (!cutByPaintServer(el, m.parentElement)) return true
    return hitAt(meet(clip, { l: b.left - grow, t: b.top - grow, r: b.right + grow, b: b.bottom + grow }), el, true)
  }
  const paintMemo = new Map()
  const paints = (m) => {
    if (paintMemo.has(m)) return paintMemo.get(m)
    let ok = true
    if (m.matches('svg')) {
      const got = [...m.querySelectorAll(SHAPES)].map((el) => shapeDraws(el, m))
      // (a shape the browser could not be asked about in full leaves the drawing's ink unproven, whatever else is painted: it may be more of it)
      ok = got.includes('unk') || unkSvg.has(m) ? 'unk' : got.includes(true)
    } else if (m.matches('img, canvas')) {
      // the pixels drawn into the part of the box that shows: the picture is drawn at the size it has on the page and any pixel that is not fully transparent is ink.
      // What cannot be placed (an object-fit, a huge box, pixels of another origin, a picture not loaded yet) gives no evidence that nothing is drawn.
      const r = m.getBoundingClientRect()
      const clip = shownBox(m)
      if (m.matches('img') && m.complete && !m.naturalWidth && !/svg/i.test(m.currentSrc || '')) ok = false
      else if ((m.matches('img') && !m.complete) || !clip || (cs(m).objectFit || 'fill') !== 'fill') ok = true
      else {
        const w = Math.max(1, Math.round(r.width))
        const h = Math.max(1, Math.round(r.height))
        if (w * h > 4e6) ok = true
        else {
          try {
            const c = document.createElement('canvas')
            c.width = w
            c.height = h
            const g = c.getContext('2d', { willReadFrequently: true })
            g.drawImage(m, 0, 0, w, h)
            const x0 = Math.max(0, Math.floor(clip.l - r.left))
            const y0 = Math.max(0, Math.floor(clip.t - r.top))
            const x1 = Math.min(w, Math.ceil(clip.r - r.left))
            const y1 = Math.min(h, Math.ceil(clip.b - r.top))
            ok = false
            if (x1 > x0 && y1 > y0) {
              const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data
              for (let i = 3; i < d.length; i += 4) if (d[i] > 0) ok = true
            }
          } catch {
            ok = true
          }
        }
      }
    }
    paintMemo.set(m, ok)
    return ok
  }
  const boxShows = (m) => {
    const clip = shownBox(m)
    return Boolean(clip) && showsIn(m.getBoundingClientRect(), clip)
  }
  const boxInk = (m) => boxShows(m) && paints(m)
  // a picture element shows what its img shows: an empty wrapper is no picture
  const mediaInk = (m) => (m.matches('picture') ? [...m.querySelectorAll('img')].some(boxInk) : boxInk(m))
  // a 128-bit digest (SHA-256, cut) of a text: the complete visible words and the displayed look of a box are compared whole, not by a prefix or a short hash
  const K = []
  const H0 = []
  {
    const primes = []
    for (let n = 2; primes.length < 64; n++) if (primes.every((q) => n % q)) primes.push(n)
    const frac = (x) => Math.floor((x - Math.floor(x)) * 4294967296)
    primes.forEach((q) => K.push(frac(Math.cbrt(q))))
    primes.slice(0, 8).forEach((q) => H0.push(frac(Math.sqrt(q))))
  }
  const digest = (str) => {
    const bytes = new TextEncoder().encode(str)
    const l = bytes.length
    const buf = new Uint8Array(((l + 9 + 63) >> 6) << 6)
    buf.set(bytes)
    buf[l] = 0x80
    const dv = new DataView(buf.buffer)
    dv.setUint32(buf.length - 4, (l * 8) >>> 0)
    dv.setUint32(buf.length - 8, Math.floor((l * 8) / 4294967296))
    const h = H0.map((x) => x | 0)
    const w = new Int32Array(64)
    const rr = (x, n) => (x >>> n) | (x << (32 - n))
    for (let o = 0; o < buf.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4)
      for (let i = 16; i < 64; i++) {
        const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
        const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
      }
      let [a, b, c, d, e, f, g, hh] = h
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0
        const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
        hh = g
        g = f
        f = e
        e = (d + t1) | 0
        d = c
        c = b
        b = a
        a = (t1 + t2) | 0
      }
      ;[a, b, c, d, e, f, g, hh].forEach((x, i) => (h[i] = (h[i] + x) | 0))
    }
    return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('').slice(0, 32)
  }
  const fullId = (t) => (t ? `${t.length}:${digest(t)}` : '')
  let unproven = 0
  // a picture whose ink or whose letters the browser could not be asked about in full: it is a picture, but nothing is known of what it shows
  const uncertain = (m) => {
    if (!m.matches('svg')) return false
    paints(m)
    return unkSvg.has(m) || paintMemo.get(m) === 'unk'
  }
  // a rendered svg: its painted parts, as the browser computed them (shape, geometry, paint, opacity, transform, filter) — not its markup
  const svgLook = (sv) => {
    const paintServer = (v) => {
      const m = /url\(["']?#([^"')]+)["']?\)/.exec(v)
      const t = m ? sv.querySelector(`#${CSS.escape(m[1])}`) ?? document.getElementById(m[1]) : null
      return t ? t.outerHTML : ''
    }
    const drawn = [...sv.querySelectorAll(SHAPES)].filter((el) => shapeDraws(el, sv))
    return (
      [sv, ...drawn]
        .map((el) => {
          const st = cs(el)
          // everything that acts on the shape on its way up through the svg, as the browser computed it
          const chain = []
          for (let a = el; a && a !== sv.parentElement; a = a.parentElement) {
            const c = cs(a)
            chain.push(`${c.transform}/${c.opacity}/${c.filter}/${c.clipPath}/${c.maskImage}/${c.mixBlendMode}`)
          }
          // the words of a text that show, not those it hides — each run with the paint, opacity and cuts of the element that holds it (a tspan may paint what its text does not)
          let words = ''
          if (el.matches('text')) {
            const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
            for (let n = w.nextNode(); n; n = w.nextNode()) {
              const run = shownText(n)
              if (!run.trim()) continue
              const hold = n.parentElement
              const hs = cs(hold)
              const up = []
              for (let a = hold; a && a !== el.parentElement; a = a.parentElement) {
                const c = cs(a)
                up.push(`${c.opacity}/${c.clipPath}/${c.maskImage}/${c.filter}/${c.transform}`)
              }
              words += `[${run}@${hs.fill}/${hs.fillOpacity}/${hs.stroke}/${hs.strokeWidth}/${hs.strokeOpacity}/${hs.visibility}/${up.join('>')}]`
            }
          }
          const geo = ['d', 'points', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'href', 'xlink:href'].map((a) => el.getAttribute(a) ?? '').join(',')
          return `${el.tagName}:${geo}:${chain.join('>')}:${st.fill}:${st.fillOpacity}:${st.stroke}:${st.strokeWidth}:${st.strokeOpacity}:${st.transform}:${st.filter}:${st.mixBlendMode}:${st.clipPath}:${st.mask}:${paintServer(st.fill)}:${paintServer(st.stroke)}:${words}`
        })
        .join(';') + `|${r1(sv.getBoundingClientRect().width)}x${r1(sv.getBoundingClientRect().height)}`
    )
  }
  // the picture shown: an image's current source, a rendered svg (its computed look), a video's poster until it plays and its source after, a background image's url
  // A kind of picture whose content cannot be read gets an identity of its own: it is never taken for another.
  const assetOf = (e, s) => {
    const place = `${s.objectFit}:${s.objectPosition}:${s.transform}:${s.filter}:${r1(e.getBoundingClientRect().width)}x${r1(e.getBoundingClientRect().height)}`
    if (e.matches('img')) return e.currentSrc || e.getAttribute('src') ? `img:${e.currentSrc || e.getAttribute('src')}:${place}` : `unproven:${++unproven}`
    if (e.matches('picture')) return `img:${e.querySelector('img')?.currentSrc || `unproven:${++unproven}`}:${place}`
    if (e.matches('svg')) return uncertain(e) ? `unproven:${++unproven}` : `svg:${digest(svgLook(e))}:${s.transform}:${s.filter}`
    if (e.matches('video')) return e.poster && (e.readyState < 2 || (e.paused && e.currentTime === 0)) ? `poster:${e.poster}:${place}` : `video:${e.currentSrc || e.getAttribute('src') || e.querySelector('source')?.src || `unproven:${++unproven}`}:${place}`
    if (e.matches('canvas')) {
      try {
        return `canvas:${digest(e.toDataURL())}`
      } catch {
        return `unproven:${++unproven}`
      }
    }
    if (e.matches('hr, [role="separator"]')) return `rule:${s.borderTopWidth}:${s.borderTopColor}:${s.borderBottomWidth}:${s.borderBottomColor}:${s.backgroundColor}`
    if (/^url\(/.test(s.backgroundImage)) return `bg:${s.backgroundImage}:${s.backgroundPosition}:${s.backgroundSize}:${s.backgroundRepeat}`
    return `unproven:${++unproven}`
  }
  // what a box paints behind its content: a background image, a background colour that shows
  const paintOf = (e, s) => {
    const img = /^url\(/.test(s.backgroundImage) ? s.backgroundImage : ''
    const col = alphaOf(s.backgroundColor) > 0 ? s.backgroundColor : ''
    const look = [s.filter !== 'none' ? s.filter : '', parseFloat(s.opacity) < 1 ? `o${s.opacity}` : '', s.transform !== 'none' ? s.transform : '', img ? `${s.backgroundPosition}/${s.backgroundSize}/${s.backgroundRepeat}` : ''].filter(Boolean).join(',')
    return img || col || look ? `${img}|${col}|${look}` : ''
  }
  // ---- the header logo: the boxes of the header that are the site's logo (a site-logo / logo / brand box, a home link, the site title), by role and painted
  // place — in flow or not. Each is read as { x, y, w, h, kind, tx }; `lg` on a tree box is the number (from 1) of the logo box it is inside.
  const LOGO = '.custom-logo-link, .wp-block-site-logo, .site-logo, .logo, #logo, [itemprop="logo"], .navbar-brand, .wp-block-site-title, .site-title, .site-name, a[rel~="home"]'
  const rootLink = (a) => {
    try {
      const u = new URL(a.getAttribute('href') ?? '', location.href)
      return u.origin === location.origin && /^\/(index\.php\/?|[a-z]{2}(-[a-z]{2})?\/?)?$/i.test(u.pathname) && !u.search.replace('?', '') && !a.closest('nav, [role="navigation"], ul, ol, .menu')
    } catch {
      return false
    }
  }
  let logoEls = []
  const logoIn = (h) => {
    logoEls = []
    const mediaOf = (e) => [...(e.matches(MEDIA) ? [e] : e.querySelectorAll(MEDIA))].filter(mediaInk)
    const has = (e) => seen(e).trim() !== '' || mediaOf(e).length > 0
    let c = [...h.querySelectorAll(LOGO)].filter(has)
    if (!c.length) c = [...h.querySelectorAll('a[href]')].filter((a) => rootLink(a) && has(a))
    const top = c.filter((e) => !c.some((o) => o !== e && o.contains(e)))
    const cands = []
    for (const el of top) {
      const rects = mediaOf(el).map((m) => crop(m.getBoundingClientRect(), shownBox(m)))
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!shownText(n).trim()) continue
        rects.push(...shownParts(n).rects)
      }
      if (!rects.length) continue
      const l = Math.min(...rects.map((r) => r.left))
      const t = Math.min(...rects.map((r) => r.top))
      const full = squash(seen(el))
      const tx = full.slice(0, 40)
      logoEls.push(el)
      cands.push({ x: r1(l + scrollX), y: r1(t + scrollY), w: r1(Math.max(...rects.map((r) => r.right)) - l), h: r1(Math.max(...rects.map((r) => r.bottom)) - t), kind: mediaOf(el).length ? (tx ? 'mixed' : 'media') : 'text', tx, th: fullId(full) })
    }
    return cands.length ? { cands } : null
  }
  // the font size of the text a box holds itself, inline words (a span, a small, a strong) included: the size most of its letters have
  let own = new Map()
  const ownText = (root) => {
    own = new Map()
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = shownText(n).trim()
      let p = n.parentElement
      if (!t || !p) continue
      const size = r1(px(cs(p).fontSize))
      while (p && p !== root && cs(p).display === 'inline') p = p.parentElement
      if (!p) continue
      const o = own.get(p) ?? { sizes: new Map(), text: '' }
      o.sizes.set(size, (o.sizes.get(size) ?? 0) + t.length)
      o.text += t
      own.set(p, o)
    }
  }
  // a subtree the depth or the budget folds into one leaf keeps the sizes and words of what is under it
  const ownUnder = (e) => {
    const o = own.get(e)
    if (!e.firstElementChild) return o
    const m = { sizes: new Map(o?.sizes ?? []), text: o?.text ?? '' }
    for (const [el, v] of own) {
      if (el === e || !e.contains(el)) continue
      for (const [sz, n] of v.sizes) m.sizes.set(sz, (m.sizes.get(sz) ?? 0) + n)
      m.text += v.text
    }
    return m.sizes.size ? m : undefined
  }
  // ---- clones. A slide a carousel prints twice (a clone for the loop) is no box of its own: `cl` marks a box that says it is a copy (a clone / duplicate
  // class, or aria-hidden) INSIDE a carousel-like component, `comp` names that component. The judge removes a copy only against an original of the same component.
  const ROOT = '.slick-slider, .swiper, .swiper-container, .owl-carousel, .carousel, .flickity-enabled, .splide, [data-ride="carousel"], [aria-roledescription="carousel"]'
  const STRUCT = '.slick-list, .slick-track, .swiper-wrapper, .owl-stage-outer, .owl-stage, .carousel-inner, .flickity-viewport, .flickity-slider, .splide__track, .splide__list'
  const compIds = new Map()
  const idOf = (el) => {
    if (!compIds.has(el)) compIds.set(el, compIds.size + 1)
    return compIds.get(el)
  }
  // the component of a box is the nearest carousel ROOT around it (a carousel inside another is its own component; the track, list and wrapper boxes of one carousel
  // are parts of it, not components); with no root, the outermost track-like box
  const compOf = (e) => {
    let struct = null
    for (let a = e; a && a !== document.body; a = a.parentElement) {
      if (a.matches(ROOT)) return idOf(a)
      if (a.matches(STRUCT)) struct = a
    }
    return struct ? idOf(struct) : null
  }
  const isCopy = (e) => /(^|[\s_-])(cloned|clone|duplicate)([\s_-]|$)/i.test(typeof e.className === 'string' ? e.className : '') || e.getAttribute('aria-hidden') === 'true'
  // The height a leaf gives its band, measured: the leaf is taken out of the flow for a moment (display:none) and the band's height read before and after. A leaf
  // that sits in a box of fixed height, or overlaid on others, gives none. At most FX_MAX leaves per page are measured (each takes a layout).
  const FX_MAX = 400
  let fxLeft = FX_MAX
  let curRoot = null
  const hideEffect = (e) => {
    const h0 = curRoot.getBoundingClientRect().height
    const had = e.hasAttribute('style')
    const v = e.style.getPropertyValue('display')
    const pr = e.style.getPropertyPriority('display')
    e.style.setProperty('display', 'none', 'important')
    const h1 = curRoot.getBoundingClientRect().height
    if (v) e.style.setProperty('display', v, pr)
    else e.style.removeProperty('display')
    if (!had) e.removeAttribute('style')
    return r1(h0 - h1)
  }
  let budget = 600
  // The words a box holds itself, beside the boxes under it: the parts of the text nodes that show, in the box and in the elements under it that are not boxes of the tree
  // (an inline link, a span). → { text, rects }
  const outOfFlow = (c) => {
    const p = cs(c).position
    return p === 'absolute' || p === 'fixed'
  }
  const directOf = (e, kidSet) => {
    let text = ''
    const rects = []
    const visit = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          const sp = shownParts(c)
          if (sp.text.trim()) {
            text += sp.text
            rects.push(...sp.rects)
          }
        } else if (c.nodeType === 1 && !kidSet.has(c) && !outOfFlow(c)) visit(c)
      }
    }
    visit(e)
    return { text, rects }
  }
  // (a box out of flow is read once, as a leaf of its own: the words of its parent are the words outside it)
  // the words a box holds itself as a leaf of the reading (`dl`): placed where they are painted, so that a judge reads them with the leaves of the boxes beside them
  const wordsLeaf = (e, d) => {
    const l = Math.min(...d.rects.map((q) => q.left))
    const t = Math.min(...d.rects.map((q) => q.top))
    const sq = squash(d.text)
    const st = cs(e)
    return { t: '#text', sig: sigOf(e), key: norm(d.text).slice(0, 48), head: '', x: r1(l + scrollX), y: r1(t + scrollY), w: r1(Math.max(...d.rects.map((q) => q.right)) - l), h: r1(Math.max(...d.rects.map((q) => q.bottom)) - t), d: 'inline', cols: 1, pt: 0, pb: 0, bw: 0, mt: 0, mb: 0, rg: 0, fs: r1(px(st.fontSize)), lh: st.lineHeight === 'normal' ? r1(px(st.fontSize) * 1.2) : r1(px(st.lineHeight)), img: null, k: [], words: 1, tx: sq.slice(0, 40), th: fullId(sq), ...(sq.length <= 1500 ? { sq } : {}), dw: 1 }
  }
  // A subtree the depth or the budget of the tree folds: it keeps ALL its leaves (the boxes that hold words or a picture), flat, and the words its boxes hold themselves —
  // what a visitor sees does not depend on how many boxes a side wraps it in. At most LEAF_MAX leaves a band; past that the band is `capped` and its content is not read.
  // Where a box's background picture is PAINTED: its size (cover, contain, lengths, auto — from the picture's own size), its position and its repeat, inside the padding box, cut
  // to it. null when that cannot be told (several layers, a picture not loaded or with no size of its own): the judge then does not take the box for the picture it holds.
  const natural = new Map()
  const bgRegion = (e, s) => {
    const img = s.backgroundImage
    if ((img.match(/url\(/g) || []).length !== 1 || /\)\s*,/.test(img)) return null
    const src = /^url\(["']?(.*?)["']?\)$/.exec(img)?.[1]
    if (!src) return null
    if (!natural.has(src)) {
      const im = new Image()
      im.src = src
      natural.set(src, im.complete && im.naturalWidth > 0 ? { w: im.naturalWidth, h: im.naturalHeight } : null)
    }
    const nat = natural.get(src)
    if (!nat) return null
    const r = e.getBoundingClientRect()
    const bw = e.clientWidth || r.width
    const bh = e.clientHeight || r.height
    const bx = r.left + scrollX + (e.clientLeft || 0)
    const by = r.top + scrollY + (e.clientTop || 0)
    const sz = s.backgroundSize.split(',')[0].trim().split(/\s+/)
    let w
    let h
    if (sz[0] === 'cover' || sz[0] === 'contain') {
      const f = (sz[0] === 'cover' ? Math.max : Math.min)(bw / nat.w, bh / nat.h)
      w = nat.w * f
      h = nat.h * f
    } else {
      const len = (t, whole) => (t === undefined || t === 'auto' ? null : /%$/.test(t) ? (parseFloat(t) / 100) * whole : parseFloat(t))
      w = len(sz[0], bw)
      h = len(sz[1], bh)
      if (w === null && h === null) [w, h] = [nat.w, nat.h]
      else if (w === null) w = (h * nat.w) / nat.h
      else if (h === null) h = (w * nat.h) / nat.w
    }
    const pos = s.backgroundPosition.split(',')[0].trim().split(/\s+/)
    const at = (t, room) => (/%$/.test(t) ? (parseFloat(t) / 100) * room : parseFloat(t) || 0)
    let x = bx + at(pos[0] ?? '0%', bw - w)
    let y = by + at(pos[1] ?? pos[0] ?? '0%', bh - h)
    const rep = s.backgroundRepeat.split(',')[0].trim().split(/\s+/)
    const repX = rep[0] !== 'no-repeat' && rep[0] !== 'repeat-y'
    const repY = (rep[1] ?? rep[0]) !== 'no-repeat' && rep[0] !== 'repeat-x'
    let rw = w
    let rh = h
    if (repX) [x, rw] = [bx, bw]
    if (repY) [y, rh] = [by, bh]
    const l = Math.max(x, bx)
    const t = Math.max(y, by)
    const rr = Math.min(x + rw, bx + bw)
    const bt = Math.min(y + rh, by + bh)
    // (painted: the region; empty: the picture lies wholly outside its box and paints nothing; unresolved: null)
    return rr > l && bt > t ? { x: r1(l), y: r1(t), w: r1(rr - l), h: r1(bt - t) } : { empty: true }
  }
  // the picture a box paints behind its content, as a leaf of the reading (see `#bg` in the judge), or null
  const backdropOf = (e, s) => {
    if (!/^url\(/.test(s.backgroundImage) || !boxShows(e)) return null
    const r = e.getBoundingClientRect()
    const reg0 = bgRegion(e, s)
    if (reg0?.empty) return null
    const reg = reg0
    const w = reg ? reg.w : r1(r.width)
    const h = reg ? reg.h : r1(r.height)
    return { t: '#bg', sig: sigOf(e), key: '', head: '', x: reg ? reg.x : r1(r.left + scrollX), y: reg ? reg.y : r1(r.top + scrollY), w, h, d: s.display, cols: 1, pt: 0, pb: 0, bw: 0, mt: 0, mb: 0, rg: 0, fs: r1(px(s.fontSize)), lh: s.lineHeight === 'normal' ? r1(px(s.fontSize) * 1.2) : r1(px(s.lineHeight)), img: { w, h }, as: assetOf(e, s), words: 0, tx: '', k: [], ov: 1, ...(reg ? { ink: reg } : { bgu: 1 }) }
  }
  const LEAF_MAX = 3000
  let leafLeft = LEAF_MAX
  let capped = false
  // the boxes out of flow (absolutely positioned or fixed) under `e` that hold something seen: they are not part of the flow the heights are told from, but what they show
  // is on the page — a picture centred in its box by absolute positioning is as much a picture as one in flow
  const overlaysOf = (e, skip) => {
    const out = []
    const walk = (n) => {
      for (const c of n.children) {
        if (SKIP.has(c.tagName) || skip.has(c)) continue
        const st = cs(c)
        if (st.display === 'none') continue
        if (st.position === 'absolute' || st.position === 'fixed') {
          // (a box that is only a background picture — nothing in it, a cover image set as its background — is the picture it shows)
          if (holdsInk(c) || (/^url\(/.test(st.backgroundImage) && !c.firstElementChild && boxShows(c))) out.push(c)
        } else walk(c)
      }
    }
    walk(e)
    return out
  }
  const leavesUnder = (e, strays, boxes) => {
    const out = []
    const go = (el, kids) => {
      for (const k of [...kids, ...overlaysOf(el, new Set(kids))]) {
        if (leafLeft <= 0) {
          capped = true
          return
        }
        boxes.add(k)
        const sub = /^(IMG|VIDEO|IFRAME|SVG|CANVAS|PICTURE)$/i.test(k.tagName) ? [] : kidsOf(k)
        if (!sub.length) {
          leafLeft--
          out.push(k)
        } else {
          const d = directOf(k, new Set(sub))
          if (d.text.trim() && d.rects.length) strays.push(Object.assign(wordsLeaf(k, d), ancestry(k)))
          const bgl = backdropOf(k, cs(k))
          if (bgl) strays.push(Object.assign(bgl, ancestry(k)))
          go(k, sub)
        }
      }
    }
    go(e, kidsOf(e))
    return out
  }
  const tree = (e, depth) => {
    const r = e.getBoundingClientRect()
    const s = cs(e)
    budget--
    const isImg = /^(IMG|VIDEO|IFRAME|SVG|CANVAS|PICTURE)$/i.test(e.tagName)
    const folded = !isImg && !(depth < 12 && budget > 0)
    const strays = []
    // (a page may hold any number of boxes: past the budget and the leaves a band may hold, what is under a box is no longer read, and the band says so)
    const boxes = new Set()
    let kids = isImg ? [] : folded ? leavesUnder(e, strays, boxes) : kidsOf(e)
    const room = budget + LEAF_MAX
    if (kids.length > room) {
      capped = true
      kids = kids.slice(0, Math.max(0, room))
    }
    const over = isImg || folded ? [] : overlaysOf(e, new Set(kids))
    const head = headingOf(e)
    const ownShown = !isImg && !kids.length && over.length ? seen(e, over) : null
    const bg = !isImg && !kids.length && /^url\(/.test(s.backgroundImage) && !(ownShown ?? seen(e)).trim() && boxShows(e)
    const bgReg = bg ? bgRegion(e, s) : null
    const bgOn = bg && !bgReg?.empty
    // a rule (<hr>, a separator) that paints a border or a fill is a picture of its own, however thin
    const edge = (a) => parseFloat(s[`border${a}Width`]) > 0 && s[`border${a}Style`] !== 'none' && alphaOf(s[`border${a}Color`]) > 0
    const rule = !isImg && !kids.length && !bgOn && e.matches('hr, [role="separator"]') && boxShows(e) && (edge('Top') || edge('Bottom') || alphaOf(s.backgroundColor) > 0)
    const shownPic = (isImg && mediaInk(e)) || bgOn || rule
    // the boxes of the first row: those that share vertical room with the first box (a centred box starts lower than its neighbour and is still beside it)
    const first = kids[0]?.getBoundingClientRect()
    const row = first
      ? kids.filter((k) => {
          const q = k.getBoundingClientRect()
          const shared = Math.min(q.bottom, first.bottom) - Math.max(q.top, first.top)
          return shared >= 0.3 * Math.min(q.height, first.height)
        })
      : []
    const node = {
      t: e.tagName.toLowerCase(),
      sig: sigOf(e),
      key: head || textOf(e),
      head,
      x: r1(r.left + scrollX),
      y: r1(r.top + scrollY),
      w: r1(r.width),
      h: r1(r.height),
      d: s.display,
      cols: kids.length > 1 ? row.length : 1,
      pt: r1(px(s.paddingTop)),
      pb: r1(px(s.paddingBottom)),
      bw: r1(px(s.borderTopWidth) + px(s.borderBottomWidth)),
      mt: r1(px(s.marginTop)),
      mb: r1(px(s.marginBottom)),
      rg: r1(px(s.rowGap)),
      fs: r1(px(s.fontSize)),
      lh: s.lineHeight === 'normal' ? r1(px(s.fontSize) * 1.2) : r1(px(s.lineHeight)),
      img: shownPic ? { w: r1(r.width), h: r1(r.height) } : null,
      k: kids.map((k) => tree(k, depth + 1))
    }
    if (folded) node.fold = 1
    if (bgOn) {
      const reg = bgReg
      if (reg) {
        node.img = { w: reg.w, h: reg.h }
        node.ink = reg
      } else node.bgu = 1
    }
    if (shownPic) {
      node.as = assetOf(e, s)
      if (isImg && uncertain(e)) node.unk = 1
    }
    const lg = logoEls.findIndex((l) => l.contains(e))
    if (lg >= 0) node.lg = lg + 1
    else if (!node.k.length && logoEls.length) {
      // a box that holds nothing but a logo drawn out of flow (the logo box is not one of its kids) is that logo's leaf
      const inside = logoEls.filter((l) => e.contains(l))
      if (inside.length && squash(seen(e)) === squash(inside.map((l) => seen(l)).join('')) && [...e.querySelectorAll(MEDIA)].every((m) => inside.some((l) => l.contains(m)))) node.lg = logoEls.indexOf(inside[0]) + 1
    }
    const paint = shownBox(e) ? paintOf(e, s) : ''
    if (paint) node.bgp = paint
    if (node.k.length) {
      // the words a box holds itself, beside the boxes under it
      const mine = directOf(e, folded ? boxes : new Set(kids))
      const dl = [...(mine.text.trim() && mine.rects.length ? [Object.assign(wordsLeaf(e, mine), ancestry(e))] : []), ...strays]
      if (mine.text.trim()) {
        node.dtx = squash(mine.text).slice(0, 40)
        node.dh = fullId(squash(mine.text))
      }
      if (dl.length) node.dl = dl
    }
    if (over.length) node.dl = [...(node.dl ?? []), ...over.map((k) => ({ ...tree(k, depth + 1), ov: 1 }))]
    // a box that holds other boxes and paints a picture behind them (a cover image set as a background) shows that picture: it is a leaf of its own, the same picture as an
    // <img> laid behind the content on the other side
    if (node.k.length && !isImg) {
      const bgl = backdropOf(e, s)
      if (bgl) node.dl = [...(node.dl ?? []), Object.assign(bgl, ancestry(e))]
    }
    const comp = compOf(e)
    if (comp != null) {
      node.comp = comp
      if (isCopy(e)) node.cl = 1
    }
    const o = folded ? ownUnder(e) : own.get(e)
    if (o) {
      node.tfs = [...o.sizes].sort((x, y) => y[1] - x[1])[0][0]
      node.ot = squash(o.text).slice(0, 24)
    }
    // a box of fixed height that cuts its content off (overflow hidden/clip, more content than room): the words past the cut are not seen
    if (/^(hidden|clip)$/.test(s.overflowY) && e.scrollHeight - e.clientHeight > 4 && e.clientHeight > 0) node.cut = e.scrollHeight
    if (!node.k.length) {
      const shown = ownShown ?? seen(e)
      node.words = shown.trim() ? 1 : 0
      node.tx = squash(shown).slice(0, 40)
      node.th = fullId(squash(shown))
      // (the complete wording of a short leaf, to read the same words cut into other boxes on the other side)
      if (node.words && squash(shown).length <= 1500) node.sq = squash(shown)
    }
    if (!node.k.length && (node.words || node.img)) {
      const ink = inkOf(e, over.length ? over : null)
      if (ink) node.ink = ink
      Object.assign(node, ancestry(e))
    }
    if (!node.k.length && (node.words || node.img) && curRoot && e !== curRoot && fxLeft > 0) {
      fxLeft--
      node.fx = hideEffect(e)
    }
    if (depth === 0) node.all = squash(seen(e)).slice(0, 12000)
    return node
  }
  const bandOf = (e, kind) => {
    const r = e.getBoundingClientRect()
    budget = 600
    if (!cfg.shapeOnly) ownText(e)
    if (cfg.shapeOnly) return { kind, y: Math.round(r.top + scrollY), h: Math.round(r.height) }
    logoEls = []
    curRoot = e
    leafLeft = LEAF_MAX
    capped = false
    const logo = kind === 'header' ? logoIn(e) : null
    const t = tree(e, 0)
    return { kind, y: r1(r.top + scrollY), h: r1(r.height), ...(logo ? { logo } : {}), ...(capped ? { capped: true } : {}), tree: t }
  }
  header = pick(cfg.selectors?.header) || [...document.querySelectorAll('header, [role="banner"], .t4-header, #t3-header, .t3-header')].find((e) => !e.closest('main, article, aside, footer, [role="main"]') && e.getBoundingClientRect().height >= 1) || null
  const footerAll = [...document.querySelectorAll('footer, [role="contentinfo"], .t4-footer, #t4-footer, .t3-footer')].filter((e) => !e.closest('main, article, aside, [role="main"]') && e.getBoundingClientRect().height >= 1)
  footer = pick(cfg.selectors?.footer) || footerAll.filter((e) => !footerAll.some((o) => o !== e && o.contains(e))).pop() || null
  const main = pick(cfg.selectors?.main) || document.querySelector('main, [role="main"], #t4-content, .t3-mainbody, #content') || null
  const expand = (e, depth) => {
    const kids = kidsOf(e)
    const transparent = kids.length > 0 && depth < 4 && (e === main || ((WRAPPER.test(e.className) || kids.length === 1) && vpad(cs(e)) === 0))
    return transparent ? kids.flatMap((k) => expand(k, depth + 1)) : [e]
  }
  const bands = []
  let seenHeader = !header
  let seenFooter = false
  const walk = (node) => {
    for (const k of kidsOf(node, true)) {
      if (k === header) {
        seenHeader = true
        bands.push(bandOf(k, 'header'))
      } else if (k === footer) {
        seenFooter = true
        bands.push(bandOf(k, 'footer'))
      } else if ((header && k.contains(header)) || (footer && k.contains(footer))) walk(k)
      else for (const b of expand(k, 0)) bands.push(bandOf(b, seenFooter ? 'post' : !seenHeader ? 'pre' : 'band'))
    }
  }
  walk(document.body)
  const last = bands.reduce((m, b) => Math.max(m, b.y + b.h), 0)
  const sh = document.documentElement.scrollHeight
  return {
    doc: sh > innerHeight ? sh : Math.round(Math.max(document.documentElement.getBoundingClientRect().height, last)),
    title: document.title,
    finalPath: location.pathname,
    lands: { header: Boolean(header), main: Boolean(main), footer: Boolean(footer) },
    bands
  }
}

const sameShape = (a, b) => a && b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1)

/** Bring a loaded page to rest: fonts, the pictures of the whole page (a scroll through it), then two equal readings. → { settled, waitedMs } */
export async function settleLayout(page, cfg, { ceilingMs = QUIET_CEILING_MS, stepMs = QUIET_STEP_MS, minMs = QUIET_MIN_MS } = {}) {
  const t0 = Date.now()
  await page.evaluate(() => document.fonts?.ready).catch(() => {})
  await page.evaluate(
    async (ceiling) => {
      const H = () => document.documentElement.scrollHeight
      for (let y = 0, n = 0; y < H() && n < 60; y += 600, n++) {
        scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 60))
      }
      scrollTo(0, H())
      const pending = [...document.images].filter((i) => !i.complete)
      await Promise.race([Promise.all(pending.map((i) => new Promise((r) => (i.onload = i.onerror = r)))), new Promise((r) => setTimeout(r, ceiling))])
      scrollTo(0, 0)
      await document.fonts?.ready
    },
    IMAGES_CEILING_MS
  )
  const shape = async () => {
    const r = await page.evaluate(heightsInPage, { ...cfg, shapeOnly: true })
    return [r.doc, ...r.bands.flatMap((b) => [b.y, b.h])]
  }
  // the ceiling and the minimum count from here: the scroll and the pictures took as long as a slow page took (several pages load at once)
  const tq = Date.now()
  let prev = await shape()
  let stable = 0
  while (Date.now() - tq < ceilingMs) {
    await page.waitForTimeout(stepMs)
    const now = await shape()
    stable = sameShape(prev, now) ? stable + 1 : 0
    prev = now
    if (stable >= QUIET_STABLE && Date.now() - tq >= minMs) return { settled: true, waitedMs: Date.now() - t0 }
  }
  return { settled: false, waitedMs: Date.now() - t0 }
}

/**
 * Measure the heights of `o.pairs` at `o.heightsWidths ?? o.widths`: one fresh load per route × width × side.
 * `o` is the sweep's options plus `load` and `passContext` (site-sweep.mjs). → { rows: [{route, width, source, port}], owed: [], notOwed: [] }
 */
export async function measureHeights(o) {
  const rows = []
  const owed = []
  const notOwed = []
  const widths = o.heightsWidths ?? o.widths
  const scheme = o.schemes.includes('light') ? 'light' : o.schemes[0]
  const late = () => o.deadlineAt != null && Date.now() > o.deadlineAt
  const jobs = []
  for (const pg of o.pairs.filter((p) => p.sourceUrl)) for (const width of [...widths].sort((a, b) => b - a)) jobs.push({ pg, width })
  await mapLimit(jobs, o.concurrency ?? 4, async ({ pg, width }) => {
    if (late()) return owed.push({ route: pg.path, width, check: HEIGHTS_ID, reason: 'the deadline was reached before this page was measured' })
    const isError = pg.status >= 400
    const sides = [
      { name: 'port', side: 'site', origin: new URL(o.site).origin, url: new URL(pg.path, o.site).href, expect: { status: pg.status, error: isError, onlyOrigin: new URL(o.site).origin } },
      { name: 'source', side: 'source', origin: new URL(pg.sourceUrl).origin, url: pg.sourceUrl, expect: { status: pg.status, error: isError } }
    ]
    const gap = scheme === 'dark' ? darkPassGap(o.plan.hooks, o.schemes) : null
    if (gap === 'derived') return notOwed.push({ route: pg.path, width, scheme, check: HEIGHTS_ID, reason: DARK_DERIVED_REASON })
    if (gap === 'owed') return owed.push({ route: pg.path, width, check: HEIGHTS_ID, reason: 'no dark switch for one side' })
    try {
      const [port, source] = await Promise.all(
        sides.map((s) =>
          withTimeout(
            (() => {
              const ctx = o.passContext({ side: s.side, origin: s.origin, width, scheme, hooks: o.plan.hooks })
              return readSide(
                o,
                { s, kind: 'heights', ctx, extra: { selectors: o.plan.selectors[s.side], quiet: o.heightsQuiet ?? {}, settleMs: o.settleMs ?? null }, label: { route: pg.path, width, scheme, check: HEIGHTS_ID } },
                (b) =>
                  withPage(b, ctx, async (page) => {
                    await o.load(page, s.url, s.expect, o.settleMs)
                    const cfg = { selectors: o.plan.selectors[s.side] }
                    const quiet = await settleLayout(page, cfg, o.heightsQuiet ?? {})
                    const read = await page.evaluate(heightsInPage, cfg)
                    const bare = await page.evaluate(() => window.__sweepBare === true)
                    // the body face and the web fonts that loaded: a source that draws in a system face moves text wraps and line heights
                    const fonts = await page.evaluate(() => ({ body: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, '').trim(), loaded: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))] }))
                    return { ...read, bare, quiet, fonts }
                  })
              )
            })(),
            SIDE_TIMEOUT_MS,
            `${pg.path} ${s.name} @${width}`
          )
        )
      )
      rows.push({ route: pg.path, width, sourceUrl: pg.sourceUrl, source, port })
    } catch (e) {
      owed.push({ route: pg.path, width, check: HEIGHTS_ID, reason: String(e.message).split('\n')[0] })
    }
  })
  // the jobs ran in parallel: the rows are in the dossier's route order, narrowest width first
  const order = new Map(o.pairs.map((p, i) => [p.path, i]))
  rows.sort((x, y) => order.get(x.route) - order.get(y.route) || x.width - y.width)
  return { rows, owed, notOwed }
}
