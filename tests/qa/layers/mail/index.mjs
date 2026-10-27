// Layer module of the mail QA layer (contract: listCases / run). Verdicts follow plan section 2:
// PASS only with a green assertion, an independent oracle and a RED proof; ENV only with a probe;
// PENDING for anything not proven; FAIL for a violated expectation with the environment sound.
import { lstatSync, readdirSync } from 'node:fs'
import path from 'node:path'
import {
  CASES_DIR,
  LAYER,
  LAYER_DIR,
  REPO_ROOT,
  SRC_REL,
  UsageError,
  claimOutputDir,
  hashFile,
  loadProduct,
  productRevision,
  readJson,
  readRegularFile,
  stable,
  utcStamp,
  writeAtomic
} from './common.mjs'
import { assertCommitted, parseNa } from '../../lib/denominator.mjs'
import { docRel } from '../../lib/doc-source.mjs'
import { BUILDER_NAMES, REGISTRY, runAssertion } from './machine.mjs'
import { MUTANTS, applyMutant, makeScratch, proofVariants, proveRed } from './red.mjs'
import {
  SUITES,
  describeSuite,
  judgeSuite,
  probeDatabase,
  probeSocket,
  redTests,
  runSuite
} from './legacy.mjs'
import { buildSheets, verifyReceipt } from './sheets.mjs'
import { ALL_TAGS } from './generate.mjs'
import { LEGACY_RED } from './legacy-red.mjs'

export const layer = LAYER
export const AREAS = ['letters', 'direct', 'tokens', 'transport', 'preferences', 'suites', 'manual', 'env']
const REQUIRED_FIELDS = [
  'id',
  'itemIds',
  'requirement',
  'oracle',
  'edgeTags',
  'targets',
  'effects',
  'prerequisites',
  'assertionIds',
  'redProof',
  'legacyIds'
]
const VERDICT_RANK = { FAIL: 4, ENV: 3, PENDING: 2, PASS: 1 }

export function areaOf(c) {
  const a = c.assertionIds[0] ?? ''
  if (a.startsWith('suite:')) return 'suites'
  if (a.startsWith('manual:')) return 'manual'
  if (a.startsWith('env:')) return 'env'
  if (/^mail\.(letter|notify)\./.test(a)) return 'letters'
  if (a.startsWith('mail.direct.')) return 'direct'
  if (/^mail\.(signin|invite|unsubscribe|sitemail)\./.test(a)) return 'tokens'
  if (a.startsWith('mail.transport.')) return 'transport'
  if (a.startsWith('mail.preferences.')) return 'preferences'
  return 'other'
}

const SHEET_PREFIX = 'manual:contact-sheet:'
const EFFECT_KEYS = ['reads', 'writes', 'mail', 'model', 'containers']
const TARGETS = ['local', 'dev', 'prod']
const isText = (v) => typeof v === 'string' && v !== ''
const isTextList = (v) => Array.isArray(v) && v.every(isText)
const oracleData = () => readJson(path.join(REPO_ROOT, 'tests/qa/oracles/mail/oracle.json'))
/** Notification kinds named by the oracle: the letter table plus every kind of a preference group. */
const kindsOf = (data) => [
  ...new Set([...Object.keys(data.kinds.table), ...Object.values(data.groups.byId).flat()])
]

/** Registered variant selectors of the machine assertions that take a `#filter`; data only. */
function selectorsOf(id, kinds) {
  if (/^mail\.(letter|notify)\./.test(id)) return new Set(kinds.map((k) => `${k}:`))
  return FIXED_SELECTORS[id] ?? new Set()
}
const FIXED_SELECTORS = {
  'mail.preferences.groups': new Set([
    'group:about-you',
    'group:join-requests',
    'group:mentions-replies',
    'group:resolved-reopened',
    'group:site-changes',
    'group:teammates',
    'locked-group-always-on',
    'locked-group-cannot-be-switched-off',
    'parse-changes-invalid',
    'six-groups',
    'unknown-kind-always-on'
  ]),
  'mail.transport.payload': new Set(['fields-pass-through', 'no-key-no-ack', 'recipient-list-unchanged']),
  'mail.transport.failure': new Set([
    'abort-signal-reaches-fetch',
    'malformed-acknowledgement',
    'network-failure',
    'status-'
  ]),
  'mail.unsubscribe.token': new Set([
    'malformed',
    'refused-after-lifetime',
    'repeat-is-harmless',
    'swapped-payload',
    'tampered-signature',
    'valid-inside-lifetime',
    'wrong-or-missing-secret'
  ]),
  'mail.sitemail.token': new Set([
    'bound-to-label-and-secret',
    'malformed-is-false-not-a-throw',
    'no-lifetime-and-not-single-use',
    'shape-and-determinism'
  ]),
  'mail.invite.token': new Set([
    'expired-one-second-later',
    'future-token-invalid',
    'live-through-the-last-second',
    'no-secret-no-token',
    'roundtrip',
    'tampered'
  ]),
  'mail.signin.expiry': new Set(['accepted-before-expiry', 'refused-after-expiry']),
  'mail.signin.replay': new Set([
    'code-of-another-address-refused',
    'replaced-code-refused',
    'too-many-wrong-guesses-spend-the-code',
    'used-code-refused'
  ]),
  'mail.transport.reserved': new Set(['deliverable:', 'reserved:', 'unconfigured-transport-refuses'])
}

/**
 * Classify one assertion reference. Only the exact supported forms parse: a machine id with an
 * optional `#a|b` filter of registered selectors, or an exact suite / contact-sheet / deliverability
 * / env reference with no filter at all. Anything else is a UsageError, never a guess.
 * @returns {{ kind: 'machine'|'suite'|'manual'|'env', id: string, filter: string[]|null }}
 */
