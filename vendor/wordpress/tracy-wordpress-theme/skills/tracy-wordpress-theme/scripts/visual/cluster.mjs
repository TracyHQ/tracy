#!/usr/bin/env node
// cluster.mjs — a round's findings grouped by PROBABLE ROOT CAUSE, so the fixing agent reads one
// row per fix instead of one row per sighting. Pure functions over a visual.json report; the CLI and
// `writeClusters` do the I/O.
//
//   node scripts/visual/cluster.mjs <run-dir|visual.json> [--out <dir>] [--history a/visual.json,b/visual.json]
//        → <out>/clusters.json (every member) + <out>/clusters.md (largest first, members on demand)
//
// THE KEY. A finding becomes one UNIT per property delta (a parity finding with three deltas is in
// up to three clusters), and a unit's key is (open|accepted, kind, site selector, property, expected,
// observed) — expected and observed are compared WITH their JSON type, so 400 and "400" stay apart.
// The same key on several pages and several tiers is one cluster: one rule on one selector sets that
// property to that value everywhere. Measured 27/09 on JA Vega M4c dd-1: 140 of 313 findings were
// ONE dark card-title colour, listed one by one.
//
// THE SELECTOR. parityByText labels an element `tag.class.class "first 40 characters of its words"`.
// The words say WHICH element, not WHY it is wrong, so they are dropped from the selector when the
// unit carries a value (a delta). A finding without a value (unclassified-element,
// parity-not-measured, image-missing, scan rows…) keys on its WHOLE record (a scan's page position aside): the
// words are then the only identity it has, and dropping them would put every bare `a` in one group.
//
// 🔒 SHARED-TEXT CHAIN — an INFERENCE, marked as one. parityByText measures a heading AND the link
// inside it that holds the same words (visual-qa.mjs `place`), so one wrong link colour arrives as
// `h3.card__title "X"` followed by a bare `a "X"` with the same delta. The label keeps neither
// ancestry nor the CSS rule, so the link cannot be PROVEN to sit in the heading. It is joined to the
// heading's cluster only when all of these hold within one page/axis/list: the link's label is a
// bare tag (no class), the finding right before it has a class, the same kind, the same words and
// the same deltas, and neither the words on a classed element nor the bare link occur anywhere else
// in that list (two titles cut to the same 40 characters are ambiguous, and stay apart). The member
// keeps `via` (its own selector) and the cluster says `inference: shared-text-chain`.
//
// 🔒 UNCHANGED IS STILL OPEN. With `history` (the earlier measurements of each page, oldest first —
// round.mjs hands them in), a member is `unchanged` when the latest earlier measurement of the same
// page ON THE SAME AXIS, without axis-error, had the same finding — the whole record, a scan's page
// position (`h@1375:` at the start of `what`) aside, so a changed `observed`, `expected` or any other field is a new finding —
// as a multiset: the second copy of a finding is unchanged only if the earlier run had two. A finding
// seen before only on another axis is new on this one (a dark tier's first sighting is not a light
// repeat). `streak` counts how many consecutive earlier measurements of that page and axis had it. A cluster whose members are ALL unchanged is listed
// in its own section so a reader does not re-read it every round — it is still counted in every
// total and still fails the gate. An axis with no earlier measurement, or with axis-error now, marks
// nothing (an axis-error on one axis does not discard the page's other axes): missing history is not evidence of anything. A finding that was gone and came back has
// streak 0 and is listed with the rest.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findingKey } from './rounds.mjs'

