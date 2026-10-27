// The `heights` check of site-sweep.mjs, the comparison half: pure functions from what the probe read on the port and on the source
// (site-sweep-heights.mjs) to defects, listed differences, notDefects and not-measured cases — the shape of the other judges:
// { cases, defects, listed, notDefects, notMeasured } plus `cells` (the route × width table).
//
// A DEFECT is reported per CAUSE, not per cell. Per cell the bands of the two pages are PAIRED (header and footer by landmark, the others by
// heading text, in order); then
//   - a band only the source has is `band-missing`, a band only the port has is `band-extra`, a band the port prints twice is `band-doubled`;
//   - a paired band whose height differs by more than the tolerance is taken apart: inside it the FIRST child (in page order) that differs, and
//     so on down, until what differs is told from computed style: an element missing/extra, the column count, a padding step, a spacing
//     (margin/gap) step, a font-size or line-height step, the box ratio of a picture, a width step, text that wraps to another line count;
//   - the gaps between bands (margins between sections) that differ are `gap`; a page that is off only by small steps that add up is `accumulated`.
// The cause key names the band and the KIND of difference (never pixel counts), so one `sweep.accept` row covers the cells it explains and does not
// go stale when the numbers move. A pairing the judge is not sure of is NOT-MEASURED; a page that never went quiet is NOT-MEASURED when it differs.
//
// WHAT IS THERE. A leaf (words, a picture) is what the probe saw with ink — no size says a thing is not there: a 12 px picture or a 2 px line of text
// counts. What only one side has is looked for in every paired band, whatever its height, in the regions one side cuts into several bands (before or after a
// pair) or two neighbours share, and in a small band without a partner; a height cause (padding, font, columns, wrap) explains the height it measures and never
// the content that is not on the other side. A leaf stands for another only with EVIDENCE: the same complete wording (or a picture of about the same size) painted
// at a supported place, one to one (a maximum matching) — equal words, equal sizes or an accepted cause alone are none. What the probe could not read (a band past
// its leaf cap, a picture whose ink the browser could not establish) is not-measured, never quiet. The site logo of the two headers (same role, same place) is one
// logo whether it is drawn as a picture or as text; two text logos that read differently are their own finding. A copy a carousel prints for its loop is removed
// only against an original of the same component.

export const HEIGHTS_TITLE = 'Page height and band heights equal the source (8 px) on every route and width, or the cause of the difference is named'
/** Why 8 px: reading the same fresh page twice moves a band by at most 1–2 px (subpixel line boxes), a different wrap or a one-step padding change is 12 px or more, and a hand table at ±8 was what the fix releases used. */
export const HEIGHT_TOLERANCE_PX = 8
const PAD_TOL = 2
const near = (a, b, t) => Math.abs(a - b) <= t
const r1 = (n) => Math.round(n * 10) / 10
const px = (n) => `${r1(n)}px`

// ---- pairing --------------------------------------------------------------------------------------------------------------

/**
 * Pair two ordered lists. `keyOf(x)` is a string or null (null never matches). Items with equal keys are anchors (longest common subsequence);
 * between anchors, equal counts pair in order; an item with a key that stands nowhere in the other list is missing/extra; what is still
 * unequal is `unsure`. → { pairs: [[i, j]], missing: [i], extra: [j], unsure: [{source: [i], port: [j]}] }
 */
export function alignSeq(S, P, keyOf) {
  const ks = S.map(keyOf)
  const kp = P.map(keyOf)
  const n = S.length
  const m = P.length
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = ks[i] != null && ks[i] === kp[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const anchors = []
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (ks[i] != null && ks[i] === kp[j]) {
      anchors.push([i, j])
      i++
      j++
    } else if (L[i + 1][j] >= L[i][j + 1]) i++
    else j++
  }
  const out = { pairs: [], missing: [], extra: [], unsure: [] }
  const segment = (i0, i1, j0, j1) => {
    let si = []
    let pj = []
    for (let i = i0; i < i1; i++) si.push(i)
    for (let j = j0; j < j1; j++) pj.push(j)
    if (si.length === pj.length) return si.forEach((i, k) => out.pairs.push([i, pj[k]]))
    if (si.length > 0 && pj.length > 0) {
      // an item named by a key that stands nowhere on the other side is missing/extra by itself
      const lostS = si.filter((i) => ks[i] != null && !kp.includes(ks[i]))
      const lostP = pj.filter((j) => kp[j] != null && !ks.includes(kp[j]))
      if (lostS.length || lostP.length) {
        out.missing.push(...lostS)
        out.extra.push(...lostP)
        si = si.filter((i) => !lostS.includes(i))
        pj = pj.filter((j) => !lostP.includes(j))
      }
      if (si.length === pj.length) return si.forEach((i, k) => out.pairs.push([i, pj[k]]))
      if (si.length && pj.length) return out.unsure.push({ source: si, port: pj })
    }
    out.missing.push(...si)
    out.extra.push(...pj)
  }
  let pi = 0
  let pjn = 0
  for (const [i, j] of anchors) {
    segment(pi, i, pjn, j)
    out.pairs.push([i, j])
    pi = i + 1
    pjn = j + 1
  }
  segment(pi, n, pjn, m)
  out.pairs.sort((a, b) => a[0] - b[0])
  return out
}

const bandKey = (b) => (b.kind === 'header' || b.kind === 'footer' ? b.kind : b.tree?.head ? `h:${b.tree.head}` : null)
export const pairBands = (source, port) => alignSeq(source, port, bandKey)

// ---- taking a band apart ----------------------------------------------------------------------------------------------------

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
const boxes = (n) => `${n} ${n === 1 ? 'box' : 'boxes'}`
const nodeName = (n) => (n.head ? `${n.sig} "${n.head.slice(0, 24)}"` : n.key ? `${n.sig} "${n.key.slice(0, 24)}"` : n.sig)
const nk = (t) => String(t ?? '').replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 32)
const kidKey = (k) => (nk(k.head || k.key) ? `${k.t}|${nk(k.head || k.key)}` : null)
const padOf = (n) => n.pt + n.pb + n.bw
/** The font size of the words a box holds (inline words in a smaller or larger size count), else its own. */
const fsOf = (n) => n.tfs ?? n.fs
/** Where the content of a box starts and ends inside it: the space above the first and below the last leaf (words, pictures). null when it has no leaf. */
const insets = (n) => {
  const L = leavesOf(n).filter((l) => !l.ov)
  if (!L.length) return null
  return { top: Math.min(...L.map((l) => l.y)) - n.y, bottom: n.y + n.h - Math.max(...L.map((l) => l.y + l.h)) }
}
/** A box that only holds its children stacked (does not cut its content off, no padding, border or columns of its own, and no room of its own around them — a box that is taller than the boxes in it is a box): its children count as the children of its parent. */
const transparent = (n) => n.k.length > 0 && n.cut == null && n.cols === 1 && padOf(n) === 0 && !n.img && n.h - (Math.max(...n.k.map((k) => k.y + k.h)) - Math.min(...n.k.map((k) => k.y))) <= PAD_TOL
const flat = (n) => n.k.flatMap((k) => (transparent(k) ? flat(k) : [k]))
/** Walk down a chain of boxes that hold one box and nothing else, so that a wrapper one side has and the other lacks is no difference. */
const skipWrap = (n, path, meta = {}) => {
  while (n.k.length === 1 && padOf(n) === 0 && !n.img && near(n.k[0].h, n.h, 2)) {
    if (n.cut != null) meta.cut = n.cut
    path.push(n.k[0].sig)
    n = n.k[0]
  }
  return n
}
const leavesOf = (n, cut = null) => {
  cut = n.cut ?? cut
  // the words a box holds itself and the boxes out of flow under it (a picture placed by absolute positioning) stand in reading order among the leaves of the boxes under it
  const own = (n.dl ?? []).flatMap((l) => leavesOf(l, cut))
  let base = []
  if (n.k.length && !n.img) base = n.k.flatMap((k) => leavesOf(k, cut))
  else if (n.words || n.img) {
    // a leaf inside a box that cuts its content off carries that cut
    if (cut != null) n.cut ??= cut
    base = [n]
  }
  return own.length ? [...base, ...own].sort((p, q) => Math.round((p.ink ?? p).y) - Math.round((q.ink ?? q).y) || (p.ink ?? p).x - (q.ink ?? q).x) : base
}
const leafKey = (l) => (l.img ? null : nk(l.key) || null)
/** The leaves of the two headers that are the one logo (see pairLogos): they are not extra or missing against each other. */
const pairedLogo = new WeakSet()
const counted = (n) => leavesOf(n).filter((l) => !pairedLogo.has(l))
const isGlyph = (l) => !l.img && l.words && !l.tx
const alike = (x, y) => x.img.w <= 2 * y.img.w && y.img.w <= 2 * x.img.w && x.img.h <= 2 * y.img.h && y.img.h <= 2 * x.img.h
/** The most pairs of leaves a comparison of two boxes tests for another reading of the same place (a page of other content is a finding, not an afternoon). */
const WORK_MAX = 4e6
const maxCols = (n) => Math.max(n.cols ?? 1, ...n.k.map(maxCols))

/** The complete visible wording of a text leaf (the digest the probe took of all of it; the words the reading holds when a hand-built reading has none). */
const wording = (l) => l.th ?? l.tx
const sameContent = (x, y) => Boolean(x.img) === Boolean(y.img) && (x.img ? alike(x, y) : wording(x) === wording(y))

/**
 * A maximum one-to-one matching of `A` against `B` (indexes) over the edges `ok(i, j)`: augmenting paths, the candidates of each leaf tried nearest first. Bounded: a
 * group too large to search every path is matched nearest first without backtracking (a leaf may then be left over — a finding, never a quiet cell).
 */
function maxMatching(A, B, ok, dist, near = null) {
  const adj = A.map((_, i) => (near ? near(i) : B.map((__, j) => j)).filter((j) => ok(i, j)).sort((p, q) => dist(i, p) - dist(i, q)))
  const owner = new Array(B.length).fill(-1)
  const mate = new Array(A.length).fill(-1)
  const edges = adj.reduce((n, l) => n + l.length, 0)
  const full = A.length * Math.max(1, edges) <= 4e6
  const augment = (i, seen) => {
    for (const j of adj[i]) {
      if (seen.has(j)) continue
      seen.add(j)
      if (owner[j] < 0 || augment(owner[j], seen)) {
        owner[j] = i
        mate[i] = j
        return true
      }
    }
    return false
  }
  for (let i = 0; i < A.length; i++) {
    if (full) augment(i, new Set())
    else {
      const j = adj[i].find((q) => owner[q] < 0)
      if (j != null) [owner[j], mate[i]] = [i, j]
    }
  }
  return mate
}

/**
 * What only one side has, leaf against leaf, ONE to ONE (a maximum matching), where a match is evidence that the two readings show the same thing at the same place:
 *   - the same COMPLETE wording (a line whose end changed does not match), or a picture of about the same size (the two sites host their pictures under other names);
 *   - at a supported position, relative to the top of the two boxes compared: the left edge within the tolerance and the top within the tolerance plus the height the two
 *     boxes differ by (a box taller by 40 px can hold its lower content 40 px lower, not 400) — widened by the difference of the boxes' own left edge and width;
 *     when the two boxes are as high as each other (`strict`) the bottom edge and the height of the leaf must agree too (a leaf that wraps to another number of lines
 *     or ends elsewhere is not the same thing at the same place; the right edge of wrapped text is ragged and says nothing);
 *   - or, when the boxes lay their content out in another number of columns (a measured change of layout), in the order of the reading: the leaves left over after the
 *     positions are matched in one reading order, which a column step moves but does not reorder.
 * Equal wording, equal picture size or an accepted height cause alone are no evidence. Words left over on both sides at the same place are one place read two ways —
 * `changedText`, its own finding — and what is left is missing (the source has it) or extra (the port has it). An icon one side draws as a glyph of an icon font matches
 * a glyph-only leaf at its place. A picture whose ink could not be established (`unk`) is matched with nothing: it is listed in `unknown`.
 * → { missingText, extraText, changedText: [[source leaf, port leaf]], missingPics, extraPics, a, b, unknown } — `a`, `b`: the pictures of each side.
 */
