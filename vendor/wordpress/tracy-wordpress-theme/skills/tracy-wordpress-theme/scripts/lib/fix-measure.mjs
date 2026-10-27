// The evidence a fix release is accepted on (`release.mjs --patch --measure <file>`): the targeted
// checks a port's own measure script ran against the restored site, in one schema —
//   {schema: 'tracy-fix-measure/v1', tool, ranAt, site, source,
//    artifact: {themeZipSha256}, checks: [{id, title, pass, cases?, defects?, rows?, note?, notMeasurable?, new?, why?}], passed, total,
//    baseline: {version, passed, total, ranAt, checks?: [{id, pass}], sourceFingerprint?} | null, notDefects: [{what, why, evidence}],
//    coverage?: {mode, explicit, carried, checks, routes, widths, heightsWidths, schemes}, sourceFingerprint?: {algorithm, url, htmlSha256, template, id}}
// `coverage` (lib/sweep-coverage.mjs) says what the sweep measured — a patch release needs a FULL run of every check over every route; `sourceFingerprint`
// (lib/source-fingerprint.mjs) says which source it measured against — a release refuses evidence whose fingerprint is not the current source's.
// A measure with neither (a port's own script) is valid as a document and never enough for a release alone.
// `defects` is a COUNT; the detail of the defects goes in `rows` (a list, one entry per defect) or `note`
// (text). `notMeasurable` lists the not-measured causes a hand measurement closed, [{cause, cases, reason, measurement, evidence}]: a check
// can pass with them, and they stay visible. A check that never ran on the previous version is declared `new: true` with a `why`; every other check
// is looked up in `baseline.checks` by id (release.mjs). `validateFixMeasure` holds the shape and its internal
// consistency (counts equal the checks, a passing check carries no defect); what a release holds the evidence to
// (the theme zip, the restored site, the restore's clock, the baseline on the previous version) is release.mjs's.
//
// Two measures of the same theme zip and site (the sweep and a port's own script) are one piece of evidence:
//   node scripts/lib/fix-measure.mjs merge <a.json> <b.json> … --out <file>
//     [--baseline-measure <earlier fix-measure.json|site-sweep.json> … --baseline-version <v>] [--new <id>=<why> …]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { mergeCoverage, validateCoverage } from './sweep-coverage.mjs'
import { validateFingerprint } from './source-fingerprint.mjs'
import { SWEEP_COMPARISON_CHECKS, SWEEP_TARGET_CHECKS } from '../visual/applicability.mjs'

export const FIX_MEASURE_SCHEMA = 'tracy-fix-measure/v1'
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const filled = (x) => typeof x === 'string' && x.trim() !== ''
const count = (x) => Number.isInteger(x) && x >= 0
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const isIso = (x) => typeof x === 'string' && ISO_RE.test(x) && Number.isFinite(Date.parse(x))
const isSite = (u) => {
  try {
    const x = new URL(u)
    return ['http:', 'https:'].includes(x.protocol) && Boolean(x.hostname) && !x.username && !x.password
  } catch {
    return false
  }
}

