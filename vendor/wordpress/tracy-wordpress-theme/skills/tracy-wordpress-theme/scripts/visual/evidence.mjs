// One closed schema per evidence file of the visual gates, validated at the place the file is read:
// bounded regular-file read → JSON parse → validate → a named refusal (`<file>: <field path> …`).
// A missing, null or mistyped field is never a default: the old reads turned `scope.plan: null`, a shot
// without `consumers` or an unknown todo id into an empty list, and an empty list passes.
//
// Closed = an object level names every field it may hold (required or optional); an unknown field is a refusal.
// `open` marks the ONE kind of subtree whose content is a measurement payload no gate reads (an axis's
// boxes, styles, menus …): the object is still typed, its gate-relevant fields are required, the rest is data.
import path from 'node:path'
import { LENSES } from './contract.mjs'
import { readRegularFile } from './pattern-registry.mjs'
import { SOURCE_DEPENDENT_CHECKS, checkApplicability, imageReferenceReason } from './applicability.mjs'

export const MAX_EVIDENCE_BYTES = 32 * 1024 * 1024
export const MAX_SMALL_EVIDENCE_BYTES = 4 * 1024 * 1024
const SHOWN = 8

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const show = (v) => {
  const s = JSON.stringify(v)
  return s === undefined ? 'undefined' : s.length > 40 ? `${s.slice(0, 37)}…` : s
}