function leafDelta(a, b, LA, LB, tol = HEIGHT_TOLERANCE_PX) {
  const unknown = [...LA.filter((l) => l.unk), ...LB.filter((l) => l.unk)]
  // (a picture whose ink is not established, or whose background is not placed, never enters ordinary matching)
  const SA = LA.filter((l) => !l.unk && !l.bgu && (l.img || l.tx))
  const SB = LB.filter((l) => !l.unk && !l.bgu && (l.img || l.tx))
  const dH = Math.abs(a.h - b.h)
  const strict = dH <= tol
  // the reach of a match is what was measured of the two boxes' own place — the offset of their left edges — never the difference of their heights or widths: how far a leaf
  // may have moved down comes from the leaves matched around it (drift, below)
  const wide = tol + Math.abs(a.x - b.x)
  const high = tol
  // a leaf stands where it is painted (its ink), relative to the top of the box it is compared in
  const box = (l, root, byBox = false) => {
    const k = byBox ? l : l.ink ?? l
    return { l: k.x, r: k.x + k.w, t: k.y - root.y, b: k.y + k.h - root.y }
  }
  // Across: the leaf of the port stands where the leaf of the source does when its painted left edge, its painted centre (centred text) or the left edge of its box (text in a
  // padded link) is within the tolerance — or the leaf stands in an anchored container (below).
  const gaps = (x, y) => {
    const kx = x.ink ?? x
    const ky = y.ink ?? y
    return [ky.x - kx.x, ky.x + ky.w / 2 - (kx.x + kx.w / 2), y.x - x.x]
  }
  /** Down: the leaf of the port stands where the leaf of the source does, from the top of the two boxes. `edges`: the bottom edge and the height too; `byBox`: the boxes, not the ink. */
  const vert = (x, y, edges, byBox = false) => {
    const p = box(x, a, byBox)
    const q = box(y, b, byBox)
    return Math.abs(p.t - q.t) <= high && (!edges || (Math.abs(p.b - q.b) <= high && Math.abs(p.b - p.t - (q.b - q.t)) <= high))
  }
  const horiz = (x, y, byBox = false) => (byBox ? Math.abs(x.x - y.x) <= wide : gaps(x, y).some((d) => Math.abs(d) <= wide))
  /** The leaf of the source and the leaf of the port stand at corresponding places (not asked: what they show). */
  const fits = (x, y, edges, byBox = false) => vert(x, y, edges, byBox) && horiz(x, y, byBox)
  const away = (x, y) => {
    const p = box(x, a)
    const q = box(y, b)
    return Math.abs(p.l - q.l) + Math.abs(p.t - q.t)
  }
  /** The leaves of `B` (indexes into the list `Y`) whose top is within the vertical reach of the top of leaf `i` of `A` (list `X`): the candidates a match can come from. */
  const reach = (A, B, X, Y, byBox) => {
    const tops = B.map((j, q) => [box(Y[j], b, byBox).t, q]).sort((p, r) => p[0] - r[0])
    return (i) => {
      const t = box(X[A[i]], a, byBox).t
      let lo = 0
      let hi = tops.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (tops[mid][0] < t - high) lo = mid + 1
        else hi = mid
      }
      const out = []
      for (; lo < tops.length && tops[lo][0] <= t + high; lo++) out.push(tops[lo][1])
      return out
    }
  }
  const mateA = new Array(SA.length).fill(-1)
  const mateB = new Array(SB.length).fill(-1)
  // Candidates the evidence does not carry: leaves that may stand for one another (equal words in the same cell, the same words after a reflow or in a carousel's other
  // phase) with no measured position behind it. They are NOT matched (`mateA`/`mateB` hold proven pairs only, and nothing below reads a candidate as evidence for another
  // match); they leave the findings because the other side may hold them, and are reported as not measured, each with its cause.
  const unsure = { A: new Set(), B: new Set() }
  const uncertain = []
  const doubt = (cause, ia, ib, where = null) => {
    ia = ia.filter((i) => !unsure.A.has(i))
    ib = ib.filter((j) => !unsure.B.has(j))
    if (!ia.length && !ib.length) return
    ia.forEach((i) => unsure.A.add(i))
    ib.forEach((j) => unsure.B.add(j))
    uncertain.push({ cause, source: ia.map((i) => SA[i]), port: ib.map((j) => SB[j]), where })
  }
  // the groups of leaves that can stand for one another: the same words, or the pictures
  const groups = new Map()
  const keyOf = (l) => (l.img ? '\0img' : wording(l))
  SB.forEach((l, j) => {
    const k = keyOf(l)
    if (!groups.has(k)) groups.set(k, { A: [], B: [] })
    groups.get(k).B.push(j)
  })
  SA.forEach((l, i) => groups.get(keyOf(l))?.A.push(i))
  for (const g of groups.values()) {
    if (!g.A.length || !g.B.length) continue
    const mate = maxMatching(g.A, g.B, (i, j) => sameContent(SA[g.A[i]], SB[g.B[j]]) && fits(SA[g.A[i]], SB[g.B[j]], strict), (i, j) => away(SA[g.A[i]], SB[g.B[j]]), reach(g.A, g.B, SA, SB, false))
    mate.forEach((j, i) => {
      if (j >= 0) [mateA[g.A[i]], mateB[g.B[j]]] = [g.B[j], g.A[i]]
    })
  }
  // Anchored containers. A displacement pairs leaves only when it is the displacement of a box whose correspondence is proven on its own — never from leaves that moved alike.
  // One element (the same tag and role: a landmark, a form, a list, a table) is the same element on both sides when it is measured as large on both sides and
  //   (a) holds the same complete set of visible leaves — three or more, whatever the element; two, the same kind of landmark — and is the only box that does, or
  //   (b) stands at the same place of the page (left, top, width, height within the tolerance), is the only box there on each side, and holds leaves that each side has once —
  //       two for the same kind of landmark, three otherwise.
  // Inside such a pair the leaves that stand for one another are those that keep their place in the box (carried by the box's own move across or down: a menu pushed by its
  // neighbour, a band that starts lower), and — the box being the same element — the leaf whose words occur once on each side: the same leaf, which the box moved or which moved in
  // it. That leaf is matched, and a place beyond what a box carries (a fifth of the width, at least 64 px, along an axis in which the box stands where it did in the page or in
  // the band; the leaf itself within the tolerance of its place in the box) is its own finding, `element-moved`: it is not silent and it is not missing. Never for the leaves of a
  // carousel's slides.
  const moved = []
  const alone = []
  {
    const ANCHOR_TAGS = new Set(['header', 'nav', 'main', 'footer', 'aside', 'form', 'section', 'article', 'ul', 'ol', 'dl', 'table', 'fieldset', 'figure', 'menu', 'address', 'details', 'tr'])
    const reachX = Math.max(64, 0.2 * Math.max(a.w, b.w))
    const boxesOf = (S) => {
      const out = new Map()
      S.forEach((l, i) => {
        if (!l.ab || l.comp != null) return
        for (const q of l.ab) {
          if (!q.tag || !(q.w > 0 && q.h > 0)) continue
          const k = `${q.tag}|${q.role ?? ''}|${q.x}|${q.y}|${q.w}|${q.h}`
          if (!out.has(k)) out.set(k, { q, idx: [] })
          out.get(k).idx.push(i)
        }
      })
      // (an element of no landmark kind is an anchor only through three leaves or more; the boxes that hold the very same leaves are one box — the innermost)
      const list = [...out.values()].filter((c) => c.idx.length >= (ANCHOR_TAGS.has(c.q.tag) || c.q.role ? 2 : 3))
      const outer = new Map()
      for (const c of list) {
        const k = c.idx.join(',')
        const o = outer.get(k)
        if (!o || c.q.w * c.q.h < o.q.w * o.q.h) outer.set(k, c)
      }
      return [...outer.values()]
    }
    const words = (S, c) => c.idx.map((i) => (S[i].img ? '\0img' : wording(S[i])))
    const kind = (c) => (ANCHOR_TAGS.has(c.q.tag) || c.q.role ? `${c.q.tag}|${c.q.role ?? ''}` : 'box')
    const byKind = { A: new Map(), B: new Map() }
    const cs = { A: boxesOf(SA), B: boxesOf(SB) }
    for (const side of ['A', 'B']) {
      const S = side === 'A' ? SA : SB
      for (const c of cs[side]) {
        c.words = words(S, c)
        c.id = `${c.idx.length >= 3 ? 'any' : kind(c)}|${[...c.words].sort().join('\u0001')}`
        for (const k of [`id|${c.id}`, `kind|${kind(c)}`]) {
          if (!byKind[side].has(k)) byKind[side].set(k, [])
          byKind[side].get(k).push(c)
        }
      }
    }
    const once = (list) => {
      const n = new Map()
      for (const w of list) n.set(w, (n.get(w) ?? 0) + 1)
      return new Set([...n].filter(([, c]) => c === 1).map(([w]) => w))
    }
    const same = (p, q) => Math.abs(p.q.w - q.q.w) <= tol && Math.abs(p.q.h - q.q.h) <= tol
    const pairs = []
    const taken = { A: new Set(), B: new Set() }
    const take = (p, q, how) => {
      if (taken.A.has(p) || taken.B.has(q)) return
      taken.A.add(p)
      taken.B.add(q)
      pairs.push({ p, q, how })
    }
    for (const p of cs.A) {
      const ds = byKind.B.get(`id|${p.id}`)
      if (byKind.A.get(`id|${p.id}`).length === 1 && ds?.length === 1 && same(p, ds[0])) take(p, ds[0], 'content')
    }
    for (const p of cs.A) {
      if (taken.A.has(p)) continue
      // (the one element of its kind in that box: nothing else of the kind stands there on either side)
      const near = (c, o) => Math.abs(c.q.x - o.q.x) <= tol && Math.abs(c.q.y - o.q.y) <= tol && same(c, o)
      const mine = cs.A.filter((c) => near(c, p))
      const theirs = cs.B.filter((c) => near(c, p))
      if (mine.length !== 1 || theirs.length !== 1 || taken.B.has(theirs[0])) continue
      const [oa, ob] = [once(p.words), once(theirs[0].words)]
      const kinds = kind(p) === kind(theirs[0]) && kind(p) !== 'box'
      if ([...oa].filter((w) => ob.has(w)).length >= (kinds ? 2 : 3)) take(p, theirs[0], 'place')
    }
    pairs.sort((x, y) => x.p.idx.length - y.p.idx.length)
    for (const { p, q } of pairs) {
      const dx = q.q.x - p.q.x
      const calm = Math.abs(dx) <= reachX && (Math.abs(q.q.y - p.q.y) <= tol || Math.abs(q.q.y - b.y - (p.q.y - a.y)) <= tol)
      const keep = (x, y) => {
        const kx = x.ink ?? x
        const ky = y.ink ?? y
        const down = Math.abs(ky.y - q.q.y - (kx.y - p.q.y)) <= tol
        const across = [ky.x - kx.x, ky.x + ky.w / 2 - (kx.x + kx.w / 2), y.x - x.x].some((d) => Math.abs(d - dx) <= tol)
        return down && across && (!strict || Math.abs(kx.h - ky.h) <= tol)
      }
      const A = p.idx.filter((i) => mateA[i] < 0)
      const B = q.idx.filter((j) => mateB[j] < 0)
      if (calm) {
        const mate = maxMatching(A, B, (i, j) => sameContent(SA[A[i]], SB[B[j]]) && keep(SA[A[i]], SB[B[j]]), (i, j) => away(SA[A[i]], SB[B[j]]))
        mate.forEach((j, i) => {
          if (j >= 0) [mateA[A[i]], mateB[B[j]]] = [B[j], A[i]]
        })
      }
      // the leaf that only one place of the box has once on each side is the same leaf, wherever it stands in the box
      // (words only: a picture has no wording to say which picture it is)
      const [ua, ub] = [once(A.filter((i) => !SA[i].img).map((i) => wording(SA[i]))), once(B.filter((j) => !SB[j].img).map((j) => wording(SB[j])))]
      for (const i of A) {
        if (mateA[i] >= 0 || SA[i].img) continue
        const k = wording(SA[i])
        if (!ua.has(k) || !ub.has(k)) continue
        const j = B.find((o) => mateB[o] < 0 && !SB[o].img && wording(SB[o]) === k && sameContent(SA[i], SB[o]))
        if (j == null) continue
        // (matched after the rows and reflows below have had their say — a leaf they take is theirs — and told as moved when it is not where the box carries it)
        const ki = SA[i].ink ?? SA[i]
        const kj = SB[j].ink ?? SB[j]
        alone.push({ i, j, by: !keep(SA[i], SB[j]) || !calm ? { across: r1(kj.x - ki.x), down: r1(kj.y - q.q.y - (ki.y - p.q.y)) } : null })
      }
    }
  }
  const left = () => [SA.map((_, i) => i).filter((i) => mateA[i] < 0), SB.map((_, j) => j).filter((j) => mateB[j] < 0)]
  // The containers of slides the two sides share: a leaf is a member of a carousel's slide only through the page's own structure (`sl`, `sc` from the probe: it, or a box around it,
  // is one of several boxes of one size in one row, held by one box). Two containers are paired when slides held by them were paired — by wording at their own place, or by
  // the slot they stand in — never by the row a leaf stands in.
  const pairedC = { A: new Set(), B: new Set() }
  // containers in which slides were candidates at a place other than their own (equal words, shifted): the carousel may have advanced, and the slides without a counterpart there
  // may be in another phase — not shown, so said as not measured, leaf by leaf
  const shiftedD = { A: new Set(), B: new Set() }
  // Drift: the content above a leaf grew or shrank, so it stands lower or higher than the same leaf of the other side by about what the leaves around it do. A leaf stands for
  // its counterpart between the two leaves already matched on either side of it (it keeps its place in the reading order) and moved down or up by no more than they are — the
  // top of the two boxes counts as matched at the shift 0. A leaf that moved past its neighbours, or further
  // than they did, is not supported. Across, the left edge, the centre or the box must still agree.
  for (let round = 0; round < 2; round++) {
    const [ra, rb] = left()
    if (!ra.length || !rb.length) break
    // (the top of the boxes is matched at 0, or at the padding step of the two boxes' own top padding: content below a padding that changed moves with it)
    const anchors = [{ ts: -Infinity, td: -Infinity, dy: 0, alt: (b.pt ?? 0) - (a.pt ?? 0) }]
    SA.forEach((l, i) => {
      if (mateA[i] < 0) return
      const p = box(l, a)
      const q = box(SB[mateA[i]], b)
      anchors.push({ ts: p.t, td: q.t, dy: q.t - p.t })
    })
    anchors.sort((x, y) => x.ts - y.ts || x.td - y.td)
    const around = (t) => {
      let lo = 0
      let hi = anchors.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (anchors[mid].ts <= t) lo = mid + 1
        else hi = mid
      }
      return [anchors[lo - 1], anchors[lo] ?? { ts: Infinity, td: Infinity, dy: anchors[lo - 1].dy }]
    }
    const byKey = new Map()
    for (const j of rb) {
      const k = keyOf(SB[j])
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k).push(j)
    }
    const edges = []
    for (const i of ra) {
      const group = byKey.get(keyOf(SA[i])) ?? []
      if (group.length > 400) continue
      const p = box(SA[i], a)
      const [prev, next] = around(p.t)
      const lo = Math.min(prev.dy, prev.alt ?? prev.dy, next.dy) - tol
      const hi = Math.max(prev.dy, prev.alt ?? prev.dy, next.dy) + tol
      for (const j of group) {
        if (!sameContent(SA[i], SB[j]) || !horiz(SA[i], SB[j])) continue
        const q = box(SB[j], b)
        const dy = q.t - p.t
        if (dy < lo || dy > hi || q.t < prev.td - tol || q.t > next.td + tol) continue
        if (strict && Math.abs(p.b - p.t - (q.b - q.t)) > high) continue
        if (edges.length < 20000) edges.push([i, j])
      }
    }
    if (!edges.length) break
    const A = [...new Set(edges.map((e) => e[0]))]
    const B = [...new Set(edges.map((e) => e[1]))]
    const has = new Set(edges.map((e) => `${e[0]}|${e[1]}`))
    const mate = maxMatching(A, B, (i, j) => has.has(`${A[i]}|${B[j]}`), (i, j) => away(SA[A[i]], SB[B[j]]))
    let got = 0
    mate.forEach((j, i) => {
      if (j >= 0) {
        ;[mateA[A[i]], mateB[B[j]]] = [B[j], A[i]]
        got++
      }
    })
    if (!got) break
  }
  // A measured layout mapping, local to where it is measured: leaves with the same wording that stand elsewhere — moved across (the padding of their container, a menu pushed by
  // its neighbour) or down (the content above them grew or shrank: the drift of a long band) — stand for one another when at least one OTHER pair of leaves, within 300 px of
  // them, is moved by the same amount (to the tolerance) both ways: two things that moved together are a mapping, one leaf that moved on its own is not. Across, bounded: a fifth
  // of the width, at least 64 px (the width of the box for the slides of a carousel, which the slide it is at moves as far as a slide is wide). When the two boxes are as high as
  // each other the leaf must still be as high as its counterpart.
  {
    const [ra, rb] = left()
    const limit = Math.max(64, 0.2 * Math.max(a.w, b.w))
    const byKey = new Map()
    for (const j of rb) {
      const k = keyOf(SB[j])
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k).push(j)
    }
    const cands = []
    for (const i of ra) {
      const group = byKey.get(keyOf(SA[i])) ?? []
      if (group.length > 200) continue
      for (const j of group) {
        if (!sameContent(SA[i], SB[j]) || horiz(SA[i], SB[j]) && vert(SA[i], SB[j], strict)) continue
        const p = box(SA[i], a)
        const q = box(SB[j], b)
        if (strict && Math.abs(p.b - p.t - (q.b - q.t)) > high) continue
        if (cands.length < 4000) cands.push({ i, j, g: gaps(SA[i], SB[j]), y: p.t, dy: q.t - p.t })
      }
    }
    // Words that read differently at the same height are moved by the same container too: they stand for no leaf, but they say how far this place is moved.
    const weak = []
    {
      const near = reach(ra, rb, SA, SB, false)
      for (let n = 0; n < ra.length && weak.length < 2000; n++) {
        const i = ra[n]
        if (SA[i].img) continue
        const p = box(SA[i], a)
        for (const m of near(n)) {
          const j = rb[m]
          if (SB[j].img || wording(SB[j]) === wording(SA[i])) continue
          const q = box(SB[j], b)
          if (Math.abs(q.t - p.t) <= tol) weak.push({ i, j, g: gaps(SA[i], SB[j]), y: p.t, dy: q.t - p.t })
        }
      }
    }
    // The shift is established by pairs already matched at positions of their own (`matched`: the pairs of the position rules above), never by the candidates it would match
    // itself: candidates that move alike say nothing about one another. A pair moved like another matched pair stands for the same leaf; the rest is a candidate (below).
    const movedBy = (e, o) => o.i !== e.i && o.j !== e.j && Math.abs(o.y - e.y) <= 300 && Math.abs(o.dy - e.dy) <= tol && e.g.some((dx, w) => Math.abs(o.g[w] - dx) <= tol)
    const matched = []
    SA.forEach((l, i) => {
      if (mateA[i] < 0 || matched.length >= 4000) return
      const p = box(l, a)
      const q = box(SB[mateA[i]], b)
      matched.push({ i, j: mateA[i], g: gaps(l, SB[mateA[i]]), y: p.t, dy: q.t - p.t })
    })
    // (no pair is made here: a shift is carried by an anchored container above, or by nothing — leaves that moved alike, and pairs matched elsewhere, say nothing about another leaf)
    // Leaves with the same words at another place, moved like something that is itself not confirmed (other candidates, a reading of other words at the same height): they
    // may be the same leaves moved by their container — as far as a slide is wide for a carousel, a fifth of the width otherwise (the whole box for three that move alike) —
    // and nothing measured says so. They are neither matched nor missing: candidates, said as not measured, and they confirm nothing else.
    const maybe = [...cands, ...weak, ...matched]
    const rigid = (e) => maybe.filter((o) => movedBy(e, o)).length >= 2
    const open = cands
      .filter((e) => mateA[e.i] < 0 && mateB[e.j] < 0 && e.g.some((dx) => Math.abs(dx) <= (SA[e.i].comp != null || SB[e.j].comp != null || rigid(e) ? Math.max(a.w, b.w) : limit)) && maybe.some((o) => movedBy(e, o)))
      .sort((p, q) => away(SA[p.i], SB[p.j]) - away(SA[q.i], SB[q.j]))
    const doubted = { A: new Set(), B: new Set() }
    // A leaf whose counterpart is clear — the same words (or a picture of about the size) once on each side among the leaves left over, or the nearest of several by more than twice —
    // within what a box carries across (`limit`) and within 300 px down (the reach of a move), is the one leaf of the source seen elsewhere on the port: it is matched and the place it moved to is its own finding (`element-moved`) — never silent. (Equal words that more
    // (Equal words that more leaves have with no clear nearest, and the leaves of a carousel's slides, are candidates: nothing says which is which.)
    // (a leaf is that one leaf when the other is the nearest of its words to it, and it the nearest to the other, the next one at least half as far again: with one of each, the case where
    // the words stand once; with a picture, its place and size are all there is)
    const eligible = cands.filter((e) => mateA[e.i] < 0 && mateB[e.j] < 0 && SA[e.i].comp == null && SB[e.j].comp == null && e.g.some((dx) => Math.abs(dx) <= limit) && (Math.abs(e.dy) <= 300 || Math.abs((SB[e.j].ink ?? SB[e.j]).y - (SA[e.i].ink ?? SA[e.i]).y) <= 300))
    // (the distance is measured in the frame of the band and in the page's own, whichever is the smaller: bands that start at other places are not what moved the leaf)
    const dist = (e) => {
      const [kx, ky] = [SA[e.i].ink ?? SA[e.i], SB[e.j].ink ?? SB[e.j]]
      return Math.min(away(SA[e.i], SB[e.j]), Math.abs(ky.x - kx.x) + Math.abs(ky.y - kx.y))
    }
    const best = (list, side) => {
      const m = new Map()
      for (const e of list) {
        const k = e[side]
        if (!m.has(k)) m.set(k, [])
        m.get(k).push(dist(e))
      }
      for (const v of m.values()) v.sort((p, q) => p - q)
      return m
    }
    const [dA, dB] = [best(eligible, 'i'), best(eligible, 'j')]
    const clear = (e) => {
      const d = dist(e)
      return [dA.get(e.i), dB.get(e.j)].every((v) => v[0] >= d - 1e-6 && (v.length < 2 || v[1] > 1.5 * d + tol))
    }
    // The same words — or pictures of about one size — on as many leaves of each side (a list of cards that all say one thing), every one within reach of the one of its order: the k-th of the source is the k-th of the
    // port. That is the order of the reading, not a measured place, and what it matches is a finding (`element-moved`), never a quiet cell; when a pair is out of reach, or the
    // numbers differ, none of the group is matched.
    {
      const [la, lb] = left()
      const group = (L, S) => {
        const m = new Map()
        for (const x of L) {
          const k = keyOf(S[x])
          if (!m.has(k)) m.set(k, [])
          m.get(k).push(x)
        }
        return m
      }
      const [gA, gB] = [group(la, SA), group(lb, SB)]
      const byPair = new Map(eligible.map((e) => [`${e.i}|${e.j}`, e]))
      const top = (S) => (x, y) => (S[x].ink ?? S[x]).y - (S[y].ink ?? S[y]).y || (S[x].ink ?? S[x]).x - (S[y].ink ?? S[y]).x
      for (const [k, xs] of gA) {
        const ys = gB.get(k)
        if (!ys || xs.length < 2 || xs.length !== ys.length || xs.length > 60) continue
        xs.sort(top(SA))
        ys.sort(top(SB))
        const es = xs.map((x, n) => byPair.get(`${x}|${ys[n]}`))
        if (!es.every(Boolean) || es.some((e) => doubted.A.has(e.i) || doubted.B.has(e.j))) continue
        for (const e of es) {
          doubted.A.add(e.i)
          doubted.B.add(e.j)
          alone.push(e)
        }
      }
    }
    for (const e of open) {
      if (doubted.A.has(e.i) || doubted.B.has(e.j)) continue
      if (eligible.includes(e) && clear(e)) {
        // (after the rows and reflows below have had their say: a leaf they take is theirs)
        alone.push(e)
        continue
      }
      doubted.A.add(e.i)
      doubted.B.add(e.j)
      const slide = SA[e.i].comp != null || SB[e.j].comp != null
      if (slide) {
        shiftedD.A.add(SA[e.i].sc)
        shiftedD.B.add(SB[e.j].sc)
      }
      doubt(slide ? 'slide-pair-unproven' : 'shift-position-unproven', [e.i], [e.j], slide ? SA[e.i].sc ?? SB[e.j].sc : null)
    }
  }
  // The box that holds a group of leaves, from the structure the probe read around each: the nearest box around ALL of them (`ab`), with whether it lays its children in a row.
  // null when the leaves share none the probe read.
  const holder = (L, idxs, wantRow) => {
    const chains = idxs.map((i) => L[i].ab)
    if (chains.some((c) => !c)) return null
    const key = (q) => `${q.x}|${q.y}|${q.w}|${q.h}`
    for (const q of chains[0]) {
      if (wantRow === true && !q.row) continue
      if (!chains.every((c) => c.some((o) => key(o) === key(q)))) continue
      // the CELL of each leaf: the child of the holder that contains it (the leaf's own box when the holder is its parent)
      const cells = idxs.map((i, n) => {
        const at = chains[n].findIndex((o) => key(o) === key(q))
        const l = L[i]
        return at === 0 ? { x: l.x, y: l.y, w: l.w, h: l.h } : chains[n][at - 1]
      })
      return { ...q, cells }
    }
    return null
  }
  // the leaf lies inside its own cell (to the tolerance): its place is bounded by a box that was measured
  const inCell = (l, c) => {
    const k = l.ink ?? l
    return k.x >= c.x - tol && k.x + k.w <= c.x + c.w + tol && k.y >= c.y - tol && k.y + k.h <= c.y + c.h + tol
  }
  // two holders stand at the same place: left edge (once, with the offset of the boxes' own left edges) and, when asked, top from the top of each box, within the tolerance
  const sameHolder = (qa, qb, top = false) => Boolean(qa && qb) && Math.abs(qa.x - qb.x) <= wide && (!top || Math.abs(qa.y - a.y - (qb.y - b.y)) <= tol)
  // One row of leaves — the fields of a form, the items of a menu — whose boxes were widened or narrowed moves the leaves along it across. The supported form: a row of at least
  // two leaves on each side, at the same height of its box (to the tolerance, once), holding the same complete wordings in the same left-to-right order: the leaves of the row
  // left over stand for each other. The row must be the same place on both sides: one box holds the leaves of the row on each side, laying its children in a row, and the two
  // boxes start at the same left edge and the same height. A lone leaf in its row, a row in no shared box, or a row whose words or order differ, is not supported.
  {
    const rowsOf = (L, root) => {
      const order = L.map((l, i) => i).sort((p, q) => box(L[p], root).t - box(L[q], root).t || box(L[p], root).l - box(L[q], root).l)
      const rows = []
      for (const i of order) {
        const t = box(L[i], root).t
        const last = rows[rows.length - 1]
        if (last && Math.abs(t - last.t) <= tol && !L[i].img === !L[last.items[0]].img) last.items.push(i)
        else rows.push({ t, items: [i] })
      }
      return rows.map((r) => ({ t: r.t, items: r.items.sort((p, q) => box(L[p], root).l - box(L[q], root).l) }))
    }
    const rA = rowsOf(SA, a).filter((r) => r.items.length >= 2)
    const rB = rowsOf(SB, b).filter((r) => r.items.length >= 2)
    for (const ra of rA) {
      if (!ra.items.some((i) => mateA[i] < 0)) continue
      const hA = holder(SA, ra.items, true)
      const mapped = (r) => {
        const hB = holder(SB, r.items, true)
        if (!sameHolder(hA, hB)) return false
        const cA = hA.cells
        const cB = hB.cells
        // each leaf in its own cell, on both sides, and the cells distinct and in order
        if (!ra.items.every((i, q) => inCell(SA[i], cA[q]) && inCell(SB[r.items[q]], cB[q]))) return false
        if (cA.some((c, q) => q > 0 && c.x < cA[q - 1].x + tol) || cB.some((c, q) => q > 0 && c.x < cB[q - 1].x + tol)) return false
        // the measured mapping of the cells: each cell moved across by what the cells before it widened or narrowed by (the gap between two cells may change by the tolerance)
        let widened = 0
        // (the first cell moves with the left edge of the box that holds the row, to the tolerance: a whole row shifted inside its box has no measure either)
        if (Math.abs(cB[0].x - cA[0].x - (hB.x - hA.x)) > tol) return false
        for (let q = 0; q < cA.length; q++) {
          if (Math.abs(cB[q].x - cA[q].x - (cB[0].x - cA[0].x) - widened) > tol * q) return false
          // a leaf keeps its place in its cell, to what the cell's own width changed by
          const offA = (SA[ra.items[q]].ink ?? SA[ra.items[q]]).x - cA[q].x
          const offB = (SB[r.items[q]].ink ?? SB[r.items[q]]).x - cB[q].x
          if (Math.abs(offB - offA) > tol + Math.abs(cB[q].w - cA[q].w)) return false
          widened += cB[q].w - cA[q].w
        }
        return true
      }
      const rb = !hA ? null : rB.find((r) => Math.abs(r.t - ra.t) <= tol && r.items.length === ra.items.length && mapped(r) && ra.items.every((i, q) => sameContent(SA[i], SB[r.items[q]]) && (mateA[i] < 0 || mateA[i] === r.items[q])))
      if (!rb || rb.items.some((j) => mateB[j] >= 0 && !ra.items.some((i) => mateA[i] === j))) continue
      ra.items.forEach((i, q) => {
        if (mateA[i] < 0 && mateB[rb.items[q]] < 0) [mateA[i], mateB[rb.items[q]]] = [rb.items[q], i]
      })
    }
  }
  // (a pair says its slide is paired only when the words are the slide's own: words that repeat in the container — every slide says "business executive" — pair with any slide)
  const repeats = (L) => {
    const m = new Map()
    for (const l of L) if (l.sc != null) m.set(`${l.sc}|${l.img ? '\0img' : wording(l)}`, (m.get(`${l.sc}|${l.img ? '\0img' : wording(l)}`) ?? 0) + 1)
    return (l) => (m.get(`${l.sc}|${l.img ? '\0img' : wording(l)}`) ?? 0) > 1
  }
  const carousel = SA.some((l) => l.comp != null) || SB.some((l) => l.comp != null)
  const repA = repeats(SA)
  const repB = repeats(SB)
  // The containers and the slides the two sides share are paired ONE to ONE, by the leaves matched at a measured place: a container (or a slide) that more than one leaf of the
  // other side points at, or that points at more than one, is not paired — the leaves matched through it are matched, but they say nothing of which carousel or slide is which.
  // A slide pair also needs its containers to be the paired ones.
  const aliveOf = () => {
    const out = { A: new Set(), B: new Set(), pairs: new Map() }
    const vote = () => ({ f: new Map(), r: new Map() })
    const put = (v, x, y) => {
      for (const [m, k, o] of [[v.f, x, y], [v.r, y, x]]) {
        if (!m.has(k)) m.set(k, new Set())
        m.get(k).add(o)
      }
    }
    const one = (v, x, y) => v.f.get(x)?.size === 1 && v.r.get(y)?.size === 1
    const cv = vote()
    const sv = vote()
    const inC = new Map()
    // The correspondence of a container or a slide is read from where the boxes STAND, never from a leaf that was carried to its counterpart by a drift, a moved box or a shift:
    // a leaf names its container and slide only when it was matched at the same place (its ink within the tolerance of the other's, relative to the top of the boxes compared) and
    // the slide boxes (`sr`) of the two have the same width and stand at the same place of their roots (a height follows the content the box holds, which is what differs; the
    // box of the container is not asked for: a track is as wide as its slides, or as one slide, by implementation). A leaf carried further, or through a slide of another width
    // or place, is a match of visible content — it names no container and no slide, so two carousels with the same words cannot swap identities through it. A slide box the
    // reading did not carry is no proof.
    const boxFits = (p, q) => Boolean(p && q && Math.abs(p.w - q.w) <= tol && Math.abs(p.x - a.x - (q.x - b.x)) <= wide && Math.abs(q.y - b.y - (p.y - a.y)) <= tol)
    // The slide boxes each side holds, by container. A container is paired only when the leaf matches at the same place agree one to one AND no other container of the other side
    // holds a slide that stands where one of its slides does (nor another of this side where a slide of its counterpart does): layered or stacked carousels with equal boxes
    // cannot be told apart by words that repeat in them. A slide is paired only when it is the one box that fits in its container pair, both ways.
    const boxesOf = (L) => {
      const m = new Map()
      for (const l of L) {
        if (l.sl == null || l.sc == null || !l.sr) continue
        if (!m.has(l.sc)) m.set(l.sc, new Map())
        m.get(l.sc).set(l.sl, l.sr)
      }
      return m
    }
    const [bxA, bxB] = [boxesOf(SA), boxesOf(SB)]
    SA.forEach((l, i) => {
      if (mateA[i] < 0) return
      const y = SB[mateA[i]]
      const [kx, ky] = [l.ink ?? l, y.ink ?? y]
      const slideOk = Math.abs(ky.y - b.y - (kx.y - a.y)) <= tol && boxFits(l.sr, y.sr)
      if (l.sc != null && y.sc != null && (l.comp != null || y.comp != null) && slideOk) {
        put(cv, l.sc, y.sc)
      }
      if (l.sl != null && y.sl != null && !repA(l) && !repB(y) && slideOk) {
        put(sv, l.sl, y.sl)
        inC.set(`${l.sl}|${y.sl}`, [l.sc, y.sc])
      }
    })
    const standsIn = (cx, cy) => {
      return (bxA.get(cx) && bxB.get(cy) && [...bxA.get(cx).values()].some((p) => [...bxB.get(cy).values()].some((q) => boxFits(p, q)))) || false
    }
    const exact = (cx, cy) => {
      if (!standsIn(cx, cy)) return false
      for (const [c2] of bxB) if (c2 !== cy && standsIn(cx, c2)) return false
      for (const [c2] of bxA) if (c2 !== cx && standsIn(c2, cy)) return false
      return true
    }
    pairedC.A.clear()
    pairedC.B.clear()
    for (const [x, ys] of cv.f) {
      const [y] = [...ys]
      if (one(cv, x, y) && exact(x, y)) {
        pairedC.A.add(x)
        pairedC.B.add(y)
      }
    }
    for (const [x, ys] of sv.f) {
      const [y] = [...ys]
      const [cx, cy] = inC.get(`${x}|${y}`) ?? []
      if (!(one(sv, x, y) && pairedC.A.has(cx) && pairedC.B.has(cy) && one(cv, cx, cy))) continue
      // (the one box of its container that fits the other's, both ways)
      const [px, py] = [bxA.get(cx)?.get(x), bxB.get(cy)?.get(y)]
      const lone = [...bxB.get(cy)].every(([sl, q]) => sl === y || !boxFits(px, q)) && [...bxA.get(cx)].every(([sl, p]) => sl === x || !boxFits(p, py))
      if (!lone) continue
      out.A.add(x)
      out.B.add(y)
      out.pairs.set(x, y)
    }
    return out
  }
  let alive = aliveOf()
  // A carousel shows the slides it is at when the page is read, and the two sides are rarely at the same slide: what a slide says is the carousel's state, not the page's content.
  // Whole slides are paired FIRST, by the slot each stands in (the box of the slide, its size and place) — and only slides with no leaf paired by words of its own: a slide
  // one of whose leaves is paired is the same slide, its other leaves are compared for content like any other leaf. The leaves of two slides in the same slot are candidates.
  {
    const slides = (L, root) => {
      const m = new Map()
      L.forEach((l, i) => {
        if (l.sl == null || l.sr == null || l.sc == null) return
        if (!m.has(l.sl)) m.set(l.sl, { sl: l.sl, sc: l.sc, sr: l.sr, idxs: [], comp: false, matched: false })
        const g = m.get(l.sl)
        g.idxs.push(i)
        g.comp ||= l.comp != null
        g.matched ||= false
      })
      return [...m.values()]
    }
    // (a box of a row of equal boxes is a slide only where a carousel-like component (`comp`) stands in the boxes compared: the cards of a grid and the tags of a cloud are leaves like any other)
    const dead = (g, side, mate) => carousel && !alive[side].has(g.sl) && g.idxs.every((i) => mate[i] < 0)
    const sA = slides(SA, a).filter((g) => dead(g, 'A', mateA))
    const sB = slides(SB, b).filter((g) => dead(g, 'B', mateB))
    // Slides that say their own words on both sides MAY be the same slide wherever each stands: the words that are theirs are candidates (not matched — nothing measured says the
    // slides correspond), a caption that changed or moved stays a finding, and the slides are left out of the slot pairing.
    const taken = { A: new Set(), B: new Set() }
    sA.forEach((g, gi) => {
      const hi = sB.findIndex((h, q) => !taken.B.has(q) && g.idxs.some((i) => !repA(SA[i]) && h.idxs.some((j) => !repB(SB[j]) && !SA[i].img && sameContent(SA[i], SB[j]))))
      if (hi < 0) return
      const h = sB[hi]
      taken.A.add(gi)
      taken.B.add(hi)
      const usedJ = new Set()
      for (const i of g.idxs) {
        const j = h.idxs.find((y) => mateB[y] < 0 && !usedJ.has(y) && !repA(SA[i]) && !repB(SB[y]) && !SA[i].img && sameContent(SA[i], SB[y]))
        if (mateA[i] < 0 && j != null) {
          usedJ.add(j)
          shiftedD.A.add(SA[i].sc)
          shiftedD.B.add(SB[j].sc)
          doubt('slide-pair-unproven', [i], [j], SA[i].sc)
        }
      }
    })
    const at = (g, root) => ({ l: g.sr.x, t: g.sr.y - root.y, w: g.sr.w, h: g.sr.h })
    const mate = maxMatching(sA, sB, (i, j) => {
      if (taken.A.has(i) || taken.B.has(j)) return false
      const p = at(sA[i], a)
      const q = at(sB[j], b)
      return (sA[i].comp || sB[j].comp) && Math.abs(p.l - q.l) <= wide && Math.abs(p.t - q.t) <= tol && Math.abs(p.w - q.w) <= tol && Math.abs(p.h - q.h) <= tol
    }, (i, j) => Math.abs(sA[i].sr.x - sB[j].sr.x))
    // (two slides in the same slot are a candidate pair: the carousel's state when the page was read, not shown to be the same slide — nothing is concluded from it)
    mate.forEach((j, i) => {
      if (j < 0) return
      doubt('slide-pair-unproven', sA[i].idxs, sB[j].idxs, sA[i].sc)
    })
  }
  alive = aliveOf()
  // The window of a carousel cuts the words of a slide: the letters that show are a piece of what the whole slide says. In a slide the two sides paired (by words that are its own),
  // a leaf cut at the window and the leaf of the paired slide that says it in full are one leaf.
  {
    // (the slide pairs are the one-to-one ones of `aliveOf`, in containers that are themselves paired one to one)
    const slidePair = alive.pairs
    const cutOf = (x, y) => x.sq && y.sq && !x.img && !y.img && (x.ink?.part || y.ink?.part) && (x.sq.includes(y.sq) || y.sq.includes(x.sq))
    // (the slide is the paired one — the slide of a leaf matched at a measured place — never one that merely stands where a shift of the container puts it)
    SA.forEach((x, i) => {
      if (mateA[i] >= 0 || x.sl == null || !pairedC.A.has(x.sc)) return
      const j = SB.findIndex((y, q) => mateB[q] < 0 && y.sl != null && pairedC.B.has(y.sc) && y.sl === slidePair.get(x.sl) && cutOf(x, y))
      if (j >= 0) [mateA[i], mateB[j]] = [j, i]
    })
  }
  // and it enters or leaves: the carousel is shifted (its slides were paired at another place), or the window cuts the slide
  const cutSl = { A: new Set(SA.filter((l) => l.ink?.part && l.sl != null).map((l) => l.sl)), B: new Set(SB.filter((l) => l.ink?.part && l.sl != null).map((l) => l.sl)) }
  // (a row of slides at the same place and height on both sides, one of them a carousel: a slide of this side with no counterpart may be a phase the other side is not at — the
  // number of slides in view differs — which is not shown either way)
  const slideRows = (L, root) => L.filter((l) => l.sl != null && l.sr).map((l) => ({ t: l.sr.y - root.y, h: l.sr.h, comp: l.comp != null }))
  const rowsHere = { A: slideRows(SA, a), B: slideRows(SB, b) }
  const sameRow = (l, side) => l.sl != null && l.sr != null && rowsHere[side === 'A' ? 'B' : 'A'].some((o) => Math.abs(o.t - (l.sr.y - (side === 'A' ? a : b).y)) <= tol && Math.abs(o.h - l.sr.h) <= tol && (o.comp || l.comp != null))
  const phase = (l, side) => carousel && l.sl != null && !alive[side].has(l.sl) && ((pairedC[side].has(l.sc) && cutSl[side].has(l.sl)) || shiftedD[side].has(l.sc) || sameRow(l, side))
  // A leaf of a slide with no counterpart in a container the sides pair may be in another phase of the carousel: it is not a finding, and it is not matched either — it is said
  // as not measured, per leaf, never as the whole container.
  SA.forEach((l, i) => {
    if (mateA[i] < 0 && !unsure.A.has(i) && phase(l, 'A')) doubt('slide-pair-unproven', [i], [], l.sc)
  })
  SB.forEach((l, j) => {
    if (mateB[j] < 0 && !unsure.B.has(j) && phase(l, 'B')) doubt('slide-pair-unproven', [], [j], l.sc)
  })
  // The same words cut into other boxes: the leaves left over on one side that together say what ONE leaf of the other side says, in reading order, all painted inside
  // that leaf's place (a number and its label in one block on one side, in two paragraphs on the other).
  {
    const run = (mateX, mateY, X, Y, flip, unsureX, unsureY) => {
      const rx = X.map((_, i) => i).filter((i) => mateX[i] < 0 && !unsureX.has(i) && X[i].sq && !X[i].img)
      // (bounded: what is not matched within the work a band may ask for is left over — a finding, never a quiet cell)
      if (rx.length * Y.length > WORK_MAX) return
      for (const i of rx) {
        const x = X[i]
        const kx = x.ink ?? x
        const inside = Y.map((_, j) => j).filter((j) => mateY[j] < 0 && !unsureY.has(j) && Y[j].sq && !Y[j].img).filter((j) => {
          const k = Y[j].ink ?? Y[j]
          const m = tol
          return k.x >= kx.x - m && k.x + k.w <= kx.x + kx.w + m && k.y >= kx.y - m && k.y + k.h <= kx.y + kx.h + m
        })
        if (inside.length < 2 || inside.map((j) => Y[j].sq).join('') !== x.sq) continue
        const u = { x: Math.min(...inside.map((j) => (Y[j].ink ?? Y[j]).x)), y: Math.min(...inside.map((j) => (Y[j].ink ?? Y[j]).y)) }
        u.w = Math.max(...inside.map((j) => (Y[j].ink ?? Y[j]).x + (Y[j].ink ?? Y[j]).w)) - u.x
        u.h = Math.max(...inside.map((j) => (Y[j].ink ?? Y[j]).y + (Y[j].ink ?? Y[j]).h)) - u.y
        const ok = flip ? fits({ ...u, sq: '' }, x, strict) : fits(x, { ...u, sq: '' }, strict)
        if (!ok) continue
        mateX[i] = inside[0]
        for (const j of inside) mateY[j] = i
      }
    }
    run(mateA, mateB, SA, SB, false, unsure.A, unsure.B)
    run(mateB, mateA, SB, SA, true, unsure.B, unsure.A)
  }
  // Another number of columns reflows a place: the leaves of a row of boxes stand one above the other. The one supported form: a RUN of at least two leaves left over between the
  // same two matched neighbours (or the same end of the reading) on both sides, in the same number and the same order, each one the same complete wording — the whole run corresponds,
  // so a leaf of it that is missing, reworded, moved out of order or carried past a neighbour breaks the run and is a finding. A single leaf is never reflowed.
  {
    const keyed = (mate, L, own) => {
      const out = new Map()
      for (let i = 0; i < L.length; i++) {
        if (mate[i] >= 0) continue
        let p = i - 1
        while (p >= 0 && mate[p] < 0) p--
        let n = i + 1
        while (n < L.length && mate[n] < 0) n++
        const id = (q) => (q < 0 || q >= L.length ? -1 : own ? mate[q] : q)
        const key = `${id(p)}|${id(n)}`
        if (!out.has(key)) out.set(key, [])
        out.get(key).push(i)
      }
      return out
    }
    const ka = keyed(mateA, SA, true)
    const kb = keyed(mateB, SB, false)
    for (const [key, ia] of ka) {
      const ib = kb.get(key)
      if (!ib || ia.length < 2 || ia.length !== ib.length || ia.length * ib.length > WORK_MAX) continue
      if (!ia.every((x, q) => sameContent(SA[x], SB[ib[q]]))) continue
      // (the run stands in one box that lays its leaves in a row on one side, and in a box at the same place that lays another number of them in a row on the other: the column step is measured there, not band-wide)
      const hA = holder(SA, ia, true)
      const hB = hA ? holder(SB, ib, false) : null
      if (!hA || !hB || hB.cols === hA.cols || !sameHolder(hA, hB, true)) continue
      // the cells of the run: one for each leaf, distinct, each leaf inside its own, the cells inside their holder and in reading order on both sides
      const within = (c, h) => c.x >= h.x - tol && c.y >= h.y - tol && c.x + c.w <= h.x + h.w + tol && c.y + c.h <= h.y + h.h + tol
      const ordered = (cs) => cs.every((c, q) => q === 0 || c.y + c.h > cs[q - 1].y - tol && (c.y >= cs[q - 1].y - tol))
      if (!ia.every((x, q) => inCell(SA[x], hA.cells[q]) && within(hA.cells[q], hA)) || !ib.every((y, q) => inCell(SB[y], hB.cells[q]) && within(hB.cells[q], hB)) || !ordered(hA.cells) || !ordered(hB.cells) || new Set(hA.cells.map((c) => `${c.x}|${c.y}`)).size < ia.length || new Set(hB.cells.map((c) => `${c.x}|${c.y}`)).size < ib.length) continue
      // (the cells lie in rows of at most the holder's column count, each row left to right; and a leaf keeps its place in its cell, to what its cell's size changed by)
      const rowsFit = (cs, cols) => {
        let n = 0
        let top = null
        for (const c of cs) {
          if (top !== null && Math.abs(c.y - top) <= tol) n++
          else [top, n] = [c.y, 1]
          if (n > Math.max(cols, 1)) return false
        }
        return true
      }
      const keeps = (q) => {
        const ka = SA[ia[q]].ink ?? SA[ia[q]]
        const kb = SB[ib[q]].ink ?? SB[ib[q]]
        const cA = hA.cells[q]
        const cB = hB.cells[q]
        return Math.abs(kb.x - cB.x - (ka.x - cA.x)) <= tol + Math.abs(cB.w - cA.w) && Math.abs(kb.y - cB.y - (ka.y - cA.y)) <= tol + Math.abs(cB.h - cA.h)
      }
      if (!rowsFit(hA.cells, hA.cols) || !rowsFit(hB.cells, hB.cols) || !ia.every((_, q) => keeps(q))) continue
      // (and each stands where the reading puts it: between the tops of its two neighbours on the page, to the tolerance, on both sides)
      const [pk, nk] = key.split('|').map(Number)
      const lowB = pk >= 0 ? box(SB[pk], b).t - tol : -Infinity
      const highB = nk >= 0 ? box(SB[nk], b).t + tol : Infinity
      const lowA = pk >= 0 ? box(SA[mateB[pk]], a).t - tol : -Infinity
      const highA = nk >= 0 ? box(SA[mateB[nk]], a).t + tol : Infinity
      if (!ib.every((y) => box(SB[y], b).t >= lowB && box(SB[y], b).t <= highB) || !ia.every((x) => box(SA[x], a).t >= lowA && box(SA[x], a).t <= highA)) continue
      // (a candidate run, not a match: the cells are in order and keep their place, but no measured position of the leaf itself carries it — said as not measured, and never
      // taken for evidence of another match)
      if (ia.some((x) => unsure.A.has(x)) || ib.some((y) => unsure.B.has(y))) continue
      doubt('reflow-position-unproven', ia, ib, `${hA.x}|${hA.y}`)
    }
  }
  for (const e of alone) {
    if (mateA[e.i] >= 0 || mateB[e.j] >= 0) continue
    if (e.by !== undefined) {
      // (the same element holds both: a candidate said elsewhere for these leaves is settled by that)
      const [x, y] = [SA[e.i], SB[e.j]]
      unsure.A.delete(e.i)
      unsure.B.delete(e.j)
      for (const u of uncertain) {
        u.source = u.source.filter((l) => l !== x)
        u.port = u.port.filter((l) => l !== y)
      }
      uncertain.splice(0, uncertain.length, ...uncertain.filter((u) => u.source.length || u.port.length))
    } else if (unsure.A.has(e.i) || unsure.B.has(e.j)) continue
    ;[mateA[e.i], mateB[e.j]] = [e.j, e.i]
    const by = e.by === undefined ? { across: r1(e.g[0]), down: r1(e.dy) } : e.by
    if (by) moved.push([SA[e.i], SB[e.j], by])
  }
  const restA = [...SA.filter((l, i) => mateA[i] < 0 && !unsure.A.has(i)), ...LA.filter((l) => l.bgu && !l.unk)]
  const restB = [...SB.filter((l, j) => mateB[j] < 0 && !unsure.B.has(j)), ...LB.filter((l) => l.bgu && !l.unk)]
  // Words left over at the same place on both sides read differently — or one side holds as one leaf what the other holds as several: the leaves painted inside the box of
  // a leaf of the other side are the same place, read two ways, and one finding.
  const changedText = []
  const usedB = new Set()
  const usedA = new Set()
  const missingText = []
  const inkOfLeaf = (l) => l.ink ?? l
  const within = (inner, outer) => {
    const i = inkOfLeaf(inner)
    const o = inkOfLeaf(outer)
    return i.x >= o.x - tol && i.x + i.w <= o.x + o.w + tol && i.y >= o.y - tol && i.y + i.h <= o.y + o.h + tol
  }
  const together = (list) => (list.length === 1 ? list[0] : { ...list[0], tx: list.map((l) => l.tx).join('').slice(0, 40), ink: undefined, y: Math.min(...list.map((l) => inkOfLeaf(l).y)), x: Math.min(...list.map((l) => inkOfLeaf(l).x)) })
  const textA = restA.filter((l) => !l.img)
  const textB = restB.filter((l) => !l.img)
  const pairable = textA.length * textB.length <= WORK_MAX
  for (const x of pairable ? textA : []) {
    // the leaves painted inside the place of this one are the same place, read as several
    const inner = textB.filter((y) => !usedB.has(y) && within(y, x))
    if (inner.length >= 2) {
      inner.forEach((y) => usedB.add(y))
      usedA.add(x)
      changedText.push([x, together(inner)])
      continue
    }
    const q = textB.filter((y) => !usedB.has(y) && wording(y) !== wording(x) && fits(x, y, false)).sort((p, r) => away(x, p) - away(x, r))[0]
    if (q) {
      usedB.add(q)
      usedA.add(x)
      changedText.push([x, q])
    }
  }
  for (const y of pairable ? textB : []) {
    if (usedB.has(y)) continue
    const inner = textA.filter((x) => !usedA.has(x) && within(x, y))
    if (inner.length >= 2) {
      inner.forEach((x) => usedA.add(x))
      usedB.add(y)
      changedText.push([together(inner), y])
    }
  }
  for (const x of textA) if (!usedA.has(x)) missingText.push(x)
  const extraText = textB.filter((l) => !usedB.has(l))
  // A picture a box paints behind its content is a picture at the place it is PAINTED (the probe resolved its size, position and repeat), matched like an <img> there. When that
  // could not be resolved (`bgu`: several layers, a picture not loaded), the box is not the picture's place: a picture of the other side inside it may be what it paints or may
  // be another — that is not established, so both are left out of the findings and counted in `unplaced`, which the judge reports as not-measured.
  const unplaced = []
  for (const [bgs, imgs] of [[restA, restB], [restB, restA]]) {
    for (const g of bgs.filter((l) => l.bgu && !unplaced.includes(l))) {
      const i = imgs.find((l) => l.img && !unplaced.includes(l) && within(l, g))
      if (i) unplaced.push(g, i)
    }
  }
  const bgPaired = new Set(unplaced)
  const lonelyA = restA.filter((l) => l.img && !bgPaired.has(l))
  const lonelyB = restB.filter((l) => l.img && !bgPaired.has(l))
  const glyphA = LA.filter(isGlyph)
  const glyphB = LB.filter(isGlyph)
  const nearest = (l, pool, used, srcSide) => {
    let best = null
    let bd = Infinity
    for (const o of pool) {
      if (used.has(o) || !(srcSide ? fits(l, o, false) : fits(o, l, false))) continue
      const dist = srcSide ? away(l, o) : away(o, l)
      if (dist < bd) [best, bd] = [o, dist]
    }
    return best
  }
  const usedG = new Set()
  const missingPics = lonelyA.filter((l) => {
    const q = nearest(l, glyphB, usedG, true)
    if (q) usedG.add(q)
    return !q
  })
  const usedH = new Set()
  const extraPics = lonelyB.filter((o) => {
    const q = nearest(o, glyphA, usedH, false)
    if (q) usedH.add(q)
    return !q
  })
  return { missingText, extraText, changedText, movedText: moved, missingPics, extraPics, a: LA.filter((l) => l.img), b: LB.filter((l) => l.img), unknown, unplaced, uncertain }
}

