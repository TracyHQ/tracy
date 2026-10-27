// The comparison half of site-sweep.mjs: pure functions from what the probes read on the port and on the
// source to defects, cases, and the things that are told apart from defects. Nothing here touches a browser.
//
// A row is { route, width, scheme, source: probe, port: probe } (a scheme-state row carries `state` instead of
// width/scheme). A judge returns { cases, defects, listed, notDefects, notMeasured }:
//   defects      the port differs and nothing explains it
//   listed       a difference that is shown but not counted (a header box whose content starts at the same y)
//   notDefects   a difference that is the SOURCE's fault, each with its evidence (the source overflows too;
//                the source swaps a header picture for a file that answers 404)
//   notMeasured  something owed that could not be read (chips that cannot be paired on a page)
export const HEADER_TOLERANCE_PX = 2
export const OVERFLOW_TOLERANCE_PX = 1
/** An icon control is read at the centre of its box, which may be larger than the icon it draws: a little more room. */
export const ICON_TOLERANCE_PX = 4

/** rgb()/rgba() → [r, g, b, a], or null when the text is not one. */
export function parseColor(text) {
  const m = /^rgba?\(([^)]*)\)$/.exec(String(text ?? '').trim())
  if (!m) return null
  const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number)
  if (p.length < 3 || p.some((x) => !Number.isFinite(x))) return null
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
}

/** Two colours a person cannot tell apart: every channel within `tol` (default 1) and the alpha within 0.02. Text that is not a colour must be equal. */
export function sameColor(a, b, tol = 1) {
  if (a === b) return true
  const x = parseColor(a)
  const y = parseColor(b)
  if (!x || !y) return false
  return x.slice(0, 3).every((v, i) => Math.abs(v - y[i]) <= tol) && Math.abs(x[3] - y[3]) <= 0.02
}

const px = (s) => [...String(s ?? '').matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))
/** CSS padding text → the same four sides compared within 1 px. */
export function samePadding(a, b) {
  const x = px(a)
  const y = px(b)
  return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) <= 1)
}
/** Two chip boxes of the same size within 2 px (width and height). */
export function sameBox(a, b) {
  return Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2
}
/** The gap between a chip's painted box and its words, four sides, within 2 px (sub-pixel text boxes). */
export function sameInset(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === 4 && a.every((v, i) => Math.abs(v - b[i]) <= 2)
}
export const insetText = (a) => (Array.isArray(a) ? a.map((v) => `${v}px`).join(' ') : String(a))
/** Corner radii compared within 1 px once both are capped at half the chip's height (a pill is a pill at 50px and at 9999px). */
export function sameRadius(a, b, h) {
  const cap = (s) => px(s).map((v) => Math.min(v, h / 2))
  const x = cap(a)
  const y = cap(b)
  return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) <= 1)
}

/** A px difference to the nearest 2: the same cause measured at two widths differs by a little, not by a different cause. */
export const bucket = (n) => Math.round(n / 2) * 2
const where = (r) => ({ route: r.route, ...(r.width != null ? { width: r.width } : {}), ...(r.scheme ? { scheme: r.scheme } : {}), ...(r.state ? { state: r.state } : {}) })
const empty = () => ({ cases: 0, defects: [], listed: [], notDefects: [], notMeasured: [] })

/** Sideways overflow: the port past the viewport by more than 1 px where the source is not. */
export function judgeOverflow(rows) {
  const out = empty()
  for (const r of rows) {
    if (typeof r.port?.over !== 'number' || typeof r.source?.over !== 'number') continue
    out.cases++
    const p = r.port.over
    const s = r.source.over
    if (p <= OVERFLOW_TOLERANCE_PX) continue
    if (s > OVERFLOW_TOLERANCE_PX)
      out.notDefects.push({ ...where(r), what: 'overflow', source: s, port: p, culprit: r.port.culprit ?? null, sourceCulprit: r.source.culprit ?? null, worse: p > s + 8 })
    else out.defects.push({ ...where(r), what: 'page-overflow', source: s, port: p, culprit: r.port.culprit?.selector ?? null, culpritDetail: r.port.culprit ?? null, cause: `page-overflow|${r.port.culprit?.selector ?? 'unknown'}` })
  }
  return out
}

/** The page background a person sees, port against source: from the main content up, and at the left edge. */
export function judgeBackground(rows) {
  const out = empty()
  for (const r of rows) {
    if (!r.port?.bgContent || !r.source?.bgContent) continue
    out.cases++
    for (const [k, label] of [['bgContent', 'content'], ['bgEdge', 'edge']]) {
      const s = r.source[k]
      const p = r.port[k]
      if (s.land && p.land && s.land !== p.land) {
        // the sample fell in the footer on one side and in content on the other (the pages differ in height): not the same part of the page
        if (!sameColor(s.color, p.color)) out.listed.push({ ...where(r), what: `page-background (${label})`, why: `the sample fell in the ${s.land} on the source and in the ${p.land} on the port (the pages differ in height), so it is not the same part of the page`, source: s.color, port: p.color, sourceAt: s.at, culprit: p.at })
        continue
      }
      if (s.solid === false || p.solid === false) {
        // a picture or a translucent layer behind the sample: the flat colour under it is not what a person sees
        if (!sameColor(s.color, p.color)) out.listed.push({ ...where(r), what: `page-background (${label})`, why: 'a picture or translucent layer is behind the sample on one side, so the colours are not comparable', source: s.color, port: p.color, sourceAt: s.at, culprit: p.at })
        continue
      }
      if (!sameColor(s.color, p.color)) out.defects.push({ ...where(r), what: `page-background (${label})`, source: s.color, port: p.color, culprit: p.at, sourceAt: s.at, cause: `page-background (${label})|${p.at}|${s.color}→${p.color}` })
    }
  }
  return out
}