// ── combinators: each schema is (value, path) => refusals[] ────────────────────────────────────────
export const str = ({ re = null, oneOf = null, min = 0 } = {}) => (v, p) => {
  if (typeof v !== 'string') return [`${p} must be a string (got ${show(v)})`]
  if (oneOf && !oneOf.includes(v)) return [`${p} ${show(v)} is not one of ${oneOf.join(' | ')}`]
  if (re && !re.test(v)) return [`${p} ${show(v)} is not an allowed form`]
  if (v.length < min) return [`${p} must not be empty`]
  return []
}
export const int = ({ min = 0 } = {}) => (v, p) => (Number.isSafeInteger(v) && v >= min ? [] : [`${p} must be an integer ≥ ${min} (got ${show(v)})`])
export const num = () => (v, p) => (typeof v === 'number' && Number.isFinite(v) ? [] : [`${p} must be a number (got ${show(v)})`])
export const bool = () => (v, p) => (typeof v === 'boolean' ? [] : [`${p} must be true or false (got ${show(v)})`])
export const lit = (x) => (v, p) => (v === x ? [] : [`${p} must be ${show(x)} (got ${show(v)})`])
export const nullable = (f) => (v, p) => (v === null ? [] : f(v, p))
export const anyOf = (...fs) => (v, p) => {
  const all = fs.map((f) => f(v, p))
  return all.some((e) => !e.length) ? [] : [all[0][0]?.replace(/ \(got .*$/, '') + ` — no allowed form matches ${show(v)}`]
}
/** An explicitly open value: any JSON. Only for payloads no gate reads. */
export const free = () => () => []
export const refine = (f, check) => (v, p) => {
  const e = f(v, p)
  return e.length ? e : check(v, p)
}
export const arr = (item, { min = 0, key = null } = {}) => (v, p) => {
  if (!Array.isArray(v)) return [`${p} must be an array (got ${show(v)})`]
  const out = []
  if (v.length < min) out.push(`${p} must hold at least ${min} item(s)`)
  v.forEach((x, i) => out.push(...item(x, `${p}[${i}]`)))
  if (key && !out.length) {
    const seen = new Set()
    for (const x of v) {
      const k = key(x)
      if (seen.has(k)) out.push(`${p} lists ${show(k)} twice`)
      seen.add(k)
    }
  }
  return out
}
export const dict = (item, { keyRe = null, min = 0 } = {}) => (v, p) => {
  if (!isObj(v)) return [`${p} must be an object (got ${show(v)})`]
  const keys = Object.keys(v)
  const out = keys.length < min ? [`${p} must hold at least ${min} entr${min === 1 ? 'y' : 'ies'}`] : []
  for (const k of keys) {
    if (keyRe && !keyRe.test(k)) out.push(`${p} has a key ${show(k)} that is not an allowed form`)
    out.push(...item(v[k], `${p}.${k}`))
  }
  return out
}
export const obj = ({ req = {}, opt = {}, open = false }) => (v, p) => {
  if (!isObj(v)) return [`${p} must be an object (got ${show(v)})`]
  const out = []
  // own properties only: `constructor`, `toString`, `__proto__` are names like any other, never a field the object inherits
  for (const [k, f] of Object.entries(req)) {
    if (!Object.hasOwn(v, k) || v[k] === undefined) out.push(`${p}.${k} is missing`)
    else out.push(...f(v[k], `${p}.${k}`))
  }
  for (const k of Object.keys(v)) {
    if (Object.hasOwn(req, k)) continue
    if (Object.hasOwn(opt, k)) out.push(...opt[k](v[k], `${p}.${k}`))
    else if (!open) out.push(`${p}.${k} is not a known field`)
  }
  return out
}

/** The refusals of `value` against `schema`, each prefixed with the evidence file's name. */
export const problems = (value, schema, what, { referenceKinds = null } = {}) => {
  const out = schema(value, what).map((m) => (m.startsWith(what) ? m : `${what}: ${m}`))
  if (referenceKinds && (schema === VISUAL || schema === VISUAL_PRIOR)) {
    for (const page of value?.pages ?? []) {
      const kind = referenceKinds[page.id]
      const hasBoundKind = Object.hasOwn(referenceKinds, page.id) && kind != null
      if (hasBoundKind && page.referenceKind !== undefined && page.referenceKind !== kind)
        out.push(`${what}.pages.${page.id}: visual referenceKind ${page.referenceKind} differs from reference.json (${kind ?? 'legacy/unknown'})`)
      const sourceIndependent = checkApplicability(kind, 'menu-comparison') === 'not-applicable'
      const hasSourceLessEvidence = (page.axes ?? []).some((axis) => (axis.notApplicable ?? []).length || axis.menus?.targetOnly === true)
      if (!hasBoundKind && hasSourceLessEvidence)
        out.push(`${what}.pages.${page.id}: N/A evidence requires --spec to bind reference.kind=none`)
      else if (!sourceIndependent && (page.axes ?? []).some((axis) => (axis.notApplicable ?? []).length))
        out.push(`${what}.pages.${page.id}: not-applicable evidence is only valid for reference.kind=none`)
      if (hasBoundKind && !sourceIndependent && (page.axes ?? []).some((axis) => axis.menus?.targetOnly === true))
        out.push(`${what}.pages.${page.id}: target-only menus are only valid for reference.kind=none`)
    }
  }
  return out
}

const refusal = (what, file, list) => new Error(`${what}: ${file} is malformed — ${list.slice(0, SHOWN).join('; ')}${list.length > SHOWN ? ` (+${list.length - SHOWN} more)` : ''}; regenerate it with the tool that writes it`)

/**
 * Bounded read → parse → validate. Every failure is an Error naming `what` and `file`. `schema` validates the parsed value;
 * the JSON is never returned before it passed.
 */
export function readEvidence(file, schema, { what = file, max = MAX_EVIDENCE_BYTES, referenceKinds = null } = {}) {
  const buf = readRegularFile(file, what, max)
  let json
  try {
    json = JSON.parse(buf.toString('utf8'))
  } catch (e) {
    throw new Error(`${what}: ${file} is not readable JSON (${e.message})`)
  }
  const list = problems(json, schema, what, { referenceKinds })
  if (list.length) throw refusal(what, file, list)
  return json
}

// ── shared forms ───────────────────────────────────────────────────────────────────────────────────
const ID = str({ re: /^[\w.-]+$/ })
const strs = arr(str())
const count = int()
// LENSES is read when a value is checked, not when this module loads: contract.mjs reaches this module through visual-qa
const LENS = (v, p) => str({ oneOf: LENSES })(v, p)
const CONSUMER = (v, p) => str({ oneOf: [...LENSES, 'reviewer'] })(v, p)
export const CONSUMERS = arr(CONSUMER, { min: 1, key: (x) => x })
const STATUS = ['open', 'done', 'skipped', 'lee', 'closed', 'reopened']
const SUMMARY = obj({ req: { total: count, covered: count, uncovered: strs } })
const INTERACTION_ATTESTATION = obj({ req: { ok: bool(), problems: strs } })

// ── the fast-gate plan (fast-gate.mjs resolveFastGate) ─────────────────────────────────────────────
const CASE = obj({
  req: { page: str({ min: 1 }), path: str(), locale: str(), layout: nullable(str()), family: nullable(str()), stages: arr(str({ min: 1 }), { min: 1, key: (x) => x }), variants: arr(str({ min: 1 }), { min: 1, key: (x) => x }), states: strs, why: strs }
})
export const PLAN = refine(
  obj({
    req: {
      schemaVersion: lit(1),
      scope: lit('fast-gate'),
      cases: arr(CASE, { min: 1, key: (c) => c?.page }),
      coverage: obj({ req: { components: SUMMARY, families: SUMMARY, states: SUMMARY, stages: SUMMARY, locales: obj({ req: { total: count, covered: count, risks: dict(strs) } }), layouts: obj({ req: { total: count, covered: count } }) } }),
      fullOnly: obj({ req: { layouts: strs, pages: strs, states: strs, components: strs } }),
      axes: obj({ req: { fast: count, full: count } }),
      ratio: num(),
      nearFull: bool(),
      notes: strs,
      errors: strs
    }
  }),
  (plan, p) => (plan.errors.length ? [`${p}.errors must be empty — a plan with errors was never a runnable plan (${plan.errors[0]})`] : [])
)

// ── visual.json (report.mjs writeRun) ──────────────────────────────────────────────────────────────
const FINDING = obj({ req: { kind: str({ min: 1 }) }, open: true })
const COVERAGE = obj({ req: { examined: int(), classified: anyOf(int(), arr(free())), unclassified: arr(free()) }, open: true })
// the header-menu record (menu-open.mjs measureMenus + visual-qa measureAxis), one closed form per way it is written:
// skipped (`{ measured: false, reason }`), read (site and source censuses, the pairs and their rows) or failed part-way (a reason, the censuses it reached)
const CLIPPED = anyOf(lit(false), obj({ req: { px: num(), items: count } }))
const MENU_SIDE = anyOf(
  obj({ req: { opened: lit(true), via: nullable(str()), rect: free(), surface: free(), items: free(), moreItems: free(), screenshot: nullable(str()), clipped: CLIPPED, closed: free() }, opt: { screenshotError: str() } }),
  obj({ req: { opened: lit(false), reason: str(), closed: free() }, opt: { via: str(), static: lit(true) } })
)
// a source whose control was reached and pressed and showed nothing (menu-open.mjs `sourceStatic`): a measured fact, not a finding;
// `covered` is the other page of the contract where the same menu opened on the source (visual-qa settles it), null until then
const STATIC_FACT = obj({
  req: { key: str(), trigger: str(), scripts: count, toggle: str({ min: 1 }), outcome: obj({ req: { hover: str({ min: 1 }), click: str({ min: 1 }) } }), covered: nullable(obj({ req: { page: str({ min: 1 }), variant: str({ min: 1 }) } })) }
})
const MENU_ROW = obj({ req: { trigger: str(), key: str(), by: str(), source: MENU_SIDE, site: MENU_SIDE, findings: count }, opt: { labels: free(), truncated: free(), picture: free() } })
const CENSUS = obj({ req: { headers: free(), triggers: count, openAtRest: free(), overCap: free(), labels: strs, drawers: count, kinds: strs } })
const RECORD_BASE = { pairs: count, menus: arr(MENU_ROW), unmatched: arr(free()), notMeasured: arr(free()), ms: count }
const MENUS = (v, p) => {
  if (!isObj(v)) return [`${p} must be an object (got ${show(v)})`]
  const m = bool()(v.measured, `${p}.measured`)
  if (m.length) return m
  const opt = { profile: str(), sourceStatic: arr(STATIC_FACT) }
  if (v.targetOnly === true && v.measured === false) return obj({
    req: { measured: lit(false), targetOnly: lit(true), reason: str({ min: 1 }), site: nullable(CENSUS), source: lit(null), pairs: lit(0), menus: arr(obj({ req: { trigger: str(), key: str(), site: MENU_SIDE, findings: count } })), unmatched: arr(free()), notMeasured: arr(free()), ms: count,
      comparison: obj({ req: { check: lit('menu-comparison'), status: lit('not-applicable'), reason: lit('reference.kind=none') } }) }, opt
  })(v, p)
  if (v.targetOnly === true) return obj({
    req: { measured: lit(true), targetOnly: lit(true), site: CENSUS, source: lit(null), pairs: lit(0), menus: arr(obj({ req: { trigger: str(), key: str(), site: MENU_SIDE, findings: count } })), unmatched: arr(free()), notMeasured: arr(free()), ms: count,
      comparison: obj({ req: { check: lit('menu-comparison'), status: lit('not-applicable'), reason: lit('reference.kind=none') } }) }, opt
  })(v, p)
  if (v.measured === false && !Object.hasOwn(v, 'site')) return obj({
    req: { measured: lit(false), reason: str({ min: 1 }) },
    opt: { comparison: obj({ req: { check: lit('menu-comparison'), status: lit('source-unavailable'), reason: lit(imageReferenceReason) } }) }
  })(v, p)
  if (v.measured === false) return refine(obj({ req: { measured: lit(false), reason: str({ min: 1 }), site: nullable(CENSUS), source: nullable(CENSUS), ...RECORD_BASE }, opt }), (m, at) => m.pairs === 0 ? [] : [`${at}.pairs must be 0 when measured is false (got ${show(m.pairs)})`])(v, p)
  return obj({ req: { measured: lit(true), site: CENSUS, source: CENSUS, ...RECORD_BASE }, opt })(v, p)
}
// an axis ends in one of two shapes: measured (coverage and findings of the readings) or lost to an axis-error (a finding and nothing else to read)
const AXIS_BASE = { variant: str({ min: 1 }), width: int({ min: 1 }), theme: str({ oneOf: ['light', 'dark'] }), components: arr(free()), findings: arr(FINDING), accepted: arr(free()), scans: obj({ open: true }), measured: str({ oneOf: ['now', 'reused'] }), stage: ID }
// the picture fields the index projects from (shotProjection): each is typed, a mistyped one is a refusal and never a skipped picture
const AXIS_OPT = {
  reusedFrom: str(), sourceScreenshot: nullable(str()), retry: obj({ open: true }),
  sourceConsumers: nullable(CONSUMERS), tiles: strs, sourceTiles: strs,
  notApplicable: arr(obj({ req: { check: str({ oneOf: SOURCE_DEPENDENT_CHECKS }), status: lit('not-applicable'), reason: lit('reference.kind=none') } }), { key: (x) => x?.check }),
  tilesCoverPicture: bool(), sourceTilesCoverPicture: bool(), sourceShotMissing: str()
}
const LOST_PICTURE = { layout: nullable(str()), screenshot: nullable(str()), shotConsumers: nullable(CONSUMERS) }
const PICTURE_REQ = { layout: nullable(str()), screenshot: nullable(str()), shotConsumers: nullable(CONSUMERS) }
// the picture fields come in pairs the writers keep together: a picture has its consumers, its tiles and whether they cover it; a source picture the rules
// asked for and the run could not write is `sourceShotMissing`, never a picture too
function pictureProblems(v, p, lost) {
  const out = []
  if (typeof v.screenshot === 'string') {
    if (!Array.isArray(v.shotConsumers)) out.push(`${p}.shotConsumers is missing (a picture has the lenses that consume it)`)
    if (!Array.isArray(v.tiles)) out.push(`${p}.tiles is missing (a picture has its tiles)`)
    if (typeof v.tilesCoverPicture !== 'boolean') out.push(`${p}.tilesCoverPicture is missing`)
  } else {
    if (!lost && v.shotConsumers !== null) out.push(`${p}.shotConsumers must be null when the axis has no picture (got ${show(v.shotConsumers)})`)
    for (const k of ['tiles', 'tilesCoverPicture']) if (v[k] !== undefined) out.push(`${p}.${k} must be absent when the axis has no picture`)
  }
  if (typeof v.sourceScreenshot === 'string') {
    if (!Array.isArray(v.sourceConsumers)) out.push(`${p}.sourceConsumers is missing (a source picture has the lenses that consume it)`)
    if (!Array.isArray(v.sourceTiles)) out.push(`${p}.sourceTiles is missing (a source picture has its tiles)`)
    if (typeof v.sourceTilesCoverPicture !== 'boolean') out.push(`${p}.sourceTilesCoverPicture is missing`)
    if (v.sourceShotMissing !== undefined) out.push(`${p}.sourceShotMissing must be absent when the source picture exists`)
  } else {
    for (const k of ['sourceTiles', 'sourceTilesCoverPicture']) if (v[k] !== undefined) out.push(`${p}.${k} must be absent when the axis has no source picture`)
  }
  return out
}
const axisSchema = (priorRun) => (v, p) => {
  if (!isObj(v)) return [`${p} must be an object (got ${show(v)})`]
  const lost = Array.isArray(v.findings) && v.findings.some((f) => f?.kind === 'axis-error')
  // a measured axis owes its coverage, its menu record and its picture fields (measureAxis writes them on every path that ends in a reading); only a lost axis has none
  // a run read only to be reused (`priorRun`) may predate the menu record: reuse selection measures such an axis again, it never copies it
  const req = lost ? AXIS_BASE : { ...AXIS_BASE, ...PICTURE_REQ, coverage: COVERAGE, ...(priorRun ? {} : { menus: MENUS }) }
  const out = obj({ req, opt: lost ? { ...AXIS_OPT, ...LOST_PICTURE } : priorRun ? { ...AXIS_OPT, menus: MENUS } : AXIS_OPT, open: true })(v, p)
  if (!out.length) out.push(...pictureProblems(v, p, lost))
  if (lost) {
    if (v.findings.length !== 1) out.push(`${p}.findings of a lost axis is the one axis-error and nothing else (got ${v.findings.length})`)
    for (const k of ['coverage', 'menus']) if (v[k] !== undefined) out.push(`${p}.${k} must be absent from an axis lost to an axis-error (got ${show(v[k])})`)
    if (v.measured === 'reused') out.push(`${p}.measured must be "now" for an axis lost to an axis-error`)
  }
  if (v.measured === 'reused' && typeof v.reusedFrom !== 'string') out.push(`${p}.reusedFrom is missing (a reused axis names the run it came from)`)
  return out
}
// a page's copy of its axes' findings (visual-qa: `{...finding, axis: variant}`)
const FINDING_COPY = obj({ req: { kind: str({ min: 1 }), axis: str({ min: 1 }) }, open: true })
const pageSchema = (priorRun) => obj({
  req: { id: str({ min: 1 }), hash: str({ min: 1 }), axes: arr(axisSchema(priorRun), { key: (a) => a?.variant }), findings: arr(FINDING_COPY) },
  opt: { path: str(), layout: nullable(str()), referenceKind: nullable(str({ oneOf: ['html', 'url', 'image', 'none'] })), hashParts: obj({ open: true }) }
})
const STAGE_STATUS = ['pass', 'fail', 'not-run', 'skipped']
const STAGE = obj({ req: { id: ID, status: str({ oneOf: STAGE_STATUS }), variants: arr(str({ min: 1 }), { key: (x) => x }), pages: count, axes: count, findings: count, reused: count }, opt: { reason: str() } })
const IDENTITY = obj({
  req: { contractHash: str({ min: 1 }) },
  opt: { contractPath: str(), canonical: bool(), sourceHash: nullable(str()), referenceHash: nullable(str()), seedReportHash: nullable(str()), artifactHash: nullable(str()), group: nullable(str()), stale: strs, capturedAt: str() }
})
const VISUAL_SUMMARY = obj({
  req: { findings: count, pages: count, axes: count, reused: count },
  opt: {
    components: count, distinct: count, unclassified: count, accepted: count, sourceMatched: count, retried: count, retryRecovered: count,
    retriedAxes: strs, motionUnhandled: strs, failedPages: strs, notApplicable: dict(count), menus: obj({ open: true }), pendingLee: count, stages: dict(str()), stale: strs, intrinsic: obj({ open: true }), interaction: obj({ open: true })
  }
})
const INTRINSIC_CLAIM = obj({
  req: { status: str({ min: 1 }) },
  opt: { reason: str(), file: str(), sourceRead: bool(), widths: arr(int({ min: 1 })), routes: count, measured: count, siteOnly: count, shared: count, sourceFixed: count, errors: count }
})
// the verdict inputs a run records (visual-qa verdictInputs): compared key by key on reuse, so they stay open; the two a verdict reads are typed
const INPUTS = obj({ opt: { theme: bool(), patternsMap: anyOf(lit(false), obj({ req: { file: str({ min: 1 }), sha256: str({ min: 1 }) } })) }, open: true })
const SCOPE = (v, p) => {
  if (!isObj(v)) return [`${p} must be an object (got ${show(v)})`]
  const kind = str({ oneOf: ['full', 'fast-gate', 'targeted-debug'] })(v.kind, `${p}.kind`)
  if (kind.length) return kind
  if (v.kind === 'fast-gate') return obj({ req: { kind: lit('fast-gate'), plan: PLAN } })(v, p)
  if (v.kind === 'full') return obj({ req: { kind: lit('full'), plan: lit(null) } })(v, p)
  return obj({ req: { kind: lit('targeted-debug'), plan: lit(null), pages: arr(str({ min: 1 }), { min: 1 }) } })(v, p)
}
const visualSchema = (priorRun) => refine(
  obj({
    req: { scope: SCOPE, identity: IDENTITY, stages: arr(STAGE, { min: 1, key: (s) => s?.id }), summary: VISUAL_SUMMARY, pages: arr(pageSchema(priorRun), { key: (x) => x?.id }) },
    opt: {
      schemaVersion: lit(1),
      at: str(),
      site: str(),
      sourceSite: nullable(str()),
      contract: str(),
      fastGate: nullable(obj({ open: true })),
      method: str(),
      inputs: nullable(INPUTS),
      browser: nullable(obj({ open: true })),
      selectors: obj({ open: true }),
      intrinsic: nullable(INTRINSIC_CLAIM),
      interaction: obj({ req: { status: str({ min: 1 }), blocking: count }, opt: { reason: str(), tool: str(), file: str(), pages: count, checks: strs, examined: count, findings: count, advisory: count, notMeasured: count, coverage: INTERACTION_ATTESTATION } })
    }
  }),
  (v, p) => {
    const out = []
    const stageRows = new Map(v.stages.map((s) => [s.id, s]))
    const naTotals = Object.fromEntries(SOURCE_DEPENDENT_CHECKS.map((check) => [check, 0]))
    const hasNonePage = v.pages.some((page) => checkApplicability(page.referenceKind, 'menu-comparison') === 'not-applicable')
    for (const page of v.pages) for (const axis of page.axes ?? []) {
      const sourceIndependent = checkApplicability(page.referenceKind, 'menu-comparison') === 'not-applicable'
      const na = axis.notApplicable ?? []
      if (na.length && !sourceIndependent) out.push(`${p}.pages.${page.id}: not-applicable evidence is only valid for reference.kind=none`)
      if (sourceIndependent) {
        const got = new Set(na.map((x) => x.check))
        for (const check of SOURCE_DEPENDENT_CHECKS) {
          if (!got.has(check)) out.push(`${p}.pages.${page.id}/${axis.variant}: missing not-applicable check ${check}`)
          else naTotals[check]++
        }
        const lost = axis.findings?.some((f) => f.kind === 'axis-error')
        if (!lost && axis.menus?.targetOnly !== true) out.push(`${p}.pages.${page.id}/${axis.variant}: target menu capture is missing for reference.kind=none`)
      }
      if (axis.menus?.targetOnly === true && !sourceIndependent) out.push(`${p}.pages.${page.id}/${axis.variant}: target-only menus are only valid for reference.kind=none`)
      if (axis.menus?.comparison?.status === 'source-unavailable' && (page.referenceKind !== 'image' || axis.menus.comparison.reason !== imageReferenceReason)) out.push(`${p}.pages.${page.id}/${axis.variant}: source-unavailable menu comparison is only valid for reference.kind=image`)
    }
    if (hasNonePage && !v.summary.notApplicable) out.push(`${p}.summary.notApplicable is missing for reference.kind=none pages`)
    if (v.summary.notApplicable) {
      for (const check of Object.keys(v.summary.notApplicable)) if (!Object.hasOwn(naTotals, check)) out.push(`${p}.summary.notApplicable has unknown check ${check}`)
      for (const check of SOURCE_DEPENDENT_CHECKS) if (v.summary.notApplicable[check] !== naTotals[check]) out.push(`${p}.summary.notApplicable.${check} is ${v.summary.notApplicable[check] ?? '(missing)'}, but the axes hold ${naTotals[check]}`)
    }
    const plan = v.scope.plan
    // a variant runs in ONE stage: two stage rows listing it would let an axis in the first satisfy the second's obligation
    const homeOf = new Map()
    for (const st of v.stages) for (const vr of st.variants) homeOf.set(vr, [...(homeOf.get(vr) ?? []), st.id])
    for (const [vr, ids] of homeOf) if (ids.length > 1) out.push(`${p}.stages variant ${show(vr)} is assigned to ${ids.length} stages (${ids.join(', ')}); a variant runs in one stage`)
    const stageOfVariant = (id) => v.stages.filter((s) => s.variants.includes(id))
    // the plan is the inventory: each case names the stages its variants run in, and every planned (page, variant) has its axis
    for (const c of plan?.cases ?? []) {
      for (const s of c.stages) if (!stageRows.has(s)) out.push(`${p}.scope.plan.cases ${c.page} names stage ${show(s)} the run does not have`)
      const owed = new Set()
      for (const vr of c.variants) {
        const home = stageOfVariant(vr)
        if (!home.length) out.push(`${p}.scope.plan.cases ${c.page} names variant ${show(vr)}, which no stage of the run measures`)
        for (const st of home) owed.add(st.id)
      }
      for (const s of c.stages) if (!owed.has(s)) out.push(`${p}.scope.plan.cases ${c.page} lists stage ${show(s)}, which none of its variants runs in`)
      for (const s of owed) if (!c.stages.includes(s)) out.push(`${p}.scope.plan.cases ${c.page} runs a variant in stage ${show(s)} and does not list it`)
      const pg = v.pages.find((x) => x.id === c.page)
      for (const vr of c.variants) {
        const home = stageOfVariant(vr)
        const ran = home.some((st) => st.status === 'pass' || st.status === 'fail')
        const axis = pg?.axes.find((a) => a.variant === vr)
        if (ran && !axis) out.push(`${p}.pages ${c.page}/${vr} has no axis, which the plan owes in stage ${home.map((st) => st.id).join(', ')}`)
        if (axis && !home.some((st) => st.id === axis.stage)) out.push(`${p}.pages ${c.page}/${vr} is measured in stage ${show(axis.stage)}, which does not run that variant`)
      }
    }
    let axes = 0
    let found = 0
    let reused = 0
    const perStage = new Map(v.stages.map((s) => [s.id, { pages: 0, axes: 0, findings: 0, reused: 0 }]))
    for (const pg of v.pages) {
      const c = plan?.cases.find((x) => x.page === pg.id)
      if (plan && pg.axes.length && !c) out.push(`${p}.pages ${pg.id} has axes but the plan has no case for it`)
      const seenStage = new Set()
      const copies = []
      for (const a of pg.axes) {
        axes++
        found += a.findings.length
        if (a.measured === 'reused') reused++
        for (const f of a.findings) copies.push(JSON.stringify({ ...f, axis: a.variant }))
        const t = perStage.get(a.stage)
        if (!t) out.push(`${p}.pages ${pg.id}/${a.variant} names stage ${show(a.stage)} the run does not have`)
        else {
          if (!seenStage.has(a.stage)) t.pages++
          seenStage.add(a.stage)
          t.axes++
          t.findings += a.findings.length
          if (a.measured === 'reused') t.reused++
          if (!stageRows.get(a.stage).variants.includes(a.variant)) out.push(`${p}.pages ${pg.id}/${a.variant} is not a variant of stage ${show(a.stage)}`)
          if (c && !c.stages.includes(a.stage)) out.push(`${p}.pages ${pg.id}/${a.variant} is measured in stage ${show(a.stage)}, which its plan case does not run`)
        }
        if (c && !c.variants.includes(a.variant)) out.push(`${p}.pages ${pg.id}/${a.variant} is not a variant its plan case measures`)
      }
      // the page's copy of the findings is the axes' findings, row for row
      const have = pg.findings.map((f) => JSON.stringify(f)).sort()
      if (JSON.stringify(have) !== JSON.stringify(copies.sort())) out.push(`${p}.pages ${pg.id}.findings (${pg.findings.length}) are not the findings of its axes (${copies.length})`)
    }
    // a total that disagrees with the rows is a contradiction, never a number to trust: `findings: 0` over a finding hid it
    if (v.summary.findings !== found) out.push(`${p}.summary.findings is ${v.summary.findings} but the axes hold ${found} finding(s)`)
    if (v.summary.axes !== axes) out.push(`${p}.summary.axes is ${v.summary.axes} but the run holds ${axes} axis(es)`)
    if (v.summary.reused !== reused) out.push(`${p}.summary.reused is ${v.summary.reused} but the run holds ${reused} reused axis(es)`)
    if (v.summary.pages !== v.pages.length) out.push(`${p}.summary.pages is ${v.summary.pages} but the run holds ${v.pages.length} page(s)`)
    for (const st of v.stages) {
      const t = perStage.get(st.id)
      for (const k of ['pages', 'axes', 'findings', 'reused']) if (st[k] !== t[k]) out.push(`${p}.stages ${st.id}.${k} is ${st[k]} but its axes hold ${t[k]}`)
    }
    return out
  }
)

export const VISUAL = visualSchema(false)
/** visual.json read as an earlier run to reuse: the same schema, but an axis may predate the header-menu record (it is measured again). */
export const VISUAL_PRIOR = visualSchema(true)

// ── index.json (report.mjs shotIndex) ──────────────────────────────────────────────────────────────
const SIDE = str({ oneOf: ['site', 'source'] })
const MEASURED = anyOf(bool(), str())
const SHOT_BASE = { layout: nullable(str()), page: str({ min: 1 }), variant: str({ min: 1 }), stage: nullable(str()), side: SIDE, hash: str({ min: 1 }) }
const SHOT = obj({ req: { ...SHOT_BASE, file: str({ min: 1 }), tiles: strs, tilesCoverPicture: bool(), consumers: CONSUMERS }, opt: { measured: MEASURED } })
const MISSING = obj({ req: { layout: nullable(str()), page: str({ min: 1 }), variant: str({ min: 1 }), stage: nullable(str()), side: SIDE, reason: str({ min: 1 }) }, opt: { measured: MEASURED } })
const MENU_SHOT = obj({
  req: { ...SHOT_BASE, state: lit('menu-open'), trigger: str(), file: str({ min: 1 }), via: nullable(str()), clipped: CLIPPED, consumers: CONSUMERS },
  opt: { measured: MEASURED }
})
const MENU_MISSING = obj({ req: { layout: nullable(str()), page: str({ min: 1 }), variant: str({ min: 1 }), stage: nullable(str()), state: lit('menu-open'), trigger: str(), side: SIDE, reason: str({ min: 1 }) }, opt: { measured: MEASURED } })
export const INDEX = obj({
  req: { shots: arr(SHOT), missing: arr(MISSING), menuShots: arr(MENU_SHOT), menuMissing: arr(MENU_MISSING) },
  opt: { at: str(), site: str(), sourceSite: nullable(str()), scope: str() }
})

/**
 * The pictures a run's axes produced, as index.json lists them (report.mjs writes this and only this): site and source shots,
 * source pictures the rules asked for and the run could not write, and the header-menu pictures and their absences. `out` is
 * the run folder; a reused axis's paths are relative to the run it came from. The ONE projection of axes to index rows:
 * the writer calls it, and the gate recomputes it to hold the file to it.
 */
export function shotProjection({ pages, out, stageOf = () => null }) {
  const shots = []
  const missing = []
  const menuShots = []
  const menuMissing = []
  for (const p of pages)
    for (const a of p.axes) {
      const base = a.measured === 'reused' ? a.reusedFrom : out
      const stage = a.stage ?? stageOf(a.variant) ?? null
      const abs = (rel) => path.resolve(base, rel)
      if (a.screenshot) shots.push({ layout: a.layout ?? null, page: p.id, variant: a.variant, stage, side: 'site', file: abs(a.screenshot), tiles: a.tiles.map(abs), tilesCoverPicture: a.tilesCoverPicture, consumers: a.shotConsumers, hash: p.hash, measured: a.measured })
      if (a.sourceScreenshot) shots.push({ layout: a.layout ?? null, page: p.id, variant: a.variant, stage, side: 'source', file: abs(a.sourceScreenshot), tiles: a.sourceTiles.map(abs), tilesCoverPicture: a.sourceTilesCoverPicture, consumers: a.sourceConsumers, hash: p.hash, measured: a.measured })
      // A source picture the contract asks for and the run could not write: listed with the reason,
      // so a lens knows it has no same-mode source rather than reaching for another picture.
      else if (a.sourceShotMissing) missing.push({ layout: a.layout ?? null, page: p.id, variant: a.variant, stage, side: 'source', reason: a.sourceShotMissing, measured: a.measured })
      // Pictures of the header menus captured open: their own list, so a lens that takes the page's
      // picture by (page, variant, side) from `shots` never takes a panel instead.
      for (const row of a.menus?.measured ? a.menus.menus : [])
        for (const side of a.menus.targetOnly && checkApplicability('none', 'menu-comparison') === 'not-applicable' ? ['site'] : ['site', 'source']) {
          const x = row[side]
          // a source that cannot open the menu is a fact recorded beside the row, not a picture the run failed to write
          if (side === 'source' && x?.static) continue
          if (x?.screenshot) menuShots.push({ layout: a.layout ?? null, page: p.id, variant: a.variant, stage, state: 'menu-open', trigger: row.trigger, side, file: abs(x.screenshot), via: x.via, clipped: x.clipped, consumers: ['reviewer'], hash: p.hash, measured: a.measured })
          else menuMissing.push({ layout: a.layout ?? null, page: p.id, variant: a.variant, stage, state: 'menu-open', trigger: row.trigger, side, reason: x?.opened ? `the picture could not be written: ${x.screenshotError ?? 'no picture'}` : (x?.reason ?? 'not captured'), measured: a.measured })
        }
    }
  return { shots, missing, menuShots, menuMissing }
}

// a row compared as data: key order never matters, an absent field and an undefined one are the same
export const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : isObj(v) ? `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null')

/**
 * index.json against the axes that produced it, in both directions: a row the axes do not produce (added, changed, replaced
 * consumers) and a row they do produce that the file lacks (deleted: its lens obligation would go with it) are each a refusal.
 * Returns the refusals; `projection` is what the file owes, the only place a gate reads lens obligations from.
 */
export function indexInventory(index, visual, runDir, file = 'index.json') {
  const want = shotProjection({ pages: visual.pages, out: path.resolve(runDir) })
  const out = []
  for (const field of ['shots', 'missing', 'menuShots', 'menuMissing']) {
    const have = new Map()
    for (const r of index[field]) have.set(canon(r), (have.get(canon(r)) ?? 0) + 1)
    const label = (r) => `${r.page}/${r.variant} (${r.side}${r.trigger === undefined ? '' : `, ${r.trigger}`})`
    for (const r of want[field]) {
      const k = canon(r)
      if (have.get(k)) have.set(k, have.get(k) - 1)
      else out.push(`${file}: ${field} row ${label(r)} is not as the run's axes produce it (missing, or its path, tiles, hash or consumers differ)`)
    }
    for (const r of index[field]) {
      const k = canon(r)
      if (have.get(k)) {
        have.set(k, have.get(k) - 1)
        out.push(`${file}: ${field} row ${label(r)} is not produced by the run's axes`)
      }
    }
  }
  return { refusals: out, projection: want }
}