export function parseRef(ref, context = {}) {
  if (!isText(ref)) throw new UsageError(`invalid assertion reference ${JSON.stringify(ref)}`)
  const data = context.kinds ? null : oracleData()
  const kinds = context.kinds ?? kindsOf(data)
  const sheetNames = context.sheetNames ?? new Set([...Object.keys(data.kinds.table), ...BUILDER_NAMES])
  const at = ref.indexOf('#')
  const id = at < 0 ? ref : ref.slice(0, at)
  if (id.startsWith('suite:')) {
    if (at >= 0 || !SUITES.includes(id.slice(6)))
      throw new UsageError(
        `${JSON.stringify(ref)} is not a registered suite reference (no filter is supported)`
      )
    return { kind: 'suite', id, filter: null }
  }
  if (id.startsWith('manual:')) {
    const ok =
      at < 0 &&
      (id === 'manual:deliverability' ||
        (id.startsWith(SHEET_PREFIX) && sheetNames.has(id.slice(SHEET_PREFIX.length))))
    if (!ok)
      throw new UsageError(
        `${JSON.stringify(ref)} is not a registered manual reference (no filter is supported)`
      )
    return { kind: 'manual', id, filter: null }
  }
  if (id.startsWith('env:')) {
    if (at >= 0 || id !== 'env:postgres')
      throw new UsageError(
        `${JSON.stringify(ref)} is not a registered env reference (no filter is supported)`
      )
    return { kind: 'env', id, filter: null }
  }
  if (!REGISTRY.has(id))
    throw new UsageError(`${JSON.stringify(id)} is not a registered assertion of this layer`)
  if (at < 0) return { kind: 'machine', id, filter: null }
  const filter = ref.slice(at + 1).split('|')
  const allowed = selectorsOf(id, kinds)
  const bad = filter.find((f) => !allowed.has(f))
  if (bad !== undefined) throw new UsageError(`${JSON.stringify(bad)} is not a registered selector of ${id}`)
  if (new Set(filter).size !== filter.length)
    throw new UsageError(`${JSON.stringify(ref)} repeats a selector`)
  return { kind: 'machine', id, filter }
}

/** Manifest schema: every field present and of the right type, every id and tag known. */
export function validateCase(c, file = '?') {
  if (!c || typeof c !== 'object' || Array.isArray(c))
    throw new UsageError(`${file}: a case must be a JSON object`)
  for (const f of REQUIRED_FIELDS)
    if (!(f in c)) throw new UsageError(`${file}: case ${c.id ?? '?'} lacks "${f}"`)
  if (typeof c.id !== 'string' || !c.id.startsWith('QA-MAIL-'))
    throw new UsageError(`${file}: bad id ${c.id}`)
  const bad = (what) => new UsageError(`${file}: ${c.id} ${what}`)
  if (!isText(c.requirement)) throw bad('needs a non-empty requirement')
  for (const f of ['itemIds', 'edgeTags', 'targets', 'prerequisites', 'assertionIds', 'legacyIds'])
    if (!isTextList(c[f])) throw bad(`.${f} must be an array of non-empty strings`)
  for (const f of ['itemIds', 'edgeTags', 'targets', 'assertionIds'])
    if (new Set(c[f]).size !== c[f].length) throw bad(`.${f} repeats a value`)
  if (c.assertionIds.length === 0) throw bad('has no assertion')
  if (c.targets.length === 0) throw bad('declares no target')
  for (const t of c.targets)
    if (!TARGETS.includes(t)) throw bad(`declares unknown target ${JSON.stringify(t)}`)
  const o = c.oracle
  if (!o || typeof o !== 'object' || !isText(o.source) || !isText(o.ref) || !isText(o.invariant))
    throw bad('has an incomplete oracle (source, ref and invariant must be non-empty strings)')
  for (const t of c.edgeTags) if (!ALL_TAGS.includes(t)) throw bad(`uses unknown tag ${t}`)
  const e = c.effects
  if (!e || typeof e !== 'object' || Array.isArray(e)) throw bad('has no effects object')
  for (const k of Object.keys(e)) if (!EFFECT_KEYS.includes(k)) throw bad(`has an unknown effect "${k}"`)
  for (const k of EFFECT_KEYS) if (!(k in e)) throw bad(`effects lack "${k}"`)
  for (const k of ['reads', 'writes'])
    if (!isTextList(e[k])) throw bad(`effects.${k} must be an array of strings`)
  for (const k of ['mail', 'model', 'containers'])
    if (typeof e[k] !== 'boolean') throw bad(`effects.${k} must be a boolean`)
  if (c.redProof !== null && (typeof c.redProof !== 'object' || Array.isArray(c.redProof)))
    throw bad('redProof must be null or an object')
  return c
}

/** One case belongs to one execution kind; suite / manual / env cases carry exactly one reference. */
export function classifyCase(c, context) {
  const refs = c.assertionIds.map((r) => parseRef(r, context))
  const kinds = new Set(refs.map((r) => r.kind))
  if (kinds.size !== 1)
    throw new UsageError(`${c.id} mixes ${[...kinds].join(' and ')} references; a case has one kind`)
  const kind = refs[0].kind
  if (kind !== 'machine' && refs.length !== 1)
    throw new UsageError(`${c.id} has ${refs.length} ${kind} references; exactly one is supported`)
  return { kind, refs }
}

export function loadCases(dir = CASES_DIR) {
  const files = readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()
  if (files.length === 0) throw new UsageError(`no case manifests in ${dir}`)
  const seen = new Set()
  return files.map((f) => {
    const text = readRegularFile(path.join(dir, f), 'case manifest')
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      throw new UsageError(`${f}: not valid JSON (${error.message})`)
    }
    const c = validateCase(parsed, f)
    if (seen.has(c.id)) throw new UsageError(`duplicate case id ${c.id}`)
    seen.add(c.id)
    return c
  })
}