/** The port draws in a web font it loaded where the source fell back to a system face: widths that depend on text are the source's. */
const sourceLacksFont = (r) => {
  const s = r.source?.fonts
  const p = r.port?.fonts
  return !!(s && p && s.body && p.body && p.loaded.includes(p.body) && !s.loaded.includes(s.body) && s.body.toLowerCase() !== p.body.toLowerCase())
}
const FONT_WHY = 'the source draws in a system face (its web font did not load), so a width, wrap or line height that depends on the text is not comparable'

/** `fetchStatus` maps a picture URL to the status it answered (404 or other): what makes a broken source picture a source fault. */
export function judgeHeader(rows, { fetchStatus = {} } = {}) {
  const out = empty()
  const tol = HEADER_TOLERANCE_PX
  for (const r of rows) {
    const s = r.source?.header
    const p = r.port?.header
    if (r.source?.header === undefined || r.port?.header === undefined) continue
    if (!s && !p) continue
    out.cases++
    const mark = out.defects.length
    if (s && !p) {
      out.defects.push({ ...where(r), what: 'header-missing', source: s.selector, port: null, cause: 'header-missing' })
      continue
    }
    if (!s) {
      out.listed.push({ ...where(r), what: 'header only on the port', why: 'the source shows no header here', port: p.selector })
      continue
    }
    const sh = s.bottom ?? s.height
    const ph = p.bottom ?? p.height
    if (Math.abs(sh - ph) > tol) {
      const bad404 = s.broken.filter((b) => fetchStatus[b.src] === 404)
      if (bad404.length)
        out.notDefects.push({ ...where(r), what: 'header-height', why: 'the source header picture answers 404', source: sh, port: ph, evidence: bad404.map((b) => `${b.src} → 404 (${b.how})`).join('; ') })
      else if (s.contentTop != null && p.contentTop != null && Math.abs(s.contentTop - p.contentTop) <= tol)
        out.listed.push({ ...where(r), what: 'header-height', why: 'header box differs, content starts at the same y', source: sh, port: ph, contentTop: [s.contentTop, p.contentTop] })
      else out.defects.push({ ...where(r), what: 'header-height', source: sh, port: ph, contentTop: [s.contentTop, p.contentTop], cause: `header-height|Δ${bucket(ph - sh)}` })
    }
    // the same control on both sides, paired by its role (logo, search, theme toggle, menu button) or, for a call to action, by its words
    const sc = s.controls ?? {}
    const pc = p.controls ?? {}
    // a control that holds a source picture which answers 404 sits where it sits because the file is missing: its inset is the source's fault, as the header height is
    const dead = s.broken.filter((b) => fetchStatus[b.src] === 404)
    const inset = (name, a, b, side, icon) => {
      const at = (c) => (icon ? (side === 'left' ? c.center : s.iw - c.center) : c[side])
      const sv = at(a)
      const pv = at(b)
      if (Math.abs(sv - pv) <= (icon ? ICON_TOLERANCE_PX : tol)) return
      const row = { ...where(r), what: `header-${name}-inset-${side}`, role: name, source: Math.round(sv * 10) / 10, port: Math.round(pv * 10) / 10, measured: icon ? 'icon centre' : 'edge', control: [`${a.name} ${a.text}`.trim(), `${b.name} ${b.text}`.trim()], cause: `header-${name}-inset-${side}|Δ${bucket(pv - sv)}` }
      const gone = dead.filter((x) => x.control && x.control === a.name)
      if (gone.length) out.notDefects.push({ ...row, why: 'the source header picture answers 404', evidence: gone.map((x) => `${x.src} → 404 (${x.how})`).join('; ') })
      else out.defects.push(row)
    }
    // the type of a control's words: size, weight, letter-spacing and case of a pair already made by role (or by its words). Different
    // wording is the text check's finding and no reason to skip the type: it is an independent measurement
    const type = (name, a, b) => {
      const x = a?.type
      const y = b?.type
      if (!x || !y) return
      const fields = [
        ['font-size', Math.abs(x.size - y.size) > 0.5, `${x.size}px`, `${y.size}px`],
        ['font-weight', Math.abs(Number(x.weight) - Number(y.weight)) >= 100, x.weight, y.weight],
        ['letter-spacing', Math.abs(x.spacing - y.spacing) > 0.3, `${x.spacing}px`, `${y.spacing}px`],
        ['text-transform', x.transform !== y.transform, x.transform, y.transform]
      ]
      for (const [what, differs, sv, pv] of fields)
        if (differs) out.defects.push({ ...where(r), what: `header-${name}-${what}`, role: name, text: a.text, source: sv, port: pv, control: [`${a.name} ${a.text}`.trim(), `${b.name} ${b.text}`.trim()], cause: `header-${name}-${what}|${sv}→${pv}` })
    }
    // a role one side has and the other lacks may be an icon-only control with no name on that side (the three-bar button): pair it by
    // role, edge and shape when it is the only candidate on that edge. Returns true when the pair was judged.
    const iconPair = (role, a, b) => {
      if (!['menu-button', 'search', 'theme-toggle'].includes(role)) return false
      const have = a ?? b
      const lack = a ? p : s
      const edge = (c, w) => (c.center < w / 2 ? 'left' : 'right')
      const taken = new Set(Object.values(lack.controls ?? {}).map((c) => c.name))
      // the candidate sits on the same edge as the control, or as the one the other side has: the pairing is by shape, not by place
      const near = (lack.unroled ?? []).filter((c) => !taken.has(c.name) && edge(c, lack.iw) === edge(have, have === a ? s.iw : p.iw))
      if (near.length !== 1) return false
      const [x, y] = a ? [a, near[0]] : [near[0], b]
      inset(role, x, y, edge(x, s.iw), true)
      return true
    }
    for (const role of new Set([...Object.keys(sc), ...Object.keys(pc)])) {
      const a = sc[role]
      const b = pc[role]
      if (a && b) {
        type(role, a, b)
        // the inset a person reads is from the edge the control sits next to. An icon control (search, theme toggle, menu
        // button) is where its icon is: its CENTRE, because one side may draw the icon in a larger invisible box (an input
        // with a background picture, a button with padding). A logo is where its edge is.
        inset(role, a, b, a.center < s.iw / 2 ? 'left' : 'right', role !== 'logo')
      } else if (role !== 'logo' && iconPair(role, a, b)) {
        // the side that lacks the role has an icon-only control it did not recognise (no name) on the same edge: that is the control
      } else if (role !== 'logo') {
        // a control only one side has is a defect of its own kind — unless the other side's markup has a trace of it that was not recognised as a control: then the pairing is unsure and it is listed
        const [have, lack, side, who] = a ? [a, p, 'source', 'port'] : [b, s, 'port', 'source']
        const there = (a ?? b).center
        // the other side has a control in the same place under another name: the pairing is not sure, so it is no difference
        if ((lack.places ?? []).some((c) => Math.abs(c - there) <= 8)) out.listed.push({ ...where(r), what: `header-${role}-unpaired`, why: `the ${who} header has a control in the same place that was not recognised as a ${role}`, [side]: have.text || have.name })
        else if (lack.traces?.[role]) out.listed.push({ ...where(r), what: `header-${role}-unpaired`, why: `the ${who} header mentions it but no control was recognised, so the pairing is not sure`, [side]: have.text || have.name })
        else out.defects.push({ ...where(r), what: a ? 'header-control-missing' : 'header-control-extra', role, source: a ? `${role} "${a.text || a.name}"` : 'none', port: a ? 'none' : `${role} "${b.text || b.name}"`, cause: `${a ? 'header-control-missing' : 'header-control-extra'}|${role}` })
      }
    }
    // a call to action is paired by its words
    for (const a of s.ctas ?? []) {
      const b = (p.ctas ?? []).find((x) => x.text.toLowerCase() === a.text.toLowerCase())
      if (b) {
        inset('cta', a, b, a.center < s.iw / 2 ? 'left' : 'right', false)
        type('cta', a, b)
      }
    }
    // the words of the navigation, paired where a word stands once on each side
    for (const a of s.nav ?? []) {
      const same = (list) => list.filter((x) => labelOf(x.text) === labelOf(a.text))
      const [b] = same(p.nav ?? [])
      if (b && same(s.nav).length === 1 && same(p.nav).length === 1) type('nav', a, b)
    }
    // what depends on the width of the text (the height after a wrap, the place of a control that follows the menu) is listed when the source has no web font; the logo's left edge and the call to action's right edge sit against the viewport and stay counted
    if (sourceLacksFont(r)) {
      const moved = out.defects.splice(mark).filter((d) => {
        const dependent = d.what === 'header-height' || (/^header-.*-inset-/.test(d.what) && !/^header-(logo-inset-left|cta-inset-right)$/.test(d.what))
        if (dependent) out.listed.push({ ...d, why: FONT_WHY })
        return !dependent
      })
      out.defects.push(...moved)
    }
  }
  return out
}

