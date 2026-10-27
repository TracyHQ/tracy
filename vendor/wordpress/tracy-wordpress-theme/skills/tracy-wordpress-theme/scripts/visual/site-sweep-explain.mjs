// site-sweep-explain.mjs — `site-sweep.mjs --only heights --explain <route>@<width>`: where ONE page differs in height at ONE width.
//
// It reads the cell as the heights check does (the same measure, pairing and tolerance) and prints the walk of the blocks from the top of both pages:
// selector, y, height and lines of text on each side, and the running offset of the port against the source. The first block where that offset is
// beyond the tolerance is marked. It writes nothing: no summary, no state, no history.
// The verdict is the sweep's: the judge, then the `sweep.accept` rows of the dossier, then the settled cell (site-sweep-verdict.mjs, one function).
// Exit follows the settled cell: 1 for a defect (even if another band is not measured, and even when the totals agree), 3 for not-measured, 0 for ok or
// accepted; 2 for input that is not a route of the dossier at a width, 3 when the cell could not be measured, or the deadline of the command passed.
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { UsageError } from '../lib/cli-args.mjs'
import { settleVerdict } from './site-sweep-verdict.mjs'
import { alignBands, bandOnlyHere, groupSplitBands, judgeHeights, unpairedAt, frameOf, HEIGHT_TOLERANCE_PX } from './site-sweep-heights-judge.mjs'

/** The whole command, from its first line to the close of the browser, is inside this one deadline. */
export const EXPLAIN_DEADLINE_MS = 90000

/** `/route@1180` → { route, width } or { error }. */
export function parseExplain(text) {
  const m = /^(\/\S*)@(\d{3,4})$/.exec(String(text ?? '').trim())
  if (!m) return { error: `--explain ${JSON.stringify(text)}: expected <route>@<width>, for example /about@1180` }
  const width = Number(m[2])
  if (width < 200 || width > 3000) return { error: `--explain: the width ${width} is outside 200–3000` }
  return { route: m[1], width }
}

const MAX_JSON_BYTES = 2 * 1024 * 1024

/**
 * A dossier file as JSON, or null when it is absent. Checked on the descriptor that is read: a link, a FIFO, a directory, an empty or a large file is
 * refused before a byte is read (a timer cannot interrupt a blocked read).
 */
export function readDossierJson(file, what) {
  let fd
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW)
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw new Error(`${what} ${file}: ${e.code === 'ELOOP' ? 'a symbolic link is refused' : e.message}`)
  }
  try {
    const st = fstatSync(fd)
    if (!st.isFile()) throw new Error(`${what} ${file}: not a regular file`)
    if (st.size === 0) throw new Error(`${what} ${file}: empty`)
    if (st.size > MAX_JSON_BYTES) throw new Error(`${what} ${file}: larger than ${MAX_JSON_BYTES} bytes`)
    try {
      // at most one byte past the limit is ever read, however the file grows meanwhile
      const buf = Buffer.alloc(MAX_JSON_BYTES + 1)
      let n = 0
      for (let got = 1; got > 0 && n < buf.length; n += got) got = readSync(fd, buf, n, buf.length - n, null)
      if (n > MAX_JSON_BYTES) throw new Error(`${what} ${file}: larger than ${MAX_JSON_BYTES} bytes`)
      return JSON.parse(buf.toString('utf8', 0, n))
    } catch (e) {
      if (/larger than/.test(e.message)) throw e
      throw new Error(`${what} ${file}: ${e instanceof SyntaxError ? 'not valid JSON' : e.message}`)
    }
  } finally {
    closeSync(fd)
  }
}

/**
 * The one deadline: when it passes, one line is printed and the process ends with `code`. → the function that disarms it.
 * `setTimer`, `clearTimer`, `print` and `exit` are injectable for the tests.
 */
export function armDeadline({ ms = EXPLAIN_DEADLINE_MS, label, code = 3, setTimer = setTimeout, clearTimer = clearTimeout, print = (l) => console.log(l), exit = (c) => process.exit(c) } = {}) {
  const timer = setTimer(() => {
    print(`explain ${label}: not measured — the deadline of ${Math.round(ms / 1000)}s for the command passed`)
    exit(code)
  }, ms)
  return () => clearTimer(timer)
}