export async function listCases({ area } = {}) {
  if (area !== undefined && !AREAS.includes(area))
    throw new UsageError(`unknown area "${area}"; one of ${AREAS.join(', ')}`)
  const cases = loadCases()
  return area ? cases.filter((c) => areaOf(c) === area) : cases
}

// ---------------------------------------------------------------------------------------------

const pool = async (items, size, fn) => {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      while (queue.length > 0) await fn(queue.shift())
    })
  )
}

const isMissingDependency = (message) => /Cannot find (package|module)|ERR_MODULE_NOT_FOUND/.test(message)

function sliceOf(result, filter) {
  const match = (v) => !filter || filter.some((p) => v === p || v.startsWith(p))
  return result.variants.filter((v) => match(v.variant))
}

/**
 * @param {{
 *   cases: object[], target?: string, proveRed?: boolean, outDir: string,
 *   productRoot?: string, receipt?: string|null, ledger?: string, mutants?: object[],
 *   registryRun?: (id: string, root: string) => Promise<object>, suites?: string[], skipSuites?: boolean,
 *   capture?: boolean, legacyRed?: object
 * }} o
 */
/** Hashes of pinned oracle sources that no longer match the file on disk. */
export function oracleDrift(oracleData, root = REPO_ROOT) {
  const drifted = []
  for (const [key, s] of Object.entries(oracleData.sources ?? {})) {
    let now = null
    try {
      now = hashFile(path.join(root, docRel(root, s.path)))
    } catch {}
    if (now !== s.sha256) drifted.push({ key, path: s.path })
  }
  return drifted
}

const catalogueMatches = (pattern, id) =>
  pattern.endsWith(':*') ? id.startsWith(pattern.slice(0, -1)) : pattern === id

/**
 * Why a case may not be judged (PASS or product FAIL) on its oracle, or null when it may. The only
 * way in is a row of the oracle catalogue for every assertion the case runs: the row fixes the
 * pinned source, the exact ref and invariant, the variants it covers and verbatim excerpts that must
 * still be found in the pinned file. Code, code comments, tests, the suite itself, unpinned
 * references (RFC, vendor docs) and rows of oracle.json that merely cite a document have no row.
 */
export function oracleIneligible(c, data, drift = [], root = REPO_ROOT) {
  const refs = c.assertionIds.map((r) => parseRef(r))
  const entries = data.catalogue?.entries ?? []
  for (const r of refs) {
    if (r.kind !== 'machine') return `${r.id}: only machine assertions have an oracle catalogue row`
    const row = entries.find(
      (e) =>
        catalogueMatches(e.assertion, r.id) &&
        e.ref === c.oracle.ref &&
        e.invariant === c.oracle.invariant &&
        data.sources?.[e.source]?.path === c.oracle.source
    )
    if (!row)
      return `no catalogue row binds ${r.id} to ${c.oracle.source} (${c.oracle.ref}: ${c.oracle.invariant.slice(0, 60)}); the case stays PENDING`
    if (row.variants !== '*') {
      if (!r.filter || !r.filter.every((f) => row.variants.includes(f)))
        return `the catalogue row of ${r.id} covers only the variants ${row.variants.join(', ')}; this case runs ${r.filter ? r.filter.join('|') : 'all of them'}`
    }
    if (drift.some((d) => d.key === row.source))
      return `${c.oracle.source} changed since the oracle was pinned; re-read before trusting`
    let text = null
    try {
      text = readRegularFile(path.join(root, docRel(root, data.sources[row.source].path)), 'oracle source')
    } catch {}
    const missing = (row.excerpts ?? []).find((x) => !text?.includes(x))
    if (!row.excerpts?.length || missing !== undefined)
      return `the pinned source no longer holds the excerpt ${JSON.stringify(missing ?? '')} that the catalogue relies on`
  }
  return null
}