/**
 * The structures differ too much to pair the boxes: compare the leaves (text and pictures). A text leaf is missing/extra only when its words
 * stand nowhere in the other side's band (the two sides cut a column into different boxes; the same words in other boxes are no difference);
 * pictures are counted.
 */
function absentLeaf(a, b, culprit, out, all, wanted = () => true) {
  if (all.skipContent) return null
  const LA = counted(a)
  const LB = counted(b)
  const d = leafDelta(a, b, LA, LB, all.tol)
  const cands = [
    ...d.missingText.concat(d.missingPics).filter(wanted).map((l) => ({ at: l.y - a.y, missing: l })),
    ...d.extraText.concat(d.extraPics).filter(wanted).map((l) => ({ at: l.y - b.y, extra: l }))
  ]
  cands.sort((x, y) => x.at - y.at)
  if (cands[0]?.missing) {
    const l = cands[0].missing
    return out('element-missing', `the source has ${nodeName(l)} (${px(l.h)} high) that the port lacks`, `${l.sig} ${px(l.h)}`, 'none', { sig: l.sig, culprit: `${culprit} > ${l.sig}`, leaf: l })
  }
  if (cands[0]?.extra) {
    const l = cands[0].extra
    return out('element-extra', `the port has ${nodeName(l)} (${px(l.h)} high) that the source lacks`, 'none', `${l.sig} ${px(l.h)}`, { sig: l.sig, culprit: `${culprit} > ${l.sig}`, leaf: l })
  }
  return null
}