/**
 * An index row of a fast-gate run is bound to the plan: its page is a case, its variant one the case measures, its stage the
 * one that variant runs in, its layout the case's. A row of anything else is a picture of nothing the run owed.
 */
export function indexBinding(index, visual, file = 'index.json') {
  const out = []
  const plan = visual.scope.plan
  if (!plan) return out
  for (const [field, list] of [['shots', index.shots], ['missing', index.missing], ['menuShots', index.menuShots], ['menuMissing', index.menuMissing]])
    for (const r of list) {
      const at = `${file}: ${field} row ${r.page}/${r.variant} (${r.side})`
      const c = plan.cases.find((x) => x.page === r.page)
      if (!c) out.push(`${at} is of a page the plan has no case for`)
      else {
        if (!c.variants.includes(r.variant)) out.push(`${at} is of a variant its plan case does not measure`)
        else if (!visual.stages.some((st) => st.id === r.stage && st.variants.includes(r.variant))) out.push(`${at} names stage ${show(r.stage)}, which does not run that variant`)
        if ((r.layout ?? null) !== c.layout) out.push(`${at} names layout ${show(r.layout)}, its plan case is ${show(c.layout)}`)
      }
    }
  return out
}

// ── notes/machine.json (report.mjs machineNotes + intrinsicNotes) ──────────────────────────────────
const MACHINE_ROW = obj({
  req: { id: str({ re: /^M\d+$/ }), lens: str({ min: 1 }), page: str(), layout: nullable(str()), axis: str(), stage: nullable(str()), what: str(), fix: str(), verify: str(), status: lit('open') }
})
export const MACHINE = arr(MACHINE_ROW, { key: (r) => r?.id })