const r1 = (n) => Math.round(n * 10) / 10
const leavesOf = (n) => (n.k?.length ? n.k.flatMap(leavesOf) : [n])
/** The lines a text box holds: its height without padding and border, over its line height. */
export const linesOf = (l) => Math.max(1, Math.round((l.h - (l.pt ?? 0) - (l.pb ?? 0) - (l.bw ?? 0)) / (l.lh || 1)))
/** The lines of text a band holds: the lines of each of its text leaves, added. */
export const linesIn = (b) => (b?.lines != null ? b.lines : b?.tree ? leavesOf(b.tree).reduce((n, l) => n + (l.words ? linesOf(l) : 0), 0) : 0)
const sel = (b) => (b ? `${b.kind === 'header' || b.kind === 'footer' ? `${b.kind} ` : ''}${b.tree?.sig ?? '?'}${b.tree?.head ? ` "${b.tree.head.slice(0, 24)}"` : ''}` : '—')
const box = (b) => (b ? `y ${r1(b.y)} h ${r1(b.h)} ${linesIn(b)} line(s)` : 'none')

/**
 * The walk of one measured cell. `row` = { route, width, source, port } as measureHeights returns it.
 * `accept` = { rows, decisions, runRoot } of the dossier (see `acceptContextOf`), or none. `rows` = every row the measurement holds (default: just `row`):
 * the accept rows are judged against all of them, so a row is held to its whole scope only as far as that scope was measured.
 * → { exit, delta, first, lines, cell, undecided, accept } — `first` is { index, why } or null; `cell` is the settled cell (null when the judge set the row aside).
 * Two things are printed and never mixed: the offset of every row is the raw measurement (the port's y against the source's at the edges of the
 * block, bands the judge skips included), and what the judge decided comes from `judgeHeights` itself — a row it skips or groups says so, the first
 * block of a defect it reports is marked, and the closing line is its verdict for the cell.
 */