/** A label as a person reads it: the same words typed with another apostrophe, ellipsis, case or spacing are the same label. */
const labelOf = (t) => String(t ?? '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/…/g, '...').replace(/\s+/g, ' ').trim().toLowerCase()

/** A chip's words without its numbers when it has letters too: `Hits: 383` and `Hits: 442` are the one label of a counter. */
const wordsOf = (t) => (/\p{L}/u.test(String(t ?? '')) ? labelOf(t).replace(/\d[\d.,]*/g, '#') : labelOf(t))

/** Why a chip that has no sure partner has none: every cause is named, none is a defect by itself. */
export const NOT_MEASURED_CAUSES = Object.freeze({
  'repeated-label': 'the same label stands a different number of times in the section on the two sides, so none of its copies can be told from the others',
  'nested-painted-boxes': 'a painted box holds another painted box with the same words, of another size, so it is not one chip',
  'no-counterpart-section': 'the label is on the other side too, but not under the same section heading, so the pairing is not sure'
})

/**
 * Pair the chips of one page: only a pairing that cannot be wrong —
 *   1. the same region (footer or body), the same section heading and the same text, when that is the only one of its kind on both sides
 *   2. the same region, section and text standing the SAME number of times (more than once) on both sides: paired by order
 *   3. what is left: the same region and the same text, when that text is the only one of its kind left on BOTH sides
 * What is left is classified by cause (`why`): a chip whose words are on the other side nowhere is only-on-one-side (a
 * difference of its own kind, judged outside); the others stay unpaired and the page is NOT MEASURED (never a defect, never clean).
 * → { pairs: [[sourceChip, portChip]], unpairedSource, unpairedPort, only: {source: [chip], port: [chip]}, causes: [{side, chip, cause, detail}] }
 */
export function pairChips(source, port) {
  // a live counter inside a label ("Hits: 442", "12 comments") is not its words: the label is compared, the number is not
  const norm = (c) => wordsOf(c.text)
  const pairs = []
  let s = [...source]
  let p = [...port]
  const index = (list, keyOf) => {
    const m = new Map()
    for (const c of list) m.set(keyOf(c), [...(m.get(keyOf(c)) ?? []), c])
    return m
  }
  const take = (a, b) => {
    pairs.push([a, b])
    s = s.filter((c) => c !== a)
    p = p.filter((c) => c !== b)
  }
  const sectionKey = (c) => `${c.region}|${labelOf(c.key)}|${norm(c)}`
  // 1 and 2: the same section and words. Once on both sides is a pair; the same number of times (in document order) on both sides is a pair by order.
  const sIdx = index(s, sectionKey)
  const pIdx = index(p, sectionKey)
  for (const [k, list] of sIdx) {
    const other = pIdx.get(k)
    if (other && other.length === list.length) list.forEach((c, i) => take(c, other[i]))
  }
  // 3: the same words in the same region, once on each side
  const keyOf = (c) => `${c.region}|${norm(c)}`
  const s2 = index(s, keyOf)
  const p2 = index(p, keyOf)
  for (const [k, list] of s2) if (list.length === 1 && p2.get(k)?.length === 1) take(list[0], p2.get(k)[0])

  // 4: the same kind of chip (tag and first class) in the same section, the same number of times on both sides, whose WORDS differ (a hit
  // counter, a count of posts): the same chip with other content, paired by order. The difference in words is listed by the judge.
  const classKey = (c) => `${c.region}|${labelOf(c.key)}|${chipClass(c.name)}`
  const leftover = (list) => list.filter((c) => !c.nested)
  const s3 = index(leftover(s), classKey)
  const p3 = index(leftover(p), classKey)
  for (const [k, list] of s3) {
    const other = p3.get(k)
    // only chips whose words the other side lacks entirely: a word both sides have is a count mismatch, not other content
    const fresh = (c, all) => !all.has(norm(c))
    if (other && other.length === list.length && list.every((c) => fresh(c, new Set(port.map(norm)))) && other.every((c) => fresh(c, new Set(source.map(norm)))))
      list.forEach((c, i) => {
        take(c, other[i])
        pairs[pairs.length - 1].textDiffers = true
      })
  }

  // the leftovers by cause
  const causes = []
  const only = { source: [], port: [] }
  const everyS = new Set(source.map(norm))
  const everyP = new Set(port.map(norm))
  const countIn = (list, c) => list.filter((x) => sectionKey(x) === sectionKey(c)).length
  const classify = (side, list, otherAll, otherLeft) => {
    for (const c of list) {
      const sectionNested = otherLeft.some((o) => o.nested && sectionKey(o) === sectionKey(c))
      if (c.nested || sectionNested) causes.push({ side, chip: c, cause: 'nested-painted-boxes', detail: `${c.text}: ${c.nested ? `${c.name} holds another painted box with the same words` : 'the other side draws it as nested painted boxes'}` })
      else if (!otherAll.has(norm(c))) only[side].push(c)
      else if (otherLeft.some((o) => sectionKey(o) === sectionKey(c))) {
        causes.push({ side, chip: c, cause: 'repeated-label', detail: `${c.text}: ${countIn(source, c)} on the source, ${countIn(port, c)} on the port in the same section`, counts: { source: countIn(source, c), port: countIn(port, c) } })
      } else causes.push({ side, chip: c, cause: 'no-counterpart-section', detail: `${c.text}: on the other side under another heading` })
    }
  }
  classify('source', s, everyP, p)
  classify('port', p, everyS, s)
  return { pairs, unpairedSource: s.filter((c) => !only.source.includes(c)), unpairedPort: p.filter((c) => !only.port.includes(c)), only, causes }
}

/** The chip's class family for grouping: tag and first class (`p.je-badge-static.je-cat--health` and `…--fashion` are one family). */
const chipClass = (name) => String(name).split('.').slice(0, 2).join('.')

/** The size of a chip whose padding, font and colours match is text metrics: a few px is listed, not counted. */
export const CHIP_METRICS_PX = { w: 6, h: 2 }

/** Category chips and tags, port against source: background, text colour, radius, font (size, spacing, weight, case) and the painted box's size. The padding is not read: a person sees the box. */
export function judgeChips(rows) {
  const out = empty()
  out.pages = []
  // a box a person cannot see (0×0, clipped to a pixel) is not a chip on either side
  const seen = (list) => list.filter((c) => c.w > 1 && c.h > 1)
  for (const r of rows) {
    if (!r.port?.chips || !r.source?.chips) continue
    out.cases++
    const lacksFont = sourceLacksFont(r)
    const sChips = seen(r.source.chips)
    const pChips = seen(r.port.chips)
    const { pairs, unpairedSource, unpairedPort, only, causes } = pairChips(sChips, pChips)
    const page = { ...where(r), source: sChips.length, port: pChips.length, paired: pairs.length }
    if (!sChips.length && !pChips.length) page.status = 'none'
    else if (unpairedSource.length || unpairedPort.length) {
      page.status = 'not-measured'
      page.unpaired = { source: unpairedSource.map((c) => c.text), port: unpairedPort.map((c) => c.text) }
      page.causes = [...new Set(causes.map((c) => c.cause))]
      // one owed entry per page, each cause with its words: the output says why and what closes it
      out.notMeasured.push({
        ...where(r),
        what: 'chips-unpaired',
        reason: `${unpairedSource.length} source and ${unpairedPort.length} port chip(s) have no sure partner`,
        causes: page.causes.map((cause) => {
          const mine = causes.filter((c) => c.cause === cause)
          return { cause, why: NOT_MEASURED_CAUSES[cause], detail: [...new Set(mine.map((c) => c.detail))].slice(0, 6), chips: mine.length }
        }),
        unpaired: page.unpaired
      })
    } else page.status = 'measured'
    if (only.source.length || only.port.length) page.only = { source: only.source.map((c) => c.text), port: only.port.map((c) => c.text) }
    out.pages.push(page)
    // a chip one side has and the other does not is a difference of its own kind (a decision settles it), never "not measured"
    for (const [side, list] of [['port', only.port], ['source', only.source]])
      for (const c of list)
        out.defects.push({ ...where(r), what: `chip-${side}-only`, chip: `${c.key ? `${c.key} · ` : ''}${c.text}`, text: c.text, source: side === 'port' ? 'none' : `${c.w}×${c.h}px`, port: side === 'port' ? `${c.w}×${c.h}px` : 'none', culprit: c.name, cause: `chip-${side}-only|${c.region}|${labelOf(c.text)}` })
    for (const pair of pairs) {
      const [a, b] = pair
      if (pair.textDiffers || labelOf(a.text) !== labelOf(b.text)) out.listed.push({ ...where(r), what: 'chip-words', chip: `${a.key ? `${a.key} · ` : ''}${a.text}`, text: a.text, source: a.text, port: b.text, culprit: b.name, why: 'the same kind of chip in the same section with other words (content, such as a counter), paired by order or by the label around a number; its paint is compared' })
      const h = Math.min(a.h, b.h)
      const sameFont = a.font == null || b.font == null || Math.abs(parseFloat(a.font) - parseFloat(b.font)) <= 0.5
      const spacing = (c) => parseFloat(c.letterSpacing ?? '0') || 0
      const fields = [
        ['background', !sameColor(a.bg, b.bg), a.bg, b.bg],
        ['text-colour', !sameColor(a.color, b.color), a.color, b.color],
        ['radius', !sameRadius(a.radius, b.radius, h), a.radius, b.radius],
        ['font-size', !sameFont, a.font, b.font],
        ['letter-spacing', Math.abs(spacing(a) - spacing(b)) > 0.3, `${spacing(a)}px`, `${spacing(b)}px`],
        ['font-weight', a.weight != null && b.weight != null && Math.abs(a.weight - b.weight) >= 100, a.weight, b.weight],
        ['text-transform', a.transform != null && b.transform != null && a.transform !== b.transform, a.transform, b.transform]
      ]
      let visible = false
      for (const [what, differs, sv, pv] of fields)
        if (differs) {
          visible = true
          out.defects.push({ ...where(r), what: `chip-${what}`, chip: `${a.key ? `${a.key} · ` : ''}${a.text}`, text: a.text, source: sv, port: pv, culprit: b.name, cause: `chip-${what}|${chipClass(b.name)}` })
        }
      // the box size: with every visible property equal, a width that differs with the text's own width and the same height is the text's
      // metrics; a different height (or a width the text does not explain) is a defect
      if (!visible && !sameBox(a, b)) {
        const row = { ...where(r), what: 'chip-size', chip: `${a.key ? `${a.key} · ` : ''}${a.text}`, text: a.text, source: `${a.w}×${a.h}px`, port: `${b.w}×${b.h}px`, culprit: b.name }
        if (textMetricsOnly(a, b)) out.listed.push({ ...row, why: 'font, letter-spacing, colours and radius equal, the height equal and the width differs with the text\'s own width: the size differs by text metrics only' })
        else if (lacksFont) out.listed.push({ ...row, why: FONT_WHY })
        else out.defects.push({ ...row, cause: `chip-size|${chipClass(b.name)}` })
      }
    }
  }
  return out
}

/**
 * A chip size difference is text metrics only when the HEIGHT is the same and the width differs by what the text's own width differs
 * by (`textW`, read in the page; without it, by at most CHIP_METRICS_PX.w). Another height is never the text's width.
 */
export function textMetricsOnly(a, b) {
  if (Math.abs(a.h - b.h) > 2) return false
  const dw = b.w - a.w
  if (a.textW != null && b.textW != null) return Math.abs(dw - (b.textW - a.textW)) <= 2
  return Math.abs(dw) <= CHIP_METRICS_PX.w
}

const luminance = (c) => {
  const x = parseColor(c)
  return x ? 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2] : null
}
/** What a probe shows as a scheme: its root's word, else the lightness of the page behind the content. */
export const shownScheme = (probe) => probe.says ?? (luminance(probe.bgContent?.color) == null ? null : luminance(probe.bgContent.color) < 128 ? 'dark' : 'light')

