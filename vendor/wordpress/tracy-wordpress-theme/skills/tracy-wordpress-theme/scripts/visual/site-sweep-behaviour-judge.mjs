// The comparison half of the behaviour checks of site-sweep: pure functions from what the probes read on the port and on the
// source to defects, listed differences, notDefects and not-measured cases. Same shape as site-sweep-judge.mjs:
// { cases, defects, listed, notDefects, notMeasured }. A row is { route, width?, scheme?, source, port }.
//
// The standard is the sweep's: a DEFECT is a difference a visitor can see or act on; a difference nobody can see is LISTED; a pairing the
// judge is not sure of is NOT-MEASURED with its cause; a fault of the source goes to notDefects with its evidence.
import { sameColor, parseColor, fontWarnings } from './site-sweep-judge.mjs'
import { shapeLikeness, shapeBox, shapePicture } from './site-sweep-behaviour.mjs'

export const BEHAVIOUR_ORDER = ['fixed-widgets', 'icons', 'forms', 'text', 'first-interaction']
/** Target-only invariants retained when a page has no visual comparison source. */
export function judgeTargetBehaviour(check, rows) {
  const outcomes = []
  const defects = []
  const owed = []
  const add = (r, status, observed, reason = null) => {
    const entry = { check, route: r.route, width: r.width, ...(r.scheme ? { scheme: r.scheme } : {}), ...(r.state ? { state: r.state } : {}), status, ...(observed !== undefined ? { observed } : {}), ...(reason ? { reason } : {}) }
    outcomes.push(entry)
    if (status === 'fail') defects.push(entry)
    if (status === 'not-measured') owed.push(entry)
  }
  for (const r of rows) {
    const p = r.port
    if (!p) { add(r, 'not-measured', undefined, 'target reading is missing'); continue }
    if (check === 'fixed-widgets') {
      const widgets = p.widgets
      if (!Array.isArray(widgets)) { add(r, 'not-measured', undefined, 'widget discovery did not return a list'); continue }
      if (!widgets.length) { add(r, 'pass', { found: 0 }); continue }
      for (const w of widgets) {
        if (!w.ink || !Number.isFinite(w.ink.ratio)) add(r, 'not-measured', { widget: w.sel ?? null }, 'widget screenshot is missing')
        else add(r, w.ink.ratio >= 0.004 ? 'pass' : 'fail', { widget: w.sel ?? null, inkRatio: w.ink.ratio, threshold: 0.004 }, w.ink.ratio >= 0.004 ? null : 'widget mark is below the visible-ink threshold')
      }
    } else if (check === 'icons') {
      if (!Array.isArray(p.icons)) { add(r, 'not-measured', undefined, 'icon discovery did not return a list'); continue }
      const icons = p.icons
      const unread = icons.filter((x) => x.unmeasured)
      for (const x of unread) add(r, 'not-measured', { icon: x.key ?? x.name ?? x.tag ?? null }, x.why ?? x.unmeasured ?? 'icon region is ambiguous or unread')
      const found = icons.filter((x) => !x.unmeasured)
      if (!found.length && !unread.length) add(r, 'pass', { found: 0 })
      for (const x of found) {
        if (x.gone || !x.ink || !Number.isFinite(x.ink.ratio) || typeof x.reachable !== 'boolean') add(r, 'not-measured', { icon: x.key ?? x.name ?? x.tag ?? null }, x.gone ? 'icon disappeared before it was read' : 'icon screenshot or reachability is missing')
        else if (!x.reachable) add(r, 'fail', { icon: x.key ?? x.name ?? x.tag ?? null, reachable: false }, 'icon control is covered')
        else if (x.ink.ratio < 0.004) add(r, 'fail', { icon: x.key ?? x.name ?? x.tag ?? null, inkRatio: x.ink.ratio, threshold: 0.004 }, 'icon mark is below the visible-ink threshold')
        else add(r, 'pass', { icon: x.key ?? x.name ?? x.tag ?? null, reachable: true, inkRatio: x.ink.ratio, threshold: 0.004 })
      }
    } else if (check === 'forms') {
      if (!Array.isArray(p.forms)) { add(r, 'not-measured', undefined, 'form discovery did not return a list'); continue }
      const forms = p.forms
      const candidates = forms.filter((f, index) => index < (p.formsFocusRead ?? forms.length) && f.focus !== undefined)
      if (!forms.length) add(r, 'pass', { forms: 0 })
      else if (!candidates.length) add(r, 'not-measured', { forms: forms.length }, 'form focus read was not attempted')
      else for (const f of candidates) {
        const eligible = (f.fields ?? []).some((field) => !['hidden', 'submit', 'button', 'checkbox', 'radio', 'image', 'file', 'reset'].includes(field.type))
        if (!f.focus && !eligible) add(r, 'pass', { form: f.id ?? f.purpose ?? null, focusField: 'none-selected' })
        else if (!f.focus) add(r, 'not-measured', { form: f.id ?? f.purpose ?? null }, 'focus appearance could not be read')
        else {
          const indicator = focusIndicator(f.focus)
          add(r, indicator.length ? 'pass' : 'fail', { field: f.name ?? f.type ?? null, indicator }, indicator.length ? null : 'focus does not change the border, outline, or shadow')
        }
      }
      for (const f of forms.slice(p.formsFocusRead ?? forms.length)) {
        const eligible = (f.fields ?? []).some((field) => !['hidden', 'submit', 'button', 'checkbox', 'radio', 'image', 'file', 'reset'].includes(field.type))
        if (eligible) add(r, 'not-measured', { form: f.id ?? f.purpose ?? null }, 'form focus read exceeds the existing eight form cap')
      }
    } else if (check === 'first-interaction') {
      if (r.kind === 'theme') {
        const x = p
        if (x.missing || !['light', 'dark'].includes(x.before) || !['light', 'dark'].includes(x.after)) add(r, 'not-measured', undefined, x.missing ?? 'theme state could not be read')
        else if (r.expect && x.before !== r.expect) add(r, 'fail', { before: x.before, expected: r.expect }, 'target did not honor the requested saved scheme')
        else add(r, x.flips ? 'pass' : 'fail', { before: x.before, after: x.after, flips: x.flips }, x.flips ? null : 'first theme click did not change scheme')
      } else if (r.kind === 'touch') {
        if (p.missing) add(r, 'not-measured', undefined, p.missing)
        else if (!Array.isArray(p.parents)) add(r, 'not-measured', undefined, 'parent menu discovery did not return a list')
        else if (!p.parents.length) add(r, 'not-measured', { found: 0 }, 'no parent menu item with a hidden panel was found')
        else for (const parent of p.parents) {
          if (!parent.taps?.length) add(r, 'not-measured', { parent: parent.text }, 'first tap result was not read')
          else add(r, parent.taps[0].opened && !parent.taps[0].navigated ? 'pass' : 'fail', { parent: parent.text, firstTap: parent.taps[0] }, 'first tap must open the panel without navigating')
        }
        if ((r.found ?? 0) > (r.readCount ?? 0)) add(r, 'not-measured', { found: r.found, read: r.readCount ?? 0 }, 'some discovered parent items were not read')
      } else if (r.kind === 'drawer') {
        if (p.missing || typeof p.opens !== 'boolean') add(r, 'not-measured', undefined, p.missing ?? 'drawer open result is missing')
        else {
          add(r, p.opens ? 'pass' : 'fail', { opens: p.opens }, 'drawer must open')
          if (p.opens && typeof p.closes !== 'boolean') add(r, 'not-measured', { opens: true }, 'drawer close result is missing')
          else if (p.opens) add(r, p.closes ? 'pass' : 'fail', { closes: p.closes }, 'drawer must close')
          if (p.backWorks !== undefined) add(r, p.backWorks === true ? 'pass' : p.backWorks === false ? 'fail' : 'not-measured', { backWorks: p.backWorks }, p.backWorks === false ? 'discovered back control did not restore the drawer rows' : p.backWorks === null ? 'discovered back control was not measurable' : null)
        }
      }
    }
  }
  return { outcomes, defects, owed, cases: outcomes.filter((x) => x.status !== 'not-applicable').length }
}
export const BEHAVIOUR_TITLES = {
  'fixed-widgets': 'Fixed page widgets (back-to-top, floating buttons, cookie bars) exist on both sides with the same box and a mark a visitor can see',
  icons: 'Icon controls of the top band (topbar and header) and footer have the same box, place in their row, visible mark and drawn glyph as the source',
  forms: 'Forms have the same fields, required/focus/placeholder/label, links in their region and field focus look as the source',
  text: 'Text blocks end where the source\'s end, and logo, nav, button, pagination and footer labels have the source\'s words, case, size, weight and letter-spacing',
  'first-interaction': 'The theme switch flips on the first click in every state, touch menus open on the first tap, the mobile drawer opens, lists the same rows, and closes'
}