/** Why `m` is not a tracy-fix-measure/v1 document: a list of messages, empty when it is one. */
export function validateFixMeasure(m) {
  if (!isObj(m)) return ['the measure is not a JSON object']
  const out = []
  if (m.schema !== FIX_MEASURE_SCHEMA) out.push(`schema is ${JSON.stringify(m.schema ?? null)}, not ${FIX_MEASURE_SCHEMA}`)
  if (!filled(m.tool)) out.push('tool is empty')
  if (!isIso(m.ranAt)) out.push(`ranAt ${JSON.stringify(m.ranAt ?? null)} is not an ISO-8601 timestamp with a zone`)
  if (!isSite(m.site)) out.push(`site ${JSON.stringify(m.site ?? null)} is not an http(s) URL`)
  const noneAuthority = isObj(m.applicability) && m.applicability.version === 1 && isObj(m.applicability.binding) && Object.values(m.applicability.binding.kinds ?? {}).length > 0 && Object.values(m.applicability.binding.kinds).every((kind) => kind === 'none')
  const claimsNa = m.checks?.some((check) => check?.status === 'not-applicable') || m.applicability?.outcomes?.some((outcome) => outcome?.status === 'not-applicable')
  if (m.source !== null && !filled(m.source)) out.push('source is empty (what the site was measured against)')
  if (m.source === null && claimsNa && !noneAuthority) out.push('source-dependent N/A is claimed without an all-none applicability binding')
  if (!isObj(m.artifact) || !/^[0-9a-f]{64}$/.test(m.artifact.themeZipSha256 ?? '')) out.push('artifact.themeZipSha256 is not a hex sha256')
  if (!Array.isArray(m.checks) || !m.checks.length) out.push('checks is not a non-empty list')
  else {
    const seen = new Set()
    m.checks.forEach((c, i) => {
      const at = `checks[${i}]`
      if (!isObj(c)) return out.push(`${at} is not an object`)
      if (!filled(c.id)) out.push(`${at}.id is empty`)
      else if (seen.has(c.id)) out.push(`${at}.id ${c.id} is listed twice`)
      else seen.add(c.id)
      if (!filled(c.title)) out.push(`${at}.title is empty`)
      if (c.status !== 'not-applicable' && typeof c.pass !== 'boolean') out.push(`${at}.pass is not true or false`)
      if (c.status !== undefined && !['pass', 'fail', 'not-measured', 'not-applicable'].includes(c.status)) out.push(`${at}.status is invalid`)
      if (c.status === 'not-applicable' && Object.hasOwn(c, 'pass')) out.push(`${at} is not-applicable and must not claim pass/fail`)
      if (c.status === 'not-applicable' && (c.cases !== 0 || c.defects !== 0)) out.push(`${at} is not-applicable and must have zero measured cases and defects`)
      if (c.intermittent !== undefined && !count(c.intermittent)) out.push(`${at}.intermittent is not a count`)
      if (c.pass === true && c.intermittent > 0) out.push(`${at} passes with ${c.intermittent} intermittent group(s)`)
      if (c.cases !== undefined && !count(c.cases)) out.push(`${at}.cases is not a count`)
      if (c.defects !== undefined && !count(c.defects)) out.push(`${at}.defects is not a count${Array.isArray(c.defects) ? ' (a list was given: defects is the number, put the list in rows)' : ''}`)
      if (c.rows !== undefined && !Array.isArray(c.rows)) out.push(`${at}.rows is not a list`)
      if (c.note !== undefined && typeof c.note !== 'string') out.push(`${at}.note is not text`)
      if (c.new !== undefined && typeof c.new !== 'boolean') out.push(`${at}.new is not true or false`)
      if (c.new === true && !filled(c.why)) out.push(`${at} is declared new without a why: say why it never ran on the previous version`)
      if (c.new !== true && c.why !== undefined) out.push(`${at}.why is given on a check that is not declared new`)
      if (c.notMeasurable !== undefined) {
        if (!Array.isArray(c.notMeasurable)) out.push(`${at}.notMeasurable is not a list`)
        else
          c.notMeasurable.forEach((n, k) => {
            if (!isObj(n) || !filled(n.cause) || !count(n.cases) || !filled(n.reason) || !filled(n.measurement) || !filled(n.evidence)) out.push(`${at}.notMeasurable[${k}] is not {cause, cases, reason, measurement, evidence}`)
          })
      }
      if (c.pass === true && c.defects > 0) out.push(`${at} passes with ${c.defects} defect(s)`)
    })
    const passed = m.checks.filter((c) => c?.pass === true).length
    if (m.passed !== passed) out.push(`passed says ${JSON.stringify(m.passed ?? null)}, the checks give ${passed}`)
    if (m.total !== m.checks.length) out.push(`total says ${JSON.stringify(m.total ?? null)}, the checks give ${m.checks.length}`)
  }
  if (m.baseline !== null) {
    const b = m.baseline
    if (!isObj(b)) out.push('baseline is neither null nor an object')
    else {
      if (!filled(b.version)) out.push('baseline.version is empty')
      if (!count(b.passed) || !count(b.total)) out.push('baseline.passed and baseline.total are not counts')
      else if (b.passed > b.total) out.push(`baseline passed ${b.passed} of ${b.total}`)
      if (!isIso(b.ranAt)) out.push(`baseline.ranAt ${JSON.stringify(b.ranAt ?? null)} is not an ISO-8601 timestamp with a zone`)
      if (b.checks !== undefined) {
        if (!Array.isArray(b.checks) || !b.checks.length) out.push('baseline.checks is not a non-empty list')
        else {
          const ids = new Set()
          b.checks.forEach((c, i) => {
            if (!isObj(c) || !filled(c.id) || (c.status === 'not-applicable' ? Object.hasOwn(c, 'pass') : typeof c.pass !== 'boolean')) out.push(`baseline.checks[${i}] is not a valid measured or not-applicable outcome`)
            else if (ids.has(c.id)) out.push(`baseline.checks[${i}].id ${c.id} is listed twice`)
            else ids.add(c.id)
          })
          if (b.total !== b.checks.length) out.push(`baseline.total says ${JSON.stringify(b.total ?? null)}, baseline.checks give ${b.checks.length}`)
          const bp = b.checks.filter((c) => c?.pass === true).length
          if (b.passed !== bp) out.push(`baseline.passed says ${JSON.stringify(b.passed ?? null)}, baseline.checks give ${bp}`)
        }
      }
      if (b.applicability !== undefined && (!isObj(b.applicability) || b.applicability.version !== 1 || !isObj(b.applicability.binding) || b.applicability.binding.version !== 1 || !isObj(b.applicability.binding.kinds))) out.push('baseline.applicability is malformed')
    }
  }
  if (m.applicability !== undefined) {
    if (!isObj(m.applicability) || m.applicability.version !== 1 || !isObj(m.applicability.binding) || m.applicability.binding.version !== 1 || !isObj(m.applicability.binding.kinds) || !Array.isArray(m.applicability.outcomes)) out.push('applicability is malformed')
    else m.applicability.outcomes.forEach((x, i) => {
      const at = `applicability.outcomes[${i}]`
      if (!isObj(x) || !filled(x.check) || !filled(x.route) || !['pass', 'fail', 'not-measured', 'not-applicable'].includes(x.status)) out.push(`${at} is not a typed sweep outcome`)
      else if (x.status === 'not-applicable' && (!SWEEP_COMPARISON_CHECKS.includes(x.check) || x.reason !== 'reference.kind=none')) out.push(`${at} is not an authorized source comparison N/A`)
      else if (x.status !== 'not-applicable' && !SWEEP_TARGET_CHECKS.includes(x.check)) out.push(`${at} is not a registered target-side sweep outcome`)
    })
  }
  if (m.coverage !== undefined) out.push(...validateCoverage(m.coverage))
  if (m.sourceFingerprint !== undefined) out.push(...validateFingerprint(m.sourceFingerprint))
  if (isObj(m.baseline) && m.baseline.sourceFingerprint !== undefined) out.push(...validateFingerprint(m.baseline.sourceFingerprint).map((x) => `baseline.${x}`))
  if (!Array.isArray(m.notDefects)) out.push('notDefects is not a list')
  else
    m.notDefects.forEach((n, i) => {
      for (const k of ['what', 'why', 'evidence']) if (!isObj(n) || !filled(n[k])) out.push(`notDefects[${i}].${k} is empty`)
    })
  return out
}