// ── NOTES-<stage>.json (notes.mjs mergeRun) ────────────────────────────────────────────────────────
const TODO = obj({
  req: { id: str({ re: /^[MN]-[0-9a-f]{6}$/ }), lenses: arr(str({ min: 1 }), { min: 1 }), page: str(), layout: str(), axis: str(), what: str(), where: str(), fix: str(), verify: str(), flag: str({ oneOf: ['', 'LEE', 'SOURCE'] }), status: str({ oneOf: STATUS }) },
  opt: { fixNote: str(), fixRank: int(), closeNote: str() }
})
const FILE_LENS = obj({ req: { file: str({ min: 1 }), lens: LENS } })
const COUNT_KEYS = [...STATUS, 'leeFlagged', 'sourceFlagged']
export const NOTES = refine(
  obj({
    req: {
      stage: ID,
      counts: obj({ req: Object.fromEntries(COUNT_KEYS.map((k) => [k, count])) }),
      lenses: arr(LENS, { key: (x) => x }),
      coverage: obj({ req: { missing: arr(FILE_LENS), extra: arr(FILE_LENS) } }),
      todos: arr(TODO, { key: (t) => t?.id })
    },
    opt: { lensWork: arr(obj({ req: { lens: str(), manifest: str(), errors: strs } })), at: str(), clusters: obj({ open: true }) }
  }),
  // a count that disagrees with the rows is a contradiction, never a number to trust: `open: 0` over an open row hid open work
  (n, p) => {
    const out = []
    for (const s of STATUS) {
      const rows = n.todos.filter((t) => t.status === s).length
      if (n.counts[s] !== rows) out.push(`${p}.counts.${s} is ${n.counts[s]} but ${rows} todo row(s) have that status`)
    }
    for (const [k, flag] of [['leeFlagged', 'LEE'], ['sourceFlagged', 'SOURCE']]) {
      const rows = n.todos.filter((t) => t.flag === flag && t.status !== 'closed').length
      if (n.counts[k] !== rows) out.push(`${p}.counts.${k} is ${n.counts[k]} but ${rows} unclosed todo row(s) carry that flag`)
    }
    return out
  }
)