async function runInner({
  cases,
  target = 'local',
  proveRed: wantRed = false,
  outDir,
  productRoot = process.env.QA_MAIL_PRODUCT_ROOT ?? REPO_ROOT,
  receipt = null,
  ledger = outDir ? path.join(outDir, 'mail-red-ledger.json') : undefined,
  mutants = MUTANTS,
  registryRun = runAssertion,
  skipSuites = false,
  capture = true,
  legacyRed = LEGACY_RED
}) {
  const oracleFileData = oracleData()
  const drift = oracleDrift(oracleFileData)
  // The ledger is an export of this run's proofs only; nothing is ever read back from it.
  const ledgerData = { run: path.basename(outDir), entries: {} }
  const started = Date.now()
  const timings = {}
  let phase = started
  const lap = (name) => {
    timings[name] = Date.now() - phase
    phase = Date.now()
  }
  const results = new Map()
  const evidenceFor = (c, payload) => {
    const rel = path.join('evidence', `${c.id}.json`)
    writeAtomic(path.join(outDir, rel), stable(payload))
    return rel
  }
  const done = (c, verdict, reason, extra = {}) =>
    results.set(c.id, {
      id: c.id,
      verdict,
      reason,
      assertionIds: c.assertionIds,
      evidence: [],
      durationMs: 0,
      redProof: null,
      area: areaOf(c),
      ...extra
    })

  // Target policy first, before any effect.
  const runnable = []
  for (const c of cases) {
    if (target !== 'local')
      done(
        c,
        'PENDING',
        `target-policy: this layer judges the local tree; "${target}" is not a target of its cases`
      )
    else if (!c.targets.includes(target))
      done(c, 'PENDING', `target-policy: the case does not declare target ${target}`)
    else runnable.push(c)
  }

  const refs = (c) => c.assertionIds.map((r) => parseRef(r))
  const machineIds = [
    ...new Set(runnable.flatMap((c) => refs(c).map((r) => r.id)).filter((id) => REGISTRY.has(id)))
  ]
  const suiteNames = [
    ...new Set(
      runnable
        .flatMap((c) => refs(c).map((r) => r.id))
        .filter((id) => id.startsWith('suite:'))
        .map((id) => id.slice(6))
    )
  ]
  // Oracle eligibility of every case, decided once and before any verdict.
  const eligibility = new Map()
  for (const c of runnable) eligibility.set(c.id, oracleIneligible(c, oracleFileData, drift))

  // Probes: direct evidence for ENV.
  const [socket, database] = await Promise.all([probeSocket(), probeDatabase()])
  const probes = { socket, database }

  lap('probes')
  // Machine assertions on the real tree.
  const control = new Map()
  for (const id of machineIds) control.set(id, await registryRun(id, productRoot))

  lap('machineControl')
  // RED proof: only fresh, in this run, only when asked, and only for assertions some case may be
  // judged on (the rest stay PENDING on their oracle anyway). Nothing is reused from an older run.
  const redByAssertion = new Map()
  const redIds = machineIds.filter((id) =>
    runnable.some((c) => eligibility.get(c.id) === null && c.assertionIds.some((r) => parseRef(r).id === id))
  )
  if (wantRed && redIds.length > 0) {
    const red = await proveRed({
      assertionIds: redIds,
      mutants,
      run: registryRun,
      outDir,
      controlRoot: productRoot
    })
    for (const [id, proofs] of red.proofs) redByAssertion.set(id, proofs)
    for (const [id, proofs] of red.proofs)
      for (const p of proofs) ledgerData.entries[`${id}|${p.mutant}`] = { proof: p }
  }

  lap('machineRed')
  // Existing suites.
  const suiteRuns = new Map()
  if (!skipSuites)
    await pool(suiteNames, 3, async (name) => {
      const d = describeSuite(name, productRoot)
      const r = await runSuite({
        root: productRoot,
        name,
        databaseUrl: database.ok ? database.url : null
      })
      const controlLog = path.join('suites', `${name}.control.log`)
      writeAtomic(
        path.join(outDir, controlLog),
        `exit ${r.exitCode} signal ${r.signal ?? 'none'} timedOut ${r.timedOut}\n--- stdout ---\n${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}\n`
      )
      suiteRuns.set(name, { d, r, controlLog, j: judgeSuite(r, { needs: d.needs, socket, database }) })
    })
  lap('suiteControl')
  const suiteRed = new Map()
  if (!skipSuites && wantRed) {
    // One scratch copy per mutation, shared by every suite that names it, suites run side by side.
    const greens = suiteNames.filter((name) => suiteRuns.get(name)?.j.verdict === 'green')
    const byMutant = new Map()
    for (const name of greens)
      for (const mutantId of Object.keys(legacyRed[name] ?? {})) {
        if (!byMutant.has(mutantId)) byMutant.set(mutantId, [])
        byMutant.get(mutantId).push(name)
      }
    for (const [mutantId, names] of byMutant) {
      const m = mutants.find((mm) => mm.id === mutantId)
      if (!m) continue
      const scratch = await makeScratch({ withTests: true })
      try {
        const applied = await applyMutant(scratch.dir, m)
        await pool(names, 3, async (name) => {
          if (!suiteRed.has(name)) suiteRed.set(name, [])
          if (!applied.ok)
            return void suiteRed.get(name).push({ mutant: mutantId, ok: false, why: applied.reason })
          const r = await runSuite({ root: scratch.dir, name })
          const red = redTests(suiteRuns.get(name).r, r)
          const expected = legacyRed[name][mutantId]
          const missing = expected.filter((t) => !red.includes(t))
          const log = path.join('red', `suite-${name}-${mutantId}.log`)
          writeAtomic(
            path.join(outDir, log),
            `mutant ${mutantId} edits ${JSON.stringify((applied.applied ?? []).map((a) => ({ file: a.file, before: a.before, after: a.after })))}\ncontrol log ${suiteRuns.get(name).controlLog} (exit ${suiteRuns.get(name).r.exitCode})\nexpected red tests ${JSON.stringify(expected)}\nred with an assertion ${JSON.stringify(red)}\nmissing ${JSON.stringify(missing)}\nexit ${r.exitCode} signal ${r.signal ?? 'none'} timedOut ${r.timedOut}\n--- stdout ---\n${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}\n`
          )
          suiteRed.get(name).push({
            mutant: mutantId,
            log,
            ok: missing.length === 0,
            redTests: expected,
            why: missing.length
              ? `named tests did not fail with an assertion on the mutant: ${missing.join('; ')}`
              : null
          })
        })
      } finally {
        await scratch.dispose()
      }
    }
    for (const [name, list] of suiteRed)
      for (const p of list) ledgerData.entries[`suite:${name}|${p.mutant}`] = { proof: p }
  }
  if (wantRed && ledgerData.entries && Object.keys(ledgerData.entries).length > 0)
    writeAtomic(ledger, stable(ledgerData))

  lap('suiteRed')
  // Sheets for the manual cases.
  const manualCases = runnable.filter((c) => c.assertionIds[0].startsWith('manual:contact-sheet:'))
  let sheets = null
  let receipts = new Map()
  if (manualCases.length > 0) {
    const names = manualCases.map((c) => c.assertionIds[0].slice('manual:contact-sheet:'.length))
    const { LETTER_KINDS } = await loadProduct(productRoot, 'mail/letters/index.js')
    const kinds = names.filter((n) => LETTER_KINDS.includes(n))
    const builders = names.filter((n) => !LETTER_KINDS.includes(n))
    sheets = await buildSheets({
      outDir,
      root: productRoot,
      kinds,
      builders,
      capture,
      revision: productRevision()
    })
    receipts = verifyReceipt(
      receipt,
      sheets.entries,
      productRevision(),
      new Set([...LETTER_KINDS, ...BUILDER_NAMES].flatMap((n) => [`${n}:en`, `${n}:vi`])),
      sheets.dir
    )
  }

  lap('sheets')
  // Verdicts.
  for (const c of runnable) {
    const t0 = Date.now()
    const rs = refs(c)
    const first = rs[0].id
    if (first.startsWith('manual:deliverability')) {
      done(
        c,
        'PENDING',
        'outside the machine: needs a real Gmail/Outlook inbox and a spam-folder check; nothing was sent or looked at',
        { kind: 'manual', manual: 'pending' }
      )
      continue
    }
    if (first.startsWith('manual:contact-sheet:')) {
      const states = ['en', 'vi'].map(
        (l) => receipts.get(`${first.slice(21)}:${l}`) ?? { state: 'pending', reason: 'no sheet' }
      )
      const worst =
        states.find((s) => s.state === 'rejected') ??
        states.find((s) => s.state === 'stale') ??
        states.find((s) => s.state === 'pending') ??
        states[0]
      const state = worst.state
      done(
        c,
        state === 'rejected' ? 'FAIL' : 'PENDING',
        `manual ${state}: ${worst.reason}${sheets ? `; sheets: ${sheets.status} (${sheets.reason})` : ''}`,
        {
          kind: 'manual',
          manual: state,
          evidence: sheets ? [path.join('sheets', 'index.html'), path.join('sheets', 'checklist.json')] : []
        }
      )
      continue
    }
    if (first === 'env:postgres') {
      if (!database.ok)
        done(c, 'ENV', `probe: ${database.reason}`, {
          kind: 'env',
          evidence: [evidenceFor(c, { probe: database })]
        })
      else
        done(
          c,
          'PENDING',
          'a database answered the probe, but this slice has no assertion that drives it; the adapted suites own the SQL cases',
          { kind: 'env' }
        )
      continue
    }
    if (first.startsWith('suite:')) {
      const name = first.slice(6)
      if (skipSuites) {
        done(c, 'PENDING', 'suites were not run in this invocation')
        continue
      }
      const s = suiteRuns.get(name)
      const ev = evidenceFor(c, {
        suite: name,
        file: s.d.file,
        needs: s.d.needs,
        counts: s.j.counts,
        judged: s.j.verdict,
        reason: s.j.reason,
        tests: s.r.tests.map((t) => ({ name: t.name, ok: t.ok, directive: t.directive })),
        probes
      })
      const base = { kind: 'suite', evidence: [ev], durationMs: Date.now() - t0 }
      // A suite is adapted regression code: it has no catalogue row, so it is never judged on its
      // own oracle. ENV stays ENV (a probe failed); everything else is an observation, PENDING.
      if (s.j.verdict === 'ENV') {
        done(c, 'ENV', s.j.reason, base)
        continue
      }
      const declared = Object.keys(legacyRed[name] ?? {})
      const proofs = suiteRed.get(name) ?? []
      const proven = declared.map((id) => proofs.find((p) => p.mutant === id && p.ok)).filter(Boolean)
      const tests = [...new Set(proven.flatMap((p) => p.redTests))]
      done(
        c,
        'PENDING',
        `oracle not independent: ${eligibility.get(c.id)}; observed ${s.j.verdict === 'green' ? 'green' : s.j.verdict}: ${s.j.reason}; ${tests.length} of ${s.j.counts.total} tests observed red under ${proven.map((p) => p.mutant).join(', ') || 'no mutation'}${wantRed || proven.length ? '' : ' (RED not run)'}`,
        {
          ...base,
          evidence: [...base.evidence, s.controlLog, ...proven.map((p) => p.log)],
          observed: s.j.verdict,
          observedRed: { tests, mutants: proven.map((p) => p.mutant), logs: proven.map((p) => p.log) }
        }
      )
      continue
    }
    // Machine case.
    const slices = rs.map((r) => ({
      r,
      result: control.get(r.id),
      slice: sliceOf(control.get(r.id), r.filter)
    }))
    const missing = slices.find((s) => s.slice.length === 0 && s.result.status !== 'error')
    const errored = slices.find(
      (s) => s.result.status === 'error' && s.result.failing.some((f) => f.kind === 'error')
    )
    const bad = slices.flatMap((s) => s.slice.filter((v) => !v.ok && v.kind === 'assertion'))
    const evPayload = {
      assertions: slices.map((s) => ({ id: s.r.id, filter: s.r.filter, variants: s.slice })),
      probes: { socket }
    }
    const ev = evidenceFor(c, evPayload)
    const total = slices.reduce((n, s) => n + s.slice.length, 0)
    const variantGreen = {}
    for (const s of slices)
      for (const v of s.slice) variantGreen[v.variant] = (variantGreen[v.variant] ?? true) && v.ok
    const base = {
      kind: 'machine',
      evidence: [ev],
      durationMs: Date.now() - t0,
      variants: { total, green: total - bad.length },
      variantGreen
    }
    const envErr = slices
      .flatMap((s) => s.result.failing)
      .find((f) => f.kind === 'error' && isMissingDependency(f.message))
    if (envErr) {
      done(c, 'ENV', `missing dependency (probe: the import failed): ${envErr.message}`, base)
      continue
    }
    if (errored || missing) {
      done(
        c,
        'PENDING',
        `TEST_INVALID: ${errored ? errored.result.failing.find((f) => f.kind === 'error').message : `the slice ${missing.r.filter?.join('|')} of ${missing.r.id} matched no variant`}`,
        base
      )
      continue
    }
    // The oracle is judged before any verdict, PASS or FAIL alike: a case without an independent
    // source is an observation of the product, never a finding about it.
    if (eligibility.get(c.id)) {
      done(
        c,
        'PENDING',
        `oracle not independent: ${eligibility.get(c.id)}; observed ${bad.length ? `${bad.length} of ${total} variants red (first ${bad[0].variant}: ${bad[0].message})` : `${total} variants green`}`,
        { ...base, observed: bad.length ? 'red' : 'green' }
      )
      continue
    }
    if (bad.length > 0) {
      done(
        c,
        'FAIL',
        `${bad.length} of ${total} variants violate the oracle, first ${bad[0].variant}: ${bad[0].message}`,
        base
      )
      continue
    }
    // Green. PASS needs a RED proof for every assertion the case owns.
    const proofs = []
    let why = null
    for (const s of slices) {
      const problems = []
      // Every variant this case ran (except a fail-closed note, which no mutant can reach) needs a
      // RED proof, possibly from several mutants; the log of each proof is re-read for it.
      const owned = s.slice.filter((v) => !v.note).map((v) => v.variant)
      const covered = new Set()
      const recorded = (redByAssertion.get(s.r.id) ?? []).filter((p) => {
        if (!p.ok || !p.copyOk || !p.controlGreen || p.errored) return false
        const { problem, variants } = proofVariants(p, { outDir, assertionId: s.r.id, productRoot, mutants })
        if (problem) problems.push(problem)
        else for (const v of variants) covered.add(v)
        return !problem && owned.some((v) => variants.has(v))
      })
      const unproven = owned.filter((v) => !covered.has(v))
      if (recorded.length === 0 || unproven.length > 0) {
        const planned = mutants.filter((m) => Object.hasOwn(m.targets, s.r.id)).map((m) => m.id)
        why =
          planned.length === 0
            ? `no recorded mutation targets ${s.r.id}`
            : wantRed
              ? recorded.length > 0
                ? `${unproven.length} of ${owned.length} variants of ${s.r.id} have no RED proof (first ${unproven[0]}); mutations ${planned.join(', ')} do not reach them`
                : `mutations ${planned.join(', ')} target ${s.r.id} but none turned this slice red (${problems[0] ?? (redByAssertion.get(s.r.id) ?? []).map((p) => p.why).filter(Boolean)[0] ?? 'not reached'})`
              : `RED not run for ${s.r.id} in this run (use --prove-red; proofs of an earlier run are never reused)`
        break
      }
      proofs.push({
        assertionId: s.r.id,
        mutants: recorded.map((p) => p.mutant),
        logs: recorded.map((p) => p.log),
        provenVariants: owned.length
      })
    }
    if (why) done(c, 'PENDING', `machine assertions green (${total} variants); ${why}`, base)
    else
      done(c, 'PASS', `${total} variants green; red under ${proofs.flatMap((p) => p.mutants).join(', ')}`, {
        ...base,
        redProof: {
          kind: 'mutation',
          ref: proofs.flatMap((p) => p.mutants).join(','),
          assertionId: proofs.map((p) => p.assertionId).join(','),
          log: proofs.flatMap((p) => p.logs)[0],
          proofs
        }
      })
  }

  const list = cases.map((c) => results.get(c.id))
  const coverage = buildCoverage(cases, list)
  const meta = {
    layer: LAYER,
    target,
    proveRed: wantRed,
    revision: productRevision(),
    durationMs: Date.now() - started,
    probes,
    sheets: sheets && { status: sheets.status, reason: sheets.reason },
    unresolved: readDenominator().unresolved
  }
  writeAtomic(path.join(outDir, 'coverage.json'), stable(coverage))
  writeAtomic(path.join(outDir, 'meta.json'), stable(meta))
  writeAtomic(path.join(outDir, 'report.md'), renderReport(list, coverage, meta))
  // Written last: its presence is what marks the run as complete.
  writeAtomic(path.join(outDir, 'results.json'), stable(list))
  return list
}