/**
 * Write the measure a fix release is accepted on. `passed` and `total` are counted from the checks,
 * so a script cannot state a total its checks do not give; a document that does not validate is
 * never written. Returns the document.
 *
 * @param {string} file
 * @param {{tool: string, site: string, source: string, themeZipSha256: string, checks: object[], baseline?: object|null, notDefects?: object[], ranAt?: string, coverage?: object, sourceFingerprint?: object}} m
 */
export function writeFixMeasure(file, { tool, site, source, themeZipSha256, checks, baseline = null, notDefects = [], ranAt = new Date().toISOString(), coverage, sourceFingerprint, applicability }) {
  const doc = {
    schema: FIX_MEASURE_SCHEMA,
    tool,
    ranAt,
    site,
    source,
    artifact: { themeZipSha256 },
    checks,
    passed: Array.isArray(checks) ? checks.filter((c) => c?.pass === true).length : 0,
    total: Array.isArray(checks) ? checks.length : 0,
    baseline,
    notDefects,
    ...(coverage !== undefined && coverage !== null ? { coverage } : {}),
    ...(applicability !== undefined && applicability !== null ? { applicability } : {}),
    ...(sourceFingerprint !== undefined && sourceFingerprint !== null ? { sourceFingerprint } : {})
  }
  const problems = validateFixMeasure(doc)
  if (problems.length) throw new Error(`not a ${FIX_MEASURE_SCHEMA} document: ${problems.join('; ')}`)
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
  return doc
}

