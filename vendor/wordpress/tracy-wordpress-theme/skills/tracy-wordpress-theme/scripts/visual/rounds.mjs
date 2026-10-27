// rounds.mjs — the decisions of a Visual QA fix loop, as pure functions over run reports. The
// orchestrator (round.mjs) does the I/O; everything that decides lives here, so it is tested
// without a stand. Numbers quoted below come from ONE lab on ONE site (Tracy Base wp7,
// light-desktop, 25/09/2026) — they are why each rule exists, not constants of nature.
import { KIND_OF_VIEW } from './contract.mjs'

/**
 * Finding kinds driven by a real pointer: the only kinds that flipped between two runs on the same
 * state. Every `scan:hover-*` kind is one: `scan:hover-jump` was left out and a link of a closed
 * mega panel "jumping" on a different page each run went into the churn guard and the stop rule as
 * deterministic (JA Vega ld-3: churn 1.11, 16 of 31 findings "new", 26/09). They stay findings of
 * the visual verdict; they are only counted apart when two runs are compared.
 * `mega-menu` is the pointer's TRAVEL into a panel (review/mega-hover.mjs). What an open panel looks
 * like is the `menu-open-*` kinds (menu-open.mjs): a panel captured open and held still, compared box
 * by box with the source's — deterministic like parity, so none of them is a pointer kind (#50: an
 * open panel unlike the source's was filed with the pointer noise and passed every checkpoint).
 */
const POINTER_KINDS = Object.freeze(['scan:hover-not-measured', 'scan:hover-jump', 'mega-menu'])
export const isPointer = (kind) => POINTER_KINDS.includes(kind) || String(kind).startsWith('scan:hover-')

/**
 * Where a scan names a finding by its page position (`h@1375: DIV:bB + DIV:bT`), the position is
 * not part of its identity: a change that moves the page by 40 px would otherwise close every such
 * finding and open it again one line lower (measured on Tracy Base, 25/09: 8 of 24 "new").
 */
const withoutPosition = (s) => String(s).replace(/@-?\d+(?:\.\d+)?/g, '@*')

/** The identity of one finding for comparing runs: axis, kind, element, and what was expected/observed. */
export const findingKey = (f) =>
  `${f.axis}|${f.kind}|${withoutPosition(f.element ?? f.selector ?? f.what ?? '')}|${JSON.stringify(f.deltas ?? f.requested ?? f.source ?? f.expected ?? f.examined ?? '')}`

const hasAxisError = (p) => (p.findings ?? []).some((f) => f.kind === 'axis-error')

/**
 * Compare the latest measurement of each page (`before`: page id → report page, possibly from
 * different earlier runs) with this run's pages, as MULTISETS of finding keys per page. Only pages
 * measured on both sides without axis-error are compared. Pointer kinds are counted apart, and
 * pages in `nondeterministic` are counted apart — their HTML differs per request, so their
 * findings move without a change.
 */
export function compareRuns(before, after, { nondeterministic = [] } = {}) {
  const nd = new Set(nondeterministic)
  const blank = () => ({ pages: 0, same: 0, closed: 0, new: 0 })
  const out = { compared: 0, skippedAxisError: 0, notMeasuredBefore: [], deterministic: blank(), nondeterministic: blank(), pointer: { closed: 0, new: 0 }, pages: [] }
  for (const p of after) {
    const q = before.get(p.id)
    if (!q) {
      out.notMeasuredBefore.push(p.id)
      continue
    }
    if (hasAxisError(p) || hasAxisError(q)) {
      out.skippedAxisError++
      continue
    }
    out.compared++
    const count = (list) => {
      const m = new Map()
      for (const f of list) m.set(findingKey(f), (m.get(findingKey(f)) ?? 0) + 1)
      return m
    }
    const a = count(q.findings ?? [])
    const b = count(p.findings ?? [])
    const row = { page: p.id, nondeterministic: nd.has(p.id), same: 0, closed: 0, new: 0, pointerClosed: 0, pointerNew: 0 }
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const ca = a.get(k) ?? 0
      const cb = b.get(k) ?? 0
      const ptr = isPointer(k.split('|')[1])
      row.same += Math.min(ca, cb)
      if (ptr) {
        row.pointerClosed += Math.max(0, ca - cb)
        row.pointerNew += Math.max(0, cb - ca)
      } else {
        row.closed += Math.max(0, ca - cb)
        row.new += Math.max(0, cb - ca)
      }
    }
    const bucket = row.nondeterministic ? out.nondeterministic : out.deterministic
    bucket.pages++
    bucket.same += row.same
    bucket.closed += row.closed
    bucket.new += row.new
    out.pointer.closed += row.pointerClosed
    out.pointer.new += row.pointerNew
    if (row.closed || row.new || row.pointerClosed || row.pointerNew) out.pages.push(row)
  }
  return out
}