export function explainRow(row, { tolerance = HEIGHT_TOLERANCE_PX, accept = null, rows: measured = [row] } = {}) {
  const sb = row.source.bands
  const pb = row.port.bands
  // the alignment of the judge: its pairs, its split-band groups (a region one side cuts into several bands of the same height together is one row,
  // its parts listed under it) and its neighbours that differ in opposite directions; then the same grouping by nearest fit for a region that differs
  const { al, split: strict, opposite } = alignBands(sb, pb, tolerance)
  // the bands the judge finds no partner for (before the nearest-fit grouping below, which only the walk uses)
  const judged0 = { pairs: [...al.pairs], missing: [...al.missing], extra: [...al.extra] }
  const oppositeOf = new Set(opposite.flat())
  const groups = [...strict, ...groupSplitBands(al, sb, pb, tolerance, { closest: true })]
  const groupOf = new Map(groups.map((g) => [g.pair, g]))
  const strictOf = new Set(strict.map((g) => g.pair))
  const partsS = new Set(groups.filter((g) => g.side === 'source').flatMap((g) => g.parts.filter((k) => k !== g.own)))
  const partsP = new Set(groups.filter((g) => g.side === 'port').flatMap((g) => g.parts.filter((k) => k !== g.own)))
  const unsureS = new Set((al.unsure ?? []).flatMap((u) => u.source ?? []))
  const unsureP = new Set((al.unsure ?? []).flatMap((u) => u.port ?? []))
  // page order: the source's bands in order (paired or not), each port band that has no partner after the last paired band that precedes it
  const walk = []
  for (let i = 0; i < sb.length; i++) {
    if (partsS.has(i)) continue
    const pr = al.pairs.find(([q]) => q === i)
    walk.push({ i, j: pr ? pr[1] : null, group: pr ? groupOf.get(pr) : null, opposite: !!pr && oppositeOf.has(pr) })
  }
  const extras = pb.map((_, j) => j).filter((j) => !al.pairs.some(([, q]) => q === j) && !partsP.has(j))
  for (const j of extras) {
    let at = 0
    walk.forEach((e, k) => {
      if (e.j != null && e.j < j) at = k + 1
    })
    while (at < walk.length && walk[at].i == null && walk[at].j < j) at++
    walk.splice(at, 0, { i: null, j })
  }
  // the cutting side's parts are one block: from the top of the first to the bottom of the last
  const span = (bands, idx) => {
    const first = bands[idx[0]]
    const last = bands[idx[idx.length - 1]]
    return { ...first, h: last.y + last.h - first.y, lines: idx.reduce((n, k) => n + linesIn(bands[k]), 0) }
  }
  // the verdict of the sweep for this cell: the judge, the accept rows, the settled cell — one function; what the rows cover is no longer a defect
  const judgedCell = { heights: judgeHeights(measured, { tolerance }) }
  const acceptResult = settleVerdict(judgedCell, accept, { routes: [...new Set(measured.map((m) => m.route))], widths: [...new Set(measured.map((m) => m.width))], cells: judgedCell.heights.cells.map((c) => ({ route: c.route, width: c.width })), cell: true })
  const all = judgedCell.heights
  const cell = all.cells.find((c) => c.route === row.route && c.width === row.width) ?? null
  // the other readings are kept for the accept rows (scope, counts); the verdict and its diagnostics are the requested cell's alone
  const here = (x) => x.route === row.route && (x.width == null || x.width === row.width)
  const verdict = { ...all, defects: all.defects.filter(here), notMeasured: all.notMeasured.filter(here), notDefects: all.notDefects.filter(here) }
  const rowOf = (n) => accept?.rows?.[n]
  const covered = verdict.notDefects.filter((n) => n.accepted)
  const undecided = [...verdict.notMeasured.map((n) => `${n.cause}: ${n.detail ?? n.why}`), ...verdict.notDefects.filter((n) => !n.accepted).map((n) => `${n.what}: ${n.why ?? 'the source has no page to compare the port with'}`)]
  // a row that also covers other routes or widths is applied to this cell by its own part only; whether it stands over its whole scope is a question for a run that measures that scope
  // an error of a row stands for this cell when the row names it; a not-measurable row's count error when its cause is not measured here, or is nowhere in the measurement (stale)
  const acceptErrors = acceptResult.errors.filter((e) => {
    const r = rowOf(e.row)
    if (e.check !== 'heights' || !r) return false
    if (r.kind !== 'not-measurable') return r.routes?.includes(row.route) && (!r.widths || r.widths.includes(row.width))
    const has = (list) => list.some((n) => n.cause === r.cause || n.causes?.some((c) => c.cause === r.cause))
    return has(verdict.notMeasured) || !has(all.notMeasured)
  })
  // a not-measurable row that closed a case leaves nothing in notDefects: its key comes from the accepted entry of the settled rows
  const closed = acceptResult.accepted.filter((x) => x.check === 'heights' && x.kind === 'not-measurable' && x.routes.includes(row.route) && x.widths.includes(row.width)).map((x) => `${x.cause} (not-measurable, measured by hand: ${x.measurement})`)
  const causes = [...new Set([...covered.map((n) => `${n.acceptCause} (${n.decision})`), ...closed])]
  // the row of a finding is the one the judge located it at (the band indexes it names), never worked out again from the printed numbers
  const hit = (idxS, idxP) => verdict.defects.find((d) => d.route === row.route && d.width === row.width && d.bandAt && (d.bandAt.source.some((k) => idxS.includes(k)) || d.bandAt.port.some((k) => idxP.includes(k))))
  const fmt = (v) => `${v > 0 ? '+' : ''}${v}`
  // the raw offset of the port against the source: at the top edge of a paired block the difference of their y, at the bottom edge the difference of
  // their bottoms; a block only one side has moves it by its height, and the space before it by the gap
  let running = 0
  let srcEdge = 0
  let portEdge = 0
  let widest = { v: 0, row: 0 }
  let judged = null
  const rows = walk.map((e, n) => {
    const g = e.group
    const idxS = e.i == null ? [] : g?.side === 'source' ? g.parts : [e.i]
    const idxP = e.j == null ? [] : g?.side === 'port' ? g.parts : [e.j]
    const s = e.i != null ? (g?.side === 'source' ? span(sb, g.parts) : sb[e.i]) : null
    const p = e.j != null ? (g?.side === 'port' ? span(pb, g.parts) : pb[e.j]) : null
    const unsure = (e.i != null && unsureS.has(e.i)) || (e.j != null && unsureP.has(e.j))
    if (p && !s) running = r1(running + (p.y - portEdge))
    if (s && !p) running = r1(running - (s.y - srcEdge))
    const top = s && p ? r1(p.y - s.y) : running
    const bottom = s && p ? r1(p.y + p.h - (s.y + s.h)) : r1(running + (p ? p.h : -s.h))
    running = bottom
    if (s) srcEdge = s.y + s.h
    if (p) portEdge = p.y + p.h
    for (const v of [top, bottom]) if (Math.abs(v) > Math.abs(widest.v)) widest = { v, row: n + 1 }
    const d = unsure ? null : hit(idxS, idxP)
    if (d && !judged) judged = { index: n + 1, d }
    let label = ''
    if (unsure) label = '  (pairing not sure)'
    else if (g) label = strictOf.has(g.pair) ? `  (split-band group: the ${g.side} cuts one region into ${g.parts.length} bands of the same height together; the judge compares them as one region)` : `  (split-band group by nearest fit: the ${g.side} cuts one region into ${g.parts.length} bands; the judge does not group them)`
    else if (e.opposite) label = '  (this band and its neighbour differ in opposite directions and cover the same extent together; the judge compares the two as one region)'
    else if (!s !== !p && (s ?? p).h <= tolerance && !bandOnlyHere(s ?? p, s ? unpairedAt(judged0, sb, pb, 'source', e.i) : unpairedAt(judged0, sb, pb, 'port', e.j), tolerance, s ? frameOf(judged0, sb, pb, 'source', e.i) : frameOf(judged0, sb, pb, 'port', e.j))) label = `  (not judged: a band of ${r1((s ?? p).h)}px with no partner on the ${s ? 'port' : 'source'}, and no content the judge can tell the other side lacks)`
    const parts = g ? g.parts.map((k, q) => `      part ${q + 1} of ${g.parts.length} (${g.side}) ${sel((g.side === 'port' ? pb : sb)[k])} [${box((g.side === 'port' ? pb : sb)[k])}]`) : []
    return { line: `${String(n + 1).padStart(2)}  source ${sel(s)} [${box(s)}]  port ${sel(p)} [${box(p)}]  offset ${fmt(top)} → ${fmt(bottom)}${label}`, parts, s, p, top, bottom }
  })
  // the block the judge reports first; a finding that names no block (the small steps that add up, the space at the bottom) marks none
  let first = null
  {
    const m = judged
    if (m) {
      const r = rows[m.index - 1]
      const at = Math.abs(r.top) > tolerance ? r.top : r.bottom
      const where = Math.abs(r.top) > tolerance ? 'top' : 'bottom'
      const how = at > 0 ? 'lower' : 'higher'
      const why = Math.abs(at) <= tolerance ? `the judge reports it: ${m.d.detail}` : !r.s || !r.p ? `${!r.s ? 'the port has a block the source does not' : 'the source has a block the port does not'}; the port is ${how} than the source by ${Math.abs(at)}px at the ${where} of it` : where === 'top' ? `the port is ${how} than the source by ${Math.abs(at)}px at the top of this block (the heights above it differ)` : `the port is ${how} than the source by ${Math.abs(at)}px at the bottom of this block (its own height differs)`
      first = { index: m.index, why }
    }
  }
  const out = rows.flatMap((r, n) => [r.line + (first && first.index === n + 1 ? '   <== first block beyond the tolerance' : ''), ...r.parts])
  const delta = r1(row.port.doc - row.source.doc)
  // the exit is the verdict of the judge: any defect 1 (also when another band is not measured), else something not measured 3, else quiet 0
  const exit = verdict.defects.length || cell?.status === 'defect' || acceptErrors.length ? 1 : !cell || cell.status === 'not-measured' || undecided.length ? 3 : 0
  const status = acceptErrors.length && exit === 1 && cell?.status !== 'defect' ? 'defect' : exit === 3 && cell && cell.status !== 'not-measured' ? 'undecided' : cell?.status ?? 'not-measured'
  const viaAccept = acceptErrors.length ? ` — verdict: ${status}; sweep.accept does not stand for this cell` : causes.length ? ` — verdict: ${status}; ${exit === 0 ? 'quiet only because of' : 'also covered by'} sweep.accept: ${causes.join(', ')}` : ''
  let closing
  if (acceptErrors.length) closing = `sweep.accept does not stand for this cell: ${acceptErrors.map((e) => e.message).join('; ')}`
  else if (first) closing = `first difference: block ${first.index} — ${first.why}`
  else if (verdict.defects.length || cell?.status === 'defect') closing = `the judge reports a difference that names no block: ${verdict.defects[0]?.detail ?? `the cell is beyond the tolerance by ${cell.net}px`}${Math.abs(widest.v) > tolerance ? `; the largest raw offset is ${fmt(widest.v)}px at row ${widest.row}` : ''}`
  else if (undecided.length) closing = `the judge could not decide this cell (${undecided.join('; ')}); no block is marked${Math.abs(widest.v) > tolerance ? `; the largest raw offset is ${fmt(widest.v)}px at row ${widest.row}` : ''}`
  else if (causes.length) closing = `the cell is quiet for the sweep (${status}) only because of sweep.accept: ${causes.join(', ')}${Math.abs(widest.v) > tolerance ? `; the largest raw offset is ${fmt(widest.v)}px at row ${widest.row}, beyond the tolerance of ±${tolerance}px` : ''}`
  else if (Math.abs(widest.v) > tolerance) closing = `the cell is quiet for the judge; the largest raw offset is ${fmt(widest.v)}px at row ${widest.row}, beyond the tolerance of ±${tolerance}px`
  else closing = 'no block is beyond the tolerance'
  const lines = [
    `explain ${row.route} @${row.width}: page height source ${row.source.doc}px, port ${row.port.doc}px, delta ${delta > 0 ? '+' : ''}${delta}px (tolerance ±${tolerance}px) — ${Math.abs(delta) <= tolerance ? 'the page totals agree' : 'the page totals differ'}${exit === 1 && Math.abs(delta) <= tolerance ? ', and the judge reports a difference' : ''}${viaAccept}`,
    `source ${row.sourceUrl ?? ''}`,
    ...out,
    closing
  ]
  return { exit, delta, first, lines, cell, undecided, accept: acceptResult }
}