// ── FAST-GATE.json (fast-gate.mjs assessFastGate) ──────────────────────────────────────────────────
const RECEIPT_CASE = obj({ req: { page: str({ min: 1 }), layout: nullable(str()), stages: arr(ID, { min: 1, key: (x) => x }), variants: arr(str({ min: 1 }), { min: 1, key: (x) => x }) } })
const RECEIPT_ORDER = {
  req: { status: str({ oneOf: ['pass', 'fail'] }), scope: lit('fast-gate'), reasons: strs, stale: strs, cases: arr(RECEIPT_CASE, { key: (c) => c?.page }), stages: arr(ID, { key: (x) => x }) },
  opt: {
    schemaVersion: lit(1),
    run: str(),
    at: str(),
    notApplicable: dict(count),
    contractHash: nullable(str()),
    pageHashes: dict(str({ min: 1 })),
    intrinsic: nullable(obj({ req: { status: str() }, opt: { siteOnly: nullable(count), shared: nullable(count), sourceFixed: nullable(count) } }))
  }
}
export const RECEIPT = refine(obj(RECEIPT_ORDER), (r, p) => {
  if (r.status === 'fail') return r.reasons.length ? [] : [`${p}.reasons must name why a failed verdict failed`]
  const out = []
  if (r.reasons.length) out.push(`${p}.reasons must be empty for a pass`)
  for (const k of ['schemaVersion', 'run', 'at', 'contractHash', 'pageHashes', 'intrinsic']) if (r[k] === undefined) out.push(`${p}.${k} is missing`)
  if (r.contractHash === null) out.push(`${p}.contractHash must be a string for a pass`)
  if (!r.cases.length) out.push(`${p}.cases must hold at least 1 item(s) for a pass`)
  if (!r.stages.length) out.push(`${p}.stages must hold at least 1 item(s) for a pass`)
  if (r.pageHashes && !Object.keys(r.pageHashes).length) out.push(`${p}.pageHashes must hold at least 1 entry for a pass`)
  // the inventories are the same set three ways: the cases, the pages hashed, the stages those cases run in
  if (r.pageHashes) {
    for (const c of r.cases) if (!Object.hasOwn(r.pageHashes, c.page)) out.push(`${p}.cases ${c.page} has no entry in pageHashes`)
    for (const id of Object.keys(r.pageHashes)) if (!r.cases.some((c) => c.page === id)) out.push(`${p}.pageHashes ${id} is a page no case measures`)
  }
  const run = new Set(r.stages)
  for (const c of r.cases) for (const s of c.stages) if (!run.has(s)) out.push(`${p}.cases ${c.page} names stage ${show(s)}, which the receipt does not list`)
  for (const s of run) if (!r.cases.some((c) => c.stages.includes(s))) out.push(`${p}.stages ${s} is a stage no case runs in`)
  if (r.stale.length) out.push(`${p}.stale must be empty for a pass`)
  // a pass stands on a probe that ran and found nothing owed by the site: the same totals a verdict recomputes
  const i = r.intrinsic
  if (i === null) out.push(`${p}.intrinsic must be the probe's result for a pass (got null)`)
  else if (i) {
    if (i.status !== 'run') out.push(`${p}.intrinsic.status must be "run" for a pass (got ${show(i.status)})`)
    if (i.siteOnly !== 0) out.push(`${p}.intrinsic.siteOnly must be 0 for a pass (got ${show(i.siteOnly)})`)
    for (const k of ['shared', 'sourceFixed']) if (!Number.isSafeInteger(i[k]) || i[k] < 0) out.push(`${p}.intrinsic.${k} must be a count for a pass (got ${show(i[k])})`)
  }
  return out
})

