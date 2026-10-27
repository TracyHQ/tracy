// audit-receipt.mjs — the finish audit's receipt (`port-audit.json` written by `review/port-audit.mjs --dossier D --out`) and the
// one check every finish consumer (Fast Gate verdict, group verdict, release — full and --patch) runs on it.
//
// The audit is only a report until a consumer cannot finish without it. A consumer
//   - names its OWN dossier (never a path the receipt supplies) and reads `<dossier>/port-audit.json` from there;
//   - recomputes the hash of every bound input from its own paths: the dossier's DECISIONS.md, CMS allowlist, behaviour reviews
//     and acceptance files (an absent optional file is bound as absent: one that appears later changes the inventory), and the
//     interaction record(s) of the run it judges — a missing one is a refusal, never a skipped hash;
//   - looks at file type and size BEFORE it reads (no symlink, FIFO, directory or oversize file; a FIFO is never waited on);
//   - requires the receipt to be CLEAN (every check ok), CURRENT (not older than any bound input's mtime, nor than the run, the
//     restore or the theme it must follow) and OF THIS SITE (origin and every owed route).
// The receipt's own list of inputs is data to compare, never a list of files to open.
//
// One writer (receiptOf, used by port-audit.mjs; issueReceipt, the same for a fixture) and one checker (auditReceiptProblems).
import { createHash } from 'node:crypto'
import { closeSync, constants as FS, fstatSync, lstatSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { validateInteractionRecord } from '../visual/interaction-report.mjs'
import { bindReferenceKinds } from '../visual/applicability.mjs'

export const AUDIT_FILE = 'port-audit.json'
export const RECEIPT_SCHEMA = 'tracy-port-audit-receipt/v1'
/**
 * THE split of the audit's checks, in one place.
 *  - SITE_FACING: what a visitor can read or use on the rendered site (source-CMS wording, copy that promises behaviour, and for a
 *    visual run the interaction probe). A finding here is a defect of the port, whatever the scope.
 *  - BOOKKEEPING: the dossier's own paperwork (a decision without a declared substitution, a duplicate id, an acceptance row that
 *    cites no single decision about its key). These guard the FULL gate, where acceptance files decide which visual findings are
 *    accepted. A fix release (`scope: patch`) runs no four-tier checkpoint and accepts nothing through those files, so a measured
 *    fix must not wait for old paperwork: the classes are still computed and carried as `advisories`, but never make a patch unclean.
 */
export const SITE_FACING = Object.freeze(['cms-leftovers', 'behavior-copy'])
export const BOOKKEEPING = Object.freeze(['decisions', 'exceptions'])
export const AUDIT_CHECKS = Object.freeze([...SITE_FACING, ...BOOKKEEPING])
export const SCOPES = Object.freeze(['visual', 'patch'])
export const MAX_BOUND_BYTES = 32 * 1024 * 1024
export const MAX_AUDIT_BYTES = 16 * 1024 * 1024
const CLOCK_SKEW_MS = 5 * 60 * 1000

/** What a dossier binds, by role. The consumer's inventory is this list read in the consumer's dossier. */
export const DOSSIER_INPUTS = Object.freeze([
  { role: 'decisions', name: 'DECISIONS.md', required: true },
  { role: 'allow', name: 'cms-allow.json', required: false },
  { role: 'reviews', name: 'behavior-copy.reviews.json', required: false },
  { role: 'acceptance', name: 'design-contract.json', required: false },
  { role: 'acceptance', name: 'visual.contract.json', required: false },
  { role: 'acceptance', name: 'review.config.json', required: false },
  { role: 'acceptance', name: 'parity-accepted.json', required: false },
  { role: 'spec', name: 'page-map.json', required: false },
  { role: 'spec', name: 'reference.json', required: false }
])

export const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const isoMs = (v) => (typeof v === 'string' && ISO_RE.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null)
const bare = (r) => (String(r).length > 1 ? String(r).replace(/\/+$/, '') : String(r))
const originOrNull = (u) => {
  try {
    return new URL(String(u)).origin
  } catch {
    return null
  }
}

/** A bound input that cannot be read as what it must be: `code` is absent | unsafe | oversize | unreadable. */
export class BoundError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/**
 * The bytes of a regular file: nothing is opened that follows a final symlink, a FIFO is opened without waiting (and then
 * refused), and the size is known before a byte is read. Throws BoundError.
 */
export function readBound(file, { max = MAX_BOUND_BYTES } = {}) {
  let fd
  try {
    fd = openSync(file, FS.O_RDONLY | FS.O_NOFOLLOW | FS.O_NONBLOCK)
  } catch (e) {
    if (e.code === 'ENOENT') throw new BoundError('absent', `${file} does not exist`)
    if (e.code === 'ELOOP') throw new BoundError('unsafe', `${file} is a symbolic link, not a regular file`)
    throw new BoundError('unreadable', `${file} cannot be read (${e.code ?? e.message})`)
  }
  try {
    const st = fstatSync(fd)
    if (!st.isFile()) throw new BoundError('unsafe', `${file} is not a regular file (${st.isDirectory() ? 'a directory' : st.isFIFO() ? 'a FIFO' : 'a special file'})`)
    if (st.size > max) throw new BoundError('oversize', `${file} is ${st.size} bytes, over the ${max} bound`)
    return { bytes: readFileSync(fd), mtimeMs: st.mtimeMs, size: st.size }
  } finally {
    closeSync(fd)
  }
}

/**
 * The dossier's inventory: every bound name read in `dossier`. Each entry is `{role, name, required, state, sha256?, mtimeMs?, bytes?, message?}`
 * with state `file` | `absent` | `unsafe` | `oversize` | `unreadable`. A name that exists but is not a safe regular file is never `absent`.
 */
export function dossierInventory(dossier) {
  return DOSSIER_INPUTS.map((spec) => {
    const file = path.join(dossier, spec.name)
    try {
      const { bytes, mtimeMs } = readBound(file)
      return { ...spec, state: 'file', sha256: sha256(bytes), mtimeMs, bytes }
    } catch (e) {
      if (!(e instanceof BoundError)) throw e
      return { ...spec, state: e.code, message: e.message }
    }
  })
}

/**
 * The receipt block a report carries. `inventory` is the dossier inventory the audit read its inputs from (its bytes are the bytes
 * audited), `interaction` the hashes of the interaction records it covered, `theme` the sha of the theme zip (patch scope).
 */
export function receiptOf({ site, source = null, routes, inventory, interaction = [], theme = null, scope = 'visual', at, advisories = null }) {
  if (!SCOPES.includes(scope)) throw new Error(`audit receipt scope ${scope} is not ${SCOPES.join(' or ')}`)
  return {
    schema: RECEIPT_SCHEMA,
    scope,
    at,
    site: originOrNull(site) ?? String(site),
    source: source ? originOrNull(source) ?? String(source) : null,
    routes: [...new Set(routes.map(bare))].sort(),
    inputs: Object.fromEntries(inventory.map((e) => [e.name, e.state === 'file' ? e.sha256 : null])),
    interaction: [...interaction].sort(),
    theme,
    ...(advisories && { advisories })
  }
}

/** The checks a clean audit of `scope` has (and the ones whose failure makes it unclean): a fix release owes the site-facing ones, a visual run all of them and the probe. */
export const checksOwed = (scope) => (scope === 'patch' ? SITE_FACING : [...AUDIT_CHECKS, 'interaction'])

/** What the bookkeeping checks found, as counts: `{decisions: n, exceptions: n}` (a check that was not run is absent). */
export function advisoriesOf(checks) {
  const out = {}
  const d = checks?.decisions
  if (isObj(d)) out.decisions = Number.isFinite(d.blocking) ? d.blocking : d.ok === true ? 0 : 1
  const x = checks?.exceptions
  if (isObj(x)) out.exceptions = Array.isArray(x.errors) ? x.errors.length : x.ok === true ? 0 : 1
  return out
}

/** The WARNING a fix release prints for its bookkeeping advisories (null when there is none). */
export function advisoryWarning(advisories) {
  const d = advisories?.decisions ?? 0
  const x = advisories?.exceptions ?? 0
  if (!d && !x) return null
  return `${x} acceptance row(s) / ${d} decision(s) do not validate; a full release of this port needs migrate-port first (they do not block a fix release)`
}

/** Writes `file` atomically (a temporary file beside it, then a rename). */
export function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.tmp`
  writeFileSync(tmp, text, { flag: 'wx' })
  renameSync(tmp, file)
}

/**
 * A receipt for a dossier without running the live audit (a fixture, or a consumer's own tests): the inventory is read from the
 * dossier, every check is recorded ok unless `checks` says otherwise. Written to `<dossier>/port-audit.json` through the same
 * `receiptOf` the audit uses. Returns the report.
 */
export function issueReceipt({ dossier, site, source = null, routes, interaction = [], theme = null, scope = theme ? 'patch' : 'visual', at = new Date().toISOString(), checks = null, ok = true, mutate = null }) {
  const inventory = dossierInventory(dossier)
  const hashes = interaction.map((f) => sha256(readBound(f).bytes))
  const all = Object.fromEntries(checksOwed(scope).map((n) => [n, { ok: true }]))
  const report = {
    tool: 'port-audit/1',
    site: originOrNull(site) ?? site,
    source,
    at,
    routes: routes.map(bare),
    ok,
    blocking: ok ? 0 : 1,
    checks: { ...all, ...(checks ?? {}) },
    receipt: receiptOf({ site, source, routes, inventory, interaction: hashes, theme, scope, at })
  }
  if (scope === 'patch') {
    for (const n of BOOKKEEPING) report.checks[n] ??= { ok: true }
    report.advisories = advisoriesOf(report.checks)
    report.receipt.advisories = report.advisories
  }
  if (mutate) mutate(report)
  writeAtomic(path.join(dossier, AUDIT_FILE), `${JSON.stringify(report, null, 2)}\n`)
  return report
}

const problem = (code, message) => ({ code, message })

/**
 * Why a consumer cannot accept the finish audit of its dossier. Empty means: a clean receipt, current, of this site and routes,
 * whose every bound input hashes (from the consumer's own paths) as it did when the audit read it.
 *
 * @param {object} o
 * @param {string} o.dossier             the consumer's own dossier (the directory holding DECISIONS.md and port-audit.json)
 * @param {string} o.site                the origin the consumer measured
 * @param {(string|string[])[]} [o.routes]  the routes the consumer owes (an array is the alternative forms of one route: page-map path / seeded path)
 * @param {'visual'|'patch'} [o.scope]
 * @param {{file: string, routes?: string[]|null, source?: string|null}[]} [o.interaction]  the consumer's own interaction records (visual scope: at least one)
 * @param {string|null} [o.theme]        patch scope: the sha256 (hex, bare or tagged) of the theme zip being released
 * @param {string|null} [o.themeFile]    patch scope: that zip's path (the receipt binds the zip by hash, not by mtime)
 * @param {number|null} [o.notBefore]    ms: the receipt must not be older (the run's, or the restore's, finish)
 * @param {(file: string, read: {bytes: Buffer, mtimeMs: number, size: number}) => void} [o.onRead]
 * @returns {{problems: {code: string, message: string}[], audit: object|null}}
 */
export function auditReceiptProblems({ dossier, site, routes = [], scope = 'visual', interaction = [], theme = null, themeFile = null, notBefore = null, now = Date.now(), onRead = null }) {
  const out = []
  const P = (code, message) => out.push(problem(code, message))
  if (!dossier) return { problems: [problem('audit-missing', 'no dossier named: the finish audit (port-audit.json) is read from the consumer\'s own dossier')], audit: null }
  let st
  try {
    st = statSync(dossier)
  } catch {
    return { problems: [problem('audit-missing', `the dossier ${dossier} does not exist`)], audit: null }
  }
  if (!st.isDirectory()) return { problems: [problem('audit-missing', `the dossier ${dossier} is not a directory`)], audit: null }
  const file = path.join(dossier, AUDIT_FILE)
  let report
  let bytes
  try {
    const r = readBound(file, { max: MAX_AUDIT_BYTES })
    onRead?.(file, r)
    bytes = r.bytes
    report = JSON.parse(bytes.toString('utf8'))
  } catch (e) {
    if (e instanceof BoundError) return { problems: [problem(e.code === 'absent' ? 'audit-missing' : e.code === 'oversize' ? 'audit-oversize' : e.code === 'unsafe' ? 'audit-unsafe' : 'audit-unreadable', e.code === 'absent' ? `${file} does not exist: run port-audit.mjs --dossier ${dossier} --out ${file} (the finish audit)` : e.message)], audit: null }
    return { problems: [problem('audit-invalid', `${file} is not JSON (${String(e.message).split('\n')[0]})`)], audit: null }
  }
  const rc = report?.receipt
  if (!isObj(report) || !isObj(rc) || rc.schema !== RECEIPT_SCHEMA) return { problems: [problem('audit-invalid', `${file} carries no ${RECEIPT_SCHEMA} receipt: write it with port-audit.mjs --dossier <dossier> --out (a report written without --dossier is a report to read, not a receipt)`)], audit: null }
  const shape = []
  if (!SCOPES.includes(rc.scope)) shape.push(`scope ${JSON.stringify(rc.scope ?? null)}`)
  if (isoMs(rc.at) === null) shape.push('at is not an ISO-8601 timestamp')
  if (typeof rc.site !== 'string' || !originOrNull(rc.site)) shape.push('site is not an origin')
  if (!Array.isArray(rc.routes) || !rc.routes.every((x) => typeof x === 'string')) shape.push('routes is not a list of routes')
  if (!isObj(rc.inputs) || !Object.values(rc.inputs).every((v) => v === null || /^sha256:[0-9a-f]{64}$/.test(v))) shape.push('inputs is not {name: sha256|null}')
  if (!Array.isArray(rc.interaction) || !rc.interaction.every((v) => /^sha256:[0-9a-f]{64}$/.test(v))) shape.push('interaction is not a list of sha256')
  if (rc.advisories !== undefined && !(isObj(rc.advisories) && Object.values(rc.advisories).every((v) => Number.isInteger(v) && v >= 0))) shape.push('advisories is not {class: count}')
  if (shape.length) return { problems: [problem('audit-invalid', `${file}: the receipt is malformed — ${shape.join('; ')}`)], audit: null }
  const at = isoMs(rc.at)
  const summary = { file: path.resolve(file), sha256: sha256(bytes), at: rc.at, scope: rc.scope, site: rc.site, ...(rc.scope === 'patch' && { advisories: rc.advisories ?? {} }) }

  // clean: the audit says it ran every check and each found nothing
  if (report.ok !== true || report.blocking !== 0) P('audit-not-clean', `the finish audit is not clean (ok ${JSON.stringify(report.ok)}, blocking ${JSON.stringify(report.blocking)}): ${Object.entries(report.checks ?? {}).filter(([n, c]) => !c?.ok && (rc.scope !== 'patch' || SITE_FACING.includes(n))).map(([n]) => n).join(', ') || 'see port-audit.json'}`)
  for (const name of checksOwed(rc.scope)) {
    const c = report.checks?.[name]
    if (!isObj(c)) P('audit-not-clean', `the finish audit has no ${name} check: an audit that did not run a check is not clean`)
    else if (c.ok !== true) P('audit-not-clean', `the finish audit's ${name} check is not ok`)
  }
  if (rc.scope !== scope) P('audit-scope', `the receipt is for a ${rc.scope} finish, this consumer is a ${scope} one`)
  // current: not from the future, not older than what it must follow
  if (at > now + CLOCK_SKEW_MS) P('audit-invalid', `the receipt says it was made at ${rc.at}, later than now`)
  if (notBefore !== null && at < notBefore) P('audit-stale', `the audit was made at ${rc.at}, before the measurement it must follow (${new Date(notBefore).toISOString()}): audit again`)

  // of this site and every owed route
  if (originOrNull(site) !== rc.site) P('audit-site', `the audit is of ${rc.site}, this consumer measured ${originOrNull(site) ?? site}`)
  const have = new Set(rc.routes.map(bare))
  const absent = routes.filter((r) => ![r].flat().some((f) => have.has(bare(f)))).map((r) => [r].flat()[0])
  if (absent.length) P('audit-routes', `the audit does not cover ${absent.length} route(s) this consumer owes: ${absent.slice(0, 5).join(', ')}`)

  // every dossier input, hashed from THIS consumer's own paths
  const inventory = dossierInventory(dossier)
  const dossierFiles = new Map(inventory.filter((e) => e.state === 'file').map((e) => [e.name, e.bytes]))
  let contract = null
  try {
    if (dossierFiles.has('visual.contract.json')) contract = JSON.parse(dossierFiles.get('visual.contract.json').toString('utf8'))
  } catch {
    // A malformed contract is not a reference exemption. Its existing acceptance checks report any contract error.
  }
  const contractPages = contract?.pages ?? []
  let referenceKinds = null
  let referenceBindingAttempted = false
  const bindReferenceKindsForExemption = () => {
    if (referenceBindingAttempted) return
    referenceBindingAttempted = true
    if (!dossierFiles.has('page-map.json') || !dossierFiles.has('reference.json')) {
      P('audit-reference-kind', 'interaction N/A needs the dossier page-map.json and reference.json to bind the exemption')
      referenceKinds = {}
      return
    }
    try {
      const pageMap = JSON.parse(dossierFiles.get('page-map.json').toString('utf8'))
      const reference = JSON.parse(dossierFiles.get('reference.json').toString('utf8'))
      const binding = bindReferenceKinds(contractPages, pageMap, reference)
      referenceKinds = binding.referenceKinds
      for (const error of binding.errors) P('audit-reference-kind', error)
    } catch (e) {
      P('audit-reference-kind', `the dossier reference binding could not be read (${String(e.message).split('\n')[0]})`)
      referenceKinds = {}
    }
  }
  if (contractPages.some((page) => page.referenceKind === 'none')) bindReferenceKindsForExemption()
  const known = new Set(inventory.map((e) => e.name))
  for (const name of Object.keys(rc.inputs)) if (!known.has(name)) P('audit-inputs', `the receipt binds ${name}, which is not one of the dossier's inputs: it is not an inventory of this dossier`)
  for (const e of inventory) {
    if (e.state === 'unsafe' || e.state === 'oversize' || e.state === 'unreadable') {
      P('audit-input-unsafe', `${e.name}: ${e.message}`)
      continue
    }
    if (e.state === 'file') onRead?.(path.join(dossier, e.name), { bytes: e.bytes, mtimeMs: e.mtimeMs, size: e.bytes.length })
    if (!Object.hasOwn(rc.inputs, e.name)) {
      P('audit-inputs', `the receipt's inventory has no entry for ${e.name}: the audit did not cover the dossier's ${e.role === 'acceptance' ? 'acceptance files' : e.name}`)
      continue
    }
    const was = rc.inputs[e.name]
    if (e.state === 'absent') {
      if (e.required) P('audit-input-missing', `${e.name} is required in the dossier and is not there`)
      else if (was !== null) P('audit-inputs', `${e.name} was bound by the audit and is not in this dossier now`)
    } else if (was === null) P('audit-inputs', `${e.name} is in this dossier and the audit was made without it: audit again`)
    else if (was !== e.sha256) P('audit-inputs', `${e.name} is ${e.sha256} now, the audit read ${was}: it changed (or the receipt is of another dossier)`)
    else if (Math.floor(e.mtimeMs) > at) P('audit-stale', `${e.name} was written at ${new Date(e.mtimeMs).toISOString()}, after the audit (${rc.at}): audit again`)
  }

  // the run's interaction records (visual) or the theme (patch)
  if (scope === 'patch') {
    if (rc.interaction.length) P('audit-interaction', 'a patch receipt binds no interaction record')
    const want = typeof theme === 'string' ? theme.replace(/^sha256:/, '') : null
    if (!want) P('audit-theme', 'the consumer names no theme zip: a patch audit is bound to the theme released')
    else if (!rc.theme || rc.theme !== `sha256:${want}`) P('audit-theme', `the audit was made for theme ${rc.theme ?? 'none'}, the release's theme zip is sha256:${want}`)
  } else {
    if (rc.theme !== null && rc.theme !== undefined) P('audit-theme', 'a visual receipt binds no theme zip; the run does')
    if (!interaction.length) P('audit-interaction', 'the consumer names no interaction record: the audit covers the run\'s probe')
    const seen = []
    for (const x of interaction) {
      let r
      try {
        r = readBound(x.file)
        onRead?.(x.file, r)
      } catch (e) {
        if (!(e instanceof BoundError)) throw e
        P(e.code === 'absent' ? 'audit-interaction-missing' : 'audit-input-unsafe', `interaction record: ${e.message}`)
        continue
      }
      seen.push(sha256(r.bytes))
      if (Math.floor(r.mtimeMs) > at) P('audit-stale', `${path.basename(x.file)} was written at ${new Date(r.mtimeMs).toISOString()}, after the audit (${rc.at})`)
      let rec
      try {
        rec = JSON.parse(r.bytes.toString('utf8'))
      } catch (e) {
        P('audit-interaction', `${x.file} is not JSON`)
        continue
      }
      if (rec?.coverage?.some((row) => row?.status === 'not-applicable')) bindReferenceKindsForExemption()
      for (const m of validateInteractionRecord(rec, { owed: { routes: x.routes ?? null, site, source: x.source ?? null, referenceKinds } }).slice(0, 4)) P('audit-interaction', `${path.basename(path.dirname(x.file))}/${path.basename(x.file)}: ${m}`)
      // findings are advisory (interaction-report.mjs): only a state that was not measured makes the record unclean
      if (rec?.notMeasured?.length) P('audit-interaction', `${x.file}: ${rec.notMeasured.length} state(s) not measured — an interaction record with one is not clean`)
    }
    const a = [...seen].sort()
    const b = [...rc.interaction].sort()
    if (seen.length === interaction.length && (a.length !== b.length || a.some((h, i) => h !== b[i]))) P('audit-interaction', `the interaction records of this run are not the ones the audit covered (${a.length} here, ${b.length} in the receipt, or their bytes differ)`)
  }
  return { problems: out, audit: summary }
}