export const STRIP_CELL_STEP = 20
export const STRIP_CELLS = 4
const near = (a, b, tol) => Math.abs(a - b) <= tol
const r1 = (n) => Math.round(n * 10) / 10
const xText = (x) => (x == null ? 'missing' : r1(x))
const where = (r) => ({ route: r.route, ...(r.width != null ? { width: r.width } : {}), ...(r.scheme ? { scheme: r.scheme } : {}), ...(r.state ? { state: r.state } : {}) })
const empty = () => ({ cases: 0, defects: [], listed: [], notDefects: [], notMeasured: [], unavailable: [] })
/** A route whose source answers the web server's own page (no stylesheet) while the port answers a page: nothing to compare, listed. */
const bareSource = (r, out) => {
  if (r.source?.bare !== true || r.port?.bare !== false) return false
  out.listed.push({ ...where(r), what: 'bare-source-page', why: 'the source answers a page with no stylesheet (the web server\'s own page), so there is no page of the source to compare the port\'s with', chip: r.route, source: 'bare page', port: 'a page' })
  return true
}
const FONT_WHY = 'the source draws in a system face (its web font did not load), so a width or wrap that depends on the text is not comparable'

/** Distance between two rgb colours as the largest channel step, or null. */
export function colourStep(a, b) {
  const x = parseColor(a)
  const y = parseColor(b)
  if (!x || !y) return null
  return Math.max(...[0, 1, 2].map((i) => Math.abs(x[i] - y[i])))
}
const rgbText = (c) => (Array.isArray(c) ? `rgb(${c.join(', ')})` : String(c))

// ---- fixed-widgets ----------------------------------------------------------------------------------------------------

/** Pair widgets by corner of the viewport (alone in it on both sides), else by accessible name; the rest is unpaired. */
export function pairWidgets(source, port) {
  const pairs = []
  const unpaired = { source: [], port: [] }
  const left = { source: [...source], port: [...port] }
  const take = (list, x) => list.splice(list.indexOf(x), 1)
  for (const s of [...left.source]) {
    const sameCorner = (list) => list.filter((w) => w.corner === s.corner)
    const ps = sameCorner(left.port)
    const ss = sameCorner(left.source)
    if (ps.length === 1 && ss.length === 1) {
      pairs.push({ source: s, port: ps[0], by: 'corner' })
      take(left.source, s)
      take(left.port, ps[0])
    }
  }
  for (const s of [...left.source]) {
    const n = (w) => w.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    const p = s.name && left.port.find((w) => w.corner === s.corner && n(w) === n(s))
    if (p) {
      pairs.push({ source: s, port: p, by: 'name' })
      take(left.source, s)
      take(left.port, p)
    }
  }
  unpaired.source = left.source
  unpaired.port = left.port
  return { pairs, unpaired }
}

export function judgeFixedWidgets(rows) {
  const out = empty()
  for (const r of rows) {
    if (!r.source || !r.port) continue
    if (bareSource(r, out)) continue
    const w = where(r)
    const { pairs, unpaired } = pairWidgets(r.source.widgets ?? [], r.port.widgets ?? [])
    out.cases += pairs.length + unpaired.source.length + unpaired.port.length || 1
    for (const [side, other] of [['source', 'port'], ['port', 'source']]) {
      for (const u of unpaired[side]) {
        // a corner holding several widgets on the other side cannot be paired by corner
        const crowded = (r[other].widgets ?? []).filter((x) => x.corner === u.corner).length > 1 || (r[side].widgets ?? []).filter((x) => x.corner === u.corner).length > 1
        if (crowded) out.notMeasured.push({ ...w, cause: 'widgets-unpairable', why: `several widgets stand in the ${u.corner} corner and none carries the same name on both sides`, detail: u.name || u.sel })
        else out.defects.push({ ...w, what: `fixed-widget-only-${side}`, cause: `fixed-widget-only-${side}|${u.corner}`, culprit: u.sel, source: side === 'source' ? `${u.sel} ${r1(u.rect.w)}×${r1(u.rect.h)} "${u.name}"` : 'none', port: side === 'port' ? `${u.sel} ${r1(u.rect.w)}×${r1(u.rect.h)} "${u.name}"` : 'none' })
      }
    }
    for (const { source: s, port: p } of pairs) {
      if (!near(s.rect.w, p.rect.w, 2) || !near(s.rect.h, p.rect.h, 2)) out.defects.push({ ...w, what: 'fixed-widget-box', cause: `fixed-widget-box|${s.corner}`, culprit: p.sel, source: `${r1(s.rect.w)}×${r1(s.rect.h)}`, port: `${r1(p.rect.w)}×${r1(p.rect.h)}` })
      else if (!near(s.fromRight, p.fromRight, 3) || !near(s.fromBottom, p.fromBottom, 3)) out.defects.push({ ...w, what: 'fixed-widget-position', cause: `fixed-widget-position|${s.corner}`, culprit: p.sel, source: `${r1(s.fromRight)} right, ${r1(s.fromBottom)} bottom`, port: `${r1(p.fromRight)} right, ${r1(p.fromBottom)} bottom` })
      const si = s.ink
      const pi = p.ink
      if (!si || !pi) {
        out.notMeasured.push({ ...w, cause: 'widget-not-rasterised', why: 'the widget could not be photographed (outside the page or covered while shooting)', detail: p.sel })
        continue
      }
      const markless = (i) => i.ratio < 0.004
      if (markless(pi) && !markless(si)) out.defects.push({ ...w, what: 'fixed-widget-mark-invisible', cause: `fixed-widget-mark-invisible|${s.corner}`, culprit: p.sel, source: `mark ink ${(si.ratio * 100).toFixed(1)}% on ${rgbText(si.bg)}`, port: `no visible mark: ink ${(pi.ratio * 100).toFixed(2)}% on ${rgbText(pi.bg)}` })
      else if (markless(pi) && markless(si)) out.listed.push({ ...w, what: 'fixed-widget-no-mark-either', why: 'neither side draws a visible mark in the widget', chip: p.sel, source: 'no mark', port: 'no mark' })
      else if (markless(si) && !markless(pi)) out.listed.push({ ...w, what: 'fixed-widget-source-mark-invisible', why: 'the source\'s own widget shows no mark (its icon font may not load); the port draws one', chip: p.sel, source: 'no visible mark', port: `ink ${(pi.ratio * 100).toFixed(1)}%` })
      else {
        // the paint is the widget's own (the photograph reads what differs from the page without it): a widget with no tile of its own has none to compare
        const step = si.transparent || pi.transparent ? null : colourStep(rgbText(si.bg), rgbText(pi.bg))
        if (step != null && step > 48) out.defects.push({ ...w, what: 'fixed-widget-paint', cause: `fixed-widget-paint|${s.corner}`, culprit: p.sel, source: rgbText(si.bg), port: rgbText(pi.bg) })
        else if (si.box && pi.box && (!near(si.box.w, pi.box.w, Math.max(4, si.box.w * 0.35)) || !near(si.box.h, pi.box.h, Math.max(4, si.box.h * 0.35)))) out.defects.push({ ...w, what: 'fixed-widget-mark-size', cause: `fixed-widget-mark-size|${s.corner}`, culprit: p.sel, source: `${r1(si.box.w)}×${r1(si.box.h)}`, port: `${r1(pi.box.w)}×${r1(pi.box.h)}` })
      }
    }
  }
  return out
}

// ---- icons ------------------------------------------------------------------------------------------------------------

/**
 * Pair icon controls of one landmark: by key (host of the link, or accessible name), then — for what is left, when the two sides name a
 * control differently — by what it is for (`role`: theme, search, menu, a social network…) and by the internal page it links to, each
 * only when one is left on each side; the rest by elimination, only when one is left on each side; several left on both sides are not paired.
 */