// ── clusters.json (cluster.mjs writeClusters): the digest notes.mjs copies; the members are data no gate reads ──
const CLUSTER_MEMBER = obj({
  req: { key: str({ min: 1 }), page: str({ min: 1 }), axis: str({ min: 1 }), list: str({ oneOf: ['findings', 'accepted'] }), index: int(), findingKey: str(), element: nullable(str()) },
  opt: { delta: int(), via: str(), unchanged: bool(), streak: int(), since: nullable(str()) }
})
const CLUSTER_ROW = obj({
  req: { id: str({ re: /^C-[0-9a-f]{8}$/ }), status: str({ oneOf: ['open', 'accepted'] }), kind: str({ min: 1 }), selector: str(), property: nullable(str()), expected: free(), observed: free(), inference: nullable(str()), viaSelectors: strs, size: int({ min: 1 }), findings: int({ min: 1 }), pages: arr(str({ min: 1 }), { min: 1 }), axes: arr(str({ min: 1 }), { min: 1 }), representative: str({ min: 1 }), unchanged: bool(), streak: int(), members: arr(CLUSTER_MEMBER, { min: 1 }) }, opt: { decision: str() }
})
const CLUSTER_TOTALS = obj({ req: Object.fromEntries(['findings', 'accepted', 'units', 'clusters', 'acceptedClusters', 'inMoreThanOneCluster', 'inferred', 'unchanged', 'compared'].map((k) => [k, count])) })
export const CLUSTERS = obj({ req: { schemaVersion: lit(1), history: bool(), totals: CLUSTER_TOTALS, clusters: arr(CLUSTER_ROW) }, opt: { at: str() } })