/** The landmarks whose surface and text colours are compared in each scheme state, in the order a person meets them. */
export const LANDMARKS = ['page', 'header', 'main', 'card', 'sidebar', 'footer']
/** Two colours of one landmark count as the same up to this many steps per channel. */
export const SURFACE_TOLERANCE = 3

const sideOf = (color) => (luminance(color) == null ? null : luminance(color) < 128 ? 'dark' : 'light')
/** The landmark colours of a probe: the page canvas from its two samples, the rest from `surfaces`. */
export function landmarksOf(probe) {
  const out = {}
  const page = probe.bgEdge ?? probe.bgContent
  if (page) out.page = { color: page.color, solid: page.solid, at: page.at, text: null, land: page.land }
  for (const name of LANDMARKS) if (name !== 'page' && probe.surfaces?.[name]) out[name] = probe.surfaces[name]
  return out
}

/**
 * The scheme a visitor gets in each state (system × saved choice), judged by what is VISIBLE: the page canvas and the
 * landmark surfaces (header, main, first card, sidebar, footer) with their text colours, each port landmark against the
 * source's. A defect is a paired landmark on the other side of the scheme (a light surface where the source is dark) or
 * a colour beyond the tolerance. The root attribute is not judged by itself: it differs "listed" with nothing visible
 * differing, and is named as the cause candidate where something visible does. A landmark only one side has, or whose
 * background is a picture or a translucent layer, is not compared. A state with a saved choice is first checked on each side: the
 * port must show the choice it was given; a SOURCE that does not take the dossier's switch (its own boot script undid it)
 * cannot be put in that state, so the state is returned in `unhonoured`, not compared.
 */