export function pairIcons(source, port) {
  const pairs = []
  const ls = [...source]
  const lp = [...port]
  const pairBy = (field, by) => {
    for (const s of [...ls]) {
      if (!s[field]) continue
      const sameS = ls.filter((x) => x[field] === s[field])
      const sameP = lp.filter((x) => x[field] === s[field])
      if (sameS.length === 1 && sameP.length === 1) {
        pairs.push({ source: s, port: sameP[0], by })
        ls.splice(ls.indexOf(s), 1)
        lp.splice(lp.indexOf(sameP[0]), 1)
      }
    }
  }
  pairBy('key', 'name')
  // the network a control stands for, whatever its host or class calls it (twitter.com and x.com are one)
  pairBy('network', 'network')
  pairBy('role', 'role')
  pairBy('path', 'link')
  // what is left stands where the other side's stands, the same size: the same control in the same place of the row. Only a place that
  // holds one control of that size on each side — each the only candidate of the other — never a guess between two.
  const atSame = (a, b) => Math.abs(a.rect.x - b.rect.x) <= 6 && Math.abs(a.rect.y - b.rect.y) <= 8 && Math.abs(a.rect.w - b.rect.w) <= 2 && Math.abs(a.rect.h - b.rect.h) <= 2
  for (const s of [...ls]) {
    const sameS = ls.filter((x) => atSame(s, x))
    const sameP = lp.filter((x) => atSame(s, x))
    // mutual: the one port control there is also the one that has this source control alone at its place, else it is a candidate of two
    if (sameS.length === 1 && sameP.length === 1 && ls.filter((x) => atSame(x, sameP[0])).length === 1) {
      pairs.push({ source: s, port: sameP[0], by: 'position' })
      ls.splice(ls.indexOf(s), 1)
      lp.splice(lp.indexOf(sameP[0]), 1)
    }
  }
  // the same number left on both sides is no proof of which is which. Only the last control on each side is the same control (elimination:
  // nothing else could be its partner); two or more left on both sides are never matched by their order or by being near each other —
  // they stay unpaired and the judge says they could not be told apart (a reordered row is not a row of other glyphs)
  if (ls.length === 1 && lp.length === 1) {
    pairs.push({ source: ls[0], port: lp[0], by: 'elimination' })
    return { pairs, unpaired: { source: [], port: [] } }
  }
  return { pairs, unpaired: { source: ls, port: lp } }
}

export const ICON_BOX_TOLERANCE = 2
/** Two glyphs of one control that share less of their painted cells than this are different drawings (see shapeLikeness). */
export const GLYPH_LIKENESS = 0.68
const glyphText = (i, c) => {
  const b = shapeBox(i.shape)
  return `${c.key || c.name || c.tag}${c.network ? ` (${c.network})` : ''} glyph ${b ? `${b.w}×${b.h} cells` : 'nothing painted'}`
}
export function judgeIcons(rows, { fontWarn = false } = {}) {
  const out = empty()
  for (const r of rows) {
    if (!r.source || !r.port) continue
    if (bareSource(r, out)) continue
    const w = where(r)
    for (const land of ['header', 'footer']) {
      const mine = (side) => (r[side].icons ?? []).filter((x) => x.land === land)
      const S = mine('source').filter((x) => !x.unmeasured)
      const P = mine('port').filter((x) => !x.unmeasured)
      // a region the probe could not read on a side (missing on that side only, or several boxes of its name that cannot be told apart): the cell is not measured, whatever the other side holds
      const gap = ['source', 'port'].map((side) => [side, mine(side).find((x) => x.unmeasured)]).filter(([, x]) => x)
      // a region missing on BOTH sides is an equal absence: nothing to compare, no case and no entry
      if (gap.length === 2 && gap.every(([, x]) => /landmark missing$/.test(x.unmeasured))) continue
      if (gap.length) {
        out.notMeasured.push({ ...w, cause: 'icons-region-not-measured', why: `not measured: ${gap.map(([side, x]) => `${side} ${x.unmeasured}`).join('; ')}`, detail: land })
        continue
      }
      if (!S.length && !P.length) continue
      const { pairs, unpaired } = pairIcons(S, P)
      out.cases += pairs.length + unpaired.source.length + unpaired.port.length
      if (unpaired.source.length || unpaired.port.length) {
        // controls left on ONE side after the pairing are controls the other side does not have: a difference of their own. Controls left on
        // BOTH sides, whose name, purpose and link settle nothing, are not guessed: the group is not measured
        if (unpaired.source.length && unpaired.port.length) out.notMeasured.push({ ...w, cause: 'icons-unpairable', why: `${land}: ${S.length} icon control(s) on the source and ${P.length} on the port; ${unpaired.source.length} and ${unpaired.port.length} of them have no partner by name, purpose or link`, detail: `source ${unpaired.source.map((x) => x.key || x.tag).join('/')} | port ${unpaired.port.map((x) => x.key || x.tag).join('/')}` })
        if (!unpaired.source.length || !unpaired.port.length) {
          const side = unpaired.source.length ? 'source' : 'port'
          const list = unpaired[side]
          out.defects.push({ ...w, what: `icon-only-${side}`, cause: `icon-only-${side}|${land}`, culprit: land, source: side === 'source' ? list.map((x) => x.key || x.tag).join(', ') : 'none', port: side === 'port' ? list.map((x) => x.key || x.tag).join(', ') : 'none' })
        }
      }
      // place within the row: x from the first paired control and the gap to the next, controls on the same line
      const sorted = pairs.slice().sort((a, b) => a.source.rect.x - b.source.rect.x)
      const sx0 = sorted[0]?.source.rect.x
      const px0 = sorted[0]?.port.rect.x
      sorted.forEach(({ source: s, port: p }, i) => {
        const tag = `${land} ${s.key || s.name || s.tag}`
        if (!s.reachable || !p.reachable) {
          if (s.reachable === p.reachable) out.notMeasured.push({ ...w, cause: 'icon-covered', why: 'the control is covered by something drawn over it on both sides, so its pixels cannot be read', detail: tag })
          else out.defects.push({ ...w, what: 'icon-not-reachable', cause: `icon-not-reachable|${land}`, culprit: tag, source: s.reachable ? 'reachable' : 'covered', port: p.reachable ? 'reachable' : 'covered' })
          return
        }
        if (!near(s.rect.w, p.rect.w, ICON_BOX_TOLERANCE) || !near(s.rect.h, p.rect.h, ICON_BOX_TOLERANCE)) out.defects.push({ ...w, what: 'icon-box', cause: `icon-box|${land}|${r1(s.rect.w)}x${r1(s.rect.h)}>${r1(p.rect.w)}x${r1(p.rect.h)}`, culprit: tag, source: `${r1(s.rect.w)}×${r1(s.rect.h)}`, port: `${r1(p.rect.w)}×${r1(p.rect.h)}` })
        else if (s.ink?.box && p.ink?.box && s.ink.ratio >= 0.004 && p.ink.ratio >= 0.004 && (!near(s.ink.box.w, p.ink.box.w, Math.max(2, s.ink.box.w * 0.2)) || !near(s.ink.box.h, p.ink.box.h, Math.max(2, s.ink.box.h * 0.2)))) out.defects.push({ ...w, what: 'icon-mark-size', cause: `icon-mark-size|${land}|${tag}`, culprit: tag, source: `painted ${r1(s.ink.box.w)}×${r1(s.ink.box.h)}`, port: `painted ${r1(p.ink.box.w)}×${r1(p.ink.box.h)}` })
        // the row: only the controls that sit on one line
        if (i > 0 && near(s.rect.y, sorted[0].source.rect.y, 8) && near(p.rect.y, sorted[0].port.rect.y, 8)) {
          const sdx = s.rect.x - sx0
          const pdx = p.rect.x - px0
          if (!near(sdx, pdx, 3)) out.defects.push({ ...w, what: 'icon-position-in-row', cause: `icon-position-in-row|${land}|${tag}`, culprit: tag, source: `${r1(sdx)}px from the first icon`, port: `${r1(pdx)}px from the first icon` })
        }
        if (s.ink && p.ink && s.ink.box && p.ink.box && s.ink.ratio >= 0.004 && p.ink.ratio >= 0.004) {
          const big = Math.max(s.ink.ratio, p.ink.ratio)
          const small = Math.min(s.ink.ratio, p.ink.ratio)
          const box = near(s.ink.box.w, p.ink.box.w, Math.max(4, s.ink.box.w * 0.4)) && near(s.ink.box.h, p.ink.box.h, Math.max(4, s.ink.box.h * 0.4))
          // a different mark of the same size is beyond reach unless the pixels differ strongly
          if (big > 0.02 && small < big * 0.4) out.defects.push({ ...w, what: 'icon-pixels', cause: `icon-pixels|${land}|${tag}`, culprit: tag, source: `ink ${(s.ink.ratio * 100).toFixed(0)}% of the box`, port: `ink ${(p.ink.ratio * 100).toFixed(0)}% of the box` })
          else if (!box) out.listed.push({ ...w, what: 'icon-mark-shape', why: 'same-size marks whose painted shapes differ (the pixels do not differ strongly enough to count)', chip: tag, source: `${r1(s.ink.box.w)}×${r1(s.ink.box.h)} ink`, port: `${r1(p.ink.box.w)}×${r1(p.ink.box.h)} ink` })
        }
        if (s.ink && p.ink && s.ink.ratio < 0.004 && p.ink.ratio >= 0.004) {
          out.listed.push({ ...w, what: 'icon-source-mark-invisible', why: 'the source\'s own icon draws no pixels (its icon font may not load); the port draws one', chip: tag, source: 'no ink', port: `ink ${(p.ink.ratio * 100).toFixed(0)}%` })
        } else if (s.ink && p.ink && p.ink.ratio < 0.004 && s.ink.ratio >= 0.004) {
          out.defects.push({ ...w, what: 'icon-mark-invisible', cause: `icon-mark-invisible|${land}`, culprit: tag, source: `ink ${(s.ink.ratio * 100).toFixed(0)}%`, port: 'no visible mark' })
        }
        // the glyph itself: two marks of the same size and ink can still be two drawings (a bird and an X on the same round tile). Every
        // paired control that draws ink on both sides has a measured comparison or says why it has none.
        const gap = (cause, why) => out.notMeasured.push({ ...w, cause, why, detail: tag })
        if (!s.ink || !p.ink) gap('icon-not-rasterised', `the control could not be photographed on ${!s.ink && !p.ink ? 'either side' : !s.ink ? 'the source' : 'the port'} (outside the page, too small to shoot, or gone while being scrolled to), so its glyph cannot be compared`)
        else if (s.ink.ratio >= 0.004 && p.ink.ratio >= 0.004) {
          if (!s.ink.shape || !p.ink.shape) gap('icon-glyph-not-read', `the drawn shape of the glyph was not read on ${!s.ink.shape && !p.ink.shape ? 'either side' : !s.ink.shape ? 'the source' : 'the port'}, so the two glyphs cannot be compared`)
          else {
            const like = shapeLikeness(s.ink.shape, p.ink.shape)
            if (like == null) gap('icon-glyph-not-read', 'the photograph holds ink but no painted glyph could be told from its ground on one side, so the two glyphs cannot be compared')
            else if (like < GLYPH_LIKENESS) out.defects.push({ ...w, what: 'icon-glyph', cause: `icon-glyph|${land}|${s.network || s.key || s.name || s.tag}`, culprit: tag, source: glyphText(s.ink, s), port: glyphText(p.ink, p), likeness: Math.round(like * 100) / 100, sourceShape: shapePicture(s.ink.shape), portShape: shapePicture(p.ink.shape) })
          }
        } else if (s.ink.ratio < 0.004 && p.ink.ratio < 0.004) out.listed.push({ ...w, what: 'icon-no-mark-either', why: 'neither side draws a visible mark in the control, so there is no glyph to compare', chip: tag, source: 'no ink', port: 'no ink' })
      })
    }
  }
  if (fontWarn) for (const d of out.listed) d.fontNote = FONT_WHY
  return out
}