// ── notes/lens-work/<stage>--<lens>/manifest.json (lens-work.mjs buildLensWork) ───────────────────────
const BOUND_FILE = obj({ req: { path: str({ min: 1 }), hash: str({ min: 1 }) } })
const MANIFEST_TILE = obj({ req: { side: SIDE, file: str({ min: 1 }), hash: str({ min: 1 }) } })
const MANIFEST_GROUP = obj({
  req: { key: str({ min: 1 }), page: str({ min: 1 }), variant: str({ min: 1 }), layout: nullable(str()), reason: str({ min: 1 }), tiles: arr(MANIFEST_TILE), findings: arr(obj({ req: { lens: str(), axis: str(), what: str(), uncovered: bool() } })) },
  opt: { representative: str() }
})
const MANIFEST_ASSIGNMENT = obj({ req: { chunk: int({ min: 1 }), groups: strs, tiles: count, prompt: str({ min: 1 }), output: str({ min: 1 }) } })
export const MANIFEST = refine(
  obj({
    req: {
      id: str({ min: 1 }), schema: lit(1), kind: lit('lens-work'), run: str({ min: 1 }), stage: ID, lens: LENS, requested: int({ min: 1 }), chunks: int({ min: 1 }),
      contract: BOUND_FILE, index: BOUND_FILE, visual: BOUND_FILE,
      selection: obj({ req: { layouts: count, representatives: strs, extras: arr(obj({ req: { page: str({ min: 1 }), layout: str({ min: 1 }), representative: str({ min: 1 }), uncovered: count } })), notMeasured: strs } }),
      tiles: count, load: obj({ req: { min: num(), max: num(), maxGroup: num() } }),
      groups: arr(MANIFEST_GROUP, { key: (g) => g?.key }), assignments: arr(MANIFEST_ASSIGNMENT, { key: (a) => a?.chunk })
    },
    opt: { at: str(), recommendedModel: str() }
  }),
  (m, p) => {
    const keys = new Set(m.groups.map((g) => g.key))
    const out = []
    for (const a of m.assignments) for (const k of a.groups) if (!keys.has(k)) out.push(`${p}.assignments chunk ${a.chunk} names group ${show(k)}, which the manifest does not have`)
    return out
  }
)

