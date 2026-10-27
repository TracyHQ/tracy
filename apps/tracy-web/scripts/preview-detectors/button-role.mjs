/**
 * Buttons that no longer wear the system's button (G2 of PR 2, 14/10/2026). Tracy Base WordPress
 * under Moxie shows black square buttons on the blue CTA band: the link inside is a pill, but its
 * wrapper (`.tracy-btn--inverse`) paints a square black box that hugs it, so the visitor sees a square
 * where every other button of the page is the system's pill.
 *
 * The probe reads each visible button with a label as the visitor sees it: the outermost box that hugs
 * it (the button or a wrapper within `HUG` px on every side) with an opaque fill gives the corner and
 * the fill, a border the outline; the ground is the first opaque fill beyond it. It also reads the
 * system's button as the page resolves it (`--ds-btn-radius`, `--ds-c-accent`, through a probe element).
 *
 * `detect` judges the worn page alone, as the visitor of the preview sees it: the system's corner is
 * `--ds-btn-radius` when the system sets it, else the corner of the accent-filled buttons of the same
 * page. A filled or outlined button whose visible corner is off that corner, or whose fill or outline
 * is none of the system's colours, is one finding. `plain` only says who broke it (`by`).
 */
import { byPath, DETECTOR_LIMITS, dist, hex, ofSystem, PAGE_HELPERS, systemOf } from './lib/colour.mjs'
import { BUTTON_SELECTOR } from './lib/buttons.mjs'

export const kind = 'button-role'

/** A toggle with `aria-expanded` wider than this is a disclosure row (an accordion's question), not a button. */
export const DISCLOSURE_PX = 320

/** A wrapper hugs a button when each of its sides is within this many px of the button's. */
const HUG = 6

/**
 * A link with no button class read as a button: a box of a button's size (24 to 72 px tall, at most
 * 420 px wide, 8 px or more of side padding) with an opaque fill and a label of 3 to 40 characters,
 * outside navigation (a menu, a pagination). It is judged only when that fill is
 * the system's accent (a link filled with the accent is a call to action, not a tag or a card).
 */
export const LINK_BOX = Object.freeze({ minH: 24, maxH: 72, maxW: 420, minPad: 8 })

/**
 * A row cell: a button that is a flush block of a header or menu row (JA Impact's header Donate now,
 * 17/10/2026: a square, full-height green cell beside the bordered menu cells of the same row). Its
 * corner is the row's, not a call to action's, so the corner check skips it; its fill is still judged.
 * It counts as one when, inside a header or navigation band, the nearest ancestor wider than it (its
 * row) starts and ends within `edgePx` of its own top and bottom, and that row holds another cell with a
 * left or right border whose top and bottom are within `edgePx` of the button's.
 */
export const ROW_CELL = Object.freeze({ edgePx: 2 })

/**
 * A segmented control's cell (Tracy Base EmDash 0.5.6's marketing "Appearance Light | Dark", 18/10/2026): two
 * or more buttons side by side in one frame the visitor sees as ONE control (a pill with a border that clips
 * its cells). The active cell is filled with the accent and square, because its corners are the frame's;
 * read alone it is "a square accent button" though the visitor sees the system's pill. The cell is judged
 * by the frame's shape: the frame's corner against the system's corner, the cell's fill as before. A frame
 * counts when its cells (two or more children that are or hold a button) share one row within `edgePx`,
 * it hugs them (`framePx` a side), and it is a group by role (group, radiogroup, tablist, toolbar) or it
 * draws (a border or an opaque fill) and clips (overflow not visible). A square frame stays a finding.
 */
export const SEGMENT = Object.freeze({ edgePx: 2, framePx: 6 })

export const ROLE_LIMITS = Object.freeze({
  /** a corner is off when it differs from the system's by more than this share of the system's... */
  cornerShare: 0.5,
  /** ...and by more than this many px */
  cornerPx: 4
})