/**
 * The churn guard: new ÷ closed on deterministic pages. Above `limit` (0.3) the fix is making as
 * much as it removes — fix again on the targeted pages before paying for a full run. The previous
 * Tracy Base loop ran at 0.65 and 0.68 and paid for it with 382 new findings in round 1.
 */
export function churn(diff, limit = 0.3, minSample = 5) {
  const { closed, new: added } = diff.deterministic
  if (!closed && !added) return { ratio: 0, limit, verdict: 'pass' }
  // One new against one closed is a ratio of 1 and says nothing: a guard on so few findings
  // stopped a two-page fix on Tracy Base (25/09). Below the sample a fix that is not net worse
  // passes and its new findings are listed; one that only adds still goes back.
  if (closed + added < minSample && added <= closed)
    return { ratio: closed ? Math.round((added / closed) * 100) / 100 : null, limit, minSample, verdict: 'pass', note: `sample ${closed + added} < ${minSample}: read the new findings` }
  const ratio = closed ? Math.round((added / closed) * 100) / 100 : null
  return { ratio, limit, verdict: ratio !== null && ratio <= limit ? 'pass' : 'fix-again-before-full' }
}

const LISTING_TEMPLATES = new Set(['home', 'index', 'archive', 'category', 'tag', 'author', 'date', 'search', 'taxonomy'])
/** Whether a contract layout is a listing (archive-like) view. */
export function isListingLayout(layout) {
  if (!layout) return false
  if (layout.family) return layout.family === 'listing'
  const id = String(layout.view ?? layout.id ?? '')
  return LISTING_TEMPLATES.has(id) || id.startsWith('taxonomy') || KIND_OF_VIEW[id] === 'listing'
}

/**
 * The owner group of one finding, by a deterministic rule on (kind, layout of the page). Groups
 * are visual-qa.md's three file-owning groups plus LEE (a design decision), noise (pointer and
 * scanner kinds the noise floor showed moving) and tool (axis-error).
 *
 * Measured 25/09 on 176 held-out finding groups labelled by one agent's rule table: this rule
 * 0.920, the kind alone 0.653, Jev (the LLM filter) 0.625 with probabilities that did not calibrate
 * (p ≥ 0.8 right 0.641). So routing is this rule, and Jev does not route.
 */
export function ownerOf(finding, layout) {
  const k = finding.kind
  let owner
  if (k === 'axis-error') return 'tool'
  if (k === 'examined-too-few') owner = 'LEE'
  else if (k === 'image-missing' || k === 'identity-mismatch') owner = 'templates-patterns'
  // A header trigger missing, ambiguous or not opening is the header's markup (parts, the mega-menu block).
  else if (k === 'menu-open-unmatched' || k === 'menu-open-not-measured') owner = 'templates-patterns'
  else if (k.startsWith('scan:') || k === 'mega-menu' || k === 'font-not-loaded') owner = 'noise'
  else if (k === 'unclassified-element') owner = 'seeder-spec'
  else owner = 'tokens-css'
  const listing = isListingLayout(layout)
  // A wrong listing is a page-level content problem (the wrong posts, the wrong order), whatever
  // the single finding says; an unclassified element elsewhere is usually a style the pattern lacks.
  if ((owner === 'tokens-css' || owner === 'seeder-spec') && listing) return 'seeder-spec'
  if (owner === 'seeder-spec' && !listing) return 'tokens-css'
  return owner
}