/**
 * What only one side has in a pair of boxes, whatever their heights (see leafDelta): the first missing and the first extra words, the first missing and extra picture.
 * → [{ kind, detail, source, port, culprit, sig, leafH }]
 */
function presenceOf(a, b, culprit, all, tol = HEIGHT_TOLERANCE_PX, sink = null) {
  const LA = counted(a)
  const LB = counted(b)
  const d = leafDelta(a, b, LA, LB, tol)
  if (sink && d.unplaced.length) sink.unplaced = (sink.unplaced ?? 0) + d.unplaced.length
  if (sink) for (const u of d.uncertain) (sink.uncertain ??= []).push({ ...u, band: nodeName(a), container: u.where })
  const groups = new Map()
  const add = (kind, l, detail) => {
    const key = `${kind}|${l.sig}`
    const g = groups.get(key)
    if (g) g.leaves.push(l)
    else groups.set(key, { kind, detail, source: kind === 'element-missing' ? `${l.sig} ${px(l.h)}` : 'none', port: kind === 'element-missing' ? 'none' : `${l.sig} ${px(l.h)}`, sig: l.sig, culprit: `${culprit} > ${l.sig}`, leaves: [l] })
  }
  const side = (kind, l) => `the ${kind === 'element-missing' ? 'source' : 'port'} has ${nodeName(l)} (${px(l.h)} high) that the ${kind === 'element-missing' ? 'port' : 'source'} lacks`
  const pic = (l) => `the source has ${plural(d.a.length, 'picture')} here, the port ${d.b.length} (${nodeName(l)}, ${px(l.img.w)}×${px(l.img.h)})`
  for (const [x, y] of d.changedText) {
    const key = `text-changed|${y.sig}`
    if (!groups.has(key)) groups.set(key, { kind: 'text-changed', detail: `the words of ${nodeName(y)} read "${x.tx}" on the source, "${y.tx}" on the port`, source: `"${x.tx}"`, port: `"${y.tx}"`, sig: y.sig, culprit: `${culprit} > ${y.sig}`, leaves: [] })
  }
  for (const [x, y, by] of d.movedText) {
    const key = `element-moved|${y.sig}`
    const g = groups.get(key)
    if (g) g.leaves.push(y)
    else groups.set(key, { kind: 'element-moved', detail: `${nodeName(y)} stands ${px(Math.abs(by.across))} ${by.across < 0 ? 'left' : 'right'} and ${px(Math.abs(by.down))} ${by.down < 0 ? 'higher' : 'lower'} in its box on the port than on the source (the same element holds it on both sides)`, source: `at ${px(x.x)}, ${px(x.y)}`, port: `at ${px(y.x)}, ${px(y.y)}`, sig: y.sig, culprit: `${culprit} > ${y.sig}`, leaves: [y] })
  }
  for (const l of d.missingText) add('element-missing', l, side('element-missing', l))
  for (const l of d.extraText) add('element-extra', l, side('element-extra', l))
  for (const l of d.missingPics) add('element-missing', l, pic(l))
  for (const l of d.extraPics) add('element-extra', l, pic(l))
  return [...groups.values()]
}