export function judgeScheme(rows) {
  const out = empty()
  out.unhonoured = []
  for (const r of rows) {
    if (!r.port || !r.source) continue
    if (r.saved === 'dark' || r.saved === 'light') {
      const p = shownScheme(r.port)
      const s = shownScheme(r.source)
      if (p !== r.saved) {
        out.cases++
        out.defects.push({ ...where(r), what: 'saved-choice-ignored', source: s, port: p, expected: r.saved, note: `the port shows ${p} after the visitor saved ${r.saved}`, cause: `saved-choice-ignored|${r.saved}` })
      }
      if (s !== r.saved) {
        out.unhonoured.push({ route: r.route, state: r.state, reason: `the source shows ${s} after its ${r.saved} switch was applied: it does not take that switch, so the state cannot be compared` })
        continue
      }
      if (p !== r.saved) continue
    }
    out.cases++
    const s = r.source.says ?? null
    const p = r.port.says ?? null
    const rootDiffers = s !== null && p !== s
    const rootNote = rootDiffers ? (p === null ? 'the root says nothing where the source writes the scheme' : `the root says ${p} where the source says ${s}`) : null
    const sl = landmarksOf(r.source)
    const pl = landmarksOf(r.port)
    let visible = 0
    for (const name of LANDMARKS) {
      const a = sl[name]
      const b = pl[name]
      if (!a || !b) continue
      // the sample fell in the footer on one side and in content on the other (the pages differ in height): not the same part of the page
      if (name === 'page' && a.land && b.land && a.land !== b.land) continue
      // text colour on the SAME words only: a landmark whose words differ between the sides has no pair to compare — and a landmark
      // that shares no word with its namesake on the other side is not known to be the same part of the page (the source's footer is
      // a copyright strip where the port's is the whole footer), so its surface is not compared either
      const shared = (a.texts ?? []).map((x) => [x, (b.texts ?? []).find((y) => y.t.toLowerCase() === x.t.toLowerCase() && (!x.tag || !y.tag || x.tag === y.tag))]).filter(([, y]) => y)
      if (name !== 'page' && !shared.length) continue
      if (a.solid !== false && b.solid !== false) {
        const sa = sideOf(a.color)
        const sb = sideOf(b.color)
        if (sa && sb && sa !== sb) {
          visible++
          out.defects.push({ ...where(r), what: `${name}-surface-on-other-side`, landmark: name, source: `${a.color} (${sa})`, port: `${b.color} (${sb})`, culprit: b.at, sourceAt: a.at, rootNote, cause: `${name}-surface-on-other-side|${sa}→${sb}|${b.at}` })
        } else if (!sameColor(a.color, b.color, SURFACE_TOLERANCE)) {
          visible++
          out.defects.push({ ...where(r), what: `${name}-surface-colour`, landmark: name, source: a.color, port: b.color, culprit: b.at, sourceAt: a.at, rootNote, cause: `${name}-surface-colour|${b.at}|${a.color}→${b.color}` })
        }
      }
      for (const [x, y] of shared) {
        const sa = sideOf(x.color)
        const sb = sideOf(y.color)
        if (sa && sb && sa !== sb) {
          visible++
          out.defects.push({ ...where(r), what: `${name}-text-on-other-side`, landmark: name, text: x.t, source: `${x.color} (${sa})`, port: `${y.color} (${sb})`, culprit: y.at, sourceAt: x.at, rootNote, cause: `${name}-text-on-other-side|${sa}→${sb}|${y.at}` })
        } else if (!sameColor(x.color, y.color, SURFACE_TOLERANCE)) {
          visible++
          out.defects.push({ ...where(r), what: `${name}-text-colour`, landmark: name, text: x.t, source: x.color, port: y.color, culprit: y.at, sourceAt: x.at, rootNote, cause: `${name}-text-colour|${y.at}|${x.color}→${y.color}` })
        }
      }
    }
    if (rootDiffers && !visible) out.listed.push({ ...where(r), what: 'root-scheme-attribute', source: s, port: p ?? 'nothing', note: 'attribute differs, nothing visible differs' })
  }
  return out
}