/**
 * Why a site-sweep.json (or a fix-measure.json) is not the evidence of a full run, or null: any sign of a scoped re-run is enough —
 * a run record that is not a full run, a carried group, case or check, a scoped check — whatever the other fields say.
 */
export function carriedEvidence(doc) {
  const sign = (x) => x !== null && typeof x === 'object'
  if (!sign(doc)) return null
  if (doc.run !== undefined && (!sign(doc.run) || doc.run.mode !== 'full')) return 'a scoped re-run (it carries checks it did not measure)'
  if (sign(doc.carried) && Object.keys(doc.carried).length) return 'a report that carries groups it did not measure'
  const checks = Array.isArray(doc.checks) ? doc.checks : []
  if (checks.some((c) => sign(c) && (c.carried || c.scoped || c.carriedGroups || c.carriedNotMeasured))) return 'a report with carried or scoped checks'
  // (a run narrowed by the caller is not carried evidence: it measured what it says, and a baseline may be such a run; the release gate holds the measure itself to a full run)
  if (sign(doc.coverage) && doc.coverage.carried) return 'a measure of a run that carries evidence it did not measure'
  if (sign(doc.fixMeasure)) return carriedEvidence({ ...doc.fixMeasure, run: undefined, carried: undefined })
  return null
}

/**
 * The baseline of a measure taken on the previous version, from that run's own document (a fix-measure.json, or
 * a site-sweep.json holding one as `fixMeasure`): per-check results, so a release can look each check up by id.
 * @param {object} doc @param {string} version the theme version that run measured
 */
export function baselineOf(doc, version) {
  const carriedWhy = carriedEvidence(doc)
  if (carriedWhy) throw new Error(`${carriedWhy} is not a baseline`)
  const m = doc?.schema === FIX_MEASURE_SCHEMA ? doc : doc?.fixMeasure
  if (!m || !Array.isArray(m.checks) || !m.checks.length) throw new Error(`not a ${FIX_MEASURE_SCHEMA} document (nor a site-sweep.json holding one)`)
  if (!filled(version)) throw new Error('the baseline needs the theme version it measured (--baseline-version)')
  const checks = m.checks.map((c) => ({ id: c.id, ...(c.status === 'not-applicable' ? { status: 'not-applicable' } : { ...(c.status ? { status: c.status } : {}), pass: c.pass === true }) }))
  const sourceFingerprint = m.sourceFingerprint ?? doc.sourceFingerprint
  return { version, passed: checks.filter((c) => c.pass === true).length, total: checks.length, ranAt: m.ranAt ?? doc.ranAt, checks, ...(m.applicability ? { applicability: m.applicability } : {}), ...(sourceFingerprint ? { sourceFingerprint } : {}) }
}

const siteKey = (u) => {
  try {
    const x = new URL(u)
    return `${x.origin}${x.pathname.replace(/\/+$/, '')}`
  } catch {
    return String(u)
  }
}

/**
 * Merge measures of ONE theme zip on ONE site into one document (not yet written): their checks side by side
 * (an id twice is refused, naming both measures), the earliest `ranAt` (the merged evidence is as old as its oldest check), their
 * baselines merged check by check (same version; an id in two baselines must agree), their notDefects joined.
 * `baselineMeasure` ({docs, version}) replaces the inputs' baselines with the per-check results of the previous
 * version's own runs. `declareNew` maps a check id to why it never ran on the previous version.
 * Throws an Error naming what does not merge.
 *
 * @param {object[]} docs @param {{baselineMeasure?: {docs: object[], version: string}, declareNew?: Record<string, string>}} [opts]
 */