// ---- forms ------------------------------------------------------------------------------------------------------------

/** Pair forms by purpose and landmark, in order. A purpose of `other` pairs only when exactly one stands on each side in the landmark. */
export function pairForms(source, port) {
  const pairs = []
  const unpaired = { source: [], port: [] }
  const keys = [...new Set([...source, ...port].map((f) => `${f.purpose}|${f.land}`))]
  for (const k of keys) {
    const S = source.filter((f) => `${f.purpose}|${f.land}` === k)
    const P = port.filter((f) => `${f.purpose}|${f.land}` === k)
    const n = Math.min(S.length, P.length)
    for (let i = 0; i < n; i++) pairs.push({ source: S[i], port: P[i], key: k })
    unpaired.source.push(...S.slice(n))
    unpaired.port.push(...P.slice(n))
  }
  // a form of one purpose left alone on each side but in another landmark (a footer form the source does not keep in its footer element) is the same form
  for (const purpose of new Set(unpaired.source.map((f) => f.purpose))) {
    const S = unpaired.source.filter((f) => f.purpose === purpose)
    const P = unpaired.port.filter((f) => f.purpose === purpose)
    if (S.length === 1 && P.length === 1 && purpose !== 'other') {
      pairs.push({ source: S[0], port: P[0], key: `${purpose}|${P[0].land}`, landDiffers: `${S[0].land}>${P[0].land}` })
      unpaired.source.splice(unpaired.source.indexOf(S[0]), 1)
      unpaired.port.splice(unpaired.port.indexOf(P[0]), 1)
    }
  }
  return { pairs, unpaired }
}

const normText = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[:*]\s*$/, '').trim()
export function focusIndicator(f) {
  // what a focused field shows that an unfocused one does not: a border colour/width change, an outline, a ring
  if (!f) return null
  const { before: b, after: a } = f
  const out = []
  if (a.border !== b.border || a.borderWidth !== b.borderWidth) out.push(`border ${a.border}`)
  if (a.outlineStyle !== 'none' && parseFloat(a.outlineWidth) > 0 && (a.outlineStyle !== b.outlineStyle || a.outlineColor !== b.outlineColor || a.outlineWidth !== b.outlineWidth)) out.push(`outline ${a.outlineWidth} ${a.outlineColor}`)
  if (a.shadow !== b.shadow && a.shadow !== 'none') out.push(`ring ${a.shadow}`)
  return out
}
const indicatorColour = (f) => {
  const { after: a } = f
  const shadow = /rgba?\([^)]*\)/.exec(a.shadow ?? '')?.[0]
  return { border: a.border, outline: a.outlineStyle !== 'none' && parseFloat(a.outlineWidth) > 0 ? a.outlineColor : null, ring: shadow ?? null }
}