// ---------------------------------------------------------------------------------------------

/** The dependencies a case may name; the layer probes the socket and the database, the rest are declared. */
const PREREQUISITES = ['playwright-chromium', 'real inbox', 'QA_STAND_DATABASE_URL', 'loopback-socket']

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const hasOnly = (o, keys) => Object.keys(o).every((k) => keys.includes(k))

/** redProof as the manifest contract defines it: null, or { kind, ref, assertionId, log } (+ the run's own proofs). */
function validateRedProof(c, bad) {
  const p = c.redProof
  if (p === null) return
  const allowed = ['kind', 'ref', 'assertionId', 'log', 'proofs']
  for (const k of Object.keys(p)) if (!allowed.includes(k)) throw bad(`redProof has an unknown field "${k}"`)
  if (!['commit', 'mutation'].includes(p.kind)) throw bad('redProof.kind must be "commit" or "mutation"')
  for (const k of ['ref', 'assertionId', 'log'])
    if (!isText(p[k])) throw bad(`redProof.${k} must be a non-empty string`)
  if (p.proofs === undefined) return
  if (!Array.isArray(p.proofs)) throw bad('redProof.proofs must be an array')
  for (const [i, e] of p.proofs.entries()) {
    const at = `redProof.proofs[${i}]`
    if (!isObject(e) || !hasOnly(e, ['assertionId', 'mutants', 'logs', 'provenVariants']))
      throw bad(`${at} must be an object of assertionId, mutants, logs and provenVariants`)
    if (!isText(e.assertionId)) throw bad(`${at}.assertionId must be a non-empty string`)
    if (!isTextList(e.mutants) || e.mutants.length === 0)
      throw bad(`${at}.mutants must be a non-empty array of strings`)
    if (!isTextList(e.logs) || e.logs.length !== e.mutants.length)
      throw bad(`${at}.logs must hold one log path per mutant`)
    if (!Number.isInteger(e.provenVariants) || e.provenVariants < 1)
      throw bad(`${at}.provenVariants must be a positive integer`)
  }
}