export const probe = `(() => {${PAGE_HELPERS}
  const px = (v) => Math.round(parseFloat(v) || 0)
  const has = (n) => !!getComputedStyle(document.body).getPropertyValue(n).trim()
  const t = document.createElement('button')
  t.style.cssText = 'position:absolute;left:-9999px;top:0;width:200px;height:40px;border:0;border-radius:var(--ds-btn-radius);background-color:var(--ds-c-accent)'
  document.body.appendChild(t)
  const tcs = getComputedStyle(t)
  const tokens = { radius: has('--ds-btn-radius') ? px(tcs.borderTopLeftRadius) : null, accent: has('--ds-c-accent') ? ch(tcs.backgroundColor) : null }
  t.remove()
  const opaque = (cs) => { if (/gradient|url\\(/.test(cs.backgroundImage)) return null; const c = ch(cs.backgroundColor); return c && c.a > 0.5 ? c : null }
  const out = []
  for (const e of document.querySelectorAll(${JSON.stringify(BUTTON_SELECTOR)})) {
    if (out.length >= 300) break
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r) continue
    const text = (e.tagName === 'INPUT' ? e.value : e.innerText || '').trim()
    if (!text) continue
    // a disclosure row (a toggle that says whether it is open) as wide as a column is a list of questions,
    // not a call to action: JA Voyara's pricing FAQ, a Bootstrap accordion whose rows keep their 14px
    // corner beside the system's pills (16/10/2026)
    if (e.matches('[aria-expanded]') && r.width > ${DISCLOSURE_PX}) continue
    // the layers the visitor sees as this button: the button and the wrappers that hug it
    const layers = [e]
    for (let x = e.parentElement; x && x !== document.body && layers.length < 4; x = x.parentElement) {
      const q = x.getBoundingClientRect()
      if (Math.abs(q.left - r.left) > ${HUG} || Math.abs(q.right - r.right) > ${HUG} || Math.abs(q.top - r.top) > ${HUG} || Math.abs(q.bottom - r.bottom) > ${HUG}) break
      layers.push(x)
    }
    let face = null
    for (const x of layers) { const c = opaque(getComputedStyle(x)); if (c) face = { x, fill: c } }
    const shape = face ? face.x : e
    const scs = getComputedStyle(shape)
    const bw = px(cs.borderTopWidth)
    const border = bw && cs.borderTopStyle !== 'none' ? ch(cs.borderTopColor) : null
    let ground = null
    for (let x = layers[layers.length - 1].parentElement; x; x = x.parentElement) { const c2 = getComputedStyle(x); if (/url\\(|gradient/.test(c2.backgroundImage)) break; const c = ch(c2.backgroundColor); if (c && c.a > 0.9) { ground = c; break } }
    const sr = shape.getBoundingClientRect()
    // a field the button is joined to: the element right before it is an input, select or textarea
    // within 16px (a search bar's input + button, a subscribe field + button)
    const prev = e.previousElementSibling
    let field = null
    if (prev && /^(INPUT|SELECT|TEXTAREA)$/.test(prev.tagName)) {
      const pr = seen(prev, getComputedStyle(prev))
      if (pr && Math.max(r.left - pr.right, pr.left - r.right, r.top - pr.bottom, pr.top - r.bottom) <= 16)
        field = { radius: px(getComputedStyle(prev).borderTopLeftRadius), w: Math.round(pr.width), h: Math.round(pr.height) }
    }
    // a row cell (ROW_CELL): a flush block that fills its header or menu row beside bordered cells
    let cell = false
    if (e.closest('header, nav, [role=banner], [role=navigation]')) {
      const E = ${ROW_CELL.edgePx}
      let row = layers[layers.length - 1].parentElement
      while (row && row !== document.body && row.getBoundingClientRect().width <= sr.width + ${HUG}) row = row.parentElement
      const rr = row && row !== document.body ? row.getBoundingClientRect() : null
      if (rr && Math.abs(rr.top - sr.top) <= E && Math.abs(rr.bottom - sr.bottom) <= E)
        cell = [...row.querySelectorAll('li, a, .nav-item, .nav-link')].some((x) => {
          if (layers.includes(x) || x.contains(e) || e.contains(x)) return false
          const xc = getComputedStyle(x)
          const side = (w, st) => px(w) >= 1 && st !== 'none'
          if (!side(xc.borderLeftWidth, xc.borderLeftStyle) && !side(xc.borderRightWidth, xc.borderRightStyle)) return false
          const q = x.getBoundingClientRect()
          return q.width > 0 && Math.abs(q.top - sr.top) <= E && Math.abs(q.bottom - sr.bottom) <= E
        })
    }
    // a cell of a segmented control (SEGMENT): the box the visitor sees is the shared frame around the cells
    let segment = null
    const frame = layers[layers.length - 1].parentElement
    if (frame && frame !== document.body) {
      const fr = frame.getBoundingClientRect()
      const fc = getComputedStyle(frame)
      const cells = [...frame.children].filter((x) => x.matches(${JSON.stringify(BUTTON_SELECTOR)}) || x.querySelector(${JSON.stringify(BUTTON_SELECTOR)}))
      const row = cells.length >= 2 && cells.every((x) => { const q = x.getBoundingClientRect(); return q.height > 0 && Math.abs(q.top - sr.top) <= ${SEGMENT.edgePx} && Math.abs(q.bottom - sr.bottom) <= ${SEGMENT.edgePx} })
      const hugs = fr.height - sr.height <= 2 * ${SEGMENT.framePx}
      const named = /^(group|radiogroup|tablist|toolbar)$/.test(frame.getAttribute('role') || '')
      const drawn = (px(fc.borderTopWidth) >= 1 && fc.borderTopStyle !== 'none') || !!opaque(fc)
      const clips = fc.overflowX !== 'visible' || fc.overflowY !== 'visible'
      if (row && hugs && (named || (drawn && clips)))
        segment = { w: Math.round(fr.width), h: Math.round(fr.height), radius: Math.max(px(fc.borderTopLeftRadius), px(fc.borderTopRightRadius), px(fc.borderBottomRightRadius), px(fc.borderBottomLeftRadius)) }
    }
    out.push({ path: pathOf(e), at: label(shape), text: text.slice(0, 30), w: Math.round(sr.width), h: Math.round(sr.height),
      // the visible corner is the roundest of the four: a button joined to a field rounds its outer
      // corners only (TB EmDash's search: 0 R R 0, read as 0 from the top-left alone, 15/10/2026)
      radius: Math.max(px(scs.borderTopLeftRadius), px(scs.borderTopRightRadius), px(scs.borderBottomRightRadius), px(scs.borderBottomLeftRadius)), fill: face ? face.fill : null, border: border && border.a > 0.5 ? border : null, ground,
      ...(field && { field }), ...(cell && { cell: true }), ...(segment && { segment }) })
  }
  // a link the template paints as a button with no button class (JA Kinetic WordPress's
  // a.acm-split-cta, "Read the KineticQL docs": a filled box of a button's size beside the system's
  // pills, 15/10/2026): read too, marked link; detect judges it only when its fill is the accent
  for (const e of document.querySelectorAll('a')) {
    if (out.length >= 300) break
    if (e.matches(${JSON.stringify(BUTTON_SELECTOR)})) continue
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || r.height < ${LINK_BOX.minH} || r.height > ${LINK_BOX.maxH} || r.width > ${LINK_BOX.maxW} || px(cs.paddingLeft) < ${LINK_BOX.minPad}) continue
    const text = (e.innerText || '').trim()
    // a page number or a link in a menu is navigation, not a call to action (JA Kinetic's blog
    // pagination: the current page a filled 8px square)
    if (text.length < 3 || text.length > 40 || e.closest('nav, [role=navigation], .pagination, .page-numbers')) continue
    const fill = opaque(cs)
    if (!fill) continue
    let ground = null
    for (let x = e.parentElement; x; x = x.parentElement) { const c2 = getComputedStyle(x); if (/url\\(|gradient/.test(c2.backgroundImage)) break; const c = ch(c2.backgroundColor); if (c && c.a > 0.9) { ground = c; break } }
    out.push({ path: pathOf(e), at: label(e), text: text.slice(0, 30), w: Math.round(r.width), h: Math.round(r.height),
      radius: Math.max(px(cs.borderTopLeftRadius), px(cs.borderTopRightRadius), px(cs.borderBottomRightRadius), px(cs.borderBottomLeftRadius)), fill, border: null, ground, link: true })
  }
  return { tokens, buttons: out }
})()`