function leafDiff(a, b, tol, culprit, out, all) {
  const absent = absentLeaf(a, b, culprit, out, all)
  if (absent) return absent
  const LA = counted(a)
  const LB = counted(b)
  // every picture with ink is counted (an icon too); a picture is matched by the asset shown, else by place and size (see leafDelta)
  const pics = leafDelta(a, b, LA, LB, all.tol)
  if (!all.skipContent && (pics.missingPics.length || pics.extraPics.length)) return out(pics.missingPics.length ? 'element-missing' : 'element-extra', `the source has ${plural(pics.a.length, 'picture')} here, the port ${pics.b.length}`, plural(pics.a.length, 'picture'), plural(pics.b.length, 'picture'), { sig: 'img' })
  // the pictures line up one to one: the first whose height differs by about what the box differs by is the cause
  const ia = LA.filter((l) => l.img)
  const ib = LB.filter((l) => l.img)
  if (ia.length === ib.length) for (let i = 0; i < ia.length; i++) if ((!near(ia[i].h, ib[i].h, 2) || !near(ia[i].w, ib[i].w, 2)) && Math.abs(ia[i].h - ib[i].h) >= 0.5 * all.delta) return diffNode(ia[i], ib[i], 0, [culprit])
  // the same words and pictures on both sides: the leaves that line up one to one and differ in height
  const al = alignSeq(LA, LB, leafKey)
  for (const [i, j] of al.pairs) if (!near(LA[i].h, LB[j].h, 2) && near(LA[i].w, LB[j].w, Math.max(8, LA[i].w * 0.1)) && Math.min(LA[i].h, LB[j].h) / Math.max(LA[i].h, LB[j].h) >= 0.4) return diffNode(LA[i], LB[j], 0, [culprit])
  return null
}

/** Words that stand in both boxes (matched by their own text) and are set in another font size: the cause when the boxes hold a different number of boxes around them. */
function textSizeStep(a, b, culprit, out) {
  const own = (n, o = []) => {
    if (n.tfs != null && n.ot) o.push(n)
    n.k.forEach((k) => own(k, o))
    return o
  }
  const mb = new Map()
  for (const n of own(b)) if (!mb.has(n.ot)) mb.set(n.ot, n)
  for (const n of own(a)) {
    const m = mb.get(n.ot)
    if (m && !near(n.tfs, m.tfs, 0.5)) return out('font-size-step', `the words "${n.ot}" are set at ${px(n.tfs)} on the source, ${px(m.tfs)} on the port`, px(n.tfs), px(m.tfs), { culprit: `${culprit} > ${m.sig}` })
  }
  return null
}

/**
 * The first place inside a pair of boxes (a: source, b: port) whose height differs by more than `tol`, told in plain terms.
 * Wrappers that only hold one box, and boxes that only stack their children, are looked through (the two sides rarely wrap alike); when
 * the two sides then hold a different number of boxes, the leaves (words, pictures) are compared instead.
 * → { kind, detail, source, port, culprit, sig? } — `sig` names the element for element-missing/extra.
 */