const relativePath = (v) =>
  isText(v) && !path.isAbsolute(v) && !v.split(/[\\/]/).includes('..') && !v.includes('\0')

/** A mutation as the catalogue defines it: closed shape for every edit and every target. */
function validateMutant(m, at) {
  const bad = (what) => new UsageError(`mutants: ${at} ${what}`)
  if (!isObject(m) || !hasOnly(m, ['id', 'summary', 'edits', 'targets']))
    throw new UsageError(`mutants: ${at} must be an object of id, summary, edits and targets`)
  if (!isText(m.id)) throw bad('needs a non-empty id')
  if (m.summary !== undefined && !isText(m.summary)) throw bad('summary must be a non-empty string')
  if (!Array.isArray(m.edits) || m.edits.length === 0) throw bad(`${m.id} needs a non-empty edits array`)
  for (const [i, e] of m.edits.entries()) {
    const where = `${m.id}.edits[${i}]`
    if (!isObject(e) || !hasOnly(e, ['file', 'find', 'replace', 'count']))
      throw bad(`${where} must be an object of file, find, replace and count`)
    if (!relativePath(e.file) || !e.file.startsWith(`${SRC_REL}/`))
      throw bad(`${where}.file must be a relative path inside the product source ${SRC_REL}/`)
    if (!isText(e.find)) throw bad(`${where}.find must be a non-empty string`)
    if (typeof e.replace !== 'string' || e.replace === e.find)
      throw bad(`${where}.replace must be a string that differs from find`)
    if (e.count !== undefined && (!Number.isInteger(e.count) || e.count < 1))
      throw bad(`${where}.count must be a positive integer`)
  }
  if (!isObject(m.targets) || Object.keys(m.targets).length === 0)
    throw bad(`${m.id} needs a non-empty targets object`)
  for (const [id, t] of Object.entries(m.targets)) {
    const where = `${m.id}.targets[${JSON.stringify(id)}]`
    if (!REGISTRY.has(id)) throw bad(`${where} is not a registered assertion`)
    if (!isObject(t) || !hasOnly(t, ['only', 'skip']))
      throw bad(`${where} must be an object of only and skip`)
    if (t.only !== undefined && (!isTextList(t.only) || t.only.length === 0))
      throw bad(`${where}.only must be a non-empty array of strings`)
    if (t.skip !== undefined && typeof t.skip !== 'function') throw bad(`${where}.skip must be a function`)
  }
}