/** The corner a box shows: a radius past half its short side draws the same pill. @param {any} b @param {number} r */
const corner = (b, r) => Math.min(r, Math.min(b.w, b.h) / 2)

/** The system's button corner on this page, or null. @param {any} data */
export function systemCorner(data, t = DETECTOR_LIMITS) {
  if (typeof data?.tokens?.radius === 'number') return { radius: data.tokens.radius, from: '--ds-btn-radius' }
  const accent = data?.tokens?.accent
  if (!accent) return null
  // a button joined to a field wears the field's corner, not the system's (offRole), and a row cell its
  // row's (ROW_CELL): neither says anything of the system's button
  const ours = (data.buttons ?? []).filter(
    (b) => b.fill && !b.field && !b.link && !b.cell && !b.segment && dist(b.fill, accent) <= t.systemTolerance
  )
  if (!ours.length) return null
  // the corner most of the accent buttons show, as a share of their short side (a pill stays a pill)
  const shares = ours.map((b) => corner(b, b.radius) / (Math.min(b.w, b.h) / 2)).sort((a, b) => a - b)
  return { share: shares[shares.length >> 1], from: 'the accent buttons of the page' }
}

/** Why a worn button is off the system's button, or null. @param {any} b @param {any} sys @param {any[]} colours */
export function offRole(b, sys, colours, t = ROLE_LIMITS) {
  if (!b?.text || (!b.fill && !b.border)) return null
  const why = []
  // a button joined to a field (b.field) wears the field's corner: the form keeps the template's
  // metrics, and a pill hung on a square field reads as two controls glued together (Tracy Business
  // Joomla's search bar, subscribe fields, 15/10/2026). Its fill is still judged.
  const joined = b.field && Math.abs(corner(b, b.radius) - corner(b.field, b.field.radius)) <= t.cornerPx
  // a row cell (ROW_CELL) wears its row's corner: only its colours are judged
  if (sys && !joined && !b.cell) {
    // a segmented control's cell (SEGMENT) shows the corner of its frame, the one control the visitor sees
    const box = b.segment ?? b
    const want = 'share' in sys ? sys.share * (Math.min(box.w, box.h) / 2) : corner(box, sys.radius)
    const got = corner(box, box.radius)
    if (Math.abs(got - want) > Math.max(t.cornerPx, t.cornerShare * want))
      why.push(`corner ${Math.round(got)}px where the system's button has ${Math.round(want)}px`)
  }
  if (b.fill && !ofSystem(b.fill, colours)) why.push(`fill ${hex(b.fill)} is none of the system's colours`)
  if (b.border && !b.fill && !ofSystem(b.border, colours))
    why.push(`outline ${hex(b.border)} is none of the system's colours`)
  return why.length ? why.join(', ') : null
}

/** @param {{ worn: any, plain: any, systemColours: string[] }} input */
export function detect({ worn, plain, systemColours }) {
  const colours = systemOf(systemColours)
  const sys = systemCorner(worn?.data)
  const plainOf = byPath(plain?.data?.buttons)
  const findings = []
  const accent = worn?.data?.tokens?.accent
  for (const b of worn?.data?.buttons ?? []) {
    // a link read for its looks (probe: link) is a button only when it wears the accent
    if (b.link && !(accent && b.fill && dist(b.fill, accent) <= DETECTOR_LIMITS.systemTolerance)) continue
    const why = offRole(b, sys, colours)
    if (!why) continue
    const was = plainOf.get(b.path)
    findings.push({
      at: b.at,
      text: b.text,
      why,
      // the same square or colour on the template's own page: the template's rule never read the slot
      by: was && was.radius === b.radius && !was.fill === !b.fill ? 'template' : 'system'
    })
  }
  return { count: findings.length, findings }
}