export function mergeFixMeasures(docs, { baselineMeasure = null, declareNew = {}, names = [] } = {}) {
  const d0 = (d) => String(d?.tool ?? '?')
  if (!Array.isArray(docs) || docs.length < 2) throw new Error('merge needs at least two measures')
  docs.forEach((d, i) => {
    const bad = validateFixMeasure(d)
    if (bad.length) throw new Error(`measure ${i + 1} is not a ${FIX_MEASURE_SCHEMA} document: ${bad.slice(0, 3).join('; ')}`)
  })
  const [first] = docs
  docs.forEach((d, i) => {
    if (d.artifact.themeZipSha256 !== first.artifact.themeZipSha256) throw new Error(`measure ${i + 1} ran on theme zip ${d.artifact.themeZipSha256}, measure 1 on ${first.artifact.themeZipSha256}: different artifacts do not merge`)
    if (siteKey(d.site) !== siteKey(first.site)) throw new Error(`measure ${i + 1} measured ${d.site}, measure 1 ${first.site}: different sites do not merge`)
  })
  const checks = docs.flatMap((d) => d.checks.map((c) => ({ ...c })))
  const seen = new Map()
  const label = (i) => `measure ${i + 1} (${names[i] ? `${names[i]}, ` : ''}tool ${d0(docs[i])})`
  docs.forEach((d, i) => {
    for (const c of d.checks) {
      if (seen.has(c.id)) throw new Error(`check ${c.id} is in ${label(seen.get(c.id))} and in ${label(i)}: a check id is listed once — give the check of the port's own script an id of its own (a script that emits an \`icons\` or \`forms\` check collides with the sweep's check of that name; prefix it, e.g. \`<port>-icons\`)`)
      seen.set(c.id, i)
    }
  })
  for (const [id, why] of Object.entries(declareNew)) {
    const c = checks.find((x) => x.id === id)
    if (!c) throw new Error(`--new ${id}: no such check in the measures`)
    if (!filled(why)) throw new Error(`--new ${id}: a reason is required`)
    c.new = true
    c.why = why
  }
  const distinct = (xs) => [...new Set(xs)]
  let baseline = null
  if (baselineMeasure) {
    const parts = baselineMeasure.docs.map((d) => baselineOf(d, baselineMeasure.version))
    baseline = mergeBaselines(parts)
  } else {
    const parts = docs.map((d) => d.baseline).filter(Boolean)
    const flat = parts.find((b) => !b.checks)
    if (flat) throw new Error(`a baseline lists counts only (${flat.passed}/${flat.total} on ${flat.version}), so it cannot be merged check by check — give the earlier runs with --baseline-measure <file> … --baseline-version ${flat.version}`)
    baseline = parts.length ? mergeBaselines(parts) : null
  }
  // coverage and source: a block is kept only when the measures agree on it — several scoped runs never add up to a full one
  const prints = distinct(docs.map((d) => d.sourceFingerprint?.id).filter(Boolean))
  if (prints.length > 1) throw new Error(`the measures were taken against different sources (${prints.join(', ')}): they do not merge`)
  const coverage = mergeCoverage(docs.map((d) => d.coverage))
  const sourceFingerprint = docs.find((d) => d.sourceFingerprint)?.sourceFingerprint
  const applicabilityDocs = docs.filter((d) => d.applicability)
  if (applicabilityDocs.some((d) => JSON.stringify(d.applicability.binding) !== JSON.stringify(applicabilityDocs[0].applicability.binding)))
    throw new Error('measures with different reference applicability bindings do not merge')
  return {
    tool: distinct(docs.map((d) => d.tool)).join(' + '),
    site: first.site,
    source: docs.every((d) => d.source === null) ? null : distinct(docs.map((d) => d.source)).join(' ; '),
    themeZipSha256: first.artifact.themeZipSha256,
    checks,
    baseline,
    notDefects: docs.flatMap((d) => d.notDefects),
    ...(coverage ? { coverage } : {}),
    ...(applicabilityDocs.length ? { applicability: { ...applicabilityDocs[0].applicability, outcomes: applicabilityDocs.flatMap((d) => d.applicability.outcomes ?? []) } } : {}),
    ...(sourceFingerprint ? { sourceFingerprint } : {}),
    ranAt: docs.map((d) => d.ranAt).sort((a, b) => Date.parse(a) - Date.parse(b))[0]
  }
}