/** The test-only hooks: shapes checked here so a wrong one fails before any output exists. */
function validateRedProofOptions({ mutants, legacyRed }) {
  const ids = new Set()
  for (const [i, m] of (mutants ?? MUTANTS).entries()) {
    if (mutants !== undefined) validateMutant(m, `[${i}]`)
    if (ids.has(m.id)) throw new UsageError(`mutants: duplicate id ${m.id}`)
    ids.add(m.id)
  }
  if (legacyRed === undefined) return
  for (const [suite, byMutant] of Object.entries(legacyRed)) {
    if (!SUITES.includes(suite)) throw new UsageError(`legacyRed names unknown suite ${suite}`)
    if (!isObject(byMutant)) throw new UsageError(`legacyRed.${suite} must be an object`)
    for (const [mutant, tests] of Object.entries(byMutant)) {
      if (!ids.has(mutant)) throw new UsageError(`legacyRed.${suite} names unregistered mutant ${mutant}`)
      if (!isTextList(tests) || tests.length === 0)
        throw new UsageError(`legacyRed.${suite}.${mutant} must be a non-empty array of test names`)
    }
  }
}

const RUN_OPTIONS = {
  cases: 'array',
  target: 'string',
  proveRed: 'boolean',
  outDir: 'string',
  productRoot: 'string',
  receipt: 'string|null',
  ledger: 'string',
  mutants: 'array',
  registryRun: 'function',
  skipSuites: 'boolean',
  capture: 'boolean',
  legacyRed: 'object'
}

/**
 * Everything a case or an option can get wrong, checked from data alone before any product import,
 * probe, output directory or assertion: option names and types, manifest schema, target, item ids
 * against the denominator, and every assertion reference against what this layer can run. The CLI and
 * the API go through this one function.
 */
export function validateRunInput(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new UsageError('run options must be an object')
  for (const [key, value] of Object.entries(options)) {
    const type = RUN_OPTIONS[key]
    if (!type) throw new UsageError(`unknown run option "${key}"`)
    if (value === undefined) continue
    const ok = type
      .split('|')
      .some((t) =>
        t === 'null'
          ? value === null
          : t === 'array'
            ? Array.isArray(value)
            : t === 'object'
              ? value && typeof value === 'object' && !Array.isArray(value)
              : typeof value === t
      )
    if (!ok) throw new UsageError(`run option "${key}" must be ${type}`)
  }
  const { cases, target = 'local', outDir, ledger } = options
  if (!isText(outDir)) throw new UsageError('outDir is required')
  if (!TARGETS.includes(target)) throw new UsageError(`unknown target "${target}"`)
  if (!Array.isArray(cases) || cases.length === 0)
    throw new UsageError('run needs a non-empty array of cases; an empty scope proves nothing')
  if (ledger !== undefined) {
    if (!isText(ledger)) throw new UsageError('ledger must be a path')
    const rel = path.relative(path.resolve(outDir), path.resolve(ledger))
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep))
      throw new UsageError(`ledger ${ledger} must be a file directly inside the new output directory`)
  }
  validateRedProofOptions(options)
  const data = oracleData()
  const itemIds = new Set(readDenominator().items.map((i) => i.id))
  const context = {
    kinds: kindsOf(data),
    sheetNames: new Set([...Object.keys(data.kinds.table), ...BUILDER_NAMES])
  }
  const seenIds = new Set()
  for (const c of cases) {
    validateCase(c, 'run input')
    for (const q of c.prerequisites)
      if (!PREREQUISITES.includes(q))
        throw new UsageError(`run input: ${c.id} has unregistered prerequisite ${JSON.stringify(q)}`)
    validateRedProof(c, (what) => new UsageError(`run input: ${c.id} ${what}`))
    if (seenIds.has(c.id)) throw new UsageError(`run input: duplicate case id ${c.id}`)
    seenIds.add(c.id)
    for (const i of c.itemIds)
      if (!itemIds.has(i))
        throw new UsageError(
          `run input: ${c.id} names item ${JSON.stringify(i)} that the denominator does not hold`
        )
    classifyCase(c, context)
  }
  for (const [what, file] of [
    ['outDir', outDir],
    ['ledger', ledger]
  ]) {
    if (!file) continue
    try {
      lstatSync(file)
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw new UsageError(`${what} ${file} is unreadable: ${error.message}`)
    }
    throw new UsageError(`${what} ${file} already exists; a run only writes files it creates`)
  }
}