/**
 * Fonts the source lacks: the port's body font is a web font it loaded, the source's body font is not one it loaded (the
 * browser fell back to a system face). Text widths — and every header inset or chip size that depends on them — then differ
 * for a reason that is the source's. → [{ source, port, routes }] (one entry per font pair).
 */
export function fontWarnings(rows) {
  const seen = new Map()
  for (const r of rows) {
    const s = r.source?.fonts
    const p = r.port?.fonts
    if (!s || !p || !s.body || !p.body) continue
    if (p.loaded.includes(p.body) && !s.loaded.includes(s.body) && s.body.toLowerCase() !== p.body.toLowerCase()) {
      const k = `${s.body}|${p.body}`
      seen.set(k, { source: s.body, port: p.body, routes: new Set([...(seen.get(k)?.routes ?? []), r.route]) })
    }
  }
  return [...seen.values()].map((w) => ({ ...w, routes: w.routes.size }))
}

export const CHECK_TITLES = {
  overflow: 'No sideways overflow on any route at any width where the source has none',
  scheme: 'What a visitor sees in every system × saved-choice state equals the source (page canvas, header, main, card, sidebar, footer: surfaces and text)',
  background: 'Page background equals the source on every route, width and scheme',
  header: 'Header height and side insets equal the source (2 px) on every route and width',
  chips: 'Category chips and tags equal the source in background, text colour, padding, radius and font size'
}
export const CHECK_ORDER = ['overflow', 'scheme', 'background', 'header', 'chips']