/**
 * Resolve, launch, measure and print. → the exit code. No timer of its own: `armDeadline` bounds the whole command.
 * `accept` = the accept context of the dossier (`acceptContextOf`). `resolve()` → the pair of the route ({ path, sourceUrl, owedReason }); `withBrowser(fn)`; `measure(browser, pair)` → { rows, owed }.
 */
export async function runExplain({ route, width, resolve, withBrowser, measure, accept = null, tolerance = HEIGHT_TOLERANCE_PX, print = (l) => console.log(l) }) {
  const notMeasured = (why) => {
    print(`explain ${route} @${width}: not measured — ${why}`)
    return 3
  }
  try {
    const pair = await resolve()
    if (!pair?.sourceUrl) return notMeasured(pair?.owedReason ?? 'the route has no source address to pair it with')
    return await withBrowser(async (browser) => {
      const hm = await measure(browser, pair)
      const row = hm.rows.find((m) => m.route === route && m.width === width)
      if (!row) return notMeasured(hm.owed[0]?.reason ?? 'no reading')
      // totals alone are no walk: both sides need their blocks
      if (!row.source?.bands?.length || !row.port?.bands?.length) return notMeasured(`${!row.source?.bands?.length ? 'the source' : 'the port'} has no blocks read`)
      // the verdict of the sweep (judge, accept rows, settled cell): a cell it sets aside or cannot decide (no defect) is not a page that agrees or differs
      const r = explainRow(row, { tolerance, accept, rows: hm.rows })
      if (r.exit === 3) return notMeasured(r.undecided.join('; ') || 'the cell was set aside')
      for (const l of r.lines) print(l)
      return r.exit
    })
  } catch (e) {
    if (e instanceof UsageError) throw e
    return notMeasured(String(e.message).split('\n')[0])
  }
}