export async function run(options) {
  validateRunInput(options)
  const {
    target = 'local',
    outDir,
    productRoot = process.env.QA_MAIL_PRODUCT_ROOT ?? REPO_ROOT,
    ledger = path.join(outDir, 'mail-red-ledger.json')
  } = options
  // The run owns a directory only it created; a leftover or a competing run is refused, never
  // revoked or overwritten. The ledger lives inside it (validateRunInput refuses any other place).
  claimOutputDir(outDir)
  return runInner({ ...options, target, productRoot, ledger })
}

/** The committed denominator, refused unless the shared contract holds in full. */
const readDenominator = (file = path.join(LAYER_DIR, 'denominator.json')) =>
  assertCommitted(readJson(file), LAYER, file)

/** Per item and tag: pass / fail / env / pending / na / open, from the verdicts of the cases that claim it. */
export function buildCoverage(cases, results, denominatorFile = path.join(LAYER_DIR, 'denominator.json')) {
  const den = readDenominator(denominatorFile)
  const verdictOf = new Map(results.map((r) => [r.id, r]))
  const variantStatus = (r, itemId) => {
    if (!r?.variantGreen) return null
    const parts = itemId.split(':')
    const key = `${parts[1]}:${parts[2]}`
    return Object.hasOwn(r.variantGreen, key) ? r.variantGreen[key] : null
  }
  const summary = { pass: 0, fail: 0, env: 0, pending: 0, na: 0, open: 0, total: 0 }
  const items = den.items.map((item) => {
    const tags = {}
    // Required and N-A are disjoint in the shared contract; an N-A entry is a key into `naReasons`.
    for (const [tag, key] of Object.entries(item.na)) {
      summary.total += 1
      const parsed = parseNa(den.naReasons[key])
      tags[tag] = { status: 'na', reason: parsed.reason, source: parsed.reference }
      summary.na += 1
    }
    for (const tag of item.requiredTags) {
      summary.total += 1
      const covering = cases.filter((c) => c.itemIds.includes(item.id) && c.edgeTags.includes(tag))
      if (covering.length === 0) {
        tags[tag] = { status: 'open', reason: 'no case written for this obligation in this slice' }
        summary.open += 1
        continue
      }
      let worst = 'PASS'
      const ids = []
      for (const c of covering) {
        const r = verdictOf.get(c.id)
        ids.push(c.id)
        let v = r?.verdict ?? 'PENDING'
        const own = variantStatus(r, item.id)
        if (v === 'FAIL' && own === true) v = 'PENDING'
        if (VERDICT_RANK[v] > VERDICT_RANK[worst]) worst = v
      }
      const status = worst.toLowerCase()
      tags[tag] = { status, cases: ids }
      summary[status] += 1
    }
    return { id: item.id, kind: item.kind, tags }
  })
  return {
    summary,
    unresolved: den.unresolved.length,
    note: 'pass = every covering case PASS with a RED proof; open = no case written; na = declared with reason and source. Not a percentage of the product.',
    items
  }
}

function renderReport(list, coverage, meta) {
  const count = (v) => list.filter((r) => r.verdict === v).length
  const machine = list.filter((r) => r.kind === 'machine')
  const lines = [
    `# Mail layer report`,
    '',
    `Target ${meta.target}, revision ${meta.revision}, prove-red ${meta.proveRed}, ${Math.round(meta.durationMs / 1000)} s.`,
    '',
    `PASS ${count('PASS')} · FAIL ${count('FAIL')} · ENV ${count('ENV')} · PENDING ${count('PENDING')} (of ${list.length} cases)`,
    '',
    `Manual: ${list.filter((r) => r.manual === 'accepted').length} accepted · ${list.filter((r) => r.manual === 'rejected').length} rejected · ${list.filter((r) => r.manual === 'pending' || r.manual === 'stale').length} pending/stale. Sheets: ${meta.sheets ? `${meta.sheets.status} — ${meta.sheets.reason}` : 'not built'}.`,
    `Machine cases ${machine.length}: ${machine.filter((r) => r.verdict === 'PASS').length} PASS, RED-proven ${machine.filter((r) => r.redProof).length}.`,
    '',
    `Coverage obligations: ${coverage.summary.total} required · ${coverage.summary.pass} pass · ${coverage.summary.fail} fail · ${coverage.summary.env} env · ${coverage.summary.pending} pending · ${coverage.summary.na} N-A · ${coverage.summary.open} open. Extraction unresolved: ${coverage.unresolved} (see denominator.json). This is not a claim that the whole product is covered.`,
    '',
    '## Not PASS',
    ''
  ]
  for (const r of list.filter((x) => x.verdict !== 'PASS'))
    lines.push(`- ${r.verdict} \`${r.id}\` — ${r.reason}`)
  return `${lines.join('\n')}\n`
}

export function exitCodeFor(list) {
  if (!Array.isArray(list) || list.length === 0)
    throw new UsageError('no results: an empty run proves nothing')
  if (list.some((r) => r.verdict === 'FAIL')) return 1
  if (list.every((r) => r.verdict === 'PASS')) return 0
  return 3
}

export { utcStamp }