export function judgeForms(rows) {
  const out = empty()
  for (const r of rows) {
    if (!r.source || !r.port) continue
    if (bareSource(r, out)) continue
    const w = where(r)
    const { pairs, unpaired } = pairForms(r.source.forms ?? [], r.port.forms ?? [])
    out.cases += pairs.length + unpaired.source.length + unpaired.port.length
    for (const side of ['source', 'port']) {
      for (const f of unpaired[side]) {
        if (f.purpose === 'other') out.notMeasured.push({ ...w, cause: 'form-purpose-unknown', why: `a form on the ${side} that is neither login, registration, search, contact nor newsletter, with no partner of its kind`, detail: `${f.land} ${f.id || f.action} (${f.fields.length} field(s))` })
        else out.defects.push({ ...w, what: `form-only-${side}`, cause: `form-only-${side}|${f.purpose}|${f.land}`, culprit: `${f.purpose} form`, source: side === 'source' ? `${f.fields.length} field(s)` : 'none', port: side === 'port' ? `${f.fields.length} field(s)` : 'none' })
      }
    }
    for (const { source: s, port: p, key } of pairs) {
      const [purpose, land] = key.split('|')
      const tag = `${purpose} form (${land})`
      const add = (what, extra, so, po) => out.defects.push({ ...w, what, cause: `${what}|${purpose}${extra ? `|${extra}` : ''}`, culprit: tag, source: so, port: po })
      if (s.fields.length !== p.fields.length) add('form-field-count', '', `${s.fields.length} field(s): ${s.fields.map((f) => f.type).join('/')}`, `${p.fields.length} field(s): ${p.fields.map((f) => f.type).join('/')}`)
      const n = Math.min(s.fields.length, p.fields.length)
      for (let i = 0; i < n; i++) {
        const a = s.fields[i]
        const b = p.fields[i]
        const nth = `field ${i + 1}`
        const TEXTUAL = ['text', 'search', 'email', 'tel', 'url']
        // text, search, e-mail, tel and url all draw the same box for a visitor: the difference is listed, not counted
        if (a.type !== b.type && TEXTUAL.includes(a.type) && TEXTUAL.includes(b.type)) out.listed.push({ ...w, what: 'form-field-type-same-look', why: 'both are single-line text boxes that look and type the same (they differ in keyboard hint and validation only)', chip: tag, source: `${nth} ${a.type}`, port: `${nth} ${b.type}` })
        else if (a.type !== b.type) add('form-field-type', `${a.type}>${b.type}`, `${nth} ${a.type}`, `${nth} ${b.type}`)
        if (a.required !== b.required) add('form-field-required', `${a.required}>${b.required}`, `${nth} (${a.label || a.name}) required=${a.required}`, `${nth} (${b.label || b.name}) required=${b.required}`)
        if (a.focusedOnLoad !== b.focusedOnLoad) add('form-field-focus-on-load', `${a.focusedOnLoad}>${b.focusedOnLoad}`, `${nth} focused on load: ${a.focusedOnLoad}`, `${nth} focused on load: ${b.focusedOnLoad}`)
        if (normText(a.placeholder) !== normText(b.placeholder)) add('form-field-placeholder', `${normText(a.placeholder)}>${normText(b.placeholder)}`, `${nth} "${a.placeholder}"`, `${nth} "${b.placeholder}"`)
        if (normText(a.label) !== normText(b.label)) add('form-field-label', `${normText(a.label)}>${normText(b.label)}`, `${nth} "${a.label}"`, `${nth} "${b.label}"`)
        if (a.name !== b.name) out.listed.push({ ...w, what: 'form-field-name', why: 'the field names are the CMS\'s own (the form posts to its own handler)', chip: tag, source: `${nth} ${a.name}`, port: `${nth} ${b.name}` })
      }
      if (!s.fields.length && !p.fields.length) continue
      if (!near(s.box.w, p.box.w, 2) || !near(s.box.h, p.box.h, 2)) {
        // the form element of one side wraps the heading above the fields, the other's does not: the box differs, the controls do not
        // links INSIDE the form element are part of its box (links of the region around it are not)
        const sameControls = s.controlsBox && p.controlsBox && near(s.controlsBox.w, p.controlsBox.w, 2) && near(s.controlsBox.h, p.controlsBox.h, 2)
        const linksDiffer = (s.linksIn ?? 0) !== (p.linksIn ?? 0) && (s.links.some((x) => !p.links.includes(x)) || p.links.some((x) => !s.links.includes(x)))
        if (linksDiffer && near(s.box.w, p.box.w, 2)) {
          // the links the form element holds on one side are the box's extra height: the group of those links carries the decision
          out.listed.push({ ...w, what: 'form-box-follows-links', why: 'the boxes differ in height and the links inside the form differ: the links are reported as their own group', chip: tag, source: `${r1(s.box.w)}×${r1(s.box.h)}`, port: `${r1(p.box.w)}×${r1(p.box.h)}` })
        } else if (sameControls) {
          // the fields, labels and buttons take the same box on both sides: the form elements differ in what they wrap (an intro, a list, links), not in what is drawn
          out.listed.push({ ...w, what: 'form-box-wraps-content', why: 'the form element of one side wraps content around the fields (an intro, a list, links) that the other keeps outside it; the box of the fields, labels and buttons is the same', chip: tag, source: `${r1(s.box.w)}×${r1(s.box.h)} (controls ${r1(s.controlsBox.w)}×${r1(s.controlsBox.h)})`, port: `${r1(p.box.w)}×${r1(p.box.h)} (controls ${r1(p.controlsBox.w)}×${r1(p.controlsBox.h)})` })
        } else if ((s.headings ?? []).join('|') !== (p.headings ?? []).join('|') || Math.abs((s.lead ?? 0) - (p.lead ?? 0)) >= 40) {
          out.listed.push({ ...w, what: 'form-box-wraps-heading', why: 'the form element of one side wraps content (a heading, an intro) above the fields that the other keeps outside it; the fields and button are the same', chip: tag, source: `${r1(s.box.w)}×${r1(s.box.h)}${s.lead >= 40 || s.headings?.length ? ` (fields start ${r1(s.lead)}px below its top)` : ''}`, port: `${r1(p.box.w)}×${r1(p.box.h)}${p.lead >= 40 || p.headings?.length ? ` (fields start ${r1(p.lead)}px below its top)` : ''}` })
        } else {
        const row = { ...w, what: 'form-box', cause: `form-box|${purpose}|${land}`, culprit: tag, source: `${r1(s.box.w)}×${r1(s.box.h)}`, port: `${r1(p.box.w)}×${r1(p.box.h)}` }
        // a form whose fields and links are the same but whose box differs only in height with a differing link count is reported by those
        out.defects.push(row)
        }
      }
      // a link drawn as a button on one side is the other side's <button> of the same words, not a link only one side has
      const onlyS = s.links.filter((x) => !p.links.includes(x) && !(p.buttons ?? []).includes(x))
      const onlyP = p.links.filter((x) => !s.links.includes(x) && !(s.buttons ?? []).includes(x))
      if (onlyS.length) add('form-links-only-source', '', onlyS.join(' | '), 'absent')
      if (onlyP.length) add('form-links-only-port', '', 'absent', onlyP.join(' | '))
      if (s.focus && p.focus) {
        const si = focusIndicator(s.focus)
        const pi = focusIndicator(p.focus)
        if (si.length && !pi.length) add('form-focus-style', 'source-shows', `focus: ${si.join(', ')}`, 'focus shows nothing')
        else if (!si.length && pi.length) add('form-focus-style', 'port-shows', 'focus shows nothing', `focus: ${pi.join(', ')}`)
        else if (si.length && pi.length) {
          const a = indicatorColour(s.focus)
          const b = indicatorColour(p.focus)
          const kinds = (x) => (x.border && 1) + '' + (x.outline ? 1 : 0) + (x.ring ? 1 : 0)
          const sameKind = si.map((x) => x.split(' ')[0]).sort().join() === pi.map((x) => x.split(' ')[0]).sort().join()
          const colourDiffers = ['border', 'outline', 'ring'].some((k) => a[k] && b[k] && !sameColor(a[k], b[k], 6))
          if (!sameKind || colourDiffers) add('form-focus-style', 'differs', `focus: ${si.join(', ')}`, `focus: ${pi.join(', ')}`)
          void kinds
        }
      } else if (s.focus === null || p.focus === null) {
        if (s.focus !== p.focus) out.notMeasured.push({ ...w, cause: 'focus-not-read', why: 'one side has no text field that takes focus in this form', detail: tag })
      }
    }
  }
  return out
}

// ---- text -------------------------------------------------------------------------------------------------------------

const stripEnd = (t) => t.replace(/[\s.…,;:!?-]+$/u, '')
const prefixKey = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 20)
const endOf = (t) => stripEnd(t).slice(-18)

/** Whether every code point of `text` (spaces apart) lies in the union of the CSS `unicode-range` lists; false for a list that cannot be read. */
export function rangesCover(lists, text) {
  const spans = []
  for (const list of lists) {
    if (typeof list !== 'string' || !list.trim()) return false
    for (const token of list.split(',')) {
      const m = /^\s*U\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(token)
      if (!m) return false
      if (m[1].includes('?')) spans.push([parseInt(m[1].replace(/\?/g, '0'), 16), parseInt(m[1].replace(/\?/g, 'f'), 16)])
      else spans.push([parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)])
    }
  }
  if (!spans.length) return false
  for (const ch of String(text)) {
    if (/\s/u.test(ch)) continue
    const cp = ch.codePointAt(0)
    if (!spans.some(([from, to]) => cp >= from && cp <= to)) return false
  }
  return true
}

/**
 * Whether the source drew a text block in a system fallback because the web font it asked for FIRST failed to load — so the words wrap differently for a reason
 * that is the source's. Only this exact form is accepted, proven by the cell's own reading from what was painted and from what the failed font could have painted:
 *   · the fonts that painted the source's block (CDP platform fonts) are all system fonts — a web font that painted any glyph means no fallback was drawn;
 *   · the FIRST family of the block's `font-family` is a web font the source declares (@font-face faces of that name are in `document.fonts`), no face of it loaded
 *     and one ended in `error`, and EVERY character of the block's text falls in the `unicode-range` of a face that ended in `error` and is the face the block's style,
 *     weight and stretch select for it — a face limited to other scripts, of another weight or style, or merely `unloaded` proves no failure for this text;
 *   · the port's block asked first for a web font that loaded.
 * A system font the source chose or put first in the stack, a web font that is merely pending, a stack whose second web font loaded and painted, a face whose
 * range does not cover the text, and a reading with no platform fonts, no face list or no ranges prove nothing: the defect stays.
 */