/** Findings of a run grouped by owner; nondeterministic pages go to seeder-spec as pages, their findings apart. */
export function ownersOf(pages, contract, { nondeterministic = [] } = {}) {
  const nd = new Set(nondeterministic)
  const layouts = new Map((contract.layouts ?? []).map((l) => [l.id, l]))
  const groups = {}
  const add = (g) => (groups[g] ??= { findings: 0, pages: [], kinds: {}, items: [] })
  for (const id of nondeterministic) add('seeder-spec').pages.push(id)
  for (const p of pages) {
    if (nd.has(p.id)) continue
    const layout = layouts.get(p.layout) ?? null
    for (const f of p.findings ?? []) {
      const g = add(ownerOf(f, layout))
      g.findings++
      g.kinds[f.kind] = (g.kinds[f.kind] ?? 0) + 1
      if (!g.pages.includes(p.id)) g.pages.push(p.id)
      g.items.push({ page: p.id, axis: f.axis, kind: f.kind, element: f.element ?? f.selector ?? f.what ?? null })
    }
  }
  for (const g of Object.values(groups)) g.pages.sort()
  return groups
}

/** Non-pointer findings on the pages of `ids` (a run's deterministic set). */
export const stableCount = (pages, ids) =>
  pages.filter((p) => ids.has(p.id)).reduce((n, p) => n + (p.findings ?? []).filter((f) => !isPointer(f.kind)).length, 0)

/**
 * The stop rule over the tier's CHECKPOINTS (full runs), counted on deterministic pages only (the
 * current run's set, applied to both runs), pointer kinds apart: stop when a checkpoint shows no
 * real progress against the previous complete one —
 *   - the total did not go down (flat or up), or
 *   - it closed no more findings than it opened (`closed ≤ new`, when the pair's diff is given).
 * A checkpoint that went down AND closed more than it opened continues, however small the drop:
 * the old rule (stop below a 20 % drop) stopped JA Vega lr-1 at 19 % while it closed far more than
 * it opened (M4c, 27/09). The round/checkpoint bound (nextStep) is what ends a slow tail.
 * Counts on nondeterministic pages move ±30–45 a run by themselves on Tracy Base; pointer kinds
 * flip 0–3 a pair — neither is counted here.
 *
 * @param {number|null} prevCount   the previous complete checkpoint's count (null: none yet)
 * @param {number} currentCount
 * @param {{closed?: number|null, new?: number|null}} [pair]  deterministic diff between the two checkpoints
 */
export function stopRule(prevCount, currentCount, pair = {}) {
  const closed = Number.isFinite(pair?.closed) ? pair.closed : null
  const added = Number.isFinite(pair?.new) ? pair.new : null
  const base = { prev: prevCount ?? null, current: currentCount, closed, new: added }
  if (prevCount === null || prevCount === undefined) return { ...base, drop: null, stop: false, reason: 'first checkpoint of the tier' }
  if (currentCount === 0) return { ...base, drop: 1, stop: false, reason: 'no findings on deterministic pages' }
  const net = prevCount - currentCount
  const drop = prevCount ? Math.round((net / prevCount) * 1000) / 1000 : 0
  const pct = `${Math.round(drop * 100)} %`
  const hand = 'stop, hand over the decision list (LEE / SOURCE / seeder-upstream)'
  if (net <= 0) return { ...base, drop, stop: true, reason: `checkpoint total ${prevCount} → ${currentCount}: not decreasing — no net progress: ${hand}` }
  if (closed !== null && added !== null && closed <= added) return { ...base, drop, stop: true, reason: `checkpoint closed ${closed} ≤ new ${added}: no real progress: ${hand}` }
  return { ...base, drop, stop: false, reason: `checkpoint ${prevCount} → ${currentCount} (−${pct})${closed !== null ? `, closed ${closed} > new ${added}` : ''}: progress` }
}

/**
 * What to do next, from one round. Order matters: a tier closes only on a FULL run with nothing
 * left and every page deterministic; a targeted run never closes a tier.
 */