export function diffNode(a0, b0, tol, path = [], all = null) {
  all = all ?? { a: a0.all ?? null, b: b0.all ?? null, delta: Math.abs(b0.h - a0.h), tol: tol || HEIGHT_TOLERANCE_PX }
  const pa = []
  const pb = []
  const ma = {}
  const mb = {}
  let a = skipWrap(a0, pa, ma)
  let b = skipWrap(b0, pb, mb)
  const here = [...path, b0.sig, ...pb]
  const culprit = here.join(' > ')
  const out = (kind, detail, source, port, extra = {}) => ({ kind, detail, source, port, culprit, ...extra })
  if (a.img && b.img) {
    const ra = a.img.w / (a.img.h || 1)
    const rb = b.img.w / (b.img.h || 1)
    if (near(a.img.w, b.img.w, PAD_TOL + 2) && Math.abs(ra - rb) / ra > 0.03) return out('image-ratio', `the picture box is ${r1(a.img.w)}×${r1(a.img.h)} on the source (ratio ${r1(ra * 100) / 100}), ${r1(b.img.w)}×${r1(b.img.h)} on the port (ratio ${r1(rb * 100) / 100})`, `${r1(a.img.w)}×${r1(a.img.h)}`, `${r1(b.img.w)}×${r1(b.img.h)}`)
    return out('width-step', `the picture is ${px(a.img.w)} wide on the source, ${px(b.img.w)} on the port`, `${px(a.img.w)}×${px(a.img.h)}`, `${px(b.img.w)}×${px(b.img.h)}`)
  }
  // at the band: words one side shows and the other does not, of about the size of the difference, are the cause (the columns of the two sides are cut alike or not)
  if (a0.all != null && b0.all != null && tol > 0) {
    const delta = Math.abs(b0.h - a0.h)
    const absent = absentLeaf(a0, b0, culprit, out, all, (l) => l.h >= delta * 0.5 && l.h <= delta * 1.6 + tol)
    if (absent) return absent
  }
  // a box of fixed height that cuts its text off on one side, the same text shown whole on the other
  const clipA = ma.cut ?? a.cut
  const clipB = mb.cut ?? b.cut
  if ((clipA != null) !== (clipB != null) && !near(a.h, b.h, tol)) {
    const la = leavesOf(a)[0]
    const lb = leavesOf(b)[0]
    if (la?.words && lb?.words && near(la.lh, lb.lh, 1) && la.lh > 0) {
      const lines = (n) => Math.max(1, Math.round(n.h / la.lh))
      const [ca, cb] = [clipA != null, clipB != null]
      return out('text-cut', `${ca ? 'the source' : 'the port'} cuts the text off at ${plural(lines(ca ? a : b), 'line')} (a box of fixed height, overflow hidden); ${ca ? 'the port' : 'the source'} shows ${plural(lines(ca ? b : a), 'line')}`, `${plural(lines(a), 'line')}${ca ? ' (cut)' : ''}`, `${plural(lines(b), 'line')}${cb ? ' (cut)' : ''}`)
    }
  }
  let ka = flat(a)
  let kb = flat(b)
  // one side holds everything in one more box (a padded wrapper): look inside it, and keep its padding to compare at the end
  let accA = padOf(a)
  let accB = padOf(b)
  while (ka.length === 1 && kb.length > 1 && ka[0].k.length && !ka[0].img) {
    a = ka[0]
    accA += padOf(a)
    ka = flat(a)
  }
  while (kb.length === 1 && ka.length > 1 && kb[0].k.length && !kb[0].img) {
    b = kb[0]
    accB += padOf(b)
    kb = flat(b)
  }
  // at the band: padding of the band and its wrappers that differs by about what the band differs by is the cause, whatever sits inside
  // (the padding is read where the content stands, not from computed style: a box may be padded more and its content offset less, and the two meet)
  if (path.length === 0 && Math.abs(accA - accB) > PAD_TOL) {
    const ia = insets(a0)
    const ib = insets(b0)
    if (ia && ib) {
      const step = Math.abs(ia.top - ib.top) + Math.abs(ia.bottom - ib.bottom)
      if (step > PAD_TOL && step >= 0.5 * all.delta) return out('padding-step', `space above the first and below the last content of the band is ${r1(ia.top)}px / ${r1(ia.bottom)}px on the source, ${r1(ib.top)}px / ${r1(ib.bottom)}px on the port`, `${r1(ia.top + ia.bottom)}px`, `${r1(ib.top + ib.bottom)}px`)
    }
  }
  if (ka.length > 1 && ka.length === kb.length && a.cols !== b.cols) return out('column-count', `${plural(a.cols, 'column')} on the source, ${plural(b.cols, 'column')} on the port (${ka.length} boxes)`, plural(a.cols, 'column'), plural(b.cols, 'column'))
  if (ka.length !== kb.length && (ka.length || kb.length)) {
    const leaf = leafDiff(a, b, tol, culprit, out, all)
    if (leaf) return leaf
    const sized = textSizeStep(a, b, culprit, out)
    if (sized) return sized
    const one = ka.length === 0 ? 'source' : kb.length === 0 ? 'port' : null
    return out('element-count', one ? `the ${one} holds this as one block of text, the other side as ${boxes(Math.max(ka.length, kb.length))}` : `${boxes(ka.length)} on the source, ${boxes(kb.length)} on the port, and the words in them do not show which one differs`, boxes(ka.length), boxes(kb.length))
  }
  // the earliest difference in page order: a paired child whose content is taller/shorter (padding aside: it is looked at where it stands)
  const inner = (n) => n.h - padOf(n)
  const cands = []
  // the boxes of one row: only the tallest sets the row's height (the others are stretched or centred in it)
  const rowAt = a.cols > 1 && b.cols > 1 ? ka.reduce((m, k, i) => (Math.max(k.h, kb[i].h) > Math.max(ka[m].h, kb[m].h) ? i : m), 0) : null
  ka.forEach((k, i) => {
    if (rowAt != null && i !== rowAt) return
    if (!near(inner(k), inner(kb[i]), tol)) cands.push({ at: i, pair: [k, kb[i]] })
  })
  const c = cands[0]
  if (c?.pair) return diffNode(c.pair[0], c.pair[1], tol, here, all)
  // nothing below differs by more than the tolerance: it is this box itself, else the child that moved most
  const padA = accA
  const padB = accB
  // words that take another number of lines are told by the lines (below), not by the padding the boxes around them stand in
  const wraps = !ka.length && a.words && b.words && Math.round((a.h - padA) / (a.lh || 1)) !== Math.round((b.h - padB) / (b.lh || 1))
  if (!wraps && !near(padA, padB, PAD_TOL)) return out('padding-step', `padding (top + bottom) ${r1(padA)}px on the source, ${r1(padB)}px on the port${a0.pt != null && a0 === a ? ` (top/bottom ${r1(a.pt)}/${r1(a.pb)} against ${r1(b.pt)}/${r1(b.pb)})` : ''}`, `${r1(padA)}px`, `${r1(padB)}px`)
  if (ka.length === kb.length && ka.length > 1) {
    for (let i = 0; i + 1 < ka.length; i++) {
      const ga = ka[i + 1].y - (ka[i].y + ka[i].h)
      const gb = kb[i + 1].y - (kb[i].y + kb[i].h)
      // children of one row sit side by side: their "gap" is between rows only
      if (a.cols === 1 && !near(ga, gb, PAD_TOL)) return out('spacing-step', `the space between ${nodeName(ka[i])} and the next box is ${px(ga)} on the source, ${px(gb)} on the port (margin or gap)`, px(ga), px(gb))
    }
    if (!near(a.rg, b.rg, PAD_TOL)) return out('spacing-step', `row gap ${px(a.rg)} on the source, ${px(b.rg)} on the port`, px(a.rg), px(b.rg))
  }
  // (an inline box is the line it stands in, not a box that moves: it is looked at through the text block that holds it)
  const moved = ka.map((k, i) => [k, kb[i], Math.abs(k.h - kb[i].h)]).filter(([x, y]) => x.d !== 'inline' && y.d !== 'inline').sort((x, y) => y[2] - x[2])[0]
  if (moved && moved[2] >= 2) return diffNode(moved[0], moved[1], tol, here, all)
  if (!near(fsOf(a), fsOf(b), 0.5)) return out('font-size-step', `font size ${px(fsOf(a))} on the source, ${px(fsOf(b))} on the port`, px(fsOf(a)), px(fsOf(b)))
  if (!near(a.lh, b.lh, 1)) return out('line-height-step', `line height ${px(a.lh)} on the source, ${px(b.lh)} on the port`, px(a.lh), px(b.lh))
  if (!near(a.w, b.w, 8)) return out('width-step', `the box is ${px(a.w)} wide on the source, ${px(b.w)} on the port`, px(a.w), px(b.w))
  if (!ka.length && a.words && b.words) {
    const la = Math.max(1, Math.round((a.h - padA) / (a.lh || 1)))
    const lb = Math.max(1, Math.round((b.h - padB) / (b.lh || 1)))
    // a box of fixed height cuts the text of one side off, the other shows all of it
    const cutA = ma.cut ?? a.cut
    const cutB = mb.cut ?? b.cut
    if (la !== lb && (cutA != null) !== (cutB != null)) return out('text-cut', `${cutA != null ? 'the source' : 'the port'} cuts the text off at ${plural(cutA != null ? la : lb, 'line')} (a box of fixed height, overflow hidden); ${cutA != null ? 'the port' : 'the source'} shows ${plural(cutA != null ? lb : la, 'line')}`, cutA != null ? `${plural(la, 'line')} (cut)` : plural(la, 'line'), cutB != null ? `${plural(lb, 'line')} (cut)` : plural(lb, 'line'))
    if (la !== lb) return out('text-wrap', `the text takes ${plural(la, 'line')} on the source, ${plural(lb, 'line')} on the port at the same width`, plural(la, 'line'), plural(lb, 'line'))
  }
  return out('unexplained', `the box is ${px(a.h)} high on the source, ${px(b.h)} on the port, and computed style does not say why`, px(a.h), px(b.h))
}

// ---- naming ---------------------------------------------------------------------------------------------------------------

/** The role of a band in a cause key: header, footer, or its class signature (the heading when the signature is only a tag). */
export function roleOf(b) {
  if (b.kind === 'header' || b.kind === 'footer') return b.kind
  const sig = b.tree?.sig ?? 'band'
  return sig.includes('.') || !b.tree?.head ? `band:${sig}` : `band:${sig}:"${b.tree.head}"`
}

const causeOfFinding = (role, kind, sig) => `heights|${role}|${kind}${sig ? `|${sig}` : ''}`

// ---- the judgement --------------------------------------------------------------------------------------------------------

const homeish = (p) => !p || p === '/' || /^\/(index\.php\/?|[a-z]{2}(-[a-z]{2})?\/?)$/i.test(p)
const NOT_FOUND_TITLE = /(^|\W)(404|page not found|not found|page can.?t be found|error)(\W|$)/i
const pathOf = (u) => {
  try {
    return new URL(u).pathname.replace(/\/+$/, '') || '/'
  } catch {
    return null
  }
}

/** Does the source answer another page (its home page, a not-found page) for this address while the port answers the page? */
function notCounterpart(r, homeTitle) {
  const s = r.source
  const p = r.port
  const expected = r.sourceUrl ? pathOf(r.sourceUrl) : null
  const got = s.finalPath ? s.finalPath.replace(/\/+$/, '') || '/' : null
  if (expected && got && expected !== got && homeish(got) && !homeish(expected)) return `the source answered ${got} for ${expected}`
  if (homeTitle && r.route !== '/' && s.title && s.title === homeTitle && p.title !== homeTitle) return `the source's title is its home page's ("${s.title}"), the port's is "${p.title}"`
  if (NOT_FOUND_TITLE.test(s.title ?? '') && !NOT_FOUND_TITLE.test(p.title ?? '') && !(r.expectError)) return `the source's page is titled "${s.title}"`
  return null
}

const unpairedFinding = (kind, b, w, note) => ({
  ...w,
  what: `height-${kind}`,
  kind,
  cause: causeOfFinding(roleOf(b), kind),
  culprit: b.tree?.sig ?? b.kind,
  band: roleOf(b),
  delta: kind === 'band-missing' ? -b.h : b.h,
  at: { [kind === 'band-missing' ? 'source' : 'port']: { y: b.y, h: b.h } },
  source: kind === 'band-missing' ? `${b.tree?.head ? `"${b.tree.head}" ` : ''}${b.tree?.sig} ${px(b.h)}` : 'none',
  port: kind === 'band-missing' ? 'none' : `${b.tree?.head ? `"${b.tree.head}" ` : ''}${b.tree?.sig} ${px(b.h)}`,
  detail: note
})

/**
 * One side cuts a region into several bands where the other holds it in one: the bands that follow a pair, precede it, or both, and together make up its height are the
 * same region. Takes those bands out of `al.extra` / `al.missing` and marks the pair `merged`. → [{ pair, side, bands, parts, own }] — `parts` are the band indexes of the
 * cutting side, in page order, `own` the one of them that is the pair's. The extent only SELECTS the region: what stands in it is compared by the judge (a region whose
 * content does not correspond is a finding, not a pair that is set aside), and --explain walks the same grouping. `closest` (the walk only) drops the requirement that
 * the parts add up within the tolerance: the whole run of unpaired bands next to a pair, up to the next paired band, is its parts (the longest run that brings the extent nearer to
 * the other side's height), so a region that differs is still one row.
 */
export function groupSplitBands(al, sb, pb, tolerance = HEIGHT_TOLERANCE_PX, { closest = false } = {}) {
  const split = []
  const REACH = 8
  for (const pr of al.pairs) {
    const [i, j] = pr
    if (pr.merged) continue
    for (const [own, other, list, mine, theirs, side] of [[pb, sb, al.extra, j, i, 'port'], [sb, pb, al.missing, i, j, 'source']]) {
      const before = []
      const after = []
      for (let k = mine - 1; list.includes(k) && before.length < REACH; k--) before.push(k)
      for (let k = mine + 1; list.includes(k) && after.length < REACH; k++) after.push(k)
      const base = Math.abs(own[mine].h - other[theirs].h)
      // a pair that already agrees within the tolerance takes the bands next to it only when they bring the extent nearer (a strip of a few px outside one header)
      const within = base <= tolerance
      let best = null
      // the fewest bands first; the bands after the pair before the bands in front of it
      for (let n = 1; n <= before.length + after.length && !(best && !closest); n++) {
        for (let nb = 0; nb <= Math.min(n, before.length); nb++) {
          const na = n - nb
          if (na > after.length) continue
          const first = nb ? before[nb - 1] : mine
          const last = na ? after[na - 1] : mine
          // the extent they cover together, margins between them included
          const off = Math.abs(own[last].y + own[last].h - own[first].y - other[theirs].h)
          if (!closest && off <= tolerance && (!within || off < base)) {
            best = { first, last }
            break
          }
          if (closest && !within && off < base) best = { first, last }
        }
      }
      if (best) {
        const parts = []
        for (let k = best.first; k <= best.last; k++) parts.push(k)
        for (const t of parts) if (t !== mine) list.splice(list.indexOf(t), 1)
        split.push({ pair: pr, side, bands: parts.length, parts, own: mine })
        pr.merged = true
        break
      }
    }
  }
  return split
}

/**
 * The alignment of a cell's bands, as the judge decides it and --explain walks it: the pairs, the split-band groups (a region one side cuts into several bands of the same
 * height together), and the pairs of neighbours that differ in opposite directions and cover the same extent together (the edge between them stands elsewhere). Both kinds
 * are marked `merged` on their pairs: they are regions the judge compares as one. → { al, split, opposite: [[pair, pair]] }
 */