function blockFallback(r, s, p) {
  const sf = r.source.fonts
  const pf = r.port.fonts
  if (!sf || !Array.isArray(sf.faces) || !Array.isArray(s.platform) || !s.platform.length || s.platform.some((f) => f.custom)) return false
  const first = (requested) => String(requested ?? '').split(',')[0].replace(/["']/g, '').trim().toLowerCase()
  const sFirst = first(s.requested)
  const pFirst = first(p.requested)
  if (!sFirst || !pFirst || !(pf?.loaded ?? []).some((x) => String(x).toLowerCase() === pFirst)) return false
  const faces = sf.faces.filter((f) => String(f.family).toLowerCase() === sFirst)
  if (!faces.length || !faces.some((f) => f.status === 'error')) return false
  const wanted = { style: s.fontStyle, weight: s.fontWeight, stretch: s.fontStretch }
  const chars = new Set([...String(s.text)].filter((ch) => !/\s/u.test(ch)))
  if (!chars.size) return false
  // every character is drawn with the face its own range and the block's style, weight and stretch select — and that face must be the one that failed
  for (const ch of chars) {
    const chosen = selectedFaces(faces.filter((f) => rangesCover([f.unicodeRange], ch)), wanted)
    if (!chosen.length || chosen.some((f) => f.status !== 'error')) return false
  }
  return true
}

const STRETCH = { 'ultra-condensed': 50, 'extra-condensed': 62.5, condensed: 75, 'semi-condensed': 87.5, normal: 100, 'semi-expanded': 112.5, expanded: 125, 'extra-expanded': 150, 'ultra-expanded': 200 }
const WEIGHT = { normal: 400, bold: 700 }
/** [from, to] of a `font-weight` / `font-stretch` value (one value or a range, numbers or keywords); null when it is empty or unreadable. */
function span(value, keywords) {
  const nums = String(value ?? '').trim().toLowerCase().split(/\s+/).map((w) => keywords[w] ?? Number.parseFloat(w)).filter((n) => Number.isFinite(n))
  return nums.length ? [Math.min(...nums), Math.max(...nums)] : null
}

const styleKind = (v) => (/^\s*(normal|italic|oblique)\b/i.exec(String(v ?? ''))?.[1] ?? '').toLowerCase()
const STYLE_ORDER = { normal: ['normal', 'oblique', 'italic'], italic: ['italic', 'oblique', 'normal'], oblique: ['oblique', 'italic', 'normal'] }

/**
 * The faces among `faces` (all covering the character) the browser selects for a block: CSS font matching order — stretch, then style (italic and oblique
 * each preferred for their own, then the other, then normal), then weight. Only a form that can be proven is accepted: a descriptor of the block or of a
 * candidate face that cannot be read selects nothing (`[]`), so the finding keeps its severity. Faces that tie are all returned.
 */
function selectedFaces(faces, wanted) {
  const order = STYLE_ORDER[styleKind(wanted.style)]
  const want = { stretch: span(wanted.stretch, STRETCH), weight: span(wanted.weight, WEIGHT) }
  if (!order || !want.stretch || !want.weight) return []
  const parsed = faces.map((f) => ({ f, stretch: span(f.stretch, STRETCH), weight: span(f.weight, WEIGHT), style: order.indexOf(styleKind(f.style)) }))
  if (parsed.some((x) => !x.stretch || !x.weight || x.style < 0)) return []
  const keep = (list) => {
    if (!list.length) return list
    const best = list.map((x) => x.k).reduce((m, k) => (k[0] < m[0] || (k[0] === m[0] && k[1] < m[1]) ? k : m))
    return list.filter((x) => x.k[0] === best[0] && x.k[1] === best[1])
  }
  let pool = parsed.map((x) => ({ ...x, k: stretchRank(x.stretch, want.stretch[0]) }))
  pool = keep(pool).map((x) => ({ ...x, k: [x.style, 0] }))
  pool = keep(pool).map((x) => ({ ...x, k: weightRank(x.weight, want.weight[0]) }))
  return keep(pool).map((x) => x.f)
}

/** CSS font matching order (css-fonts-4 §5.2) as a [group, distance] key, lowest first; both ranks are given readable ranges. */
function stretchRank(r, w) {
  if (w >= r[0] && w <= r[1]) return [0, 0]
  const below = r[1] < w
  if (w <= 100) return below ? [1, w - r[1]] : [2, r[0] - w]
  return below ? [2, w - r[1]] : [1, r[0] - w]
}
function weightRank(r, w) {
  if (w >= r[0] && w <= r[1]) return [0, 0]
  const below = r[1] < w
  if (w >= 400 && w <= 500) return !below && r[0] <= 500 ? [1, r[0] - w] : below ? [2, w - r[1]] : [3, r[0] - w]
  if (w < 400) return below ? [1, w - r[1]] : [2, r[0] - w]
  return below ? [2, w - r[1]] : [1, r[0] - w]
}

export function judgeText(rows) {
  const out = empty()
  for (const r of rows) {
    if (!r.source || !r.port) continue
    if (bareSource(r, out)) continue
    const w = where(r)
    const used = new Set()
    const S = r.source.text?.blocks ?? []
    const P = r.port.text?.blocks ?? []
    for (const s of S) {
      const k = prefixKey(s.text)
      if (k.length < 12) continue
      // the blocks that start alike, the one standing for this one by its content: a carousel clones its slides, so by order a block meets another slide's clone
      const alike = P.filter((x, i) => !used.has(i) && prefixKey(x.text) === k && x.land === s.land)
      const p = alike.find((x) => x.text === s.text && x.visible === s.visible) ?? alike.find((x) => stripEnd(x.text) === stripEnd(s.text) && stripEnd(x.visible) === stripEnd(s.visible)) ?? alike.find((x) => x.text === s.text) ?? alike[0]
      if (!p) continue
      used.add(P.indexOf(p))
      out.cases++
      const same = stripEnd(s.text) === stripEnd(p.text)
      if (same) {
        if (s.text.length !== p.text.length && !sameEllipsis(s.text, p.text)) out.listed.push({ ...w, what: 'text-ellipsis-style', why: 'the same words with a different closing mark', chip: s.head || s.tag, source: s.text.slice(-24), port: p.text.slice(-24) })
        if (stripEnd(s.visible) !== stripEnd(p.visible)) {
          if (blockFallback(r, s, p)) out.listed.push({ ...w, what: 'text-clamp-visible', why: FONT_WHY, chip: s.head || s.tag, source: s.visible.slice(-30), port: p.visible.slice(-30) })
          else out.defects.push({ ...w, what: 'text-visible-ending', cause: `text-visible-ending|${p.land}|${p.tag}`, culprit: s.head || p.tag, source: `…${s.visible.slice(-30)}`, port: `…${p.visible.slice(-30)}` })
        }
        continue
      }
      const shorter = s.text.length < p.text.length ? 'source' : 'port'
      const lenS = stripEnd(s.text).length
      const lenP = stripEnd(p.text).length
      // one cut is a prefix of the other: the same words, ended in a different place (server-side cut against a CSS clamp, or two cut lengths)
      const prefix = stripEnd(s.text).startsWith(stripEnd(p.text)) || stripEnd(p.text).startsWith(stripEnd(s.text))
      if (prefix) {
        // a cut shows a cut: the shorter block ends in dots or breaks off mid-sentence; a shorter block that is a whole sentence is the same words grouped into another element
        const shortText = lenS < lenP ? s.text : p.text
        const endsCut = /(\.\.\.|…)\s*$/.test(shortText) || !/[.!?:"”)]\s*$/.test(shortText)
        if (!endsCut || s.tag !== p.tag) {
          out.listed.push({ ...w, what: 'text-block-grouping', why: 'one side holds in a single element the words the other splits over several (the shorter block is a whole sentence, not a cut)', chip: s.head || s.tag, source: `<${s.tag}> ${lenS} chars`, port: `<${p.tag}> ${lenP} chars` })
          continue
        }
        if (stripEnd(s.visible) === stripEnd(p.visible)) {
          out.listed.push({ ...w, what: 'text-dom-only', why: 'the page text differs in length but the visible words are the same', chip: s.head || s.tag, source: `${lenS} chars`, port: `${lenP} chars` })
          continue
        }
        out.defects.push({ ...w, what: 'text-cut', cause: `text-cut|${p.land}|${p.tag}|${shorter}-shorter`, culprit: s.head || p.tag, source: `${lenS} chars, ends "…${endOf(s.visible || s.text)}"`, port: `${lenP} chars, ends "…${endOf(p.visible || p.text)}"` })
      } else {
        out.defects.push({ ...w, what: 'text-differs', cause: `text-differs|${p.land}|${p.tag}`, culprit: s.head || p.tag, source: s.text.slice(0, 50), port: p.text.slice(0, 50) })
      }
    }
    const L = r.port.text?.labels ?? []
    const SL = r.source.text?.labels ?? []
    // the label of the other side that stands for this one by its words (and the place among the copies of those words)
    const partner = new Map()
    const usedPort = new Set()
    for (const s of SL) {
      const j = L.findIndex((x, k) => !usedPort.has(k) && x.kind === s.kind && x.land === s.land && x.text.toLowerCase() === s.text.toLowerCase() && x.nth === s.nth)
      if (j < 0) continue
      usedPort.add(j)
      partner.set(s, j)
      const p = L[j]
      out.cases++
      labelStyle(s, p, w, out, true)
    }
    judgeLabelWording(SL, L, partner, usedPort, w, out)
  }
  return out
}
// The words a label shows: its text with its computed text-transform applied. innerText already carries the transform but the
// value of an <input type=submit> does not, so a label read either way is compared as drawn (ja-fresco S-34); applying a
// transform to text that already carries it changes nothing.
const shownLabel = (l) =>
  l.transform === 'uppercase' ? l.text.toUpperCase() : l.transform === 'lowercase' ? l.text.toLowerCase() : l.transform === 'capitalize' ? l.text.replace(/(^|[\s\-–—(\[{"'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : l.text

// ---- short labels whose words differ ----------------------------------------------------------------------------------
// A label (logo, nav item, button, pagination, breadcrumb, footer line) with no equal-worded partner is not dropped: it stands for the
// label of the other side that holds its place — between the same two labels that DID pair by their words, in the same group, or the one
// that links to the same page — and when its words differ that is a text finding with both strings. What cannot be paired that way is
// a defect (no label of that kind at that place on the other side: `text-label-only-source|port`) or not measured (several on both sides and nothing to tell them by).
const textKey = (t) => String(t ?? '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/…/g, '...').replace(/\s+/g, ' ').trim()
// a live counter or a date inside a button or a footer line ("Hits: 383", "3 comments") is not other words; in a pagination, a breadcrumb or a
// navigation a number IS the label ("Page 2", "2020"), and a changed number is changed words
const COUNTER_KINDS = new Set(['button', 'footer'])
const wordsKey = (t) => textKey(t).replace(/\d[\d.,]*/g, '#')
// where a label is drawn, as far as the reading says: a changed wording is paired by place only where both places are known and close
const PLACE_DX = 120
const PLACE_DY = 60
const placed = (a, b) => [a.x, a.y, b.x, b.y].every(Number.isFinite) && Math.abs(a.x - b.x) <= PLACE_DX && Math.abs(a.y - b.y) <= PLACE_DY

/** The style of a pair of labels paired confidently (by words, or by link/place with other words): case of the same words, size, weight, spacing, transform. */
function labelStyle(s, p, w, out, sameWords) {
  const tag = `${s.kind} "${s.text}"`
  const add = (what, so, po, extra = '') => out.defects.push({ ...w, what, cause: `${what}|${s.kind}|${extra}`, culprit: tag, source: so, port: po })
  if (sameWords) {
    if (shownLabel(s) !== shownLabel(p)) add('label-case', `"${s.text}"`, `"${p.text}"`, `${s.transform}>${p.transform}`)
    else if (s.transform !== p.transform) out.listed.push({ ...w, what: 'label-transform-same-words', why: 'text-transform differs but the shown words are identical', chip: tag, source: s.transform, port: p.transform })
  } else if (s.transform !== p.transform) add('label-transform', s.transform, p.transform, `${s.transform}>${p.transform}`)
  if (!near(s.size, p.size, 0.6)) add('label-size', `${r1(s.size)}px`, `${r1(p.size)}px`, `${r1(s.size)}>${r1(p.size)}`)
  if (s.weight !== p.weight) add('label-weight', String(s.weight), String(p.weight), `${s.weight}>${p.weight}`)
  if (!near(s.spacing, p.spacing, 0.3)) add('label-letter-spacing', `${r1(s.spacing)}px`, `${r1(p.spacing)}px`, `${r1(s.spacing)}>${r1(p.spacing)}`)
}

function judgeLabelWording(S, P, partner, usedPort, w, out) {
  const groups = [...new Set([...S, ...P].map((l) => `${l.kind}|${l.land}`))]
  for (const g of groups) {
    const si = S.map((l, i) => [l, i]).filter(([l]) => `${l.kind}|${l.land}` === g)
    const pi = P.map((l, i) => [l, i]).filter(([l]) => `${l.kind}|${l.land}` === g)
    // the labels paired by words, kept in order on both sides (a label that moved past another is no anchor)
    const anchors = []
    for (const [l, i] of si) {
      const j = partner.get(l)
      if (j == null) continue
      if (!anchors.length || j > anchors[anchors.length - 1].j) anchors.push({ i, j })
    }
    const bounds = [{ i: -1, j: -1 }, ...anchors, { i: Infinity, j: Infinity }]
    for (let k = 0; k + 1 < bounds.length; k++) {
      const a = si.filter(([l, i]) => !partner.has(l) && i > bounds[k].i && i < bounds[k + 1].i).map(([l]) => l)
      const b = pi.filter(([, j]) => !usedPort.has(j) && j > bounds[k].j && j < bounds[k + 1].j).map(([l]) => l)
      if (!a.length && !b.length) continue
      const left = { a: [...a], b: [...b] }
      const pair = (s, p) => {
        left.a.splice(left.a.indexOf(s), 1)
        left.b.splice(left.b.indexOf(p), 1)
        out.cases++
        const counter = COUNTER_KINDS.has(s.kind) && wordsKey(s.text) === wordsKey(p.text)
        if (!counter && textKey(s.text) !== textKey(p.text)) out.defects.push({ ...w, what: 'text-label-differs', cause: `text-label-differs|${s.kind}|${s.land}|${s.text.toLowerCase()}>${p.text.toLowerCase()}`, culprit: `${s.kind} "${s.text}"`, source: `"${s.text}"`, port: `"${p.text}"` })
        // the type is a finding of its own whatever the words are
        labelStyle(s, p, w, out, false)
      }
      const clash = (s, p) => Boolean(s.path && p.path && s.path !== p.path)
      // the same page under other words
      for (const s of [...left.a]) {
        if (!s.path) continue
        const ps = left.b.filter((x) => x.path === s.path)
        if (ps.length === 1 && left.a.filter((x) => x.path === s.path).length === 1) pair(s, ps[0])
      }
      // the one label that stands where this one stands on the other side, and for which this is the one that stands there: a count of
      // labels that happens to be equal is no evidence, a visible place is
      for (const s of [...left.a]) {
        const ps = left.b.filter((x) => !clash(s, x) && placed(s, x))
        if (ps.length === 1 && left.a.filter((x) => !clash(x, ps[0]) && placed(x, ps[0])).length === 1) pair(s, ps[0])
      }
      // the logo is the one link home of the header: by its role there is one on each side, and the one left on each side is it
      if (left.a.length === 1 && left.b.length === 1 && left.a[0].kind === 'logo' && !clash(left.a[0], left.b[0])) pair(left.a[0], left.b[0])
      if (left.a.length && left.b.length) {
        out.notMeasured.push({ ...w, cause: 'labels-unpairable', why: `${g.replace('|', ' ')}: ${left.a.length} label(s) on the source and ${left.b.length} on the port between the same two paired labels have no partner by link or visible place`, detail: `source ${left.a.map((x) => `"${x.text}"`).join(' ')} | port ${left.b.map((x) => `"${x.text}"`).join(' ')}` })
      } else {
        // labels left on ONE side between the same two paired labels: the other side has nothing in that place, a difference of its own
        for (const [side, list] of [['source', left.a], ['port', left.b]])
          for (const l of list) out.defects.push({ ...w, what: `text-label-only-${side}`, cause: `text-label-only-${side}|${l.kind}|${l.land}`, culprit: `${l.kind} "${l.text}"`, source: side === 'source' ? `"${l.text}"` : 'none', port: side === 'port' ? `"${l.text}"` : 'none' })
      }
    }
  }
}
const sameEllipsis = (a, b) => /[….]+$/.test(a) === /[….]+$/.test(b)

// ---- first-interaction ------------------------------------------------------------------------------------------------

/**
 * Rows are { route, width, state, source: {kind, ...}, port: {kind, ...} } with kind `theme`, `touch`, `drawer`; a side
 * that found no control carries `{ missing: <reason> }`.
 */
/** What opening the drawer did to one cell of the strip: nothing, a dimming (every channel darker, by this ratio), or another change. */
export function stripEffect(closed, open) {
  const delta = open.map((v, k) => v - closed[k])
  if (Math.max(...delta.map(Math.abs)) <= STRIP_CELL_STEP) return { kind: 'same', delta }
  const sum = (c) => c.reduce((a, b) => a + b, 0)
  if (delta.every((d) => d <= 6) && sum(closed) > 90) return { kind: 'dimmed', ratio: sum(open) / sum(closed), delta }
  return { kind: 'changed', delta }
}
// the kinds are a threshold on the change (20 levels), and a cell that moves by 21 on one side and 20 on the other lands in two kinds: the changes themselves are compared as well
const sameEffect = (a, b) => (a.kind === b.kind && (a.kind !== 'dimmed' || Math.abs(a.ratio - b.ratio) <= 0.15)) || Math.max(...a.delta.map((d, k) => Math.abs(d - b.delta[k]))) <= STRIP_CELL_STEP
const SOURCE_HAS_NONE = /^(no visible (theme|drawer) control by role\/name|no parent menu item with a hidden panel)/
export function judgeFirstInteraction(rows) {
  const out = empty()
  for (const r of rows) {
    const w = where(r)
    const s = r.source
    const p = r.port
    if (!s || !p) continue
    out.cases++
    if (s.missing || p.missing) {
      // a state the dossier cannot put a side in is told apart from a control that was not found (the scheme check does the same)
      if ([s.missing, p.missing].some((m) => /^the dossier names/.test(m ?? ''))) {
        out.unavailable.push({ ...w, cause: `${r.kind}-state-unavailable`, why: [s.missing && `source: ${s.missing}`, p.missing && `port: ${p.missing}`].filter(Boolean).join('; '), detail: r.state })
        out.cases--
        continue
      }
      // the source has no such control at all (no theme switch, no menu item with a panel) and the port has one: there is nothing to compare, and
      // nothing was left unread (a control missing on both sides may be the tool's own miss, and stays not-measured)
      if ((r.kind === 'theme' || r.kind === 'touch') && SOURCE_HAS_NONE.test(s.missing ?? '') && !p.missing) {
        out.listed.push({ ...w, what: `${r.kind}-no-source-control`, why: `the source has no ${r.kind === 'theme' ? 'theme switch' : 'parent menu item with a hidden panel'}, so there is nothing to compare (the port has one)`, chip: r.state ?? r.kind, source: s.missing, port: p.control ?? 'a control found' })
        out.cases--
        continue
      }
      out.notMeasured.push({ ...w, cause: [s.missing, p.missing].some((m) => /^the dossier names/.test(m ?? '')) ? `${r.kind}-state-unavailable` : `${r.kind}-control-not-found`, why: [s.missing && `source: ${s.missing}`, p.missing && `port: ${p.missing}`].filter(Boolean).join('; '), detail: r.what ?? r.kind })
      continue
    }
    if (r.kind === 'theme') {
      const want = r.expect
      const off = ['source', 'port'].filter((k) => want && r[k].before !== want)
      if (off.length) {
        out.unavailable.push({ ...w, cause: 'theme-state-not-honoured', why: `the ${off.join(' and ')} did not take the state (${r.state}): the page shows ${off.map((k) => r[k].before).join('/')} before the click, not ${want}`, detail: r.state })
        continue
      }
      if (s.flips && !p.flips) out.defects.push({ ...w, what: 'theme-first-click-noop', cause: `theme-first-click-noop|${r.state}`, culprit: r.state, source: `click flips the page to ${s.after}`, port: `click leaves the page ${p.before}` })
      else if (!s.flips && p.flips) out.defects.push({ ...w, what: 'theme-first-click-differs', cause: `theme-first-click-differs|${r.state}`, culprit: r.state, source: 'click leaves the page as it was', port: `click flips the page to ${p.after}` })
      else if (s.flips && p.flips && s.after !== p.after) out.defects.push({ ...w, what: 'theme-first-click-result', cause: `theme-first-click-result|${r.state}`, culprit: r.state, source: `flips to ${s.after}`, port: `flips to ${p.after}` })
      else if (s.before !== p.before) out.listed.push({ ...w, what: 'theme-state-start-differs', why: 'the two sides start the state in a different scheme (the scheme check owns that)', chip: r.state, source: s.before, port: p.before })
    } else if (r.kind === 'touch') {
      const a = s.taps
      const b = p.taps
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i]
        const y = b[i]
        if (!x || !y) break
        const so = x.navigated ? 'navigates' : x.opened ? 'opens the panel' : 'does nothing visible'
        const po = y.navigated ? 'navigates' : y.opened ? 'opens the panel' : 'does nothing visible'
        if (so !== po) {
          out.defects.push({ ...w, what: 'touch-tap-outcome', cause: `touch-tap-outcome|tap ${i + 1}|${so}>${po}`, culprit: r.what, source: `tap ${i + 1} ${so}`, port: `tap ${i + 1} ${po}` })
          break
        }
      }
    } else if (r.kind === 'drawer') {
      const add = (what, so, po, extra = '') => out.defects.push({ ...w, what, cause: `${what}|${extra}`, culprit: 'drawer', source: so, port: po })
      if (s.opens !== p.opens) {
        add('drawer-opens', s.opens ? 'opens' : 'does not open', p.opens ? 'opens' : 'does not open')
        continue
      }
      if (!s.opens) continue
      const sr = s.rows.map((x) => x.text.toLowerCase())
      const pr = p.rows.map((x) => x.text.toLowerCase())
      const missing = sr.filter((x) => !pr.includes(x))
      const extra = pr.filter((x) => !sr.includes(x))
      // the cause key carries no counts (the number of rows a header or a site name adds is not the defect): the rows themselves are in source/port
      if (missing.length || extra.length) add('drawer-rows', `${sr.length} rows${missing.length ? `, missing on port: ${missing.slice(0, 4).join(' | ')}` : ''}`, `${pr.length} rows${extra.length ? `, only on port: ${extra.slice(0, 4).join(' | ')}` : ''}`, 'rows')
      for (const x of s.rows) {
        const y = p.rows.find((z) => z.text.toLowerCase() === x.text.toLowerCase())
        if (!y) continue
        if (x.text !== y.text) add('drawer-row-case', `"${x.text}"`, `"${y.text}"`, 'row')
        if (!near(x.size, y.size, 0.6)) add('drawer-row-size', `${r1(x.size)}px`, `${r1(y.size)}px`, `${r1(x.size)}>${r1(y.size)}`)
      }
      if (s.back && !p.back) add('drawer-back-row-missing', `back row "${s.back.text}"`, 'no back row after opening a sub-level', 'back')
      else if (!s.back && p.back) add('drawer-back-row-extra', 'no back row', `back row "${p.back.text}"`, 'back')
      else if (s.back && p.back) {
        if (s.back.text !== p.back.text) add('drawer-back-row-text', `"${s.back.text}"`, `"${p.back.text}"`, `${s.back.transform}>${p.back.transform}`)
        if (!near(s.back.size, p.back.size, 0.6) || s.back.weight !== p.back.weight) add('drawer-back-row-type', `${r1(s.back.size)}px/${s.back.weight}`, `${r1(p.back.size)}px/${p.back.weight}`, 'back')
        if (!near(s.back.w, p.back.w, 2) || !near(s.back.h, p.back.h, 2)) add('drawer-back-row-box', `${r1(s.back.w)}×${r1(s.back.h)}`, `${r1(p.back.w)}×${r1(p.back.h)}`, 'back')
      }
      if ((s.closes === null) !== (p.closes === null) && (s.closes === true || p.closes === true)) out.notMeasured.push({ ...w, cause: 'drawer-close-not-found', why: 'no control that closes the drawer was found on one side (it may be drawn without an element a tap can find)', detail: `source ${s.closes}, port ${p.closes}` })
      else if (s.closes !== p.closes) add('drawer-close', s.closes === true ? 'closes' : s.closes === null ? 'no close control found' : 'stays open', p.closes === true ? 'closes' : p.closes === null ? 'no close control found' : 'stays open', 'close')
      // what the page does while the drawer is open: the strip beside the panel is what a visitor sees of it
      // a landmark the page lacks has no x: it is not measured, with its selector, never read as 0
      const absent = [['header', 'pushedHeaderX'], ['main', 'pushedMainX']].filter(([, k]) => s[k] == null || p[k] == null)
      for (const [sel, k] of absent) out.notMeasured.push({ ...w, cause: 'drawer-push-not-measured', why: `not measured: ${sel} missing (the page push under the open drawer needs it on both sides)`, detail: `${sel} missing on the ${s[k] == null && p[k] == null ? 'source and the port' : s[k] == null ? 'source' : 'port'}` })
      const pushed = [['pushedHeaderX'], ['pushedMainX']].some(([k]) => s[k] != null && p[k] != null && !near(s[k], p[k], 6))
      // the strip is compared in 8 px cells: four cells or more of another colour (a button box left in the strip) is a visible difference
      // each side's strip is first compared with ITSELF with the drawer closed: what the drawer does to the strip (a dimming, a page pushed away) is
      // compared, not what the page draws there on its own (a hero copy, a picture), which differs with the drawer closed as well
      const useClosed = Boolean(s.strip?.closed && p.strip?.closed && s.strip.closed.length === s.strip.grid.length && p.strip.closed.length === p.strip.grid.length)
      const sameGrid = s.strip && p.strip && s.strip.grid.length === p.strip.grid.length
      const cellsApart = !sameGrid ? null : useClosed ? s.strip.grid.filter((_, i) => !sameEffect(stripEffect(s.strip.closed[i], s.strip.grid[i]), stripEffect(p.strip.closed[i], p.strip.grid[i]))).length : s.strip.grid.filter((c, i) => Math.max(...c.map((v, k) => Math.abs(v - p.strip.grid[i][k]))) > STRIP_CELL_STEP).length
      const gridDiff = cellsApart
      if (cellsApart != null && cellsApart >= STRIP_CELLS) add('drawer-open-strip', `strip beside the panel (${s.strip.edge}px): header x ${xText(s.pushedHeaderX)}, main x ${xText(s.pushedMainX)}`, `${cellsApart} cell(s) of 8 px ${useClosed ? 'change differently from the source\'s when the drawer opens' : 'differ from the source\'s strip'}: header x ${xText(p.pushedHeaderX)}, main x ${xText(p.pushedMainX)}`, 'strip')
      else if (pushed) out.listed.push({ ...w, what: 'drawer-open-push-differs', why: gridDiff == null ? 'the page moves differently under the open drawer but the strip beside the panel could not be compared' : 'the page moves differently under the open drawer but the strip beside the panel looks the same', chip: 'drawer', source: `header x ${xText(s.pushedHeaderX)}, main x ${xText(s.pushedMainX)}`, port: `header x ${xText(p.pushedHeaderX)}, main x ${xText(p.pushedMainX)}` })
    }
  }
  return out
}

export const BEHAVIOUR_JUDGES = {
  'fixed-widgets': judgeFixedWidgets,
  icons: judgeIcons,
  forms: judgeForms,
  text: judgeText,
  'first-interaction': judgeFirstInteraction
}