const first = (list, n = 2) => list.slice(0, n)

/** What a notDefects list becomes in tracy-fix-measure/v1: {what, why, evidence} rows, grouped so a sweep does not write one per case. */
export function notDefectsForMeasure(notDefects) {
  const out = []
  const overflow = notDefects.filter((n) => n.what === 'overflow')
  if (overflow.length) {
    const routes = [...new Set(overflow.map((n) => n.route))]
    out.push({
      what: `Sideways overflow on ${routes.length} route(s) that the source has too (${overflow.length} case(s))`,
      why: 'the source overflows at the same route, width and scheme; a defect both sides share is not a port defect',
      evidence: first(overflow, 3)
        .map((n) => `${n.route} @${n.width} ${n.scheme}: source ${n.source}px, port ${n.port}px${n.worse ? ' (port worse)' : ''}${n.sourceCulprit ? `; source culprit ${n.sourceCulprit.selector}` : ''}`)
        .join(' | ')
    })
  }
  for (const n of notDefects.filter((x) => x.what === 'source-not-counterpart'))
    out.push({
      what: `${n.route} is not compared for heights: the source route answers another page`,
      why: n.why,
      evidence: `${n.sourceUrl} → title "${n.title}"`
    })
  for (const n of notDefects.filter((x) => x.what === 'bare-source-page'))
    out.push({
      what: `${n.route} is not compared: the source route answers a bare page`,
      why: 'the source answers the web server\'s own page with no stylesheet, so there is no page of the source to compare the port\'s with',
      evidence: `${n.sourceUrl} → title "${n.title}", no stylesheet`
    })
  // what the dossier accepts: one entry per check, cause and decision, with the decision and its evidence
  const acc = new Map()
  for (const n of notDefects.filter((x) => x.accepted)) acc.set(`${n.check}|${n.acceptCause}|${n.decision}`, [...(acc.get(`${n.check}|${n.acceptCause}|${n.decision}`) ?? []), n])
  for (const list of acc.values()) {
    const n = list[0]
    const routes = [...new Set(list.map((x) => x.route))]
    out.push({
      what: `${n.check}: ${n.what} (${n.acceptCause}) on ${routes.length} route(s), ${list.length} case(s) — e.g. ${n.route}${n.width != null ? ` @${n.width}` : ''}${n.scheme || n.state ? ` ${n.scheme ?? n.state}` : ''}: source ${typeof n.source === 'object' ? JSON.stringify(n.source) : n.source}, port ${typeof n.port === 'object' ? JSON.stringify(n.port) : n.port}`,
      why: `recorded in the dossier as ${n.kind} under ${n.decision}, not counted as a port defect`,
      evidence: n.evidence
    })
  }
  // a header difference the source's own missing picture explains: the height, and the inset of the control that holds the picture
  const byUrl = new Map()
  for (const n of notDefects.filter((x) => /^header-/.test(x.what) && !x.accepted)) byUrl.set(`${n.what}|${n.evidence}`, [...(byUrl.get(`${n.what}|${n.evidence}`) ?? []), n])
  for (const list of byUrl.values()) {
    const n = list[0]
    out.push({
      what: n.what === 'header-height' ? `Header height differs on ${list.length} case(s) (e.g. ${n.route} @${n.width} ${n.scheme}: source ${n.source}px, port ${n.port}px)` : `${n.what} differs on ${list.length} case(s) (e.g. ${n.route} @${n.width} ${n.scheme}: source ${n.source}px, port ${n.port}px)`,
      why: n.why,
      evidence: n.evidence
    })
  }
  return out
}