/**
 * A passing receipt against the fast-gate plan the contract resolves to NOW: the same cases, each with the same layout, stages and
 * variants, and the same stages — a self-consistent receipt of a subset (or of an older plan) authorizes nothing. Own keys only.
 */
export function receiptAgainstPlan(receipt, plan, file = 'FAST-GATE.json') {
  const out = []
  const sorted = (l) => [...l].sort()
  const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
  const have = new Map(receipt.cases.map((c) => [c.page, c]))
  const want = new Map(plan.cases.map((c) => [c.page, c]))
  for (const [id, c] of want) {
    const r = have.get(id)
    if (!r) out.push(`${file}: the plan owes case ${id} and the receipt does not hold it`)
    else {
      if (r.layout !== c.layout) out.push(`${file}: case ${id} has layout ${show(r.layout)}, the plan says ${show(c.layout)}`)
      if (!same(r.stages, c.stages)) out.push(`${file}: case ${id} has stages ${show(r.stages)}, the plan says ${show(c.stages)}`)
      if (!same(r.variants, c.variants)) out.push(`${file}: case ${id} has variants ${show(r.variants)}, the plan says ${show(c.variants)}`)
    }
  }
  for (const id of have.keys()) if (!want.has(id)) out.push(`${file}: case ${id} is not in the plan`)
  const stages = new Set(plan.cases.flatMap((c) => c.stages))
  if (!same(receipt.stages, [...stages])) out.push(`${file}: stages ${show(receipt.stages)} are not the plan's ${show([...stages])}`)
  return out
}

// ── spec-pack sections.json (section id → type) ────────────────────────────────────────────────────
// ingest writes three row kinds, each closed: `custom` (mod_custom / footer columns / page sections: `sectionType` is a type or
// null for a non-page module), `acm` (a typed module: it has `type`, no `sectionType`) and `other` (a module kept as its params).
const SECTION_ID = str({ min: 1 })
const SECTION_TYPE = nullable(str({ min: 1 }))
const SPACING = obj({ req: { top: nullable(str()), bottom: nullable(str()) } })
const PAGES = arr(anyOf(str({ min: 1 }), obj({ open: true })))
const FRAME = obj({ open: true })
const ROW_BASE = { id: SECTION_ID, title: str(), position: str(), scope: str(), ordering: int({ min: -1e9 }), pages: PAGES }
const CUSTOM_ROW = obj({
  req: { ...ROW_BASE, showtitle: bool(), sectionType: SECTION_TYPE, html: str(), blocks: str(), images: arr(free()) },
  opt: { spacing: SPACING, moduleClass: str(), frame: FRAME, locale: str(), fields: free(), items: free() }
})
const ACM_ROW = obj({
  req: { id: SECTION_ID, type: str(), style: str(), title: str(), position: str(), scope: str(), published: bool(), ordering: int({ min: -1e9 }), showtitle: bool(), pages: PAGES, spacing: SPACING, moduleClass: str(), itemGroup: free(), fields: free(), items: arr(free()) },
  opt: { frame: FRAME }
})
const OTHER_ROW = obj({ req: { ...ROW_BASE, module: str(), params: free() }, opt: { frame: FRAME } })
export const SECTIONS = refine(
  obj({ req: { slotBlock: lit('tracy-base/slot'), custom: arr(CUSTOM_ROW), acm: arr(ACM_ROW), other: arr(OTHER_ROW) } }),
  (j, p) => {
    // the type map is keyed by id across the three lists: a second row of an id would silently replace the first
    const seen = new Set()
    const out = []
    for (const k of ['custom', 'acm', 'other'])
      for (const r of j[k]) {
        if (seen.has(r.id)) out.push(`${p}.${k} lists section ${show(r.id)} twice`)
        seen.add(r.id)
      }
    return out
  }
)