export function alignBands(sb, pb, tolerance = HEIGHT_TOLERANCE_PX) {
  const al = pairBands(sb, pb)
  const split = groupSplitBands(al, sb, pb, tolerance)
  const opposite = []
  for (let a = 0; a + 1 < al.pairs.length; a++) {
    const p1 = al.pairs[a]
    const p2 = al.pairs[a + 1]
    if (p1.merged || p2.merged || p2[0] !== p1[0] + 1 || p2[1] !== p1[1] + 1) continue
    if (Math.abs(pb[p1[1]].h - sb[p1[0]].h) <= tolerance || Math.abs(pb[p2[1]].h - sb[p2[0]].h) <= tolerance) continue
    const ext = (bands, i) => bands[i + 1].y + bands[i + 1].h - bands[i].y
    if (Math.abs(ext(pb, p1[1]) - ext(sb, p1[0])) > tolerance) continue
    p1.merged = p2.merged = true
    opposite.push([p1, p2])
  }
  return { al, split, opposite }
}

// ---- clones ---------------------------------------------------------------------------------------------------------------

/** What a box shows, from the filtered tree: its tag, the words it holds itself, what it paints behind them, the boxes under it that show something, and for a leaf its words and the picture shown. A hidden box adds nothing. */
// every box out of flow and every run of words or backdrop a box holds beside its children (`dl`) is part of what it shows
const overlays = (n) => n.dl ?? []
const shows = (n) => Boolean(n.words || n.img || n.dtx || n.dh || n.bgp || n.k.some(shows) || overlays(n).some(shows))
const unproven = new WeakMap()
let unprovenCount = 0
const identOf = (n) => {
  if (n.unk || n.bgu) return `unproven:${unproven.get(n) ?? unproven.set(n, ++unprovenCount).get(n)}`
  // (the boxes out of flow under a box are part of what it shows)
  const ov = overlays(n).filter(shows)
  const out = ov.length ? `+[${ov.map(identOf).join('|')}]` : ''
  return (n.k.length ? `${n.t}{${n.dh ?? n.dtx ?? ''}|${n.bgp ?? ''}}[${n.k.filter(shows).map(identOf).join('|')}]` : `${n.t}:${n.th ?? n.tx ?? ''}:${n.as ?? ''}:${n.bgp ?? ''}`) + out
}

/**
 * Take out of a band the copies a carousel prints for its loop. A box is a copy only when the probe saw it say so (`cl`: a clone / duplicate class, or
 * aria-hidden) inside a carousel-like component (`comp`), and only against an original of THAT component that shows the same: another component's box
 * that looks the same is not its original. The original may stand deeper than the copy. → the tree itself when nothing is a copy.
 */
export function withoutClones(root) {
  const originals = new Map()
  // the boxes out of flow under a box (`dl`, `ov`) are its children too: a slide placed by absolute positioning is a slide of its component
  const collect = (n) => {
    if (n.cl) return
    if (n.comp != null && shows(n)) (originals.get(n.comp) ?? originals.set(n.comp, new Set()).get(n.comp)).add(identOf(n))
    n.k.forEach(collect)
    overlays(n).forEach(collect)
  }
  collect(root)
  const isCopy = (k) => k.cl && k.comp != null && originals.get(k.comp)?.has(identOf(k))
  const strip = (n) => {
    const kept = n.k.filter((k) => !isCopy(k))
    const kids = kept.map(strip)
    const ov = overlays(n)
    const keptOv = ov.filter((k) => !isCopy(k)).map(strip)
    const same = kept.length === n.k.length && kids.every((k, i) => k === n.k[i]) && keptOv.length === ov.length && keptOv.every((k, i) => k === ov[i])
    if (same) return n
    return { ...n, k: kids, dl: keptOv }
  }
  return strip(root)
}

// ---- the logo -------------------------------------------------------------------------------------------------------------------

/** Same place: the two logos share at least half of the shorter one's height, and their left edges are within 64 px. */
const sameSpot = (a, b) => {
  const shared = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return shared >= 0.5 * Math.min(a.h, b.h) && Math.abs(a.x - b.x) <= 64
}

/**
 * The logos of the two headers. Each probe names the boxes of its header that are the site's logo (a site-logo / brand box, a home link, the site title), in flow
 * or not, with where each is painted; two at the same place are one logo whether a side draws it as a picture, a drawing or text, and their leaves are no extra or
 * missing leaf against each other. What the pairs do not settle is told here, not hidden by the pairing: two text logos that read differently (`logo-text`), two
 * logos of the same kind whose painted size or place differ (`logo-box`), a logo box with no partner (`element-missing` / `element-extra` named `logo`). A
 * side that names no logo is not paired. → [{ kind, detail, source, port, culprit, sig }] (none when the headers have no logos on both sides)
 */
function pairLogos(s, p) {
  if (s.kind !== 'header' || p.kind !== 'header' || !s.logo?.cands || !p.logo?.cands) return []
  for (const t of [s.tree, p.tree]) for (const l of leavesOf(t)) if (l.lg) pairedLogo.add(l)
  const used = new Set()
  const found = []
  const label = (c) => `${c.kind === 'media' ? 'picture' : c.kind === 'mixed' ? 'picture and text' : 'text'}${c.tx ? ` "${c.tx}"` : ''}`
  s.logo.cands.forEach((a) => {
    const q = p.logo.cands.filter((b) => !used.has(b) && sameSpot(a, b)).sort((x, y) => Math.abs(x.x - a.x) - Math.abs(y.x - a.x))[0]
    if (!q) return found.push({ kind: 'element-missing', detail: `the source has a logo (${label(a)}) that the port lacks at that place`, source: `logo ${label(a)}`, port: 'none', sig: 'logo', culprit: 'header > logo' })
    used.add(q)
    if (a.tx && q.tx && (a.th ?? a.tx) !== (q.th ?? q.tx)) found.push({ kind: 'logo-text', detail: `the logo of the header reads "${a.tx}" on the source, "${q.tx}" on the port`, source: `"${a.tx}"`, port: `"${q.tx}"`, culprit: 'header > logo' })
    {
      // every pair is compared on what is painted. Place, for any two logos: left edge and vertical middle within 24 px. The same kind of logo: size within
      // max(8 px, 10%). A picture against text (the width of a wordmark is its wording's): the two painted boxes overlap by half of the smaller, and differ in
      // height by at most 2.5 times and in width by at most 6 times
      const same = a.kind === q.kind
      const w = Math.min(a.x + a.w, q.x + q.w) - Math.max(a.x, q.x)
      const h = Math.min(a.y + a.h, q.y + q.h) - Math.max(a.y, q.y)
      const overlap = w > 0 && h > 0 ? w * h : 0
      const ratio = (u, v) => Math.max(u, v) / Math.max(1, Math.min(u, v))
      const place = Math.abs(a.x - q.x) > 24 || Math.abs(a.y + a.h / 2 - (q.y + q.h / 2)) > 24
      const off = place || (same
        ? Math.abs(a.w - q.w) > Math.max(8, 0.1 * Math.max(a.w, q.w)) || Math.abs(a.h - q.h) > Math.max(8, 0.1 * Math.max(a.h, q.h))
        : overlap < 0.5 * Math.min(a.w * a.h, q.w * q.h) || ratio(a.h, q.h) > 2.5 || ratio(a.w, q.w) > 6)
      if (off) found.push({ kind: 'logo-box', detail: `the logo is ${px(a.w)}×${px(a.h)} at ${px(a.x)},${px(a.y)} on the source, ${px(q.w)}×${px(q.h)} at ${px(q.x)},${px(q.y)} on the port`, source: `${px(a.w)}×${px(a.h)}`, port: `${px(q.w)}×${px(q.h)}`, culprit: 'header > logo' })
    }
  })
  for (const b of p.logo.cands) if (!used.has(b)) found.push({ kind: 'element-extra', detail: `the port has a logo (${label(b)}) that the source lacks at that place`, source: 'none', port: `logo ${label(b)}`, sig: 'logo', culprit: 'header > logo' })
  return found
}

/**
 * Does this band hold anything the other side does not show? It is the other side's only when one of the bands that have no partner there (`candidates`) holds the
 * same leaves in full, at the same places in the band (see leafDelta). The caller offers the bands that stand in the same place of the page — between the same two paired
 * bands — and no others: the same words in a band elsewhere on the page are no counterpart. Used for a band that has no partner and is not tall.
 */
export function bandOnlyHere(b, candidates, tol = HEIGHT_TOLERANCE_PX, frame = b.y) {
  if (!b.tree) return false
  const L = counted(b.tree)
  if (!L.some((l) => l.img || l.tx || l.unk)) return false
  // a band is the other side's only when that band holds the same leaves, in full and in order (a band is not matched by a word it shares with another)
  return !candidates.some((c) => {
    if (!c.tree) return false
    // one coordinate frame: the leaves of both bands are measured from the bottom of the paired band before them, so the tolerance is applied once, to the leaf
    const ra = { ...b.tree, y: frame, h: b.y + b.h - frame }
    const rc = { ...c.tree, y: c.frame ?? c.y, h: c.y + c.h - (c.frame ?? c.y) }
    // (two bands apart on the page have no common bottom: their leaves are matched by the frame alone)
    const d = leafDelta(ra, rc, L, counted(c.tree), tol)
    return !d.unknown.length && !d.unplaced.length && !d.uncertain.length && !d.missingText.length && !d.extraText.length && !d.changedText.length && !d.movedText.length && !d.missingPics.length && !d.extraPics.length
  })
}

/** The bands with no partner on the other side that stand in the same place of the page as band `idx` of `side`: between the same two paired bands. */
export function unpairedAt(al, sb, pb, side, idx) {
  const slot = (pos, k) => al.pairs.filter((pr) => pr[pos] < k).length
  const [mine, theirs, list, bands] = side === 'source' ? [0, 1, al.extra, pb] : [1, 0, al.missing, sb]
  const n = slot(mine, idx)
  // every band of the slot is returned with its frame (see frameOf): the caller compares leaves in that frame
  return list.filter((k) => slot(theirs, k) === n).map((k) => ({ ...bands[k], frame: frameOf(al, sb, pb, side === 'source' ? 'port' : 'source', k) }))
}

/** The page position a band with no partner is measured from: the bottom of the paired band before it on its own side, or the top of the page. */
export function frameOf(al, sb, pb, side, idx) {
  const [pos, bs] = side === 'source' ? [0, sb] : [1, pb]
  const prs = al.pairs.filter((pr) => pr[pos] < idx)
  const last = prs.length ? bs[prs[prs.length - 1][pos]] : null
  return last ? last.y + last.h : 0
}

/** Where a finding is on the page: the band indexes of each side it names. Not enumerable, so the reports do not carry it; --explain reads it. */
const locate = (f, source, port) => Object.defineProperty(f, 'bandAt', { value: { source, port }, enumerable: false })

/**
 * Judge the cells. `rows`: [{route, width, sourceUrl?, source, port}] (a probe read on each side); `opts.tolerance` in px, `opts.expectError(route)`.
 * → { cases, defects, listed, notDefects, notMeasured, cells, tolerance }. A cell: { route, width, source, port, delta, causes: [cause], notes: [text] }.
 */