function mergeBaselines(parts) {
  const version = parts[0].version
  const byId = new Map()
  for (const b of parts) {
    if (b.version !== version) throw new Error(`baselines of different versions (${version}, ${b.version}) do not merge`)
    for (const c of b.checks) {
      const normalized = c.status === 'not-applicable' ? { id: c.id, status: c.status } : { id: c.id, ...(c.status ? { status: c.status } : {}), pass: c.pass === true }
      if (byId.has(c.id) && JSON.stringify(byId.get(c.id)) !== JSON.stringify(normalized)) {
        const before = byId.get(c.id)
        const message = before.pass !== normalized.pass
          ? `baseline check ${c.id} passed in one baseline and failed in another`
          : `baseline check ${c.id} has different outcomes in its baselines`
        throw new Error(message)
      }
      byId.set(c.id, normalized)
    }
  }
  const checks = [...byId.values()]
  const applicability = parts.filter((b) => b.applicability)
  if (applicability.some((b) => JSON.stringify(b.applicability.binding) !== JSON.stringify(applicability[0].applicability.binding)))
    throw new Error('baselines with different reference applicability bindings do not merge')
  const prints = new Set(parts.map((b) => b.sourceFingerprint?.id).filter(Boolean))
  if (prints.size > 1) throw new Error('baselines taken against different sources do not merge')
  const sourceFingerprint = parts.find((b) => b.sourceFingerprint)?.sourceFingerprint
  return { version, ...(applicability.length ? { applicability: applicability[0].applicability } : {}), ...(sourceFingerprint && parts.every((b) => b.sourceFingerprint) ? { sourceFingerprint } : {}), passed: checks.filter((c) => c.pass === true).length, total: checks.length, ranAt: parts.map((b) => b.ranAt).sort((a, b) => Date.parse(a) - Date.parse(b))[0], checks }
}

const MERGE_USAGE = 'usage: fix-measure.mjs merge <a.json> <b.json> … --out <file> [--baseline-measure <earlier fix-measure.json|site-sweep.json> … --baseline-version <v>] [--new <id>=<why> …]'

/** The `merge` command: argv after the verb → the document written. Throws Error with a message to print. */
export function mergeCommand(argv) {
  const files = []
  const o = { baselineMeasure: [], newChecks: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value\n${MERGE_USAGE}`)
      return argv[++i]
    }
    if (a === '--out') o.out = val()
    else if (a === '--baseline-measure') o.baselineMeasure.push(val())
    else if (a === '--baseline-version') o.baselineVersion = val()
    else if (a === '--new') o.newChecks.push(val())
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}\n${MERGE_USAGE}`)
    else files.push(a)
  }
  if (!o.out) throw new Error(`--out is required\n${MERGE_USAGE}`)
  if (files.length < 2) throw new Error(`merge needs at least two measures\n${MERGE_USAGE}`)
  if (o.baselineMeasure.length && !o.baselineVersion) throw new Error(`--baseline-measure needs --baseline-version <v>\n${MERGE_USAGE}`)
  if (o.baselineVersion && !o.baselineMeasure.length) throw new Error(`--baseline-version goes with --baseline-measure\n${MERGE_USAGE}`)
  const read = (f) => {
    if (!existsSync(f)) throw new Error(`${f}: no such file`)
    try {
      return JSON.parse(readFileSync(f, 'utf8'))
    } catch (e) {
      throw new Error(`${f}: not valid JSON (${e.message})`)
    }
  }
  const declareNew = {}
  for (const n of o.newChecks) {
    const at = n.indexOf('=')
    if (at < 1) throw new Error(`--new ${n}: expected <id>=<why>`)
    declareNew[n.slice(0, at)] = n.slice(at + 1)
  }
  const merged = mergeFixMeasures(files.map(read), {
    declareNew,
    names: files,
    baselineMeasure: o.baselineMeasure.length ? { docs: o.baselineMeasure.map(read), version: o.baselineVersion } : null
  })
  return writeFixMeasure(o.out, merged)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [verb, ...rest] = process.argv.slice(2)
  if (verb !== 'merge') {
    console.error(MERGE_USAGE)
    process.exit(2)
  }
  try {
    const doc = mergeCommand(rest)
    console.log(`fix-measure: merged ${doc.total} check(s), ${doc.passed} pass${doc.baseline ? `, baseline ${doc.baseline.version} ${doc.baseline.passed}/${doc.baseline.total}` : ', no baseline'} → ${rest[rest.indexOf('--out') + 1]}`)
  } catch (e) {
    console.error(`fix-measure: ${e.message}`)
    process.exit(2)
  }
}