export function nextStep({ scope, round, maxRounds = 3, churnVerdict, stop, findings, unclassified, nondeterministic, axisErrors, incomplete = null }) {
  // A measurement with a tier that wrote no report, or that was cut by a deploy, counts for nothing:
  // not for closing, not for the stop rule, not against the bound.
  if (incomplete) return { next: 'full', why: `${scope === 'full' ? 'checkpoint' : 'recheck'} incomplete (${incomplete}): it does not count — measure again (a full checkpoint)` }
  const clean = findings === 0 && unclassified === 0 && nondeterministic === 0 && axisErrors === 0
  if (scope === 'full' && clean) return { next: 'close-tier', why: 'full run clean: run every lens the contract names for this tier (visual.shots consumers), merge notes, then the next tier' }
  if (nondeterministic && scope === 'full' && findings === 0) return { next: 'fix', why: `${nondeterministic} page(s) serve different HTML per request: seeder group first — a tier never closes on them` }
  // A checkpoint whose fixes opened more than the churn guard allows is judged by the guard, not by
  // the stop rule: its total is the regressions' total, and the next step is to fix them — ONE next
  // (#19 item 8: lr-1 and dd-1 of JA Vega M4c said `fix-again-before-full` and `stop-decision-list`
  // at once, and the tier stopped when it needed a regression fix). The bound still holds: at the
  // last checkpoint round the stop rule and the bound decide.
  if (scope === 'full' && churnVerdict === 'fix-again-before-full' && round < maxRounds)
    return { next: 'fix-again', why: `churn above the guard on this checkpoint: fix the regressions it opened, then a checkpoint${stop?.stop ? ' — the stop rule is judged on that checkpoint, not on this one' : ''}` }
  if (stop?.stop) return { next: 'stop-decision-list', why: stop.reason }
  if (round >= maxRounds && scope === 'full') return { next: 'replan', why: `round ${round} of ${maxRounds}: bound reached — write the decision list and replan, do not open round ${round + 1}` }
  if (scope !== 'full' && churnVerdict === 'fix-again-before-full') return { next: 'fix-again', why: 'churn above the guard on the targeted pages: fix again before a full run' }
  if (scope !== 'full') return { next: 'full', why: 'targeted pages converged; a full run is what counts toward closing the tier' }
  return { next: 'fix', why: 'fix by owner group, then a targeted round' }
}

/** The lenses due at this point of a tier: `layout` at the tier's first run, every lens at close. */
export function lensesDue({ tierFirstRun, next }) {
  if (next === 'close-tier') return 'all lenses the contract names for the tier (visual.shots consumers)'
  if (tierFirstRun) return 'layout (representative page of each layout; 26/34 layout notes in the lab were things no machine kind covers)'
  return null
}

/**
 * The lens names a ledger line asked for: its `lenses`, else read from its `lensesDue` words. "All
 * lenses" is the stage's visual.shots consumers; when those cannot be determined (`stageConsumers`
 * null — the contract was not readable — or empty) the answer is `null`, never an empty list: an
 * empty list asks for no note and let a deploy through with every lens of the close unwritten. A
 * line recorded with `lenses: []` against "all lenses" is read from its words again.
 */
export function lensesOf(line, stageConsumers = null) {
  const all = /^all lenses/.test(line.lensesDue ?? '')
  if (Array.isArray(line.lenses) && (line.lenses.length || !all)) return line.lenses
  if (!line.lensesDue) return []
  if (/^layout\b/.test(line.lensesDue)) return ['layout']
  if (all) return stageConsumers?.length ? [...stageConsumers] : null
  return []
}

/**
 * The lens gate of a deploying round: every lens an earlier run of THIS tier asked for must have
 * its note (`notes/<lens>.md`, non-empty) in that run's directory before another fix is deployed.
 * JA Vega M4: ld-0 asked for the layout lens, ld-1…ld-3 deployed without it, and the layout lens
 * ran at ld-3 — after three rounds of fixes it would have redirected (M4.7). A note in another
 * tier's run does not count. `noteSize(file)` returns the note's size, 0 when it is absent.
 * `stageConsumers` is null when the contract could not be read; "all lenses" then fails closed.
 */
export function missingLensNotes(tier, { stageConsumers = null, noteSize }) {
  const missing = []
  for (const l of tier) {
    if (l.failedStep || !l.out) continue
    const lenses = lensesOf(l, stageConsumers)
    // Fail closed: lenses that cannot be named cannot be shown written.
    if (lenses === null) {
      missing.push({ run: l.run, lens: null, why: `${l.run} asked for all lenses and the contract's visual.shots consumers for this stage cannot be determined (contract unreadable or no shot names the stage)` })
      continue
    }
    for (const lens of lenses) if (!noteSize(`${l.out}/notes/${lens}.md`)) missing.push({ run: l.run, lens, note: `${l.out}/notes/${lens}.md` })
  }
  return missing
}