/** The cause key of a defect row: what groups it with the others and what a `sweep.accept` row names. */
export const causeOf = (d) => d.cause ?? `${d.what}|${d.culprit ?? ''}`

/**
 * Group a check's raw defect rows by cause candidate: same property, same landmark/selector, same delta (each row's
 * `cause`). A group is ONE defect, with the number of occurrences (route × width × scheme rows), the routes, widths and
 * schemes it occurs on, up to three examples and the distinct values seen.
 */
export function groupDefects(defects) {
  const groups = new Map()
  for (const d of defects) {
    const key = causeOf(d)
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { cause: key, what: d.what, count: 0, routes: new Set(), widths: new Set(), schemes: new Set(), example: d, examples: [], values: new Map() }))
    g.count++
    g.routes.add(d.route)
    if (d.width != null) g.widths.add(d.width)
    const sch = d.scheme ?? d.state
    if (sch) g.schemes.add(sch)
    if (g.examples.length < 3 && !g.examples.some((e) => e.route === d.route)) g.examples.push(d)
    g.values.set(`${d.text ?? ''}|${JSON.stringify(d.source)}|${JSON.stringify(d.port)}`, { text: d.text, source: d.source, port: d.port })
  }
  return [...groups.values()]
    .map((g) => ({ cause: g.cause, what: g.what, occurrences: g.count, routes: [...g.routes], widths: [...g.widths].sort((a, b) => a - b), schemes: [...g.schemes], culprit: g.example.culprit ?? null, example: g.example, examples: g.examples, values: [...g.values.values()].slice(0, 6) }))
    .sort((a, b) => b.routes.length - a.routes.length || b.occurrences - a.occurrences)
}

/**
 * Exit code of a sweep: 1 when any check has a defect, else 3 when anything owed was not measured (a route or a
 * scheme that could not be read, the deadline, chips that could not be paired), else 0. A partial sweep is never 0.
 */
export function exitCodeOf(checks, owed) {
  if (checks.some((c) => c.defects > 0 || c.acceptErrors > 0)) return 1
  if (owed.length || checks.some((c) => c.notMeasured > 0)) return 3
  return 0
}

/** Why a dark cell is closed without being read when the contract declares the source has no dark of its own (darkPassGap). */
export const DARK_DERIVED_REASON = 'the contract declares the source has no dark of its own (source.darkDerived, page-map theme.darkDerived): nothing on the source to compare the port\'s dark with; the port\'s dark is measured by Visual QA\'s dark tiers'

/**
 * Whether a dark pass of a page can be read on both sides (`hooks`: dossierPlan's; `schemes`: the run's). null: both sides have a dark
 * switch. 'derived': the site has one, the source has none BY DECLARATION (`source.darkDerived`, taken by dossierPlan only from a
 * contract fresh for the spec-pack), and the run reads the same cells in light: the dark cell is not owed, it is listed in the
 * report's `notOwed` with DARK_DERIVED_REASON. 'owed': a side has no switch and nothing declares why, or a run with no light pass
 * (closing its dark would leave nothing measured) — the cell stays owed, not measured.
 */
export function darkPassGap(hooks, schemes = ['light', 'dark']) {
  if (hooks.site.dark && hooks.source.dark) return null
  if (hooks.site.dark && hooks.source.darkDerived === true && schemes.includes('light')) return 'derived'
  return 'owed'
}