export function judgeHeights(rows, { tolerance = HEIGHT_TOLERANCE_PX } = {}) {
  const out = { cases: 0, defects: [], listed: [], notDefects: [], notMeasured: [], cells: [], tolerance }
  const homeTitle = rows.find((r) => r.route === '/' && r.source?.title)?.source.title ?? null
  const dropped = new Map()
  for (const r of rows) {
    if (!r.source || !r.port || dropped.has(r.route)) continue
    if (r.source.bare === true && r.port.bare === false) dropped.set(r.route, { what: 'bare-source-page', title: r.source.title, sourceUrl: r.sourceUrl })
    else {
      const why = notCounterpart(r, homeTitle)
      if (why) dropped.set(r.route, { what: 'source-not-counterpart', title: r.source.title, sourceUrl: r.sourceUrl, why })
    }
  }
  for (const [route, d] of dropped) out.notDefects.push({ route, check: 'heights', ...d })
  for (const r of rows) {
    if (!r.source || !r.port || dropped.has(r.route)) continue
    const w = { route: r.route, width: r.width }
    out.cases++
    const delta = r1(r.port.doc - r.source.doc)
    const cell = { route: r.route, width: r.width, sourceUrl: r.sourceUrl ?? null, source: r.source.doc, port: r.port.doc, delta, causes: [], notes: [] }
    out.cells.push(cell)
    const unquiet = [r.source.quiet?.settled === false ? 'source' : null, r.port.quiet?.settled === false ? 'port' : null].filter(Boolean)
    if (unquiet.length) cell.notes.push(`${unquiet.join(' and ')} did not go quiet`)
    const sysFace = r.source.fonts && r.port.fonts && r.port.fonts.loaded.includes(r.port.fonts.body) && !r.source.fonts.loaded.includes(r.source.fonts.body) && r.source.fonts.body.toLowerCase() !== r.port.fonts.body.toLowerCase()
    if (sysFace) cell.systemFace = true
    const prune = (bands) => bands.map((b) => (b.tree ? { ...b, tree: withoutClones(b.tree) } : b))
    const sb = prune(r.source.bands)
    const pb = prune(r.port.bands)
    const add = (d) => {
      const e = { ...d, ...(sysFace ? { systemFace: true } : {}) }
      if (d.bandAt) locate(e, d.bandAt.source, d.bandAt.port)
      out.defects.push(e)
      cell.causes.push(d.cause)
    }
    if (!sb.length || !pb.length) {
      if (Math.abs(delta) > tolerance || sb.length !== pb.length) out.notMeasured.push({ ...w, cause: 'bands-not-found', why: 'no band of the page could be read on one side (no in-flow box below the body)', detail: `source ${sb.length} band(s), port ${pb.length}` })
      continue
    }
    const { al, split, opposite } = alignBands(sb, pb, tolerance)
    if (opposite.length) cell.notes.push('two neighbouring bands differ in opposite directions and cover the same extent together (the edge between them stands elsewhere)')
    for (const x of split) cell.notes.push(`the ${x.side} cuts a region into ${x.bands} bands where the other holds it in one (same height together)`)
    const found = []
    // a finding of a pair of boxes (a band, or the region one side cuts into several bands), told by the first box that differs or by what only one side has
    const pairFinding = (x, s, p, i, j, d) => locate({ ...w, what: `height-${x.kind}`, kind: x.kind, cause: causeOfFinding(roleOf(p), x.kind, x.sig), culprit: x.culprit, band: roleOf(p), bandHeading: p.tree.head || s.tree.head || '', at: { source: { y: s.y, h: s.h }, port: { y: p.y, h: p.h } }, delta: r1(d), source: x.source, port: x.port, detail: x.detail, bandHeights: { source: s.h, port: p.h } }, i, j)
    const addOnce = (f) => {
      if (!found.some((o) => o.cause === f.cause && o.bandAt.source.join() === f.bandAt.source.join() && o.bandAt.port.join() === f.bandAt.port.join())) found.push(f)
    }
    // the region of a cut: the bands of the side that cuts it, as one box
    const regionOf = (bands, idx) => {
      const first = bands[idx[0]]
      const last = bands[idx[idx.length - 1]]
      const trees = idx.map((k) => bands[k].tree)
      return { kind: 'band', y: first.y, h: last.y + last.h - first.y, tree: { ...first.tree, y: first.y, h: last.y + last.h - first.y, k: trees, dl: undefined, img: null, cut: undefined, words: 0, all: trees.map((t) => t.all ?? '').join('') } }
    }
    // The height of a pair is shared out by what was MEASURED: a leaf that is only on one side gives the band the height the probe read when it took the leaf out of the
    // flow (`fx`; none for a leaf in a box of fixed height or overlaid, nothing when it was not measured). The content findings take those heights; a cause that is not
    // about content keeps the rest; when a content finding was the first cause and a height beyond the tolerance is left, the box is looked at again without content and
    // that cause is its own finding for the rest.
    const share = (s, p, i, j, d, primary, content) => {
      const cause = (x) => causeOfFinding(roleOf(p), x.kind, x.sig)
      const eff = (x) => (x.leaves ?? []).reduce((n, l) => n + (typeof l.fx === 'number' ? (x.kind === 'element-missing' ? -l.fx : l.fx) : 0), 0)
      const isContent = Boolean(primary) && /^element-(missing|extra)$/.test(primary.kind)
      const same = primary ? content.find((x) => cause(x) === cause(primary)) : null
      const others = content.filter((x) => x !== same)
      const primaryEffect = isContent ? eff(same ?? { kind: primary.kind, leaves: primary.leaf ? [primary.leaf] : [] }) : 0
      const rest = r1(d - primaryEffect - others.reduce((n, x) => n + eff(x), 0))
      if (primary && !isContent) addOnce(pairFinding(primary, s, p, i, j, rest))
      // content measured to give height, and the band as high as the other side's (or the height left over its cause): the rest of the band makes up for it, and says so
      if (!primary && Math.abs(rest) > tolerance) addOnce(pairFinding({ kind: 'compensated', detail: `the band is ${px(Math.abs(d))} ${d >= 0 ? 'taller' : 'shorter'} on the port, but the content only one side has accounts for ${px(Math.abs(d - rest))} of it: ${px(Math.abs(rest))} elsewhere in the band make up for the rest`, source: px(s.h), port: px(p.h), culprit: p.tree.sig }, s, p, i, j, rest))
      if (isContent) {
        addOnce(pairFinding(primary, s, p, i, j, r1(primaryEffect)))
        if (Math.abs(rest) > tolerance) {
          const left = diffNode(s.tree, p.tree, tolerance, [], { a: s.tree.all ?? null, b: p.tree.all ?? null, delta: Math.abs(p.tree.h - s.tree.h), skipContent: true, tol: tolerance })
          addOnce(pairFinding(left, s, p, i, j, rest))
        }
      }
      for (const x of others) addOnce(pairFinding(x, s, p, i, j, r1(eff(x))))
    }
    // What the probe could not read is said, never taken for nothing: a band with more leaves than the probe reads (`capped`) is not compared for content, and a picture
    // whose ink the browser could not establish (`unk`) is matched with nothing.
    const unresolved = new Map()
    const sink = {}
    const unreadable = (bands) => {
      const capped = bands.some((b) => b.capped)
      if (capped) unresolved.set('content-not-read', 'a band holds more words and pictures than the probe reads, so what only one side has in it cannot be told')
      if (bands.some((b) => b.tree && leavesOf(b.tree).some((l) => l.unk))) unresolved.set('ink-not-established', 'the browser could not establish whether a picture (an svg with a clip or mask) paints, so it is matched with no picture of the other side')
      return capped
    }
    // the regions the two sides lay out differently but cover together alike: one side cuts a region into several bands, or two neighbours differ in opposite directions
    // and cover the same extent. Their extent chose them; what stands in them is compared as one box (the heights agree as a whole), never set aside.
    const regionAt = new Map()
    for (const g of split) regionAt.set(g.pair, { pairs: [g.pair], src: g.side === 'source' ? g.parts : [g.pair[0]], dst: g.side === 'port' ? g.parts : [g.pair[1]] })
    for (const [p1, p2] of opposite) {
      const reg = { pairs: [p1, p2], src: [p1[0], p2[0]], dst: [p1[1], p2[1]] }
      regionAt.set(p1, reg)
      regionAt.set(p2, reg)
    }
    for (const pr of al.pairs) {
      const [i, j] = pr
      const s = sb[i]
      const p = pb[j]
      if (!s.tree || !p.tree) continue
      const reg = regionAt.get(pr)
      if (reg) {
        if (reg.done) continue
        reg.done = true
        if (!reg.src.every((k) => sb[k].tree) || !reg.dst.every((k) => pb[k].tree)) continue
        const rs = reg.src.length > 1 ? regionOf(sb, reg.src) : sb[reg.src[0]]
        const rp = reg.dst.length > 1 ? regionOf(pb, reg.dst) : pb[reg.dst[0]]
        const logos = reg.pairs.flatMap((q) => pairLogos(sb[q[0]], pb[q[1]]))
        const capped = unreadable([...reg.src.map((k) => sb[k]), ...reg.dst.map((k) => pb[k])])
        share(rs, rp, reg.src, reg.dst, rp.h - rs.h, null, [...(capped ? [] : presenceOf(rs.tree, rp.tree, rp.tree.sig, { a: rs.tree.all ?? null, b: rp.tree.all ?? null }, tolerance, sink)), ...logos.map((x) => ({ ...x, leafH: 0 }))])
        continue
      }
      const d = p.h - s.h
      const logos = pairLogos(s, p)
      const capped = unreadable([s, p])
      const primary = Math.abs(d) > tolerance ? diffNode(s.tree, p.tree, tolerance) : null
      // what only one side has is a finding whatever the heights say; the band's height is shared out once: the first cause that explains it keeps what the content
      // findings do not (each content finding takes the height of its own leaf, in the direction of the difference, up to what is left)
      share(s, p, [i], [j], d, primary, [...(capped ? [] : presenceOf(s.tree, p.tree, p.tree.sig, { a: s.tree.all ?? null, b: p.tree.all ?? null }, tolerance, sink)), ...logos.map((x) => ({ ...x, leafH: 0 }))])
    }
    const keyOfPort = (j) => bandKey(pb[j])
    // a band with no partner is read too: what the probe could not read in it is said before a short band is set aside
    const unreadS = new Map(al.missing.map((i) => [i, unreadable([sb[i]])]))
    const unreadP = new Map(al.extra.map((j) => [j, unreadable([pb[j]])]))
    for (const i of al.missing) if (sb[i].h > tolerance || unreadS.get(i) || bandOnlyHere(sb[i], unpairedAt(al, sb, pb, 'source', i), tolerance, frameOf(al, sb, pb, 'source', i))) found.push(locate(unpairedFinding('band-missing', sb[i], w, `the source has the band ${sb[i].tree?.head ? `"${sb[i].tree.head}" ` : ''}(${sb[i].tree?.sig}, ${px(sb[i].h)} high) and the port has no counterpart`), [i], []))
    for (const j of al.extra) {
      if (pb[j].h <= tolerance && !unreadP.get(j) && !bandOnlyHere(pb[j], unpairedAt(al, sb, pb, 'port', j), tolerance, frameOf(al, sb, pb, 'port', j))) continue
      const twin = keyOfPort(j) != null && pb.some((o, k) => k !== j && keyOfPort(k) === keyOfPort(j))
      found.push(locate(unpairedFinding(twin ? 'band-doubled' : 'band-extra', pb[j], w, twin ? `the port prints the band "${pb[j].tree?.head}" twice (${px(pb[j].h)} each)` : `the port has the band ${pb[j].tree?.head ? `"${pb[j].tree.head}" ` : ''}(${pb[j].tree?.sig}, ${px(pb[j].h)} high) and the source has no counterpart`), [], [j]))
    }
    if (sink.unplaced) unresolved.set('background-picture-not-placed', 'a picture is painted as the background of a box on one side and a picture lies inside that box on the other, and where the background is painted could not be told (several layers, a picture not loaded), so they are not told apart')
    for (const [cause, why] of unresolved) out.notMeasured.push({ ...w, cause, why, detail: 'the content of the page is not fully read' })
    // Candidates the reading cannot carry (see leafDelta): one row per cause and band in this cell, naming the band, its container and the leaves. Independent findings of the
    // same band stay what they are; only these leaves are set aside as not measured.
    {
      const byCause = new Map()
      for (const u of sink.uncertain ?? []) {
        const key = `${u.cause}|${u.band}`
        if (!byCause.has(key)) byCause.set(key, { cause: u.cause, band: u.band, containers: new Set(), source: [], port: [] })
        const g = byCause.get(key)
        if (u.container != null) g.containers.add(String(u.container))
        g.source.push(...u.source)
        g.port.push(...u.port)
      }
      const words = (list) => [...new Set(list.map((l) => (l.img ? 'picture' : `"${String(l.tx ?? '').slice(0, 24)}"`)))].slice(0, 4).join(', ') || 'none'
      const WHY = {
        'reflow-position-unproven': 'leaves with the same words stand in boxes that lay out another number of columns, and no measured position of the leaves themselves says they are the same places, so they are neither matched nor reported as missing',
        'shift-position-unproven': 'leaves with the same words stand elsewhere, moved like other leaves that are not confirmed either, and no measured position of the leaves themselves says they are the same places, so they are neither matched nor reported as missing',
        'slide-pair-unproven': 'leaves of a carousel with equal words, in the same slot or in another phase, are not shown to belong to the same slide of the other side, so they are neither matched nor reported as missing'
      }
      for (const g of byCause.values()) out.notMeasured.push({ ...w, cause: g.cause, why: WHY[g.cause], detail: `band ${g.band}${g.containers.size ? `, container ${[...g.containers].join(' / ')}` : ''}: source ${words(g.source)}; port ${words(g.port)}` })
    }
    for (const u of al.unsure) out.notMeasured.push({ ...w, cause: 'bands-unpairable', why: 'the bands between two anchors are not the same number on both sides and none is named by a heading the other side lacks, so they cannot be paired', detail: `source ${u.source.map((i) => bandKey(sb[i]) ?? sb[i].tree?.sig).join(', ')} | port ${u.port.map((j) => bandKey(pb[j]) ?? pb[j].tree?.sig).join(', ')}` })
    // the gaps between the bands (margins between sections), when every band is paired in order
    // the height of the page the findings explain: what is left is told, never taken for nothing
    const residual = () => r1(delta - found.reduce((n, f) => n + (typeof f.delta === 'number' ? f.delta : 0), 0))
    // the gaps are told between UNITS: a pair is one unit, and a region one side cuts into several bands is one unit on both sides
    const total = !al.missing.length && !al.extra.length && !al.unsure.length && al.pairs.length > 0
    if (total) {
      const groupOf = new Map(split.map((g) => [g.pair, g]))
      const us = al.pairs.map((pr) => {
        const g = groupOf.get(pr)
        return { s: g?.side === 'source' ? g.parts : [pr[0]], p: g?.side === 'port' ? g.parts : [pr[1]] }
      })
      const span = (bands, idx) => ({ y: bands[idx[0]].y, h: bands[idx[idx.length - 1]].y + bands[idx[idx.length - 1]].h - bands[idx[0]].y })
      const US = us.map((u) => span(sb, u.s))
      const UP = us.map((u) => span(pb, u.p))
      const gaps = (units, doc) => [units[0].y, ...units.slice(1).map((b, i) => b.y - (units[i].y + units[i].h)), doc - (units[units.length - 1].y + units[units.length - 1].h)]
      const gs = gaps(US, r.source.doc)
      const gp = gaps(UP, r.port.doc)
      gs.forEach((g, k) => {
        const d = gp[k] - g
        if (Math.abs(d) <= tolerance) return
        const before = k === 0 ? 'top' : roleOf(pb[us[k - 1].p[0]])
        const after = k === us.length ? 'bottom' : roleOf(pb[us[k].p[0]])
        found.push(locate({ ...w, what: 'height-gap', kind: 'gap', ...(k < us.length ? { at: { source: { y: US[k].y, h: US[k].h }, port: { y: UP[k].y, h: UP[k].h } } } : {}), cause: `heights|gap|${before}>${after}`, culprit: `${before} > ${after}`, band: `${before}>${after}`, delta: r1(d), source: px(g), port: px(gp[k]), detail: `the space between ${before} and ${after} is ${px(g)} on the source, ${px(gp[k])} on the port` }, k < us.length ? [us[k].s[0]] : [], k < us.length ? [us[k].p[0]] : []))
      })
    }
    // what the findings do not explain of the page's difference is told: steps under the tolerance that add up when every band is paired or grouped, else a
    // reading that cannot say where the rest is
    if (Math.abs(residual()) > tolerance) {
      const settled = !al.unsure.length && !al.missing.length && !al.extra.length
      if (settled) found.push({ ...w, what: 'height-accumulated', kind: 'accumulated', cause: 'heights|page|accumulated', culprit: 'page', band: 'page', delta: residual(), source: `${r.source.doc}px`, port: `${r.port.doc}px`, detail: found.length ? `the findings of this page explain ${r1(delta - residual())}px of its ${delta}px; the small steps under ${tolerance}px that add up to ${residual()}px are not explained` : `no band or gap differs by more than ${tolerance}px, but the small steps add up to ${delta}px` })
      else if (!al.unsure.length) out.notMeasured.push({ ...w, cause: found.length ? 'height-residual' : 'bands-unpairable', why: found.length ? 'the findings of this page do not explain all of its height difference and the bands cannot be paired one to one to say where the rest is' : 'the page height differs but the bands cannot be paired one to one', detail: `source ${sb.length} band(s), port ${pb.length}${found.length ? `; ${residual()}px unexplained` : ''}` })
    }
    if (unquiet.length && Math.abs(delta) > tolerance) {
      out.notMeasured.push({ ...w, cause: 'layout-not-quiet', why: 'the page was still changing height when the ceiling was reached, so a difference may be the reading', detail: `${unquiet.join(' and ')} (${delta}px)` })
      continue
    }
    for (const f of found) add(f)
  }
  return out
}

/**
 * After the accept rows: the table with the accepted causes taken out. net = port − source − (what the accepted findings of the cell explain);
 * status: ok (within tolerance), accepted (beyond only by accepted causes), defect, not-measured. `judged` is the heights entry of the sweep.
 */
export function settleHeightCells(judged) {
  const tol = judged.tolerance ?? HEIGHT_TOLERANCE_PX
  const key = (x) => `${x.route}|${x.width}`
  const accepted = new Map()
  for (const n of judged.notDefects) if (n.accepted && n.delta != null) accepted.set(key(n), (accepted.get(key(n)) ?? 0) + n.delta)
  const open = new Set(judged.defects.map(key))
  const owed = new Set(judged.notMeasured.map(key))
  for (const c of judged.cells) {
    c.accepted = r1(accepted.get(key(c)) ?? 0)
    // an accepted amount offsets a difference that is there: a cell already within the tolerance has none to offset, so the amount must not create one
    c.net = Math.abs(c.delta) <= tol ? c.delta : r1(c.delta - c.accepted)
    // an open defect is a defect whatever else of the cell is not measured; a reading not measured makes no defect of its own
    c.status = open.has(key(c)) ? 'defect' : owed.has(key(c)) ? 'not-measured' : Math.abs(c.net) > tol ? 'defect' : Math.abs(c.delta) <= tol ? 'ok' : 'accepted'
  }
  return judged.cells
}