const CLUSTER_SCHEMA = 1
const LABEL = /^([a-z][a-z0-9-]*)((?:\.[^\s."]+)*) "([\s\S]*)"$/i
// A scan names the element by its page position at the START of `what` (review/seam-scan.mjs
// `${axis}@${pos}: …`). Only that position is dropped, and only there: an `@123` anywhere else —
// the words of a label, an expected or observed value — is content, and a change to it is new.
const SCAN_POSITION = /^([a-z]+)@-?\d+(?:\.\d+)?(?=:)/i
const isScan = (f) => typeof f?.kind === 'string' && f.kind.startsWith('scan:')
const withoutPosition = (f, k, v) => (typeof v === 'string' && k === 'what' && isScan(f) ? v.replace(SCAN_POSITION, '$1@*') : v)
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8)

/** A parityByText label `tag.a.b "words"` as parts; null for anything else (a CSS path, a rule name). */
export function parseLabel(element) {
  if (typeof element !== 'string') return null
  const m = LABEL.exec(element)
  if (!m) return null
  const tag = m[1].toLowerCase()
  return { tag, classes: m[2] ? m[2].slice(1).split('.') : [], text: m[3], selector: `${tag}${m[2]}` }
}

/** JSON with sorted keys, so two records with the same content key the same. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  return JSON.stringify(v === undefined ? null : v)
}

const goodDelta = (d) => d && typeof d === 'object' && typeof d.property === 'string' && d.property !== '' && 'expected' in d && 'observed' in d
const deltasOf = (f) => (Array.isArray(f?.deltas) && f.deltas.length && f.deltas.every(goodDelta) ? f.deltas : null)
const kindOf = (f) => (f && typeof f.kind === 'string' && f.kind ? f.kind : '(no kind)')
const sameDeltas = (a, b) => {
  if (!a || !b || a.length !== b.length) return false
  const s = (list) => list.map((d) => stable([d.property, d.expected, d.observed])).sort().join('\n')
  return s(a) === s(b)
}

/** Where a finding without a parsed label says it is: the fields the producers use, in that order. */
const whereOf = (f) => {
  for (const k of ['element', 'selector', 'k', 'what', 'rule']) if (typeof f?.[k] === 'string' && f[k]) return withoutPosition(f, k, f[k])
  return '—'
}

/**
 * Indices in one ordered finding list whose bare-tag label joins the finding right before it
 * (see SHARED-TEXT CHAIN above). Returns Map index → wrapper selector.
 */
export function sharedTextChains(list) {
  const out = new Map()
  const labels = list.map((f) => parseLabel(f?.element))
  for (let i = 1; i < list.length; i++) {
    const inner = labels[i]
    const outer = labels[i - 1]
    if (!inner || inner.classes.length || !outer || !outer.classes.length) continue
    if (kindOf(list[i]) !== kindOf(list[i - 1]) || inner.text !== outer.text) continue
    if (!sameDeltas(deltasOf(list[i]), deltasOf(list[i - 1]))) continue
    const wrappers = labels.filter((l) => l && l.classes.length && l.text === inner.text).length
    const inners = labels.filter((l) => l && !l.classes.length && l.tag === inner.tag && l.text === inner.text).length
    if (wrappers !== 1 || inners !== 1) continue
    out.set(i, outer.selector)
  }
  return out
}

/** The units of one finding: one per well-formed delta, else one keyed on the whole record. */
function unitsOf(f, chainedTo) {
  const kind = kindOf(f)
  const deltas = deltasOf(f)
  const label = parseLabel(f?.element)
  if (deltas) {
    const own = label ? label.selector : whereOf(f)
    const selector = chainedTo ?? own
    return deltas.map((d, delta) => ({ kind, selector, via: chainedTo ? own : null, property: d.property, expected: d.expected, observed: d.observed, delta, sig: stable([d.property, d.expected, d.observed]) }))
  }
  // Conservative: the whole record is the identity. Scan rows name the element by page position
  // (`h@1375:`) — the position is not the cause — and nothing else is dropped.
  const rest = {}
  for (const [k, v] of Object.entries(f && typeof f === 'object' ? f : { value: f })) if (!['kind', 'axis', 'exception'].includes(k)) rest[k] = withoutPosition(f, k, v)
  return [{ kind, selector: whereOf(f), via: null, property: null, expected: null, observed: null, delta: null, sig: stable(rest) }]
}

/**
 * The identity of a finding across runs: the whole record with sorted keys, a scan's page position
 * stripped from the start of its `what`. `exception` and `axis` are left out (the axis is the history
 * key). Nothing else is dropped — findingKey keeps only one of expected/observed for a finding without
 * deltas, so a changed actual value would look unchanged.
 */
export function repeatKey(f) {
  if (!f || typeof f !== 'object') return stable(f)
  const rest = {}
  for (const [k, v] of Object.entries(f)) if (k !== 'exception' && k !== 'axis') rest[k] = withoutPosition(f, k, v)
  return stable(rest)
}
const axisError = (axis) => (axis?.findings ?? []).some((f) => f?.kind === 'axis-error')
const pageAxis = (page, axis) => `${page}\u0000${axis}`

/**
 * Earlier measurements (oldest first, each `{ run, pages }` as in visual.json) → `page\0axis` → list
 * of multisets, oldest first. Only the axes a page was measured on count, and an axis that ended in
 * axis-error is skipped (it measured nothing whole, so it neither shows a finding nor shows it gone);
 * the page's other axes still count.
 */
function historyByPage(history = []) {
  const byPage = new Map()
  for (const h of history)
    for (const p of h?.pages ?? []) {
      if (!p?.id) continue
      for (const a of p.axes ?? []) {
        if (a?.variant == null || axisError(a)) continue
        const m = new Map()
        for (const f of a.findings ?? []) m.set(repeatKey(f), (m.get(repeatKey(f)) ?? 0) + 1)
        const k = pageAxis(String(p.id), String(a.variant))
        if (!byPage.has(k)) byPage.set(k, [])
        byPage.get(k).push({ run: h.run ?? null, counts: m })
      }
    }
  return byPage
}

/**
 * Group a report's findings (`pages[].axes[].findings` and `.accepted`) into clusters. Pure.
 * `history`: earlier measurements, oldest first (`[{ run, pages }]`); omitted → nothing is marked.
 */
export function clusterFindings(pages, { history = null } = {}) {
  if (!Array.isArray(pages)) throw new Error('clusterFindings: pages must be an array (visual.json `pages`)')
  const past = history ? historyByPage(history) : null
  const clusters = new Map()
  const totals = { findings: 0, accepted: 0, units: 0, clusters: 0, acceptedClusters: 0, inMoreThanOneCluster: 0, inferred: 0, unchanged: 0, compared: 0 }
  for (const p of pages) {
    const pageId = String(p?.id ?? '(no id)')
    for (const a of p?.axes ?? []) {
      const axis = String(a?.variant ?? '(no axis)')
      const earlier = (a?.variant != null && past?.get(pageAxis(pageId, axis))) || []
      const comparable = past && !axisError(a) && earlier.length
      const seen = new Map()
      for (const list of ['findings', 'accepted']) {
        const rows = Array.isArray(a?.[list]) ? a[list] : []
        const chains = sharedTextChains(rows)
        rows.forEach((f, index) => {
          const status = list === 'accepted' ? 'accepted' : 'open'
          if (status === 'open') totals.findings++
          else totals.accepted++
          const member = { key: `${pageId}|${axis}|${list}#${index}`, page: pageId, axis, list, index, findingKey: findingKey({ ...f, axis }), element: typeof f?.element === 'string' ? f.element : null }
          if (status === 'open' && comparable) {
            totals.compared++
            const k = repeatKey(f)
            const nth = (seen.get(k) ?? 0) + 1
            seen.set(k, nth)
            let streak = 0
            for (let j = earlier.length - 1; j >= 0 && (earlier[j].counts.get(k) ?? 0) >= nth; j--) streak++
            member.unchanged = streak > 0
            member.streak = streak
            if (streak) member.since = earlier[earlier.length - streak].run
            if (streak) totals.unchanged++
          }
          const units = unitsOf(f, chains.get(index) ?? null)
          if (units.length > 1) totals.inMoreThanOneCluster++
          if (chains.has(index)) totals.inferred++
          for (const u of units) {
            totals.units++
            const decision = status === 'accepted' ? String(f?.exception?.decision ?? '') : ''
            const key = [status, u.kind, u.selector, u.property ?? '', u.sig, decision].join('\u0000')
            if (!clusters.has(key))
              clusters.set(key, { id: `C-${hash(key)}`, status, kind: u.kind, selector: u.selector, property: u.property, expected: u.expected, observed: u.observed, ...(decision ? { decision } : {}), inference: null, vias: new Set(), members: [] })
            const c = clusters.get(key)
            if (u.via) {
              c.inference = 'shared-text-chain'
              c.vias.add(u.via)
            }
            c.members.push({ ...member, ...(u.delta != null ? { delta: u.delta } : {}), ...(u.via ? { via: u.via } : {}) })
          }
        })
      }
    }
  }
  const order = (m) => `${m.page}\u0000${m.axis}\u0000${m.list}\u0000${String(m.index).padStart(8, '0')}\u0000${String(m.delta ?? 0).padStart(4, '0')}`
  const out = [...clusters.values()].map((c) => {
    const members = c.members.sort((x, y) => (order(x) < order(y) ? -1 : order(x) > order(y) ? 1 : 0))
    const perPage = new Map()
    for (const m of members) perPage.set(m.page, (perPage.get(m.page) ?? 0) + 1)
    const representative = [...perPage.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0][0]
    const findings = new Set(members.map((m) => m.key)).size
    const { vias, ...rest } = c
    return {
      ...rest,
      viaSelectors: [...vias].sort(),
      size: members.length,
      findings,
      pages: [...perPage.keys()].sort(),
      axes: [...new Set(members.map((m) => m.axis))].sort(),
      representative,
      unchanged: c.status === 'open' && members.every((m) => m.unchanged === true),
      streak: members.every((m) => m.unchanged === true) ? Math.min(...members.map((m) => m.streak)) : 0,
      members
    }
  })
  out.sort((x, y) => y.size - x.size || (x.id < y.id ? -1 : 1))
  totals.clusters = out.filter((c) => c.status === 'open').length
  totals.acceptedClusters = out.filter((c) => c.status === 'accepted').length
  return { schemaVersion: CLUSTER_SCHEMA, history: past ? true : false, totals, clusters: out }
}

/**
 * Escape a value for a Markdown table cell: no pipe that splits the row, no newline that ends it, no
 * backtick or angle bracket that opens code or HTML. Emphasis characters are left alone on purpose:
 * selectors are full of `__` and a reader of the raw file must be able to copy them.
 */
export const escapeMd = (v) => String(v ?? '').replace(/[\\`<>|]/g, '\\$&').replace(/\r?\n/g, ' ')
/** The same outside a table (member lines): a pipe is kept, so a member key reads and copies as written. */
const escapeLine = (v) => String(v ?? '').replace(/[\\`<>]/g, '\\$&').replace(/\r?\n/g, ' ')
const value = (v) => (v === null || v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v))
const change = (c) => (c.property ? `${value(c.expected)} → ${value(c.observed)}` : '—')
const where = (c) => `${c.selector}${c.viaSelectors?.length ? ` (+ ${c.viaSelectors.join(', ')} inside, inferred)` : ''}`

/** The table rows of the first `limit` clusters (open, not unchanged) — used by VISUAL.md, machine.md and NOTES. */
export function clusterDigest(result, { limit = 15, link = 'clusters.md' } = {}) {
  const open = result.clusters.filter((c) => c.status === 'open')
  const fresh = open.filter((c) => !c.unchanged)
  const still = open.filter((c) => c.unchanged)
  const t = result.totals
  return [
    `${t.findings} open finding(s) → **${t.clusters} cluster(s)** (${t.units} property-level membership(s); ${t.inMoreThanOneCluster} finding(s) sit in more than one cluster${t.inferred ? `; ${t.inferred} joined by the shared-text-chain inference` : ''})${still.length ? ` · ${still.length} cluster(s) unchanged since the last measurement — still open, listed apart in ${link}` : ''}. One cluster is one probable fix; members and their keys are in ${link} and clusters.json.`,
    '',
    '| Cluster | Findings | Kind | Selector | Property | Expected → Actual | Pages | Representative |',
    '|---|---:|---|---|---|---|---:|---|',
    ...(fresh.length
      ? fresh.slice(0, limit).map((c) => `| ${c.id} | ${c.size} | ${escapeMd(c.kind)} | ${escapeMd(where(c))} | ${escapeMd(c.property ?? '—')} | ${escapeMd(change(c))} | ${c.pages.length} | ${escapeMd(c.representative)} |`)
      : ['| — | 0 | — | none | — | — | 0 | — |']),
    ...(fresh.length > limit ? ['', `${fresh.length - limit} smaller cluster(s) not shown here: ${link}.`] : []),
    // A stuck cluster must stay in sight: a large one unchanged for rounds is a replan signal, not
    // something to scroll past. Its size and streak are shown; its members are not repeated.
    ...(still.length
      ? [
          '',
          `Unchanged since the last measurement (largest ${Math.min(still.length, 5)} of ${still.length}; still open, still counted):`,
          '',
          '| Cluster | Findings | Kind | Selector | Property | Expected → Actual | Unchanged |',
          '|---|---:|---|---|---|---|---|',
          ...still.slice(0, 5).map((c) => `| ${c.id} | ${c.size} | ${escapeMd(c.kind)} | ${escapeMd(where(c))} | ${escapeMd(c.property ?? '—')} | ${escapeMd(change(c))} | ×${c.streak} |`)
        ]
      : [])
  ]
}

export function clustersMarkdown(result, { at = '' } = {}) {
  const open = result.clusters.filter((c) => c.status === 'open')
  const fresh = open.filter((c) => !c.unchanged)
  const still = open.filter((c) => c.unchanged)
  const accepted = result.clusters.filter((c) => c.status === 'accepted')
  const row = (c) => `| ${c.id} | ${c.size} | ${escapeMd(c.kind)} | ${escapeMd(where(c))} | ${escapeMd(c.property ?? '—')} | ${escapeMd(change(c))} | ${c.pages.length} | ${escapeMd(c.axes.join(', '))} | ${escapeMd(c.representative)} | ${[c.inference ? 'inferred: shared-text-chain' : '', c.unchanged ? `unchanged ×${c.streak} since ${c.members[0].since ?? '?'}` : '', c.decision ? `accepted: ${c.decision}` : ''].filter(Boolean).map(escapeMd).join('; ') || '—'} |`
  const table = (list) => [
    '| Cluster | Size | Kind | Selector | Property | Expected → Actual | Pages | Axes | Representative | Note |',
    '|---|---:|---|---|---|---|---:|---|---|---|',
    ...(list.length ? list.map(row) : ['| — | 0 | — | none | — | — | 0 | — | — | — |'])
  ]
  const members = (c) => [
    `<details><summary>${c.id} — ${c.size} member(s)</summary>`,
    '',
    ...c.members.map((m) => `- ${escapeLine(m.key)}${m.delta != null ? ` Δ${m.delta}` : ''}${m.via ? ` via ${escapeLine(m.via)}` : ''}${m.unchanged ? ` (unchanged ×${m.streak})` : ''} — ${escapeLine(m.element ?? '')}`),
    '',
    '</details>'
  ]
  const t = result.totals
  return [
    `# Clusters — ${at}`,
    '',
    `${t.findings} open finding(s) in ${t.clusters} cluster(s); ${t.accepted} accepted finding(s) in ${t.acceptedClusters} cluster(s). ${t.units} property-level membership(s): a finding with several deltas sits in several clusters (${t.inMoreThanOneCluster} do). ${result.history ? `${t.unchanged} of ${t.compared} compared open finding(s) are unchanged since the page's last measurement.` : 'No history given: nothing is marked unchanged.'}`,
    '',
    'A cluster is a PROBABLE root cause: same kind, site selector (label words dropped), property and expected → actual across pages and tiers. It is not proof of one CSS rule — check the representative page, fix, and rerun. Totals and the gate are unchanged by clustering.',
    '',
    '## Open — largest first',
    '',
    ...table(fresh),
    '',
    '## Unchanged since the last measurement — still open, still counted, still failing the gate',
    '',
    ...table(still),
    '',
    '## Accepted by a cited exception',
    '',
    ...table(accepted),
    '',
    '## Members (open on demand; keys are page|axis|list#index into visual.json)',
    '',
    ...result.clusters.flatMap((c) => [...members(c), '']),
    ''
  ].join('\n')
}

/** Write clusters.json + clusters.md into `out`; returns the result. */
export function writeClusters(out, pages, { history = null, at = '' } = {}) {
  const result = clusterFindings(pages, { history })
  mkdirSync(out, { recursive: true })
  writeFileSync(path.join(out, 'clusters.json'), JSON.stringify({ at, ...result }, null, 2) + '\n')
  writeFileSync(path.join(out, 'clusters.md'), clustersMarkdown(result, { at }))
  return result
}

const readReport = (p) => {
  const file = existsSync(p) && statSync(p).isDirectory() ? path.join(p, 'visual.json') : p
  return JSON.parse(readFileSync(file, 'utf8'))
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const argv = process.argv.slice(2)
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null)
  const input = argv[0]
  if (!input || input.startsWith('--')) {
    console.error('usage: cluster.mjs <run-dir|visual.json> [--out <dir>] [--history a/visual.json,b/visual.json]')
    process.exit(2)
  }
  const report = readReport(input)
  const history = opt('--history') ? opt('--history').split(',').filter(Boolean).map((f) => ({ run: path.basename(statSync(f).isDirectory() ? path.resolve(f) : path.dirname(path.resolve(f))), pages: readReport(f).pages })) : null
  const out = opt('--out') ?? (statSync(input).isDirectory() ? input : path.dirname(input))
  const r = writeClusters(out, report.pages, { history, at: report.at ?? '' })
  console.log(JSON.stringify({ out, ...r.totals, largest: r.clusters.slice(0, 5).map((c) => ({ id: c.id, size: c.size, kind: c.kind, selector: c.selector, property: c.property, inference: c.inference })) }))
}
