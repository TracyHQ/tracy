#!/usr/bin/env node
// Assemble release/ for a quickstart: the two archives and manifest.json from the pack, plus
// README.md (how the fleet restores it, how a person does), VERIFICATION.json (parity.json +
// the route table + the restore report + the acceptance evidence), release-notes.md (a template the
// coordinator fills — left alone when it already exists), the theme zip and any extra assets, and
// SHA256SUMS over everything. Prints the publish command and does NOT run it: publishing needs write
// access on the release repository and a person's decision. It asks `gh release view` (read-only)
// first: a new release gets `gh release create --draft`, an existing one `gh release upload
// --clobber` — one command per group, archives, then metadata, then tracy_setting.json — and
// `gh release edit --notes-file`.
//
// Nothing is written until the whole release is accepted (acceptRelease): the canonical
// contracts fresh against --spec (and the theme zip), ONE complete four-tier Visual QA checkpoint
// named by run id in its ledger, each tier's report bound by `artifact-binding.json` to the bytes of
// the theme zip, webroot archive and database archive being released and measured no earlier than
// any of them, a bound content contract (contract-bind.json, run on the restore of this very pack and
// theme zip), a green restore report and parity.json bound to this pack whose access probes ran as
// the runtime user, every tier measured on that restored site after the restore finished. A refusal
// names every reason as `[code] …` and leaves an earlier release/ as it was. The release is
// assembled from the validated bytes in a temporary directory beside --out, the copies checked, the
// whole release accepted again and every input compared (bytes and mtime) with the first reading,
// then swapped in under a lock — only for an empty --out or a completed earlier release.
//
// `--patch` is a FIX release of a port that was already released: no four-tier checkpoint and no design or
// visual contract GATE (their freshness against the spec is not checked), but it reads the dossier's visual.contract.json for the renderable
// routes the measure must cover and the source site the evidence is judged against; the same runtime evidence, the same bound content contract, and instead of the
// checkpoint targeted measurement evidence (`--measure`, lib/fix-measure.mjs) that must pass on the restored
// site, bound to this theme zip and shown to fail on the previous version (`--previous`; the baseline run is
// site-sweep.mjs with `--zip` of the PREVIOUS theme zip, `--baseline` of its output on the final run).
// The measure must be a FULL run of every check over every renderable route of the dossier's visual contract (its `coverage`;
// lib/sweep-coverage.mjs), taken against the source as it is now (its `sourceFingerprint`, read again here; lib/source-fingerprint.mjs).
// `--no-baseline` is free text the release cannot check: it is recorded as an unverified exception in VERIFICATION.json and the notes.
// See references/quickstart.md §Fix release.
//
// Two ways to the checkpoint. FULL: `--checkpoint` is the four-tier run measured on the restored site after the restore. REUSE
// (`--restore-smoke <run>`, in the same ledger): `--checkpoint` is the four-tier run of the BUILD stand, each tier bound (artifact-binding.json,
// written as it was measured, after the pack existed) to this theme zip, webroot and database, and parity.json found the restored pack
// equal to the build stand with zero style drift; the restored site then needs only one tier (`dark-responsive`, which holds the dark theme and
// the narrow layout) measured on it after the restore, bound to the same artifacts, full and clean (reuseProblems). Any mismatch — a hash, the
// pack, drift, a missing binding, a smoke of another tier, site or time — keeps the full requirement. VERIFICATION.json says which path was
// taken (`acceptance.visual.path`).
//
// A first (non-patch) release also carries a BEHAVIOUR PASS (`--behaviour-sweep <site-sweep.json>`): a site-sweep run of all eleven
// checks (no --only; each one passed, with a case measured) on the restored site, bound to this theme zip, made after
// the restore, over every route of the visual contract. Every group it reports is fixed (the run is clean) or recorded in the dossier's
// `sweep.accept` (it then counts as accepted, not as a defect). Without it the release is refused `[behaviour-pass-missing]` with the
// command to run; a patch release keeps its own measure and does not take it (behaviourProblems).
//
// Both modes also need a clean, current FINISH AUDIT of the dossier (`<--run-root>/port-audit.json`, review/port-audit.mjs --dossier
// --out; lib/audit-receipt.mjs): of the restored site and every declared route, with every dossier input (DECISIONS.md, the CMS
// allowlist, behaviour reviews, acceptance files) hashed from this release's own dossier. The full release binds it to the four
// tiers' interaction records; a fix release, which has no four-tier run, binds it to the theme zip (`--theme-zip`) and to the
// restore (made after the restore finished). A refusal is `[audit-…]`.
//
// Usage: node release.mjs --pack <dir> --out <dir> --parity <parity.json> --restore-report <json>
//        --run-root <dossier> --spec <spec-pack> --theme-zip <zip> --visual-ledger <rounds.jsonl>
//        --checkpoint <run> [--restore-smoke <run>] --behaviour-sweep <site-sweep.json> --contract-bind <contract-bind.json> [--asset <file>]… [--repo JoomlArt-Products/joomlart-products] [--title "…"] [--force-notes]
//        --patch --previous <VERIFICATION.json|release dir> --measure <file> [--no-baseline "<reason>"] [--changed-from <zip>]
//               (with --pack --out --parity --restore-report --theme-zip --contract-bind --run-root; --spec only for the route declarations)
import { spawnSync } from 'node:child_process'
import { closeSync, constants as FS, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { acquireLock, bindingProblems, checkSums, cli, isArtifactName, isRenderableStatus, isRouteStatus, archiveConfig, CONFIG_MEMBERS, listArchive, normalSiteUrl, parseArgs, parseSums, readPack, routeExpectations, sha256File, sha256Text, sumsText, startDeadline, PLACEHOLDER_URL, UsageError } from './lib.mjs'
import { CANONICAL, darkDerivedProblems, groupIdOf, identityOf, resolveContract, specHash } from '../lib/canonical.mjs'
import { recordData, repoRootOf } from '../lib/record-paths.mjs'
import { validateDesign } from '../design-contract.mjs'
import { STAGES, validateContract } from '../visual/contract.mjs'
import { accept as exceptionFor, bindDecisions, decisionsOf } from '../visual/visual-qa.mjs'
import { COUNT_OPTIONS, COUNT_TYPES } from './verify-parity.mjs'
import { CONTRACT_RE } from './contract-bind.mjs'
import { advisoryWarning, auditReceiptProblems } from '../lib/audit-receipt.mjs'
import { carriedEvidence, validateFixMeasure } from '../lib/fix-measure.mjs'
import { diffZips, zipIndex, zipMemberText } from '../lib/zip-index.mjs'
import { DARK_DERIVED_REASON } from '../visual/site-sweep-judge.mjs'
import { ALL_CHECKS, DEFAULT_SCHEMES, DEFAULT_WIDTHS, SWEEP_SCHEMA, dossierPlan } from '../visual/site-sweep.mjs'
import { heightsWidths } from '../visual/site-sweep-heights.mjs'
import { coverageFromReport, coverageProblems, sweepOutcomeProblems } from '../lib/sweep-coverage.mjs'
import { bindReferenceKinds, SWEEP_APPLICABILITY_VERSION } from '../visual/applicability.mjs'
import { sweepInputs } from '../visual/site-sweep.mjs'
import { differsFrom, fingerprintOf, homeUrlOf, templateOf, validateFingerprint } from '../lib/source-fingerprint.mjs'
import { fileURLToPath } from 'node:url'
import { settleOutput } from '../visual/site-sweep-publish.mjs'
import { BINDING_FILE, BINDING_SCHEMA, isCompleteCheckpoint, reportProblems, tierOuts } from '../visual/round.mjs'

// the one tier measured on the restored pack when the four-tier checkpoint of the build stand is reused: dark and the narrow layout in one run
export const SMOKE_TIER = 'dark-responsive'

const SPEC = {
  '--pack': { placeholder: 'dir', required: true, help: 'pack.mjs output' },
  '--out': { placeholder: 'dir', required: true, help: 'release directory to assemble (replaced whole once the release is accepted; release-notes.md is kept)' },
  '--parity': { placeholder: 'file', required: true, help: 'verify-parity.mjs output: ok, its access probe run as the runtime user, of this pack' },
  '--restore-report': { placeholder: 'file', required: true, help: 'restore.mjs --report output: ok, of this pack and the stand parity measured' },
  '--asset': {
    placeholder: 'file',
    repeat: true,
    help: 'extra release asset (profile zip); repeatable'
  },
  '--repo': { placeholder: 'owner/name', default: 'JoomlArt-Products/joomlart-products' },
  '--title': { placeholder: 'text', help: 'release title (default from the manifest id)' },
  '--admin': { placeholder: 'login', default: 'tracyagent', help: 'the account the pack ships (prune-audit --admin), named in README.md' },
  '--force-notes': { value: false, help: 'overwrite an existing release-notes.md with the template' },
  '--timeout': { placeholder: 's', default: '900', help: 'seconds for the whole release; past it the run ends with exit 1' },
  '--run-root': { placeholder: 'dir', help: 'the site dossier: it holds the CANONICAL design-contract.json and visual.contract.json (a release names them and refuses a stale one), DECISIONS.md and the finish audit port-audit.json (port-audit.mjs --dossier --out) the release is refused without — required in both modes' },
  '--spec': { placeholder: 'dir', help: 'spec-pack the contracts are bound to (staleness check), and whose page-map.json declares the status of each parity route (required unless --patch; a patch reads only the page map)' },
  '--theme-zip': { placeholder: 'file', required: true, help: 'the final theme zip: released as an asset, and every Visual QA tier must be bound to its bytes' },
  '--visual-ledger': { placeholder: 'file', help: 'the Visual QA ledger (round.mjs <evidence>/rounds.jsonl) that holds --checkpoint (required unless --patch)' },
  '--contract-bind': { placeholder: 'file', required: true, help: 'contract-bind.mjs evidence (contract-bind.json): bound, run with --pack and --theme-zip on the restore of this pack, after it finished' },
  '--checkpoint': { placeholder: 'run', help: 'run id of the complete four-tier checkpoint in --visual-ledger the release quotes (required unless --patch)' },
  '--restore-smoke': { placeholder: 'run', help: `run id, in --visual-ledger, of the one-tier ${SMOKE_TIER} smoke measured on the restored pack: with it, --checkpoint may be the four-tier checkpoint of the BUILD stand, when it is bound to the same theme zip, webroot and database as the pack restored and parity found no style drift (reuseProblems); any mismatch and --checkpoint must be four tiers on the restored site` },
  '--behaviour-sweep': { placeholder: 'file', help: 'a first release (not --patch): site-sweep.json of `site-sweep.mjs --zip <theme zip>` (no --only: all eleven checks, each passed with a case measured) on the restored site, after the restore, every group fixed or in sweep.accept (behaviourProblems)' },
  '--patch': { value: false, help: 'a fix release of a port already released: targeted measurement (--measure) instead of the four-tier checkpoint and the contract gates; visual.contract.json is read only for the routes the measure must cover and the source site' },
  '--previous': { placeholder: 'file|dir', help: '--patch: the VERIFICATION.json (or the release directory) of the last release: same id, a lower version (a record whose `release` lacks the manifest id\'s `quickstart/` prefix is accepted, with a note)' },
  '--sweep': { placeholder: 'file', help: '--patch: the site-sweep.json of the full run the --measure stands on (default: site-sweep.json beside the measure): its rows prove the measure\'s coverage, its source fingerprint and its results' },
  '--measure': { placeholder: 'file', help: '--patch: tracy-fix-measure/v1 evidence (lib/fix-measure.mjs): every check passes, on this theme zip, on the restored site after the restore; copied into the release as fix-measure.json' },
  '--setting-template': { placeholder: 'file', help: 'the published tracy_setting.json of this port (any earlier release): the release writes the new one from it — version from the manifest, the new archive names and sha256, everything else kept' },
  '--card': { placeholder: 'file', help: 'the port\'s tracy_design_inspiration.json, copied into the release byte for byte' },
  '--no-baseline': { placeholder: 'reason', help: '--patch: the measure carries no baseline on the previous version; the reason is recorded verbatim (a baseline run is `site-sweep.mjs --zip <the previous theme zip> …`; fix-measure.mjs merge builds the per-check baseline)' },
  '--baseline-version': { placeholder: 'x.y.z', help: '--patch: the theme version the measure\'s baseline ran on and the previous theme zip carries, when it is not the previous release version' },
  '--changed-from': { placeholder: 'zip', help: '--patch: the previous theme zip; the files that differ are recorded, and a change that looks like more than a fix is warned about' }
}

/** A named reason a release (or a cycle) is refused. */
const problem = (code, message) => ({ code, message })
export const formatProblems = (problems) => problems.map((p) => `[${p.code}] ${p.message}`).join('\n  ')
export class AcceptanceError extends Error {
  constructor(what, problems) {
    super(`${what}:\n  ${formatProblems(problems)}`)
    this.problems = problems
  }
}

// Every file acceptRelease reads through readRegular, by absolute path: its hash, size and mtime.
// Assembly accepts the release again just before the swap and compares the two (input-changed).
let reads = null
const openRegular = (file) => {
  let fd
  try {
    fd = openSync(file, FS.O_RDONLY | FS.O_NOFOLLOW | FS.O_NONBLOCK)
  } catch (e) {
    throw new Error(e.code === 'ELOOP' ? `${file} is a symlink, not a regular file` : `${file} cannot be read (${e.code ?? e.message})`)
  }
  const stat = fstatSync(fd)
  if (!stat.isFile()) {
    closeSync(fd)
    throw new Error(`${file} is not a regular file`)
  }
  return { fd, stat }
}
/**
 * The bytes of a regular file, read without following a final symlink and without blocking on a
 * FIFO; `stat` is of the descriptor that was read. Anything else throws naming what it is.
 */
export function readRegular(file) {
  const { fd, stat } = openRegular(file)
  try {
    const bytes = readFileSync(fd)
    reads?.set(path.resolve(file), { sha256: sha256Text(bytes), size: bytes.length, mtimeMs: stat.mtimeMs })
    return { bytes, stat }
  } finally {
    closeSync(fd)
  }
}
/** Throws unless `file` is a regular file (no symlink followed, a FIFO never waited on); nothing is read. */
function checkRegular(file) {
  closeSync(openRegular(file).fd)
}
const readJsonRegular = (file) => {
  const { bytes, stat } = readRegular(file)
  let json
  try {
    json = JSON.parse(bytes.toString('utf8'))
  } catch (e) {
    throw new Error(`${file} is not JSON (${String(e.message).split('\n')[0]})`)
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error(`${file} does not hold a JSON object`)
  return { json, bytes, stat }
}
const tagged = (bytes) => `sha256:${sha256Text(bytes)}`
const HASH_RE = /^sha256:[0-9a-f]{64}$/
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
/** Milliseconds of an ISO-8601 timestamp with a zone, or null. */
const isoMs = (v) => (typeof v === 'string' && ISO_RE.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null)
// A measurement recorded in the future is a clock or a hand edit, not a measurement.
const CLOCK_SKEW_MS = 5 * 60 * 1000
const obj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const nonEmptyString = (x) => typeof x === 'string' && x.trim() !== ''
const lexists = (p) => {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}
/** An absolute http(s) URL with a host and no credentials — what a measured site is. */
const isSiteUrl = (u) => {
  if (typeof u !== 'string' || !u) return false
  try {
    const x = new URL(u)
    return ['http:', 'https:'].includes(x.protocol) && Boolean(x.hostname) && !x.username && !x.password
  } catch {
    return false
  }
}
const SPEC_FILES = ['page-map.json', 'sections.json', 'content.json']
// The gates the contracts were written through: whatever they reject — a list of errors or a throw on
// a shape they did not expect — is one contract-invalid refusal, never a TypeError out of the release.
export const contractErrors = (key, c, decisions) => {
  try {
    if (key === 'design') {
      validateDesign(c, { decisions })
      return []
    }
    const errors = validateContract(c, { decisions })
    return Array.isArray(errors) ? errors.map(String) : ['validateContract returned no list of errors']
  } catch (e) {
    return [String(e?.message ?? e)]
  }
}

/**
 * Why the run-root's canonical contracts cannot back a cycle or a release, against the spec-pack
 * (and the theme zip) as they are now: `{problems, contracts}`, each problem a named code —
 * run-root-missing, spec-missing, spec-unreadable, contract-missing, contract-ambiguous,
 * contract-unreadable, contract-unbound (no specHash binding to verify), contract-invalid (not the
 * structure validateDesign / validateContract require), contract-stale. `parsed` holds the contracts
 * that were read and valid.
 */
export function contractProblems({ runRoot, specDir, artifactPath = null }) {
  const problems = []
  const contracts = {}
  const parsed = {}
  if (!runRoot) problems.push(problem('run-root-missing', 'no --run-root: the canonical contracts cannot be named'))
  if (!specDir) problems.push(problem('spec-missing', 'no --spec: the contracts cannot be checked against the spec-pack they were written for'))
  else
    try {
      // specHash and identityOf read these with readFileSync: a FIFO would hold the run, a symlink
      // would hash a file outside the spec-pack. A file that is absent is left to specHash to name.
      for (const f of [...SPEC_FILES, 'reference.json']) {
        const p = path.join(specDir, f)
        if (lexists(p)) readRegular(p)
      }
      specHash(specDir)
    } catch (e) {
      problems.push(problem('spec-unreadable', e.message))
    }
  if (!runRoot) return { problems, contracts, parsed }
  for (const [key, name] of Object.entries(CANONICAL)) {
    let resolved
    try {
      resolved = resolveContract({ runRoot, name })
    } catch (e) {
      problems.push(problem(existsSync(path.join(runRoot, name)) ? 'contract-ambiguous' : 'contract-missing', e.message))
      continue
    }
    let contract
    try {
      contract = readJsonRegular(resolved.path).json
    } catch (e) {
      problems.push(problem('contract-unreadable', `${name}: ${e.message}`))
      continue
    }
    if (typeof contract.bindings?.specHash !== 'string' || !HASH_RE.test(contract.bindings.specHash)) {
      problems.push(problem('contract-unbound', `${name} records no specHash binding — its freshness cannot be verified; regenerate it against the spec-pack`))
      continue
    }
    // The structure the gates that wrote and read it hold it to: the spec-pack gate (validateDesign)
    // and visual-qa (validateContract, bindings checked below against the spec-pack given here).
    const invalid = contractErrors(key, contract, decisionsOf({}, resolved.path, contract))
    if (invalid.length) {
      problems.push(problem('contract-invalid', `${name} is not a valid ${key} contract: ${invalid.slice(0, 3).join('; ')}${invalid.length > 3 ? '; …' : ''}`))
      continue
    }
    if (groupIdOf(contract)) {
      problems.push(problem('contract-group', `${name} is page group ${groupIdOf(contract)}'s contract (its pages only) — a release reads the site's own contract from the main dossier`))
      continue
    }
    parsed[key] = contract
    if (!specDir || problems.some((p) => p.code === 'spec-unreadable')) continue
    let identity
    try {
      identity = identityOf({ contractPath: resolved.path, contract, specDir, artifactPath })
    } catch (e) {
      problems.push(problem('contract-invalid', `${name}: its identity cannot be computed (${e.message})`))
      continue
    }
    if (identity.stale.length) problems.push(problem('contract-stale', `${name} is stale — ${identity.stale.join('; ')} — regenerate it before releasing`))
    else contracts[key] = identity
  }
  return { problems, contracts, parsed }
}

/**
 * The contracts a release may quote: the run-root's canonical design and visual contracts, each
 * bound to the inputs as they are now. A missing canonical, a second candidate beside it, an unbound
 * or a stale binding stops the release — a gate that read another file is not this release's gate.
 */
export function contractsFor({ runRoot, specDir = null, artifactPath = null }) {
  const { problems, contracts } = contractProblems({ runRoot, specDir, artifactPath })
  if (problems.length) throw new AcceptanceError('the contracts cannot back a release', problems)
  return contracts
}

// ---------------------------------------------------------------- Visual QA checkpoint
// the binding round.mjs writes when a tier is measured (config `pack` + `artifact`); release only reads it
export { BINDING_SCHEMA, BINDING_FILE }
const ARTIFACT_KEYS = Object.freeze(['theme', 'webroot', 'database'])
export const TIER_IDS = Object.freeze(STAGES.map((s) => s.id))

/**
 * The one ledger line named `run`: `{line, problems}`. A ledger with a line that is not JSON is not
 * read around; two lines with the run id are ambiguous.
 */
function readCheckpoint({ ledger, run }) {
  if (!ledger) return { line: null, problems: [problem('checkpoint-missing', 'no --visual-ledger: the Visual QA checkpoint cannot be named')] }
  if (!run) return { line: null, problems: [problem('checkpoint-missing', 'no --checkpoint: name the run id of the complete checkpoint the release quotes')] }
  let text
  try {
    text = readRegular(ledger).bytes.toString('utf8')
  } catch (e) {
    return { line: null, problems: [problem('checkpoint-unreadable', e.message)] }
  }
  const lines = []
  for (const [i, raw] of text.split('\n').entries()) {
    if (!raw.trim()) continue
    try {
      lines.push(JSON.parse(raw))
    } catch {
      return { line: null, problems: [problem('checkpoint-unreadable', `${ledger} line ${i + 1} is not JSON — the ledger is cut or edited`)] }
    }
  }
  const hits = lines.filter((l) => obj(l) && l.run === run)
  if (!hits.length) return { line: null, problems: [problem('checkpoint-missing', `${ledger} holds no line for run ${JSON.stringify(run)}`)] }
  if (hits.length > 1) return { line: null, problems: [problem('checkpoint-ambiguous', `${ledger} holds ${hits.length} lines for run ${JSON.stringify(run)}`)] }
  return { line: hits[0], problems: [] }
}

/** Problems of the checkpoint line itself, before any tier report is read. */
function checkpointLineProblems(line, { now = Date.now(), stages = TIER_IDS } = {}) {
  // The shape tierOuts and the checks below read, before they read it.
  const shape = []
  if (line.tiers !== undefined && (!obj(line.tiers) || !Object.values(line.tiers).every(obj))) shape.push('tiers is not an object of tier records')
  if (line.stages !== undefined && (!Array.isArray(line.stages) || !line.stages.every((x) => typeof x === 'string'))) shape.push('stages is not a list of tier ids')
  if (line.tiers === undefined && line.out !== undefined && typeof line.out !== 'string') shape.push('out is not a path')
  for (const k of ['scope', 'findings', 'determinism']) if (line[k] !== undefined && !obj(line[k])) shape.push(`${k} is not an object`)
  if (line.determinism?.errors !== undefined && !Array.isArray(line.determinism.errors)) shape.push('determinism.errors is not a list')
  if (shape.length) return [problem('checkpoint-invalid', `run ${line.run}: the ledger line is malformed — ${shape.join('; ')}`)]
  const out = []
  if (line.kind !== 'checkpoint') out.push(problem('checkpoint-not-full', `run ${line.run} is a ${line.kind ?? 'legacy'} line, not a checkpoint — a recheck or a targeted round cannot back a release`))
  if (line.scope?.kind !== 'full') out.push(problem('checkpoint-not-full', `run ${line.run} scope is ${line.scope?.kind ?? 'unknown'}, not full`))
  if (line.complete !== true || line.interrupted || line.failedStep || line.incomplete)
    out.push(problem('checkpoint-incomplete', `run ${line.run} is not complete${line.incomplete ? `: ${line.incomplete}` : line.interrupted ? ' (interrupted)' : line.failedStep ? ` (failed at ${line.failedStep})` : ''}`))
  if ((line.axisErrors ?? 0) !== 0 || line.determinism?.errors?.length) out.push(problem('checkpoint-incomplete', `run ${line.run} carries axis errors or determinism errors`))
  if (line.findings?.total !== 0 || line.findings?.unclassified !== 0)
    out.push(problem('checkpoint-findings', `run ${line.run} has ${line.findings?.total ?? 'unknown'} finding(s), ${line.findings?.unclassified ?? 'unknown'} unclassified — only a clean checkpoint backs a release`))
  if (Array.isArray(line.stages) && new Set(line.stages).size !== line.stages.length) out.push(problem('tier-duplicate', `run ${line.run} lists a tier twice: ${line.stages.join(', ')}`))
  const outs = tierOuts(line)
  for (const id of stages) if (!outs[id]) out.push(problem('tier-missing', `run ${line.run} has no ${id} tier`))
  for (const id of Object.keys(outs)) if (!stages.includes(id)) out.push(problem('tier-unknown', `run ${line.run} has a tier ${JSON.stringify(id)} that is not one of ${stages.join(', ')}`))
  const seen = new Map()
  for (const [id, dir] of Object.entries(outs)) {
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) out.push(problem('tier-report', `${id}: the tier directory ${JSON.stringify(dir)} is not an absolute path`))
    else if (seen.has(path.resolve(dir))) out.push(problem('tier-duplicate', `${id} and ${seen.get(path.resolve(dir))} name the same report directory ${dir}`))
    else seen.set(path.resolve(dir), id)
  }
  const start = isoMs(line.start)
  const end = isoMs(line.end)
  if (start === null || end === null) out.push(problem('timestamp-invalid', `run ${line.run} records no valid start/end (${JSON.stringify(line.start ?? null)} – ${JSON.stringify(line.end ?? null)})`))
  else {
    if (start > end) out.push(problem('timestamp-invalid', `run ${line.run} ends at ${line.end}, before it started at ${line.start}`))
    if (end > now + CLOCK_SKEW_MS) out.push(problem('timestamp-invalid', `run ${line.run} ends at ${line.end}, later than now`))
  }
  if (!out.length && !isCompleteCheckpoint(line, stages)) out.push(problem('checkpoint-incomplete', `run ${line.run} is not a complete checkpoint (a tier report is missing)`))
  return out
}

/** Why a tier report does not have the shape reportProblems and the tier checks read (empty = it does). */
function reportShapeProblems(report) {
  const out = []
  const list = (x, what, each = obj) => {
    if (x !== undefined && (!Array.isArray(x) || !x.every(each))) out.push(`${what} is not a list of ${each === obj ? 'objects' : 'strings'}`)
  }
  if (!Array.isArray(report.stages) || !report.stages.every(obj)) out.push('stages is not a list of objects')
  if (!Array.isArray(report.pages) || !report.pages.every(obj)) out.push('pages is not a list of objects')
  for (const k of ['summary', 'scope']) if (!obj(report[k])) out.push(`${k} is not an object`)
  if (report.identity !== undefined && !obj(report.identity)) out.push('identity is not an object')
  list(report.summary?.stale, 'summary.stale', (x) => typeof x === 'string')
  for (const p of Array.isArray(report.pages) ? report.pages.filter(obj) : []) {
    if (!Array.isArray(p.axes)) out.push(`page ${p.id} axes is not a list`)
    list(p.axes, `page ${p.id} axes`)
    list(p.findings, `page ${p.id} findings`)
    for (const a of Array.isArray(p.axes) ? p.axes.filter(obj) : []) {
      if (!Array.isArray(a.findings)) out.push(`page ${p.id} ${a.variant} findings is not a list`)
      list(a.findings, `page ${p.id} ${a.variant} findings`)
      list(a.accepted, `page ${p.id} ${a.variant} accepted`)
      if (a.containers !== undefined && a.containers !== null && !obj(a.containers)) out.push(`page ${p.id} ${a.variant} containers is not an object`)
      else list(a.containers?.rows, `page ${p.id} ${a.variant} containers.rows`)
      if (a.coverage !== undefined && a.coverage !== null && (!obj(a.coverage) || (a.coverage.unclassified !== undefined && !Array.isArray(a.coverage.unclassified))))
        out.push(`page ${p.id} ${a.variant} coverage is not {unclassified: [...]}`)
    }
  }
  return out
}

const sameElement = (x, y) => JSON.stringify(x) === JSON.stringify(y)
/**
 * An accepted entry stands only if the canonical visual contract accepts it now: the finding it
 * carries (the entry without `exception`) is classified by visual-qa's own accept(), and the
 * exception it cites must be the one accept() picks — same kind, and the reason and decision the
 * contract records. A reason written into the report, or an exception the contract no longer has,
 * is not an acceptance.
 */
function acceptedBy(contract, entry, page, axis = null) {
  if (!obj(entry) || !obj(entry.exception)) return false
  const { exception, ...finding } = entry
  let x
  try {
    x = exceptionFor(contract, finding, page, axis)
  } catch {
    return false // an exception whose match is not a regular expression accepts nothing
  }
  return !!x && x.kind === finding.kind && nonEmptyString(x.decision) && x.reason === exception.reason && x.decision === exception.decision
}
/**
 * The findings a tier report carries in its pages, counted from the payload the way visual-qa's
 * summarize() counts them — never read from a total: `findings` (every axis finding),
 * `unclassified` (unclassified-element findings), `unrecorded` (a coverage.unclassified element
 * neither a finding nor an accepted exception), `uncited` (an accepted entry the contract's
 * exceptions do not accept — see acceptedBy), `pageMismatch` (pages whose flat findings list is not
 * their axes' findings).
 */
export function payloadFindings(report, contract) {
  const n = { findings: 0, unclassified: 0, unrecorded: [], uncited: [], pageMismatch: [] }
  for (const p of report.pages) {
    let axisFindings = 0
    for (const a of p.axes) {
      const where = `${p.id} ${a.variant}`
      axisFindings += a.findings.length
      n.findings += a.findings.length
      n.unclassified += a.findings.filter((f) => f.kind === 'unclassified-element').length
      const accepted = a.accepted ?? []
      for (const x of accepted) if (!acceptedBy(contract, x, p, a.variant)) n.uncited.push(`${where} ${x.kind ?? 'finding'}`)
      const recorded = [...a.findings, ...accepted].filter((f) => f.kind === 'unclassified-element')
      for (const u of a.coverage?.unclassified ?? []) if (!recorded.some((f) => sameElement(f.element, u))) n.unrecorded.push(where)
    }
    if (p.findings !== undefined && p.findings.length !== axisFindings) n.pageMismatch.push(`${p.id} (${p.findings.length} listed, ${axisFindings} on its axes)`)
  }
  return n
}

/**
 * One tier: its report is the full, clean, fresh measurement of every contract page on the tier's
 * axes, against the canonical visual contract, and its artifact-binding.json binds that very report
 * (by hash) to the release artifacts as measured now (`artifacts`: key → {file, sha256, mtimeMs}),
 * measured no earlier than any of them, on the site restore and parity vouch for (`siteUrl`), after
 * that restore finished (`restoredAt`, ms). A tier of the BUILD stand (the reuse path, reuseProblems) names the build
 * stand as `siteUrl`, has no `restoredAt`, and was measured no later than `notAfter` (ms). Returns `{problems, tier}`.
 */
function tierProblems({ stage, entry, dir, visualContract, visualIdentity, artifacts, line, siteUrl = null, restoredAt = null, notAfter = null, now = Date.now() }) {
  const out = []
  const P = (code, msg) => out.push(problem(code, `${stage}: ${msg}`))
  let report
  let reportBytes
  try {
    ;({ json: report, bytes: reportBytes } = readJsonRegular(path.join(dir, 'visual.json')))
  } catch (e) {
    P('tier-report', e.message)
    return { problems: out, tier: null }
  }
  const shape = reportShapeProblems(report)
  if (shape.length) {
    P('tier-report', `visual.json is malformed — ${shape.slice(0, 3).join('; ')}`)
    return { problems: out, tier: null }
  }
  const exit = entry?.exit
  if (exit !== 0) P('tier-failed', `visual-qa exited ${JSON.stringify(exit ?? null)} for this tier, not 0`)
  for (const p of reportProblems({ contract: visualContract, stage, report, exit: exit ?? null, pages: (visualContract.pages ?? []).map((p) => p.id), full: true })) P('tier-report', p)
  const row = report.stages.find((s) => s.id === stage)
  if (row?.status !== 'pass') P('tier-failed', `the report's ${stage} stage is ${row?.status ?? 'absent'}, not pass`)
  if (report.summary?.findings !== 0 || report.summary?.unclassified !== 0) P('tier-failed', `the report has ${report.summary?.findings ?? 'unknown'} finding(s), ${report.summary?.unclassified ?? 'unknown'} unclassified`)
  // Clean is what the pages carry, not what a total says: the payload is recounted and the report
  // summary, its stage row and the ledger's tier entry must each give that count.
  const counted = payloadFindings(report, visualContract)
  if (counted.findings || counted.unclassified) P('tier-findings', `the report's pages carry ${counted.findings} finding(s), ${counted.unclassified} unclassified`)
  if (counted.unrecorded.length) P('tier-findings', `${counted.unrecorded.length} unclassified coverage element(s) neither a finding nor an accepted exception (${counted.unrecorded.slice(0, 3).join('; ')})`)
  if (counted.uncited.length) P('tier-findings', `${counted.uncited.length} accepted entr${counted.uncited.length > 1 ? 'ies' : 'y'} the canonical contract's exceptions do not accept (${counted.uncited.slice(0, 3).join('; ')})`)
  if (counted.pageMismatch.length) P('tier-findings', `page findings disagree with their axes: ${counted.pageMismatch.slice(0, 3).join('; ')}`)
  const totals = [
    ['the report summary', report.summary?.findings, report.summary?.unclassified],
    [`the report's ${stage} stage row`, row?.findings, counted.unclassified],
    ['the ledger tier entry', entry?.findings?.total, entry?.findings?.unclassified]
  ]
  for (const [what, total, unclassified] of totals)
    if (total !== counted.findings || unclassified !== counted.unclassified)
      P('tier-findings', `${what} says ${JSON.stringify(total ?? null)} finding(s), ${JSON.stringify(unclassified ?? null)} unclassified; the pages carry ${counted.findings}, ${counted.unclassified}`)
  if (entry?.axisErrors !== undefined && entry.axisErrors !== 0) P('tier-findings', `the ledger tier entry records ${JSON.stringify(entry.axisErrors)} axis error(s)`)
  const id = report.identity
  if (!id || typeof id !== 'object') P('tier-contract', 'the report carries no contract identity')
  else {
    if (path.resolve(String(id.contractPath ?? '')) !== visualIdentity.contractPath) P('tier-contract', `measured against ${id.contractPath ?? 'no contract'}, not the canonical ${visualIdentity.contractPath}`)
    if (id.contractHash !== visualIdentity.contractHash) P('tier-contract', `measured against contract ${id.contractHash ?? 'unknown'}, the canonical is ${visualIdentity.contractHash}`)
    if (!Array.isArray(id.stale) || id.stale.length) P('tier-contract', `the report's contract identity is stale or unrecorded (${JSON.stringify(id.stale ?? null)})`)
  }
  // The theme measured: visual-qa --artifact <theme zip> records it; a report without it measured a
  // theme nobody named, and a binding written afterwards cannot say which.
  if (typeof id?.artifactHash !== 'string' || !HASH_RE.test(id.artifactHash)) P('binding-missing', `the report's identity.artifactHash is ${JSON.stringify(id?.artifactHash ?? null)} — visual-qa ran without --artifact <theme zip>`)
  else if (id.artifactHash !== artifacts.theme.sha256) P('artifact-mismatch', `the report's identity.artifactHash ${id.artifactHash} is not the theme zip ${artifacts.theme.sha256}`)
  // The site measured is the restored one restore and parity vouch for.
  if (!isSiteUrl(report.site)) P('tier-site', `the report records no measured site URL (${JSON.stringify(report.site ?? null)})`)
  else if (!siteUrl) P('tier-site', `measured ${report.site}, but no ${notAfter === null ? 'restored' : 'build stand'} site URL is vouched for by the restore report and parity.json`)
  else if (siteUrl && normalSiteUrl(report.site) !== siteUrl) P('tier-site', notAfter === null ? `measured ${report.site}, not the restored site ${siteUrl} the restore report and parity.json are of` : `measured ${report.site}, not the build stand ${siteUrl} parity.json compared (a)`)
  // The measurement time is the one the report recorded, never a file's mtime.
  const at = isoMs(report.at)
  const start = isoMs(line.start)
  const end = isoMs(line.end)
  if (at === null) P('timestamp-invalid', `the report's measurement time ${JSON.stringify(report.at ?? null)} is not an ISO-8601 timestamp`)
  else {
    if (obj(id) && isoMs(id.capturedAt) !== at) P('timestamp-invalid', `the report says it was measured at ${report.at} and its identity at ${JSON.stringify(id.capturedAt ?? null)}`)
    if (start !== null && end !== null && (at < start || at > end)) P('timestamp-invalid', `measured at ${report.at}, outside its checkpoint ${line.start} – ${line.end}`)
    if (at > now + CLOCK_SKEW_MS) P('timestamp-invalid', `measured at ${report.at}, later than now`)
    if (notAfter !== null && at > notAfter) P('evidence-stale', `measured at ${report.at}, after parity was measured (${new Date(notAfter).toISOString()}): a build checkpoint that stands in for the restored one is measured before the restore is checked`)
    if (restoredAt !== null && at < restoredAt) P('evidence-stale', `measured at ${report.at}, before the restore it measured finished (${new Date(restoredAt).toISOString()})`)
  }
  let binding
  let bindingBytes
  try {
    ;({ json: binding, bytes: bindingBytes } = readJsonRegular(path.join(dir, BINDING_FILE)))
  } catch (e) {
    P(existsSync(path.join(dir, BINDING_FILE)) || /symlink|regular file/.test(e.message) ? 'binding-invalid' : 'binding-missing', `${BINDING_FILE}: ${e.message}`)
    return { problems: out, tier: null }
  }
  if (binding.schema !== BINDING_SCHEMA) P('binding-invalid', `${BINDING_FILE} schema is ${JSON.stringify(binding.schema ?? null)}, not ${BINDING_SCHEMA}`)
  if (binding.stage !== stage) P('binding-invalid', `${BINDING_FILE} is for stage ${JSON.stringify(binding.stage ?? null)}`)
  if (binding.report?.file !== 'visual.json' || binding.report?.sha256 !== tagged(reportBytes)) P('binding-invalid', `${BINDING_FILE} binds report ${JSON.stringify(binding.report?.sha256 ?? null)}, the tier's visual.json is ${tagged(reportBytes)}`)
  if (binding.measuredAt !== report.at) P('timestamp-invalid', `${BINDING_FILE} says measured at ${JSON.stringify(binding.measuredAt ?? null)}, the report at ${JSON.stringify(report.at ?? null)}`)
  const bound = binding.artifactHash
  for (const key of ARTIFACT_KEYS) {
    const b = bound?.[key]
    const a = artifacts[key]
    if (!b || typeof b !== 'object') P('binding-missing', `${BINDING_FILE} records no ${key} artifactHash`)
    else if (typeof b.sha256 !== 'string' || !HASH_RE.test(b.sha256) || !isArtifactName(b.file)) P('binding-invalid', `${BINDING_FILE} ${key} is not {file, sha256: "sha256:<hex>"}`)
    else if (b.file !== a.file || b.sha256 !== a.sha256) P('artifact-mismatch', `bound to ${key} ${b.file} ${b.sha256}, the release's ${key} is ${a.file} ${a.sha256}`)
    else if (at !== null && at < Math.floor(a.mtimeMs)) P('evidence-stale', `measured at ${report.at}, before the ${key} artifact ${a.file} was written (${new Date(a.mtimeMs).toISOString()})`)
  }
  return {
    problems: out,
    tier: { stage, dir: path.resolve(dir), site: report.site ?? null, report: tagged(reportBytes), binding: tagged(bindingBytes), measuredAt: report.at, status: row?.status ?? null, pages: report.pages.length }
  }
}

/** The whole checkpoint: the line, then every tier. Returns `{problems, visual}`. */
function checkpointProblems({ ledger, run, visualContract, visualIdentity, artifacts, siteUrl = null, restoredAt = null, notAfter = null, stages = TIER_IDS, now = Date.now() }) {
  // the exceptions a tier report cites are applied through the decisions of the dossier the contract lives in (an unbound contract accepts nothing)
  bindDecisions(visualContract, decisionsOf({}, visualIdentity.contractPath, visualContract))
  const read = readCheckpoint({ ledger, run })
  if (read.problems.length) return { problems: read.problems, visual: null }
  const line = read.line
  const problems = checkpointLineProblems(line, { now, stages })
  if (problems.some((p) => ['checkpoint-invalid', 'tier-missing', 'tier-unknown', 'tier-duplicate', 'tier-report'].includes(p.code))) return { problems, visual: null }
  const outs = tierOuts(line)
  const tiers = []
  for (const stage of stages) {
    const entry = line.tiers?.[stage] ?? (line.stage === stage ? line : null)
    const r = tierProblems({ stage, entry, dir: outs[stage], visualContract, visualIdentity, artifacts, line, siteUrl, restoredAt, notAfter, now })
    problems.push(...r.problems)
    if (r.tier) tiers.push(r.tier)
  }
  return { problems, visual: { ledger: path.resolve(ledger), checkpoint: run, start: line.start, end: line.end, contractPath: visualIdentity.contractPath, contractHash: visualIdentity.contractHash, tiers } }
}

/**
 * The REUSE path: the four-tier checkpoint of the BUILD stand stands in for the one on the restored site when
 * nothing between the two could have changed what it measured, and one tier measured on the restored pack
 * (`smoke`, SMOKE_TIER) shows the restore renders. Eligible only when ALL hold; otherwise the reasons come back and the
 * release asks for the full four-tier checkpoint on the restored site (today's gate):
 *  - verify-parity found the restored pack equal to the build stand it was packed from: parity ok, zero computed-style
 *    mismatches and capture failures, styles measured (runtimeProblems holds the coverage: every page × viewport × theme);
 *  - the build checkpoint is complete, clean and of the canonical visual contract, on the build stand (parity.a), every tier bound
 *    by artifact-binding.json — when it was measured — to the theme zip, webroot and database being released, measured after those
 *    artifacts existed and before parity;
 *  - the smoke is one tier of its own run, bound to the same artifacts, full, clean, on the restored site after the restore.
 * → { problems: [text], visual } — `visual` is the build checkpoint with `restoreSmoke` (the smoke's record) and `reuse` (parity evidence).
 */
function reuseProblems({ ledger, build, smoke, visualContract, visualIdentity, artifacts, parity, runtime, restoredAt, now = Date.now() }) {
  const why = []
  if (!build || !smoke) return { problems: ['both --checkpoint (the build stand\'s four tiers) and --restore-smoke are needed'], visual: null }
  if (build === smoke) why.push(`--checkpoint and --restore-smoke name the same run ${JSON.stringify(build)}: the build checkpoint and the restored smoke are two measurements`)
  const s = parity?.styles
  const buildSite = isSiteUrl(parity?.a) ? normalSiteUrl(parity.a) : null
  const parityAt = isoMs(parity?.generatedAt)
  if (!runtime || restoredAt === null || !runtime.siteUrl) why.push('the restore report and parity.json do not give a valid restored site')
  if (parity?.ok !== true) why.push('parity.json does not say ok')
  if (!obj(s) || !Array.isArray(s.mismatches) || !Array.isArray(s.captureFailures)) why.push('parity.json carries no style comparison')
  else {
    if (s.mismatches.length) why.push(`parity found ${s.mismatches.length} computed-style mismatch(es) between the build stand and the restore: the build measurement does not describe the restored site`)
    if (s.captureFailures.length) why.push(`parity had ${s.captureFailures.length} style capture failure(s)`)
    if (!(s.checked > 0) || !(s.axes > 0)) why.push('parity compared no style')
  }
  if (!buildSite) why.push(`parity.json a ${JSON.stringify(parity?.a ?? null)} is not the build stand's URL`)
  if (parityAt === null) why.push('parity.json has no measurement time')
  const common = { ledger, visualContract, visualIdentity, artifacts, now }
  const b = checkpointProblems({ ...common, run: build, siteUrl: buildSite, notAfter: parityAt ?? 0 })
  const m = checkpointProblems({ ...common, run: smoke, stages: [SMOKE_TIER], siteUrl: runtime?.siteUrl ?? null, restoredAt })
  for (const [what, r] of [['the build checkpoint', b], ['the restored smoke', m]]) for (const p of r.problems) why.push(`${what}: [${p.code}] ${p.message}`)
  if (!why.length && b.visual && m.visual) {
    const dirs = new Set(b.visual.tiers.map((t) => t.dir))
    if (m.visual.tiers.some((t) => dirs.has(t.dir))) why.push('the smoke reports are the build checkpoint\'s: they are two measurements')
  }
  if (why.length) return { problems: why, visual: null }
  return {
    problems: [],
    visual: {
      ...b.visual,
      path: 'build-checkpoint-plus-smoke',
      restoreSmoke: m.visual,
      reuse: { buildSite, restoredSite: runtime.siteUrl, smokeTier: SMOKE_TIER, parity: { measuredAt: parity.generatedAt, ok: true, styleMismatches: 0, styleCaptureFailures: 0, styleChecks: s.checked, styleAxes: s.axes }, artifacts: Object.fromEntries(ARTIFACT_KEYS.map((k) => [k, artifacts[k].sha256])) }
    }
  }
}

// ---------------------------------------------------------------- content contract
/**
 * Why a contract-bind.json is not the bound content contract of this release: it is this tool's own
 * evidence (shape, a recorded run), the bind held (`bound`, a re-run on an already bound restore
 * included), it records the pack (`measured`: manifest, webrootArchive, databaseArchive) and the
 * theme zip (`themeSha`, hex) it ran for and they are the ones being released, and it ran after the
 * restore finished (`restoredAt`, ms). Returns `{problems, contractBind}` — contractBind is the summary
 * VERIFICATION.json quotes.
 */
export function contractBindProblems({ file, measured = null, themeSha = null, restoredAt = null, now = Date.now() }) {
  const out = []
  if (!file) return { problems: [problem('contract-bind-missing', 'no --contract-bind: a release needs the content-contract bind test (contract-bind.mjs --pack --theme-zip) run on the restore of this pack')], contractBind: null }
  let json
  let bytes
  try {
    ;({ json, bytes } = readJsonRegular(file))
  } catch (e) {
    return { problems: [problem('contract-bind-unreadable', `--contract-bind: ${e.message}`)], contractBind: null }
  }
  const shape = []
  if (json.tool !== 'contract-bind') shape.push(`tool is ${JSON.stringify(json.tool ?? null)}, not "contract-bind"`)
  if (typeof json.contract !== 'string' || !CONTRACT_RE.test(json.contract)) shape.push(`contract ${JSON.stringify(json.contract ?? null)} is not <slug>/wp7/<version>`)
  for (const k of ['bound', 'refused', 'alreadyBound']) if (typeof json[k] !== 'boolean') shape.push(`${k} is not true or false`)
  if (!Array.isArray(json.problems)) shape.push('problems is not a list')
  const count = (x) => Number.isInteger(x) && x >= 0
  if (!count(json.warnings)) shape.push('warnings is not a count')
  if (!count(json.entities)) shape.push('entities is not a count')
  if (!obj(json.warningCodes) || !Object.values(json.warningCodes).every(count)) shape.push('warningCodes is not a count per code')
  else if (count(json.warnings) && Object.values(json.warningCodes).reduce((n, c) => n + c, 0) !== json.warnings) shape.push(`warnings says ${json.warnings}, warningCodes add up to ${Object.values(json.warningCodes).reduce((n, c) => n + c, 0)}`)
  if (json.bound === true && !nonEmptyString(json.pluginVersion)) shape.push('pluginVersion is empty on a bound run')
  const ranAt = isoMs(json.ranAt)
  if (ranAt === null) shape.push(`ranAt ${JSON.stringify(json.ranAt ?? null)} is not an ISO-8601 timestamp`)
  if (shape.length) return { problems: [problem('contract-bind-invalid', `--contract-bind is not contract-bind.mjs evidence: ${shape.join('; ')}`)], contractBind: null }
  const P = (code, msg) => out.push(problem(code, msg))
  if (json.bound !== true || json.refused || json.error)
    P('contract-bind-refused', `${json.contract} is not bound (${json.refused ? 'refused' : 'the test did not run to an answer'}: ${json.error ?? 'no reason recorded'}) — a release that is not bound needs its profile first (references/quickstart.md §Content contract)`)
  if (!obj(json.pack) || ['manifest', 'webrootArchive', 'databaseArchive'].some((k) => !nonEmptyString(json.pack[k]))) P('contract-bind-unbound', 'the evidence records no pack identity (manifest, webrootArchive, databaseArchive) — run contract-bind.mjs with --pack')
  else if (measured) {
    const differs = ['manifest', 'webrootArchive', 'databaseArchive'].filter((k) => json.pack[k] !== measured[k])
    if (differs.length) P('contract-bind-pack-mismatch', `the bind test ran for another pack: ${differs.map((k) => `${k} ${json.pack[k]}, the release's ${measured[k]}`).join('; ')}`)
  }
  if (!nonEmptyString(json.themeZipSha256)) P('contract-bind-unbound', 'the evidence records no theme zip sha256 — run contract-bind.mjs with --theme-zip')
  else if (themeSha && json.themeZipSha256 !== themeSha) P('contract-bind-theme-mismatch', `the bind test ran for theme zip ${json.themeZipSha256}, the release's is ${themeSha}`)
  if (ranAt > now + CLOCK_SKEW_MS) P('contract-bind-invalid', `the bind test says it ran at ${json.ranAt}, later than now`)
  if (restoredAt !== null && ranAt < restoredAt) P('contract-bind-stale', `the bind test ran at ${json.ranAt}, before the restore finished (${new Date(restoredAt).toISOString()}) — it did not run on that restore`)
  return {
    problems: out,
    contractBind: { contract: json.contract, pluginVersion: json.pluginVersion ?? null, alreadyBound: json.alreadyBound, warnings: json.warnings, warningCodes: json.warningCodes, entities: json.entities, ranAt: json.ranAt, evidence: tagged(bytes) }
  }
}

// ---------------------------------------------------------------- behaviour pass (first release)
/** The command that makes the evidence `--behaviour-sweep` takes. */
const BEHAVIOUR_NEXT = `run node scripts/visual/site-sweep.mjs --site <restored site> --source <source site> --run-root <dossier> --zip <theme zip> --out <dir> on the restored pack (no --only: all ${ALL_CHECKS.length} checks; when the dossier already has sweep history add --full --reason 'release gate' so the run is not a scoped re-run), fix or record (review.config.json sweep.accept) every group it reports, rerun, and pass <dir>/site-sweep.json as --behaviour-sweep`

/**
 * The behaviour pass a FIRST release carries: a site-sweep report whose checks include all eleven sweep checks (ALL_CHECKS), measured on the restored
 * site (after the restore finished), on this theme zip, over every route of the visual contract, with every group it reports either fixed
 * (nothing left) or accepted through the dossier's `sweep.accept` (site-sweep-accept.mjs applies it; what is left over is a defect).
 * @returns {{problems: {code: string, message: string}[], behaviour: object|null}}
 */
export function sweepAuthority({ report, contract, specDir = null, runRoot = null }) {
  const claimsNa = (report?.applicability?.outcomes ?? []).some((x) => x?.status === 'not-applicable')
  const declaresNone = (contract?.pages ?? []).some((p) => p.referenceKind === 'none')
  const basePages = (contract?.pages ?? []).map((p) => ({ path: p.path, referenceKind: p.referenceKind ?? null }))
  if (!claimsNa && !declaresNone) return { problems: [], pages: basePages, none: false, allNone: false, binding: null }
  const problems = []
  if (!specDir) return { problems: ['N/A evidence requires --spec to bind reference.kind=none'], pages: basePages, none: true, allNone: false, binding: null }
  try {
    const pageMap = readJsonRegular(path.join(specDir, 'page-map.json')).json
    const reference = readJsonRegular(path.join(specDir, 'reference.json')).json
    const bound = bindReferenceKinds(contract?.pages ?? [], pageMap, reference)
    problems.push(...bound.errors)
    const pages = dossierPlan({ contract }).pages.map((p) => ({ path: p.path, referenceKind: bound.referenceKinds[p.id] ?? bound.referenceKinds[p.path] ?? null }))
    const none = pages.some((p) => p.referenceKind === 'none')
    if (claimsNa && !none) problems.push('N/A evidence is claimed but the spec binds no page to reference.kind=none')
    const input = runRoot ? sweepInputs(runRoot, specDir) : null
    const binding = report?.applicability?.binding
    if (claimsNa || none) {
      if (report?.applicability?.version !== SWEEP_APPLICABILITY_VERSION || !binding || binding.version !== SWEEP_APPLICABILITY_VERSION)
        problems.push('the sweep has no supported applicability binding')
      else {
        const kinds = Object.fromEntries(pages.map((p) => [p.path, p.referenceKind]))
        if (JSON.stringify(binding.kinds) !== JSON.stringify(kinds)) problems.push('the sweep applicability binding does not match reference.json page kinds')
        if (input && (binding.specHash !== input.files.spec || binding.contractHash !== input.files.contract)) problems.push('the sweep applicability binding is stale against the spec or visual contract')
      }
      problems.push(...sweepOutcomeProblems(report, pages))
    }
    return { problems, pages, none, allNone: pages.length > 0 && pages.every((p) => p.referenceKind === 'none'), binding: binding ?? null }
  } catch (e) {
    return { problems: [...problems, `the sweep's spec binding cannot be read: ${String(e.message).split('\n')[0]}`], pages: basePages, none: true, allNone: false, binding: null }
  }
}

export function behaviourProblems({ file, siteUrl = null, themeSha = null, restoredAt = null, pages = 0, sourceDarkDerived = false, now = Date.now(), contract = null, specDir = null, runRoot = null }) {
  const problems = []
  const P = (code, message) => problems.push(problem(code, message))
  if (!file) {
    P('behaviour-pass-missing', `no --behaviour-sweep: a first release carries a site-sweep measure with all ${ALL_CHECKS.length} checks (${ALL_CHECKS.join(', ')}) run on the restored pack. Next step: ${BEHAVIOUR_NEXT}`)
    return { problems, behaviour: null }
  }
  let m
  let bytes
  try {
    settleOutput(path.dirname(path.resolve(file)))
    ;({ json: m, bytes } = readJsonRegular(file))
  } catch (e) {
    P('behaviour-pass-invalid', `--behaviour-sweep: ${e.message}`)
    return { problems, behaviour: null }
  }
  if (!obj(m) || m.schema !== SWEEP_SCHEMA || !Array.isArray(m.checks)) {
    P('behaviour-pass-invalid', `--behaviour-sweep is not a ${SWEEP_SCHEMA} site-sweep.json (it must be the site-sweep.mjs output, not a merged measure). Next step: ${BEHAVIOUR_NEXT}`)
    return { problems, behaviour: null }
  }
  if (carriedEvidence(m)) P('behaviour-pass-scoped', `the sweep is a scoped re-run (it carries checks it did not measure): the behaviour pass is the output of a full run. Next step: ${BEHAVIOUR_NEXT}`)
  const authority = sweepAuthority({ report: m, contract, specDir, runRoot })
  for (const error of authority.problems) P('behaviour-applicability', error)
  const ran = new Set(m.checks.map((c) => c?.id))
  const absent = ALL_CHECKS.filter((c) => !ran.has(c))
  if (absent.length) P('behaviour-pass-checks', `the sweep did not run ${absent.join(', ')}: all ${ALL_CHECKS.length} sweep checks are owed. Next step: ${BEHAVIOUR_NEXT}`)
  const mine = m.checks.filter((c) => ALL_CHECKS.includes(c?.id))
  // a check that says it did not pass is not green because its counters are zero: it read nothing (no case) or failed in a way no counter shows
  const noCases = mine.filter((c) => c.status !== 'not-applicable' && !((c.cases ?? 0) > 0))
  const failed = mine.filter((c) => c.status !== 'not-applicable' && c.pass !== true && (c.cases ?? 0) > 0 && !((c.defects ?? 0) > 0 || (c.acceptErrors ?? 0) > 0 || (c.notMeasured ?? 0) > 0))
  const left = mine.filter((c) => (c.defects ?? 0) > 0)
  if (failed.length) P('behaviour-pass-defects', `the sweep reports ${failed.map((c) => c.id).join(', ')} as not passed with no group counted: measure again, or record what it found with a sweep.accept row`)
  if (left.length) {
    const what = left.map((c) => `${c.id} ${c.defects} group(s)`).join(', ')
    P('behaviour-pass-defects', `the sweep still reports ${what}: fix each group, or record it with a sweep.accept row (one decision of DECISIONS.md, evidence, explicit routes), then measure again`)
  }
  const bad = mine.filter((c) => (c.acceptErrors ?? 0) > 0)
  if (bad.length) P('behaviour-pass-accept', `sweep.accept rows in error on ${bad.map((c) => c.id).join(', ')}: a row that matches nothing or cites no decision is not a record`)
  const unmeasured = mine.filter((c) => (c.notMeasured ?? 0) > 0 || (c.target?.notMeasured ?? 0) > 0)
  // a sweep that read no cell of the behaviour checks measured nothing, whatever it closed or owed: said once, as that
  const readNothing = !mine.reduce((n, c) => n + (Number.isFinite(c.cases) ? c.cases : 0), 0) || m.measuredCells === 0
  if (readNothing) P('behaviour-pass-unmeasured', 'the sweep measured no cell of the behaviour checks: a run that read nothing is not a behaviour pass')
  else if (unmeasured.length || noCases.length || (Array.isArray(m.owed) && m.owed.length))
    P('behaviour-pass-unmeasured', `${[...unmeasured.map((c) => `${c.id} ${c.notMeasured} case(s)`), ...noCases.filter((c) => !unmeasured.includes(c)).map((c) => `${c.id} no case measured`)].join(', ') || 'no check'}${Array.isArray(m.owed) && m.owed.length ? `, ${m.owed.length} owed route/state case(s)` : ''} not measured: a partial sweep is not a behaviour pass (a cause measured by hand is recorded with a sweep.accept row of kind not-measurable)`)
  // cells the sweep closed without reading them: only the dark of a source the release's visual contract declares has no dark of its own
  const notOwed = Array.isArray(m.notOwed) ? m.notOwed : []
  const foreign = notOwed.filter((o) => !obj(o) || o.reason !== DARK_DERIVED_REASON || o.scheme !== 'dark')
  if (foreign.length) P('behaviour-pass-unmeasured', `${foreign.length} cell(s) the sweep lists as not owed for another reason than the source's declared lack of dark (e.g. ${JSON.stringify(foreign[0]).slice(0, 160)}): not measured`)
  else if (notOwed.length && !sourceDarkDerived) P('behaviour-pass-unmeasured', `the sweep closes ${notOwed.length} dark cell(s) on a declaration that the source has no dark of its own, and the release's visual contract — fresh for the spec-pack — does not declare source.darkDerived: not measured`)
  else if (notOwed.length && !(Array.isArray(m.schemes) && m.schemes.includes('light'))) P('behaviour-pass-unmeasured', `the sweep closes ${notOwed.length} dark cell(s) and ran no light pass: nothing of those pages was measured`)
  if (siteUrl && normalSiteUrl(String(m.site ?? '')) !== siteUrl) P('behaviour-pass-site', `the sweep measured ${m.site ?? 'no site'}, not the restored site ${siteUrl}`)
  const zip = m.theme?.zipSha256 ?? null
  if (!zip) P('behaviour-pass-artifact', 'the sweep records no theme zip: run it with --zip <the theme zip being released>')
  else if (themeSha && zip !== themeSha) P('behaviour-pass-artifact', `the sweep ran on theme zip ${zip}, the release's is ${themeSha}`)
  const at = isoMs(m.ranAt)
  if (at === null) P('behaviour-pass-invalid', `the sweep's ranAt ${JSON.stringify(m.ranAt ?? null)} is not an ISO-8601 timestamp`)
  else {
    if (at > now + CLOCK_SKEW_MS) P('behaviour-pass-invalid', `the sweep says it ran at ${m.ranAt}, later than now`)
    if (restoredAt !== null && at < restoredAt) P('behaviour-pass-stale', `the sweep ran at ${m.ranAt}, before the restore finished (${new Date(restoredAt).toISOString()}): it did not measure this restore`)
  }
  if (pages && (authority.none ? (m.routesTotal ?? 0) !== pages : (m.routesTotal ?? 0) < pages)) P('behaviour-pass-narrow', `the sweep covers ${m.routesTotal ?? 0} route(s), the visual contract has ${pages}: every renderable route must be covered without --pages narrowing`)
  if (mine.some((c) => c.status === 'not-applicable' && (c.pass !== undefined || (c.cases ?? 0) > 0))) P('behaviour-pass-applicability', 'a not-applicable check claims pass or measured cases')
  if (!problems.length) return { problems, behaviour: { tool: m.tool, ranAt: m.ranAt, site: m.site, themeZipSha256: zip, source: m.source ?? null, routes: m.routesTotal, checks: mine.map((c) => c.id), accepted: (m.accepted ?? []).filter((a) => ALL_CHECKS.includes(a.check)).length, applicability: authority.none ? { status: authority.allNone ? 'all-none' : 'mixed', binding: authority.binding, ...(authority.allNone ? { sourceFingerprint: { status: 'not-applicable', reason: 'all renderable pages bind to reference.kind=none' } } : {}) } : null, ...(Array.isArray(m.notOwed) && m.notOwed.length ? { notOwed: notOwedTally(m.notOwed) } : {}), evidence: tagged(bytes) } }
  return { problems, behaviour: null }
}

/** The sweep's cells closed by a declaration (site-sweep.mjs `notOwed`: the dark of a source with no dark of its own), once per reason: carried on the receipt, never counted as measured. */
const notOwedTally = (list) => [...list.reduce((by, o) => by.set(o.reason, (by.get(o.reason) ?? 0) + 1), new Map())].map(([reason, cells]) => ({ reason, cells }))

// ---------------------------------------------------------------- fix release (--patch)
// A fix is warned about when the theme diff looks like more than a fix. The fix this was written for changed six
// theme files (CSS, JS, PHP, readme) and none of the block theme's structure; templates/, parts/ and patterns/
// carry the routes and the layout, so more than STRUCTURAL of them differing (added, removed or changed) is a
// redesign, and TOTAL files overall is a rewrite — both belong to the full gate. A warning, never a refusal:
// the measure is what accepts the release.
export const PATCH_LIMITS = Object.freeze({ structural: 3, total: 15 })
const STRUCTURAL_DIR = /^(templates|parts|patterns)\//

const QUICKSTART_PREFIX = 'quickstart/'
/** A record's `release` that is the manifest id without its `quickstart/` prefix — and nothing else. */
const prefixNormalised = (release, id) => typeof id === 'string' && id.startsWith(QUICKSTART_PREFIX) && release === id.slice(QUICKSTART_PREFIX.length)

const versionParts = (v) => (typeof v === 'string' && /^\d+(\.\d+)*$/.test(v) ? v.split('.').map(Number) : null)
/** -1, 0 or 1; null when either is not a dotted number. */
export function compareVersions(a, b) {
  const x = versionParts(a)
  const y = versionParts(b)
  if (!x || !y) return null
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * Re-read the source home page in a child process (a bounded network read; acceptRelease is synchronous) and fingerprint it.
 * → {ok: true, fingerprint} | {ok: false, error}
 */
export function readSourceNow(url, template = null) {
  const script = fileURLToPath(new URL('../lib/source-fingerprint.mjs', import.meta.url))
  const args = [script, '--url', url, ...(template ? ['--template-name', template.name, ...(template.version ? ['--template-version', template.version] : [])] : [])]
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 })
  if (r.error || r.status !== 0) {
    let why = r.error?.message ?? ''
    try {
      why = JSON.parse(r.stderr).error
    } catch {
      why ||= String(r.stderr).trim().split('\n')[0] || `exit ${r.status}`
    }
    return { ok: false, error: why }
  }
  try {
    return { ok: true, fingerprint: JSON.parse(r.stdout) }
  } catch {
    return { ok: false, error: 'the fingerprint reader printed no JSON' }
  }
}

/**
 * The home HTML the spec-pack keeps for the front page (`reference.json`: a `kind: html` entry for the page-map page at `/`), as its
 * normalised digest — or null when the spec holds none. An independent anchor: it is not written by the sweep.
 */
function referenceHomeDigest(specDir) {
  if (!specDir) return null
  try {
    const map = readJsonRegular(path.join(specDir, 'page-map.json')).json
    const ref = readJsonRegular(path.join(specDir, 'reference.json')).json
    const homes = (map.pages ?? []).filter((p) => p?.path === '/')
    if (homes.length !== 1) return null
    const entries = (ref.pages ?? []).filter((e) => e?.page === homes[0].file)
    if (entries.length !== 1 || (entries[0].kind ?? ref.kind) !== 'html' || typeof entries[0].path !== 'string') return null
    const abs = path.resolve(specDir, entries[0].path)
    if (!abs.startsWith(path.resolve(specDir) + path.sep) || lstatSync(abs).isSymbolicLink()) return null
    return fingerprintOf({ url: 'http://reference.invalid/', html: readFileSync(abs, 'utf8') }).htmlSha256
  } catch {
    return null
  }
}

/**
 * The source gate: evidence (a measure, a behaviour sweep) carries the fingerprint of the source it was taken against, and that source — the one
 * the evidence names, at its own origin — is read again now and must be the same one. A missing fingerprint, an unreadable source or a different
 * one is a problem.
 *
 * Evidence taken against another origin than the visual contract's `source.site` (a source stand restored elsewhere) is judged the same way, plus
 * an identity check: its fingerprint must be of the home URL its `source` gives, and the home page it fingerprints must be the dossier's — the
 * spec-pack's own home HTML reference when it holds one, else the canonical source's home page read now. With neither, it is refused: the declared
 * template alone does not tell one site's content from another's.
 */
export function sourceGateProblems(fingerprint, evidenceSource, { contract, specDir = null, readSource = readSourceNow }, { prefix, what }) {
  const out = []
  const P = (code, msg) => out.push(problem(`${prefix}-${code}`, msg))
  if (!fingerprint) {
    P('source-missing', `${what} records no fingerprint of the source it was taken against: run site-sweep.mjs again (it records one)`)
    return out
  }
  const site = contract?.source?.site
  if (!site) {
    P('source-mismatch', 'visual.contract.json names no source site to read the source from')
    return out
  }
  let origin = null
  let relocated = true
  try {
    origin = new URL(evidenceSource).origin
    relocated = origin !== new URL(site).origin
  } catch {
    origin = null
  }
  if (!origin || origin === 'null') {
    P('source-mismatch', `${what} was taken against ${evidenceSource}, which is not an http(s) source; the visual contract's source is ${site}`)
    return out
  }
  const template = templateOf(specDir)
  const home = homeUrlOf({ source: evidenceSource, contract })
  if (relocated) {
    const bad = validateFingerprint(fingerprint)
    if (bad.length) {
      P('source-mismatch', `${what} was taken against ${evidenceSource} but its source fingerprint is not valid: ${bad.join('; ')}`)
      return out
    }
    if (fingerprint.url !== home) {
      P('source-mismatch', `${what} was taken against ${evidenceSource} but records the fingerprint of ${fingerprint.url}, not of ${home}`)
      return out
    }
    if (JSON.stringify(fingerprint.template) !== JSON.stringify(template)) {
      P('source-mismatch', `${what} was taken against ${evidenceSource} with the template identity ${JSON.stringify(fingerprint.template)}; the dossier declares ${JSON.stringify(template)}`)
      return out
    }
    // the dossier's home page: the spec-pack's own home HTML reference when it holds one, else the canonical source read now — never the evidence's own say
    const reference = referenceHomeDigest(specDir)
    const canonical = reference ? null : readSource(homeUrlOf({ source: site, contract }), template)
    const anchor = reference ?? (canonical?.ok ? canonical.fingerprint?.htmlSha256 : null)
    if (!anchor) {
      P('source-mismatch', `${what} was taken against ${evidenceSource}, the visual contract's source is ${site}: the contract's source cannot be read now and the spec-pack holds no home HTML reference, so nothing shows that ${evidenceSource} is the same source`)
      return out
    }
    if (anchor !== fingerprint.htmlSha256) {
      P('source-mismatch', `${what} was taken against ${evidenceSource}, whose home page is not the dossier's source (${reference ? 'the spec-pack reference' : site}): the source differs in the served home page`)
      return out
    }
  }
  const now = readSource(home, template)
  if (!now?.ok) P('source-unreadable', `the source cannot be fingerprinted now: ${now?.error ?? 'no answer'}`)
  else {
    const why = differsFrom(fingerprint, now.fingerprint)
    if (why) P('source-changed', `${what} was not taken against the source as it is now: ${why}`)
  }
  return out
}

/** Why a measure does not stand on this site-sweep.json: its theme zip, its site, its coverage, its source and its results for the sweep's checks. */
function sweepBindingProblems(m, sweep, { restoredAt = null, now = Date.now() } = {}) {
  const out = []
  const P = (code, msg) => out.push(problem(code, msg))
  if (sweep.schema !== SWEEP_SCHEMA) return [problem('measure-sweep-invalid', `the sweep document is not a ${SWEEP_SCHEMA} site-sweep.json`)]
  // the sweep is evidence of its own: taken on the restore (after it finished), not in the future, and not older than the measure that stands on it
  const sweepAt = typeof sweep.ranAt === 'string' ? Date.parse(sweep.ranAt) : NaN
  if (!Number.isFinite(sweepAt)) P('measure-sweep-invalid', `the sweep's ranAt ${JSON.stringify(sweep.ranAt ?? null)} is not a timestamp`)
  else {
    if (sweepAt > now + CLOCK_SKEW_MS) P('measure-sweep-invalid', `the sweep says it ran at ${sweep.ranAt}, later than now`)
    if (restoredAt !== null && sweepAt < restoredAt) P('measure-sweep-stale', `the sweep ran at ${sweep.ranAt}, before the restore finished (${new Date(restoredAt).toISOString()}) — it did not measure that restore`)
    if (isoMs(m.ranAt) > sweepAt) P('measure-sweep-mismatch', `the measure is dated ${m.ranAt}, after the sweep it stands on (${sweep.ranAt})`)
  }
  const carried = carriedEvidence(sweep)
  if (carried) P('measure-carried', `the sweep the measure stands on is ${carried}`)
  if (sweep.theme?.zipSha256 !== m.artifact.themeZipSha256) P('measure-sweep-mismatch', `the sweep ran on theme zip ${sweep.theme?.zipSha256 ?? 'none (no --zip)'}, the measure on ${m.artifact.themeZipSha256}`)
  if (normalSiteUrl(String(sweep.site)) !== normalSiteUrl(m.site)) P('measure-sweep-mismatch', `the sweep measured ${sweep.site}, the measure ${m.site}`)
  const allNone = m.source === null && m.applicability?.binding && Object.values(m.applicability.binding.kinds ?? {}).length > 0 && Object.values(m.applicability.binding.kinds).every((kind) => kind === 'none')
  if (allNone) {
    if (JSON.stringify(sweep.applicability?.binding) !== JSON.stringify(m.applicability.binding)) P('measure-sweep-mismatch', 'the sweep records another reference applicability binding')
  } else if (!sweep.sourceFingerprint || sweep.sourceFingerprint.id !== m.sourceFingerprint?.id) P('measure-sweep-mismatch', 'the sweep records another source fingerprint than the measure (or none)')
  if (!m.coverage) P('measure-coverage-missing', 'the measure records no coverage: only a measure written from a full `site-sweep.mjs --zip` run does — a port\'s own script is merged into it with fix-measure.mjs merge')
  else if (JSON.stringify(m.coverage) !== JSON.stringify(sweep.coverage)) P('measure-sweep-mismatch', 'the measure\'s coverage is not the coverage the sweep recorded')
  const had = new Map((sweep.checks ?? []).map((c) => [c.id, c]))
  const differ = m.checks.filter((c) => had.has(c.id) && (had.get(c.id).pass !== c.pass || had.get(c.id).defects !== c.defects || had.get(c.id).cases !== c.cases)).map((c) => c.id)
  if (differ.length) P('measure-sweep-mismatch', `the measure's result differs from the sweep's for ${differ.slice(0, 5).join(', ')}`)
  return out
}

/**
 * The scope gates of a measure, independent of its shape and its pass/fail: it is a FULL run of every check over every renderable route of
 * the visual contract on the standard axes, and it was taken against the source as it is now. → problems
 */
export function measureScopeProblems(m, { contract, specDir = null, runRoot = null, readSource = readSourceNow, sweep = null, restoredAt = null, now = Date.now() }) {
  const out = []
  const P = (code, msg) => out.push(problem(code, msg))
  let routes = null
  if (!contract) P('measure-contract-missing', 'no visual.contract.json in --run-root: the routes a full run covers are the contract\'s')
  else {
    try {
      routes = dossierPlan({ contract }).pages.map((p) => p.path)
    } catch (e) {
      P('measure-contract-missing', `visual.contract.json does not give the routes a full run covers: ${String(e.message).split('\n')[0]}`)
    }
  }
  // the measure cannot certify itself: what it covers is proven by the site-sweep.json it stands on, from that document's own rows
  if (!sweep) P('measure-sweep-missing', 'the measure stands on no site-sweep.json: give --sweep <site-sweep.json> of the full run (or keep it beside the measure) — a measure\'s own `coverage` is a claim, the sweep\'s rows are the evidence')
  else {
    out.push(...sweepBindingProblems(m, sweep, { restoredAt, now }))
    if (routes) for (const x of coverageProblems({ ...m, coverage: coverageFromReport(sweep) }, { checks: [...ALL_CHECKS], routes, widths: DEFAULT_WIDTHS, heightsWidths: heightsWidths(DEFAULT_WIDTHS, false), schemes: DEFAULT_SCHEMES })) out.push(problem(x.code, x.message))
  }
  const authority = sweep ? sweepAuthority({ report: sweep, contract, specDir, runRoot }) : { problems: [], allNone: false }
  for (const message of authority.problems) P('measure-applicability', message)
  if (authority.allNone) {
    if (m.source !== null || m.sourceFingerprint) P('measure-applicability', 'an all-none measure must not claim a source URL or source fingerprint')
    if (JSON.stringify(m.applicability?.binding) !== JSON.stringify(sweep?.applicability?.binding)) P('measure-applicability', 'the measure applicability binding differs from its full sweep')
  } else out.push(...sourceGateProblems(m.sourceFingerprint, m.source, { contract, specDir, readSource }, { prefix: 'measure', what: 'the measure' }))
  return out
}

/**
 * The evidence of a fix release (--patch), beyond the runtime evidence and the contract bind it shares
 * with the full gate: the previous release (`previous`: its VERIFICATION.json or its directory — same
 * id, a lower version), the targeted measure (`measure`, tracy-fix-measure/v1: every check passing, on
 * this theme zip, on the restored site `siteUrl` after the restore finished at `restoredAt`, and a
 * baseline on the previous version in which a check failed — or `noBaseline`, a reason recorded
 * verbatim and marked UNVERIFIED: the release cannot check it — and the measure must be a FULL run of
 * every check over every renderable route of the visual `contract` (lib/sweep-coverage.mjs), taken
 * against the source as it is now (`readSource` reads it again; lib/source-fingerprint.mjs)) and, optionally, the previous theme zip (`changedFrom`) whose differences are recorded.
 * Returns `{problems, fix}`.
 */
export function fixProblems({ previous, sweep = null, measure, noBaseline, baselineVersion, changedFrom, manifest, themeSha, themeBytes, siteUrl = null, restoredAt = null, now = Date.now(), contract = null, specDir = null, runRoot = null, readSource = readSourceNow }) {
  const out = []
  const P = (code, msg) => out.push(problem(code, msg))
  const fix = { previous: null, measure: null, measureBytes: null, baseline: null, noBaseline: null, notDefects: [], changedFrom: null, warnings: [], notes: [], reminders: [] }

  // -- the previous release
  let prev = null
  if (!previous) P('previous-missing', 'no --previous: a fix release names the VERIFICATION.json (or the release directory) of the release it fixes')
  else {
    try {
      const file = lstatSync(previous).isDirectory() ? path.join(previous, 'VERIFICATION.json') : previous
      const { json, bytes } = readJsonRegular(file)
      prev = { json, file: path.resolve(file), evidence: tagged(bytes) }
    } catch (e) {
      P('previous-unreadable', `--previous: ${e.message}`)
    }
  }
  if (prev) {
    const { json } = prev
    const order = compareVersions(json.version, manifest.version)
    if (!nonEmptyString(json.release) || !nonEmptyString(json.version)) P('previous-invalid', `${prev.file} is not a release's VERIFICATION.json: release ${JSON.stringify(json.release ?? null)}, version ${JSON.stringify(json.version ?? null)}`)
    else if (json.release !== manifest.id && !prefixNormalised(json.release, manifest.id)) P('previous-mismatch', `--previous is a release of ${json.release}, this pack is ${manifest.id}`)
    else if (order === null) P('previous-invalid', `--previous version ${JSON.stringify(json.version)} or this version ${JSON.stringify(manifest.version)} is not a dotted number, so which is lower cannot be told`)
    else if (order >= 0) P('previous-not-lower', `--previous is version ${json.version}, not lower than this release's ${manifest.version}`)
    else
      // what the previous release says of itself, verbatim: an older port's last full checkpoint may be several versions back
      fix.previous = { release: json.release, version: json.version, file: prev.file, evidence: prev.evidence, gate: json.gate ?? null, visual: json.visual ?? null }
    if (fix.previous && json.release !== manifest.id) {
      // the one mismatch accepted: every hand-assembled record before the tool wrote one names the release without the manifest id's prefix
      fix.previous.normalised = { release: { from: json.release, to: manifest.id } }
      fix.notes.push(`--previous names its release ${json.release}, the manifest id is ${manifest.id}: the ${QUICKSTART_PREFIX} prefix is the only difference, accepted (recorded in VERIFICATION.json previous.normalised)`)
    }
  }

  // -- the measure
  let m = null
  let measureBytes = null
  if (!measure) P('measure-missing', 'no --measure: a fix release is accepted on targeted measurement (tracy-fix-measure/v1, lib/fix-measure.mjs)')
  else {
    try {
      settleOutput(path.dirname(path.resolve(measure)))
      ;({ json: m, bytes: measureBytes } = readJsonRegular(measure))
    } catch (e) {
      P('measure-unreadable', `--measure: ${e.message}`)
    }
  }
  if (m) {
    const shape = validateFixMeasure(m)
    if (shape.length) {
      P('measure-invalid', `--measure is not a tracy-fix-measure/v1 document: ${shape.slice(0, 4).join('; ')}${shape.length > 4 ? '; …' : ''}`)
      m = null
    }
  }
  if (m) {
    const failed = m.checks.filter((c) => c.status !== 'not-applicable' && c.pass !== true)
    if (failed.length) P('measure-failed', `${failed.length} of ${m.total} check(s) fail: ${failed.slice(0, 5).map((c) => c.id).join(', ')}${failed.length > 5 ? ', …' : ''}`)
    if (themeSha && m.artifact.themeZipSha256 !== themeSha) P('measure-artifact-mismatch', `the measure ran on theme zip ${m.artifact.themeZipSha256}, the release's is ${themeSha}`)
    if (!siteUrl) P('measure-site', `measured ${m.site}, but no restored site URL is vouched for by the restore report and parity.json`)
    else if (normalSiteUrl(m.site) !== siteUrl) P('measure-site', `measured ${m.site}, not the restored site ${siteUrl} the restore report and parity.json are of — the measure runs on the restore, not on the build stand`)
    const ranAt = isoMs(m.ranAt)
    if (ranAt > now + CLOCK_SKEW_MS) P('measure-invalid', `the measure says it ran at ${m.ranAt}, later than now`)
    if (restoredAt !== null && ranAt < restoredAt) P('measure-stale', `the measure ran at ${m.ranAt}, before the restore finished (${new Date(restoredAt).toISOString()}) — it did not measure that restore`)
    let sweepDoc = null
    let sweepBytes = null
    const sweepFile = sweep ?? path.join(path.dirname(path.resolve(measure)), 'site-sweep.json')
    if (sweep || existsSync(sweepFile)) {
      try {
        settleOutput(path.dirname(path.resolve(sweepFile)))
        ;({ json: sweepDoc, bytes: sweepBytes } = readJsonRegular(sweepFile))
      } catch (e) {
        P('measure-sweep-unreadable', `--sweep: ${e.message}`)
      }
    }
    out.push(...measureScopeProblems(m, { contract, specDir, runRoot, readSource, sweep: sweepDoc, restoredAt, now }))
    fix.sweepEvidence = sweepBytes ? tagged(sweepBytes) : null
    if (m.baseline) {
      const b = m.baseline
      // the previous version's baseline must have been taken on the same source as the measure
      const allNone = m.source === null && m.applicability?.binding && Object.values(m.applicability.binding.kinds ?? {}).length > 0 && Object.values(m.applicability.binding.kinds).every((kind) => kind === 'none')
      if (allNone) {
        if (JSON.stringify(b.applicability?.binding) !== JSON.stringify(m.applicability.binding)) P('measure-baseline-applicability', `the baseline on ${b.version} has another reference applicability binding`)
      } else if (!b.sourceFingerprint) P('measure-baseline-source', `the baseline on ${b.version} records no source fingerprint: run the baseline again so that it does (site-sweep.mjs --zip <the previous theme zip>)`)
      else if (m.sourceFingerprint) {
        const why = differsFrom(b.sourceFingerprint, m.sourceFingerprint)
        if (why) P('measure-baseline-source', `the baseline on ${b.version} was measured against another source than the measure: ${why}`)
      }
      if (noBaseline !== undefined) P('measure-baseline-conflict', 'the measure carries a baseline and --no-baseline is given too: one of them')
      if (fix.previous && b.version !== (baselineVersion ?? fix.previous.version)) P('measure-baseline-mismatch', `the baseline is of version ${b.version}, the previous release is ${baselineVersion ?? fix.previous.version}`)
      const list = (ids) => `${ids.slice(0, 5).join(', ')}${ids.length > 5 ? ', …' : ''}`
      if (b.checks) {
        // per CHECK, not per count: a check is in the baseline (by id) or declared new with a reason; none may disappear
        const before = new Map(b.checks.map((c) => [c.id, c]))
        const now = new Set(m.checks.map((c) => c.id))
        const undeclared = m.checks.filter((c) => !before.has(c.id) && c.new !== true).map((c) => c.id)
        if (undeclared.length) P('measure-baseline-undeclared', `${undeclared.length} check(s) are not in the baseline on ${b.version} and are not declared new: ${list(undeclared)} (a check that never ran there is \`new: true\` with a \`why\`)`)
        const claimed = m.checks.filter((c) => c.new === true && before.has(c.id)).map((c) => c.id)
        if (claimed.length) P('measure-baseline-mismatch', `${claimed.length} check(s) are declared new but the baseline on ${b.version} ran them: ${list(claimed)}`)
        const dropped = b.checks.filter((c) => !now.has(c.id)).map((c) => c.id)
        if (dropped.length) P('measure-baseline-dropped', `${dropped.length} check(s) of the baseline on ${b.version} are not in the measure: ${list(dropped)} (a check cannot silently disappear)`)
        if (!m.checks.some((c) => before.get(c.id)?.pass === false))
          P('measure-baseline-passed', `no check that ran on ${b.version} failed there (${b.passed}/${b.total} passed): a check that never failed proves nothing (give --no-baseline "<reason>" when the previous version cannot be measured)`)
      } else {
        // a baseline of counts only (an older site-sweep): the counts are all there is to hold it to
        if (m.checks.some((c) => c.new === true)) P('measure-baseline-mismatch', `the baseline on ${b.version} lists no checks, so a check cannot be declared new against it — build the baseline with fix-measure.mjs merge --baseline-measure`)
        if (b.total !== m.total) P('measure-baseline-mismatch', `the baseline ran ${b.total} check(s), the measure ${m.total}: not the same checks (a baseline that lists its checks lets the measure declare the ones that are new: fix-measure.mjs merge --baseline-measure)`)
        if (b.passed >= b.total) P('measure-baseline-passed', `the baseline on ${b.version} passed ${b.passed}/${b.total}: a check that never failed proves nothing (give --no-baseline "<reason>" when the previous version cannot be measured)`)
      }
    } else if (!nonEmptyString(noBaseline)) P('measure-baseline-missing', 'the measure has no baseline on the previous version — measure it there (a baseline run is site-sweep.mjs --zip <the previous theme zip>; its output is --baseline on the final run), or give --no-baseline "<reason>"')
    else {
      fix.noBaseline = noBaseline
      fix.warnings.push(`--no-baseline "${noBaseline}": the release cannot verify this reason; it is recorded as an unverified exception (no check is proven to have failed on the previous version)`)
    }
    fix.measure = { tool: m.tool, ranAt: m.ranAt, site: m.site, source: m.source, artifact: m.artifact, passed: m.passed, total: m.total, checks: m.checks, ...(m.coverage ? { coverage: m.coverage } : {}), ...(m.sourceFingerprint ? { sourceFingerprint: m.sourceFingerprint } : {}), ...(m.applicability ? { applicability: m.applicability } : {}), ...(m.source === null ? { sourceFingerprintApplicability: { status: 'not-applicable', reason: 'all renderable pages bind to reference.kind=none' } } : {}), ...(fix.sweepEvidence ? { sweepEvidence: fix.sweepEvidence } : {}), evidence: tagged(measureBytes) }
    fix.baseline = m.baseline
    fix.measureBytes = measureBytes
    fix.notDefects = m.notDefects
  }

  // -- what changed in the theme
  if (changedFrom) {
    let index = null
    let before = null
    try {
      before = readRegular(changedFrom).bytes
      index = zipIndex(before)
    } catch (e) {
      P('changed-from-invalid', `--changed-from: ${e.message}`)
    }
    if (index && themeBytes) {
      const had = prev?.json.acceptance?.artifacts?.theme?.sha256 ?? prev?.json.artifacts?.theme?.sha256 ?? null
      const sha = tagged(before)
      if (had && had !== sha) P('changed-from-mismatch', `--changed-from is ${sha}, the theme zip the previous release records is ${had}`)
      const diff = diffZips(index, zipIndex(themeBytes))
      const touched = [...diff.added, ...diff.removed, ...diff.changed]
      const structural = touched.filter((n) => STRUCTURAL_DIR.test(n))
      const warnings = []
      if (!touched.length) warnings.push('no theme file differs from --changed-from: this release changes nothing in the theme')
      if (structural.length > PATCH_LIMITS.structural) warnings.push(`${structural.length} templates/parts/patterns files differ (more than ${PATCH_LIMITS.structural}): this looks like more than a fix — a redesign takes the full gate`)
      if (touched.length > PATCH_LIMITS.total) warnings.push(`${touched.length} theme files differ (more than ${PATCH_LIMITS.total}): this looks like more than a fix — a redesign takes the full gate`)
      fix.warnings.push(...warnings)
      fix.changedFrom = { file: path.basename(changedFrom), sha256: sha, matchesPrevious: had ? true : null, ...diff, counts: { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length, structural: structural.length }, warnings }
    }
  }
  // -- the theme's own version: a zip that keeps the previous version is not an update to a site that has it
  if (prev && themeBytes) {
    let inZip = null
    try {
      inZip = /^\s*(?:\*\s*)?Version:\s*(.+?)\s*$/im.exec(zipMemberText(themeBytes, (n) => /^[^/]+\/style\.css$/.test(n)) ?? '')?.[1] ?? null
    } catch {
      /* an unreadable zip is the theme zip's own problem, named elsewhere */
    }
    const prevTheme = baselineVersion ?? prev.json.version
    const order = inZip ? compareVersions(inZip, prevTheme) : null
    if (inZip === null) fix.reminders.push(`the theme version could not be read from style.css in the theme zip: a site only updates a theme whose version is higher than ${prevTheme}, the previous release's — check it`)
    else if (order === null || order <= 0) fix.reminders.push(`the theme zip's style.css says Version: ${inZip}, not higher than ${prevTheme}, the previous release's: a site that has ${prevTheme} will not see this as an update — bump the theme version before publishing`)
  }
  return { problems: out, fix }
}

// ---------------------------------------------------------------- restore and parity
/**
 * The restore report and parity.json as release evidence: both green, both bound to the pack as
 * measured now (`measured`: manifest, webrootArchive, databaseArchive) and to one target, the access
 * probes run — wp-cli and HTTP — as the runtime uid (never root), after the archives were written.
 * `expectations` (path → status, specRouteExpectations) are the statuses the spec-pack declares:
 * without them no route row can be judged. Returns `{problems, runtime}`.
 */
export function runtimeProblems({ restore, parity, measured, archives, theme = null, expectations = null, now = Date.now() }) {
  const out = []
  if (!restore) out.push(problem('restore-missing', 'no restore report'))
  if (!parity) out.push(problem('parity-missing', 'no parity.json'))
  // A restore that skipped the wordpress.org checksum list (a group stand, restore.mjs --offline-checksums) is not release evidence
  if (restore?.offlineChecksums || (Array.isArray(restore?.steps) && restore.steps.some((x) => x?.name === 'core-checksums' && x.offline)))
    out.push(problem('restore-offline', 'the restore report skipped core checksums (--offline-checksums): only a restore that checked them against wordpress.org backs a release'))
  if (out.length) return { problems: out, runtime: null }
  // The shape read below and quoted in VERIFICATION.json / release-notes.md, before it is read.
  const strings = (x) => x === undefined || (Array.isArray(x) && x.every((v) => typeof v === 'string'))
  const shape = []
  if (restore.access !== undefined && !obj(restore.access)) shape.push('restore report: access is not an object')
  const verdict = (a) => obj(a) && typeof a.ok === 'boolean' && Array.isArray(a.problems) && a.problems.every((v) => typeof v === 'string')
  for (const when of ['beforeBootstrap', 'afterRestore']) {
    const a = restore.access?.[when]
    if (a !== undefined && !verdict(a)) shape.push(`restore report: access.${when} is not {ok, problems: [text]}`)
  }
  if (restore.identity !== undefined && !obj(restore.identity)) shape.push('restore report: identity is not an object')
  if (restore.steps !== undefined && !Array.isArray(restore.steps)) shape.push('restore report: steps is not a list')
  if (parity.access !== undefined && (!verdict(parity.access) || typeof parity.access.ran !== 'boolean')) shape.push('parity.json: access is not {ran, ok, problems: [text], …}')
  // verify-parity writes null for a probe it could not run or refused (root): a runtime-access failure below, not a shape error
  for (const via of ['cli', 'http']) if (parity.access?.[via] != null && !obj(parity.access[via])) shape.push(`parity.json: access.${via} is not an object`)
  if (!obj(parity.summary)) shape.push('parity.json: summary is not an object')
  for (const k of ['routes', 'counts']) if (!Array.isArray(parity[k])) shape.push(`parity.json: ${k} is not a list`)
  if (parity.styles !== undefined && !obj(parity.styles)) shape.push('parity.json: styles is not an object')
  else if (!strings(parity.styles?.themes)) shape.push('parity.json: styles.themes is not a list of names')
  if (!isSiteUrl(parity.b)) shape.push(`parity.json: b (the restored site) ${JSON.stringify(parity.b ?? null)} is not an http(s) URL`)
  if (!isSiteUrl(parity.a)) shape.push(`parity.json: a (the build stand) ${JSON.stringify(parity.a ?? null)} is not an http(s) URL`)
  if (restore.binding !== undefined && !obj(restore.binding)) shape.push('restore report: binding is not an object')
  else if (restore.binding?.siteUrl !== undefined && !isSiteUrl(restore.binding.siteUrl)) shape.push(`restore report: binding.siteUrl ${JSON.stringify(restore.binding.siteUrl)} is not an http(s) URL`)
  if (parity.access?.binding !== undefined && !obj(parity.access?.binding)) shape.push('parity.json: access.binding is not an object')
  shape.push(...parityRowShape(parity))
  if (shape.length) return { problems: shape.map((m) => problem(m.startsWith('parity') ? 'parity-invalid' : 'restore-invalid', m)), runtime: null }
  if (restore.ok !== true) out.push(problem('restore-failed', `the restore report says the restore did not finish${restore.error ? `: ${String(restore.error).split('\n')[0]}` : ''}`))
  else if (restore.error !== undefined) out.push(problem('restore-failed', `the restore report says ok and also records an error: ${String(restore.error).split('\n')[0]}`))
  const uid = restore.runtimeUid
  if (!Number.isInteger(uid) || uid <= 0) out.push(problem('runtime-access', `the restore report's runtime uid ${JSON.stringify(uid ?? null)} is not a uid other than root`))
  for (const when of ['beforeBootstrap', 'afterRestore']) {
    const a = restore.access?.[when]
    if (a?.ok !== true) out.push(problem('runtime-access', `the restore's ${when} access check did not pass${a?.problems?.length ? `: ${a.problems.join('; ')}` : ''}`))
    else if (a.problems.length) out.push(problem('runtime-access', `the restore's ${when} access check says ok and names ${a.problems.length} problem(s): ${a.problems.join('; ')}`))
  }
  if (restore.identity?.euid !== uid || restore.identity?.euid === 0) out.push(problem('runtime-access', `the restore ran wp-cli as uid ${JSON.stringify(restore.identity?.euid ?? null)}, not the runtime uid ${uid}`))
  const after = restore.access?.afterRestore
  if (after?.ok === true) for (const m of probeRecordProblems('the restore\'s afterRestore check', after, { theme })) out.push(problem('runtime-access', m))
  if (parity.ok !== true) out.push(problem('parity-failed', 'parity.json says ok is not true'))
  if (!expectations) out.push(problem('parity-expectation', 'no route declarations from the spec-pack: the status each parity route must answer cannot be checked'))
  else {
    for (const m of parityExpectationProblems(parity, expectations)) out.push(problem('parity-expectation', `parity.json: ${m}`))
    for (const m of parityRouteCoverageProblems(parity, expectations)) out.push(problem('parity-incomplete', `parity.json: ${m}`))
  }
  for (const m of parityVerdictProblems(parity)) out.push(problem('parity-failed', `parity.json: ${m}`))
  for (const m of parityCoverageProblems(parity)) out.push(problem(m.code, `parity.json: ${m.message}`))
  const access = parity.access
  if (!access || access.ran !== true) out.push(problem('runtime-access', 'parity.json carries no access probe that ran'))
  else {
    if (access.ok !== true || (access.problems ?? []).length) out.push(problem('runtime-access', `the parity access probe did not pass${access.problems?.length ? `: ${access.problems.join('; ')}` : ''}`))
    if (access.runtimeUid !== uid) out.push(problem('runtime-access', `parity probed as runtime uid ${JSON.stringify(access.runtimeUid ?? null)}, the restore as ${uid}`))
    for (const via of ['cli', 'http']) {
      if (!access[via] || access[via].euid !== uid || access[via].euid === 0) out.push(problem('runtime-access', `the parity ${via} probe ran as uid ${JSON.stringify(access[via]?.euid ?? null)}, not the runtime uid ${uid}`))
      else for (const m of probeIdentityProblems(via, access[via], { theme })) out.push(problem('runtime-access', `parity.json: ${m}`))
    }
  }
  // One target, measured: the pack now, the stand parity probed.
  const target = { ...measured, webroot: access?.binding?.webroot ?? null, siteUrl: parity.b ? normalSiteUrl(parity.b) : null, runtimeUid: access?.runtimeUid ?? null }
  for (const p of bindingProblems(restore.binding, target)) out.push(problem('restore-mismatch', `restore report: ${p}`))
  for (const p of bindingProblems(access?.binding, target)) out.push(problem('restore-mismatch', `parity.json: ${p}`))
  const finished = isoMs(restore.finishedAt)
  const measuredAt = isoMs(parity.generatedAt)
  if (finished === null) out.push(problem('timestamp-invalid', `the restore report's finishedAt ${JSON.stringify(restore.finishedAt ?? null)} is not an ISO-8601 timestamp`))
  if (measuredAt === null) out.push(problem('timestamp-invalid', `parity.json generatedAt ${JSON.stringify(parity.generatedAt ?? null)} is not an ISO-8601 timestamp`))
  if (finished !== null && measuredAt !== null && measuredAt < finished) out.push(problem('evidence-stale', `parity was measured at ${parity.generatedAt}, before the restore finished at ${restore.finishedAt}`))
  if (finished !== null && finished > now + CLOCK_SKEW_MS) out.push(problem('timestamp-invalid', `the restore report says it finished at ${restore.finishedAt}, later than now`))
  if (measuredAt !== null && measuredAt > now + CLOCK_SKEW_MS) out.push(problem('timestamp-invalid', `parity.json says it was measured at ${parity.generatedAt}, later than now`))
  for (const a of archives)
    if (finished !== null && finished < Math.floor(a.mtimeMs)) out.push(problem('evidence-stale', `the restore finished at ${restore.finishedAt}, before ${a.file} was written (${new Date(a.mtimeMs).toISOString()})`))
  return {
    problems: out,
    restoredAt: finished,
    runtime: {
      runtimeUid: uid,
      webroot: target.webroot,
      siteUrl: target.siteUrl,
      restore: { finishedAt: restore.finishedAt ?? null, euid: restore.identity?.euid ?? null, user: restore.identity?.user ?? null },
      parity: { measuredAt: parity.generatedAt ?? null, cli: access?.cli ? { euid: access.cli.euid, user: access.cli.user ?? null } : null, http: access?.http ? { euid: access.http.euid, user: access.http.user ?? null } : null }
    }
  }
}

// httpStatuses: an HTTP status, or `error: <message>` for a request that failed
const statusOrNull = (x) => x === null || Number.isInteger(x) || typeof x === 'string'
// collectCounts: a post/term count (integer) or an option value as wp-cli prints it (text)
const countOrNull = (x) => x === null || (Number.isInteger(x) && x >= 0) || typeof x === 'string'
const nonNegative = (x) => Number.isInteger(x) && x >= 0
/** Why parity.json's rows are not the shape verify-parity writes (compareParity rows, the failure lists). */
function parityRowShape(parity) {
  const out = []
  const rows = (k, key, value) => {
    if (!Array.isArray(parity[k])) return
    parity[k].forEach((r, i) => {
      if (!obj(r) || !nonEmptyString(r[key]) || !value(r.a) || !value(r.b) || typeof r.ok !== 'boolean') out.push(`parity.json: ${k}[${i}] is not {${key}, a, b, ok}`)
      else if (k === 'routes' && !isRouteStatus(r.expected)) out.push(`parity.json: routes[${i}] (${r.path}) records no declared status it was held to (expected ${JSON.stringify(r.expected ?? null)})`)
    })
  }
  rows('routes', 'path', statusOrNull)
  rows('counts', 'name', countOrNull)
  if (!Array.isArray(parity.countErrors)) out.push('parity.json: countErrors is not a list')
  if (obj(parity.styles)) {
    for (const k of ['mismatches', 'captureFailures']) if (!Array.isArray(parity.styles[k])) out.push(`parity.json: styles.${k} is not a list`)
    for (const k of ['axes', 'checked']) if (!nonNegative(parity.styles[k])) out.push(`parity.json: styles.${k} is not a count`)
    const per = parity.styles.perAxis
    if (!obj(per) || !Object.values(per).every(nonNegative)) out.push('parity.json: styles.perAxis is not a count per axis')
  }
  if (obj(parity.summary))
    for (const k of ['routes', 'routesMatching', 'routes200', 'counts', 'countsMatching', 'axes', 'styleChecks', 'styleMismatches'])
      if (!nonNegative(parity.summary[k])) out.push(`parity.json: summary.${k} is not a count`)
  return out
}

/**
 * The status each route of the spec-pack's page-map.json is declared to answer (lib.mjs
 * routeExpectations — the reading verify-parity gives `--routes`): `{expectations, problems}`,
 * expectations a Map path → status, null when the page map cannot be read or declares nonsense.
 */
export function specRouteExpectations(specDir) {
  if (!specDir) return { expectations: null, problems: [problem('spec-missing', 'no --spec: the status each parity route is declared to answer cannot be read')] }
  const file = path.join(specDir, 'page-map.json')
  try {
    const { json } = readJsonRegular(file)
    return { expectations: new Map(routeExpectations(json.pages ?? json.routes, file).map((r) => [r.path, r.expected])), problems: [] }
  } catch (e) {
    return { expectations: null, problems: [problem('parity-expectation', `the route declarations cannot be read: ${e.message}`)] }
  }
}

/**
 * Why parity.json's declared statuses are not the spec-pack's: every route row must carry the status
 * the spec-pack's page map declares for its path (200 for a path it does not declare). A status
 * written into parity.json and nowhere else is never an expectation the release honours.
 */
function parityExpectationProblems(parity, expectations) {
  const out = []
  for (const r of parity.routes) {
    const want = expectations.get(r.path) ?? 200
    if (r.expected !== want) out.push(`route ${r.path} was held to status ${JSON.stringify(r.expected ?? null)}, the spec-pack declares ${want}`)
  }
  return out
}

/**
 * The routes the spec-pack's page map declares that parity.json never compared: a release measures
 * every declared route, so a parity run over `/` alone cannot stand in for the `/404` page or a
 * declared redirect beside it (their style axes follow from parityCoverageProblems once the row is
 * there).
 */
function parityRouteCoverageProblems(parity, expectations) {
  const compared = new Set(parity.routes.map((r) => r.path))
  return [...expectations.keys()].filter((p) => !compared.has(p)).map((p) => `route ${p}, which the spec-pack's page map declares, was not compared`)
}

/**
 * parity.json's verdict, recomputed from its rows the way verify-parity computes it (compareParity:
 * a count matches when a is present and equals b, a route when both stands answer the status it
 * is declared to answer — `expected`, checked against the spec-pack by parityExpectationProblems;
 * ok = every row matching, no style
 * mismatch, no capture failure, no count error, the access probe passing). Every row that does not
 * match, every row whose `ok` says otherwise, a summary that is not the rows' count and an `ok` the
 * rows do not give are named: the flag and the totals are never read in place of the rows.
 */
function parityVerdictProblems(parity) {
  const out = []
  const matches = (r) => r.a !== null && r.a === r.b
  const answers = (r) => matches(r) && r.a === r.expected
  if (!parity.routes.some((r) => r.path === '/')) out.push('the front page / was not compared')
  for (const [k, key, same] of [['routes', 'path', answers], ['counts', 'name', matches]])
    for (const r of parity[k]) {
      const declared = k === 'routes' ? ` (declared ${JSON.stringify(r.expected)})` : ''
      if (r.ok !== same(r)) out.push(`${k} ${r[key]} says ok ${r.ok} for ${JSON.stringify(r.a)} vs ${JSON.stringify(r.b)}${declared}`)
      else if (!r.ok) out.push(`${k} ${r[key]}: ${JSON.stringify(r.a)} vs ${JSON.stringify(r.b)}${declared}`)
    }
  const s = parity.styles
  if (s.mismatches.length) out.push(`${s.mismatches.length} computed-style mismatch(es)`)
  if (s.captureFailures.length) out.push(`${s.captureFailures.length} style capture failure(s)`)
  if (parity.countErrors.length) out.push(`${parity.countErrors.length} count error(s)`)
  const counted = {
    routes: parity.routes.length,
    routesMatching: parity.routes.filter(answers).length,
    routes200: parity.routes.filter((r) => r.a === 200 && r.b === 200).length,
    counts: parity.counts.length,
    countsMatching: parity.counts.filter(matches).length,
    axes: s.axes,
    styleChecks: s.checked,
    styleMismatches: s.mismatches.length
  }
  for (const [k, n] of Object.entries(counted)) if (parity.summary[k] !== n) out.push(`summary.${k} says ${parity.summary[k]}, the rows give ${n}`)
  const ok =
    parity.routes.every(answers) && parity.counts.every(matches) && !s.mismatches.length && !s.captureFailures.length && !parity.countErrors.length && parity.access?.ok === true && !parity.access.problems.length
  if (parity.ok === true && !ok && !out.length) out.push('ok is true, its access probe did not pass')
  if (parity.access && parity.access.ok !== !parity.access.problems.length) out.push(`access says ok ${parity.access.ok} with ${parity.access.problems.length} problem(s)`)
  return out
}

/**
 * What a passing access probe record carries (restore afterRestore, parity `access.cli` /
 * `access.http`): the entries it walked and the themes it checked, the manifest's among them. An `ok`
 * over a probe that walked nothing or checked another theme is not a probe of this site.
 */
function probeRecordProblems(what, rec, { theme }) {
  const out = []
  if (!Number.isInteger(rec.entries) || rec.entries <= 0) out.push(`${what} walked ${JSON.stringify(rec.entries ?? null)} entries, not a count above 0`)
  if (!Array.isArray(rec.themes) || !rec.themes.every(nonEmptyString)) out.push(`${what} records no list of the themes it checked`)
  else if (theme && !rec.themes.includes(theme)) out.push(`${what} checked themes ${JSON.stringify(rec.themes)}, not the manifest's ${theme}`)
  return out
}

/**
 * The identity a parity probe record must carry to be the pass verify-parity grants (lib.mjs
 * evaluateAccess, checkAccess): wp-cli under the CLI SAPI; the HTTP probe under the web server's
 * SAPI, as the user `www-data`; both over entries and the manifest's theme. The uid itself is held
 * by the caller.
 */
function probeIdentityProblems(via, rec, { theme }) {
  const out = []
  if (via === 'cli') {
    if (rec.sapi !== 'cli') out.push(`the cli probe ran under SAPI ${JSON.stringify(rec.sapi ?? null)}, not cli`)
    if (rec.user !== null && rec.user !== undefined && typeof rec.user !== 'string') out.push(`the cli probe's user ${JSON.stringify(rec.user)} is not a name`)
  } else {
    if (rec.user !== 'www-data') out.push(`the http probe ran as user ${JSON.stringify(rec.user ?? null)}, not www-data`)
    if (!nonEmptyString(rec.sapi) || rec.sapi === 'cli') out.push(`the http probe ran under SAPI ${JSON.stringify(rec.sapi ?? null)}, not a web server's`)
  }
  out.push(...probeRecordProblems(`the ${via} probe`, rec, { theme }))
  return out
}

// the axis keys and views verify-parity measures (captureStyles: route × viewport × theme)
const VIEWPORT = /^\d+x\d+$/
const PARITY_THEMES = ['light', 'dark']
/**
 * Whether parity.json measured what a release needs, beyond its rows agreeing: every route answering
 * the status it is declared to answer on both stands (`expected`: 200 unless the spec-pack declares
 * otherwise — two stands answering the same undeclared 404 or the same failed request match and
 * prove nothing), every count collectCounts takes (post and term counts as integers), and computed
 * styles on every route × viewport × theme axis of a route that draws a page (200 or a declared
 * error page; a declared redirect has no page of its own), light and dark, each axis with checks of
 * its own (`styles.perAxis`, keyed as captureStyles keys an axis). A run with
 * `--skip-styles` or without `--wp-a`/`--wp-b` is therefore refused (`parity-incomplete`).
 * Returns `{code, message}` items.
 */
function parityCoverageProblems(parity) {
  const out = []
  const fail = (message) => out.push({ code: 'parity-failed', message })
  const missing = (message) => out.push({ code: 'parity-incomplete', message })
  for (const r of parity.routes) if (r.a !== r.expected || r.b !== r.expected) fail(`route ${r.path} answered ${JSON.stringify(r.a)} on the build stand and ${JSON.stringify(r.b)} on the restored one, not its declared ${JSON.stringify(r.expected ?? null)} on both`)
  const counts = new Map(parity.counts.map((c) => [c.name, c]))
  const integers = [...COUNT_TYPES.map((t) => `post:${t}`), 'term:category']
  for (const name of [...integers, ...COUNT_OPTIONS.map((o) => `option:${o}`)]) {
    const c = counts.get(name)
    if (!c) missing(`count ${name} was not measured`)
    else if (integers.includes(name) && (!Number.isInteger(c.a) || !Number.isInteger(c.b))) fail(`count ${name} is ${JSON.stringify(c.a)} vs ${JSON.stringify(c.b)}, not a number on both`)
  }
  const s = parity.styles
  const viewports = typeof s.viewports === 'string' ? s.viewports.split(',') : []
  if (!viewports.length || !viewports.every((v) => VIEWPORT.test(v))) missing(`styles.viewports ${JSON.stringify(s.viewports ?? null)} names no WxH viewports`)
  const themes = Array.isArray(s.themes) ? s.themes : []
  for (const t of PARITY_THEMES) if (!themes.includes(t)) missing(`styles were not measured on the ${t} theme`)
  const pages = parity.routes.filter((r) => isRenderableStatus(r.expected))
  const axes = pages.length * viewports.length * themes.length
  if (!axes || s.axes !== axes) missing(`styles cover ${s.axes} axes, not the ${pages.length} page route(s) × ${viewports.length} viewport(s) × ${themes.length} theme(s) = ${axes} measured`)
  // every axis by its key (captureStyles: route|width|theme), each with checks of its own — a total
  // other axes carry never stands in for an axis that compared nothing
  const per = s.perAxis
  const expected = pages.flatMap((r) => viewports.flatMap((v) => themes.map((t) => `${r.path}|${v.split('x')[0]}|${t}`)))
  for (const k of expected)
    if (!Object.hasOwn(per, k)) missing(`styles axis ${k} was not compared`)
    else if (per[k] === 0) missing(`styles axis ${k} made 0 checks — it compared nothing`)
  for (const k of Object.keys(per)) if (!expected.includes(k)) missing(`styles axis ${k} is not a route × viewport × theme this parity measured`)
  const sum = Object.values(per).reduce((n, c) => n + c, 0)
  if (sum !== s.checked) missing(`styles.perAxis adds up to ${sum} checks, styles.checked says ${s.checked}`)
  if (Object.keys(per).length !== s.axes) missing(`styles.perAxis names ${Object.keys(per).length} axes, styles.axes says ${s.axes}`)
  for (const m of s.mismatches) if (!obj(m) || !Object.hasOwn(per, m.axis)) missing(`a style mismatch on axis ${JSON.stringify(m?.axis ?? null)} is not an axis perAxis records`)
  return out
}

// A release tag: `<product>/<cms>` or `<owner>/<product>/<cms>`, each segment words joined by `-` or `.`.
const ID_SEGMENT = /^[A-Za-z0-9]+(?:[-.][A-Za-z0-9]+)*$/
/**
 * The manifest fields the release itself reads (title, README, notes, VERIFICATION.json) beyond what
 * readPack holds restore and verify to: named here so a manifest the release cannot describe is a
 * pack-invalid refusal, not a TypeError half-way through assembly.
 */
function releaseManifestProblems(m) {
  const out = []
  const segments = typeof m.id === 'string' ? m.id.split('/') : []
  if (segments.length < 2 || !segments.every((x) => ID_SEGMENT.test(x))) out.push(`id ${JSON.stringify(m.id ?? null)} is not <product>/<cms> (a release tag)`)
  for (const k of ['version', 'phpVersion', 'prefix']) if (!nonEmptyString(m[k])) out.push(`${k} ${JSON.stringify(m[k] ?? null)} is not a non-empty string`)
  if (!obj(m.theme) || !nonEmptyString(m.theme.version)) out.push('theme.version is not a non-empty string')
  if (m.placeholderUrl !== undefined && !isSiteUrl(m.placeholderUrl)) out.push(`placeholderUrl ${JSON.stringify(m.placeholderUrl)} is not an http(s) URL`)
  if (m.plugins !== undefined && !Array.isArray(m.plugins)) out.push('plugins is not a list')
  if (m.counts !== undefined && m.counts !== null && !obj(m.counts)) out.push('counts is not an object')
  return out
}

// `<product>/<cms>` are the id's last two segments: a JoomlArt design's tag carries an owner
// segment in front (`quickstart/ja-kinetic/wp7`) that names neither.
const productAndCms = (id) => id.split('/').slice(-2)

export const titleFor = (manifest) => {
  const [product, cms] = productAndCms(manifest.id)
  const name = product
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
  const m = cms.match(/^wp(\d+)$/)
  return `Quickstart: ${name} / ${m ? `WordPress ${m[1]}` : cms}`
}

const PATCH_VISUAL_REASON = 'fix release: targeted measurement instead of a four-tier checkpoint'

export function buildVerification({ manifest, parity, restoreReport, contracts = null, visual = null, acceptance = null, contractBind = null, fix = null }) {
  const s = parity.summary ?? {}
  return {
    release: manifest.id,
    version: manifest.version,
    gate: fix ? 'patch' : 'full',
    ...(fix && { previous: fix.previous, measure: fix.measure, baseline: fix.baseline, ...(fix.noBaseline !== null && { noBaseline: fix.noBaseline, noBaselineVerified: false }), notDefects: fix.notDefects, changedFrom: fix.changedFrom }),
    contracts: fix ? null : contracts,
    contractBind,
    visual: fix ? { checkpoint: null, reason: PATCH_VISUAL_REASON } : visual ? { run: visual.run, contractPath: visual.identity?.contractPath ?? null, contractHash: visual.identity?.contractHash ?? null, capturedAt: visual.at, stages: visual.summary?.stages ?? null, findings: visual.summary?.findings ?? null, path: visual.path ?? null, ...(visual.restoreSmoke && { restoreSmoke: visual.restoreSmoke }) } : null,
    // what the release was accepted on: artifact bytes, the four bound tiers, the runtime identity
    acceptance,
    platform: manifest.platform,
    wpVersion: manifest.wpVersion,
    phpVersion: manifest.phpVersion,
    restoration: {
      method:
        'restore.mjs: as root, tar -x webroot into a Linux webroot (owner and modes as shipped), wp-config.php DB constants rewritten in place (render_wp_config.py shape), access probe as www-data (wp-config.php, uploads, active theme), wp db import, wp search-replace placeholder → site URL (all tables, --precise), wp core verify-checksums, active theme checked, wp rewrite flush',
      freshDatabase: true,
      prefix: manifest.prefix,
      placeholderUrl: manifest.placeholderUrl ?? PLACEHOLDER_URL,
      passwordsBlanked: manifest.passwordsBlanked ?? true,
      steps: restoreReport?.steps ?? null,
      finishedAt: restoreReport?.finishedAt ?? null
    },
    parity: {
      // roles, not the origins the stands answered on: those are the build machine's
      source: STAND_ROLES.source,
      restored: STAND_ROLES.restored,
      measuredAt: parity.generatedAt,
      ok: parity.ok,
      routes: { total: s.routes, matching: s.routesMatching, both200: s.routes200, table: parity.routes },
      counts: { total: s.counts, matching: s.countsMatching, table: parity.counts },
      styles: {
        axes: s.axes,
        checks: s.styleChecks,
        mismatches: s.styleMismatches,
        viewports: parity.styles?.viewports,
        themes: parity.styles?.themes,
        selectors: parity.styles?.selectors,
        properties: parity.styles?.properties,
        tolerance: parity.styles?.tolerance,
        darkHook: parity.styles?.darkHook,
        lightHook: parity.styles?.lightHook,
        detail: parity.styles?.mismatches ?? [],
        captureFailures: parity.styles?.captureFailures ?? []
      }
    },
    secretScan: { tool: 'secret-scan.sh', ranAtPack: true },
    counts: manifest.counts ?? null,
    theme: manifest.theme,
    plugins: manifest.plugins
  }
}

const STAND_ROLES = { source: 'source stand', restored: 'restored stand' }
// an http(s) origin of a machine-local stand: loopback, wildcard, a bare IPv4, a docker host name, a .local/.test name
const STAND_ORIGIN = /https?:\/\/(?:127(?:\.\d+){3}|0\.0\.0\.0|\[(?:::1?|::ffff:\d{1,3}(?:\.\d{1,3}){3})\]|localhost|host\.docker\.internal|[\w.-]+\.(?:local|test|localhost)|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?/gi
// a path of the build machine that survived recordData: the home mark, or an absolute path into a user, volume or temp area
const MACHINE_PATH = /^(?:~|\/(?:Users|home|private|Volumes|tmp|var\/folders))(?:\/|$)/
// the same paths anywhere inside a longer text: from the root to the next space or quote
const MACHINE_PATH_IN_TEXT = /(?:file:\/\/)?(?:(?<![\w.~/-])|(?<=file:\/\/))(?:~|\/(?:Users|home|private|Volumes|tmp|var\/folders))(?:\/[^\s"'`<>),;]*)?/g
const cutPath = (p) => path.posix.basename(p.replace(/\/+$/, '')) || '<path>'

/**
 * VERIFICATION.json is published: it keeps the measurements and hashes but not how the build machine is laid out.
 * A stand origin (host:port) becomes the role the stand played, an evidence directory is dropped (the dossier keeps it,
 * the hashes stay), and any other path of the machine is cut to its file name. Keys that readers of `--previous` use
 * (release, version, gate, visual) hold no stand and no machine path and are not touched. A `sourceFingerprint` is kept
 * whole: its id is a hash over its url, so a rewritten url would leave a fingerprint that no longer validates.
 */
export function portableVerification(value) {
  if (typeof value === 'string') return value.replace(STAND_ORIGIN, 'a stand').replace(MACHINE_PATH_IN_TEXT, (m) => (m === '~' || m === '/Users' ? '<path>' : cutPath(m)))
  if (Array.isArray(value)) return value.map(portableVerification)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k, v]) => !(k === 'dir' && typeof v === 'string' && MACHINE_PATH.test(v))).map(([k, v]) => [k, k === 'sourceFingerprint' ? v : portableVerification(v)]))
  return value
}

/** The VERIFICATION.json content as it is written: built, paths recorded (lib/record-paths.mjs), then made portable. */
export function verificationRecord(args, recordOpts = {}) {
  return portableVerification(recordData(buildVerification(args), recordOpts))
}

export function readmeText(manifest, { repo, extraAssets = [], admin = 'tracyagent', title = titleFor(manifest) }) {
  const ph = manifest.placeholderUrl ?? PLACEHOLDER_URL
  const [, cms] = productAndCms(manifest.id)
  return `# ${title}

Version ${manifest.version}. A complete WordPress ${manifest.wpVersion} site (PHP ${manifest.phpVersion} tested) with the
\`${manifest.theme.name}\` block theme ${manifest.theme.version} active and its demo content. Two archives, consumed as a pair:

| Asset | What it is |
|---|---|
| \`${manifest.webroot.file}\` | the whole webroot, table prefix \`${manifest.prefix}\`, \`wp-config.php\` with placeholder database constants (\`{{DB_NAME}}\` \`{{DB_USER}}\` \`{{DB_PASSWORD}}\` \`{{DB_HOST}}\`) and fresh salts |
| \`${manifest.database.file}\` | the database, prefix \`${manifest.prefix}\` literal, every address written as \`${ph}\` |
${extraAssets.map((a) => `| \`${a}\` | extra asset |`).join('\n')}
Hashes and sizes: \`manifest.json\`, \`SHA256SUMS\`. Parity of a clean restore against the build: \`VERIFICATION.json\`.

## Restore on the Tracy fleet

The provisioner takes the pair through \`provision/quickstart.py\` (download + sha256 + member check) and
\`provision.sh\` (\`tar -xf\` into the webroot, \`gunzip -c | mariadb\`), then \`render_wp_config.py\` rewrites the
four database constants in place and \`platform/wordpress.sh\` runs \`wp search-replace <old> <new>\` where
\`<old>\` is read from \`${manifest.prefix}options.home\` — which is \`${ph}\` in this dump. The catalogue entry
(\`quickstarts.json\`) needs \`url\`, \`bytes\` and \`sha256\` from \`manifest.json\` for both files.

## Restore by hand

\`\`\`sh
mkdir site && tar -xzf ${manifest.webroot.file} -C site
# wp-config.php: replace the four {{DB_*}} placeholders with your database, keep $table_prefix = '${manifest.prefix}'
gunzip -c ${manifest.database.file} | mysql your_database
cd site
wp search-replace '${ph}' 'https://your-site.example' --all-tables --precise
wp core verify-checksums
wp user update ${admin} --user_pass='choose-a-password'   # no account ships with a usable password
wp rewrite flush
\`\`\`

Or, with the tools this pack was built with (skill \`tracy-wordpress-theme\`, \`scripts/quickstart/restore.mjs\`):

\`\`\`sh
node restore.mjs --pack . --root-runner "<runs as root in the webroot>" --wp "<wp as www-data>" --site-url https://your-site.example \\
  --db-host localhost --db-user … --db-name … --db-password-env DB_PASSWORD${admin === 'tracyagent' ? '' : ` --admin ${admin}`} --admin-password '…'
\`\`\`

## What was scrubbed

Passwords and activation keys of every user are blank, login sessions removed, transients and revisions pruned,
no debug log, no build-only options, salts regenerated at pack time, the build stand's address absent from both
archives (\`secret-scan.sh\` refuses a pack that carries any of it). The Cowork receiver is not bundled: the
provisioner installs the current release and the plugin mints its own token on activation.

## Editing the demo

Everything on the site is ordinary WordPress: pages and posts in the editor, navigation in the Site Editor,
sections are theme patterns with editable content. Company details, people, pricing and contact addresses are
demonstration data — replace them before accepting enquiries.

## For the site owner and any agent maintaining the site

The theme carries its own documentation, inside the restored webroot at
\`wp-content/themes/${manifest.theme.name}/\`: read \`AGENTS.md\` first (rules, what is a file and what is a
database row, what not to edit by hand), then \`docs/\` — architecture, install, content model (where every
kind of text lives, menus, options, redirects), content rules (owner decisions and the port's gaps), design
system (style variations, dark mode) and checks-and-recovery (backup, restore, the review commands).
\`docs/generated/inventory.md\` is the theme's file inventory at build time, not a live inventory of this site.

Release: \`${repo}\`, tag \`${manifest.id}\` (${cms}).
`
}

export function notesTemplate(manifest, verification, { title = titleFor(manifest) } = {}) {
  const v = verification.parity
  return `## ${title.replace('Quickstart: ', '')} ${manifest.version}

{{ONE_LINE_WHAT_THIS_IS}}

- WordPress ${manifest.wpVersion} (PHP ${manifest.phpVersion}), block theme \`${manifest.theme.name}\` ${manifest.theme.version} active, light/dark, demo content.
- {{HIGHLIGHTS: sections, menus, mega panel, style variations — the coordinator fills this}}
- {{COWORK: receiver policy per Q6 — installed by the provisioner, contract/profile if shipped}}
- Source passwords, sessions and build-only options are scrubbed. Restore with your own administrator password.

### Downloads

\`${manifest.webroot.file}\` + \`${manifest.database.file}\` are the pair the fleet reads. {{EXTRA_ASSETS: theme zip, profile zip}}
Identities and hashes are in \`manifest.json\` and \`SHA256SUMS\`.

### Verification

A clean restore (\`restore.mjs\`, fresh database, prefix \`${manifest.prefix}\`) compared to the build stand:
${v.routes.matching}/${v.routes.total} routes answer their declared status on both stands (${v.routes.both200} of them 200), ${v.counts.matching}/${v.counts.total} content counts match,
${v.styles.mismatches} computed-style mismatches over ${v.styles.checks} checks on ${v.styles.axes} axes
(${v.styles.themes?.join('/')} × ${v.styles.viewports}). Detail in \`VERIFICATION.json\`.

{{INTEGRATION_NOTE: whether Tracy Build/provision selects this quickstart yet}}
`
}

/** The notes paragraph for a `--no-baseline` reason: stated by the releaser, not checked by the release. */
export const unverifiedNoBaselineNote = (reason) => `**Unverified exception:** no baseline was measured on the previous version. The reason given — "${reason}" — is the releaser's statement and was not verified, so these checks are not proven to have failed there.`

/** Complete, plain notes of a fix release from its VERIFICATION.json: what was fixed (the checks' titles) and what it was verified on. */
export function patchNotes(manifest, verification, { title = titleFor(manifest) } = {}) {
  const v = verification.parity
  const m = verification.measure
  const lines = [
    `## ${title.replace('Quickstart: ', '')} ${manifest.version}`,
    '',
    `A fix release of ${verification.previous.version}: WordPress ${manifest.wpVersion} (PHP ${manifest.phpVersion}), block theme \`${manifest.theme.name}\` ${manifest.theme.version}, the same site and demo content.`,
    '',
    `### Fixed in ${manifest.version}`,
    '',
    ...m.checks.map((c) => `- ${c.title}`),
    ''
  ]
  if (verification.notDefects?.length) lines.push('### Differences from the source that are not defects', '', ...verification.notDefects.map((n) => `- ${n.what} — ${n.why}`), '')
  lines.push(
    '### Downloads',
    '',
    `\`${manifest.webroot.file}\` + \`${manifest.database.file}\` are the pair the fleet reads. The theme zip is released beside them. Identities and hashes are in \`manifest.json\` and \`SHA256SUMS\`.`,
    '',
    '### Verification',
    '',
    `${m.passed}/${m.total} targeted checks pass on a clean restore of this pack${verification.baseline ? `; on ${verification.baseline.version} ${verification.baseline.passed}/${verification.baseline.total} passed` : ''}.`,
    ...(verification.noBaseline ? ['', unverifiedNoBaselineNote(verification.noBaseline)] : []),
    `A clean restore (\`restore.mjs\`, fresh database, prefix \`${manifest.prefix}\`) compared to the build stand: ${v.routes.matching}/${v.routes.total} routes answer their declared status on both stands, ${v.counts.matching}/${v.counts.total} content counts match, ${v.styles.mismatches} computed-style mismatches over ${v.styles.checks} checks on ${v.styles.axes} axes. Detail in \`VERIFICATION.json\`.`,
    ''
  )
  return lines.join('\n')
}

const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`

/**
 * Upload order: the archives first, then the metadata, `tracy_setting.json` last. A reader of the
 * release (the fleet, a person) that sees the settings file sees everything it describes already
 * there; an upload that dies half-way leaves the archives, not a settings file pointing at nothing.
 */
const assetRank = (a) => (path.basename(a) === 'tracy_setting.json' ? 2 : /\.(tar\.gz|tgz|sql\.gz|gz|zip)$/i.test(a) ? 0 : 1)
export function orderAssets(assets) {
  return assets.map((a, i) => [a, i]).sort((x, y) => assetRank(x[0]) - assetRank(y[0]) || x[1] - y[1]).map(([a]) => a)
}

/**
 * The upload order as commands: one `gh release upload` per group, in order. One command is not an
 * order — gh uploads the files of a command concurrently (5 at a time, `ConcurrentUpload` in
 * cli/cli pkg/cmd/release/shared/upload.go) — so the settings file gets a command of its own.
 */
export function uploadCommands({ tag, repo, assets }) {
  const groups = [0, 1, 2].map((r) => orderAssets(assets).filter((a) => assetRank(a) === r)).filter((g) => g.length)
  return groups.map((g) => ghCommand({ tag, repo, assets: g, exists: true }))
}

/** `gh release create --draft` for a new release; `gh release upload --clobber` for one that exists. */
export function ghCommand({ tag, repo, title, notesFile, assets, exists = false }) {
  if (exists) return ['gh release upload', q(tag), '-R', repo, '--clobber', ...assets.map(q)].join(' ')
  return [
    'gh release create',
    q(tag),
    '-R',
    repo,
    '--draft',
    '--title',
    q(title),
    '--notes-file',
    q(notesFile),
    ...assets.map(q)
  ].join(' ')
}

/**
 * Does the GitHub release for `tag` exist? Read-only: `gh release view`. `{exists: true|false}`,
 * or `{error}` when gh could not tell (not installed, not logged in, no network) — which is not
 * the same as "no release". A git tag without a release is "no release": `gh release create`
 * attaches to the existing tag. `run` is injectable (tests).
 */
export function releaseState({ tag, repo, run = spawnSync }) {
  const r = run('gh', ['release', 'view', tag, '-R', repo, '--json', 'tagName,isDraft'], { encoding: 'utf8', timeout: 30000 })
  if (r.error) return { error: r.error.code === 'ENOENT' ? 'gh is not installed' : String(r.error.message) }
  if (r.status === 0) {
    try {
      return { exists: true, draft: Boolean(JSON.parse(r.stdout).isDraft) }
    } catch {
      return { exists: true, draft: null }
    }
  }
  const err = String(r.stderr ?? '').trim()
  if (/release not found|HTTP 404|Not Found/i.test(err)) return { exists: false }
  return { error: err.split('\n').slice(-1)[0] || `gh exited ${r.status}` }
}

/** The publish commands to print for a release in `state` (releaseState). Nothing is run. */
export function publishCommands({ tag, repo, title, notesFile, assets, state }) {
  const ordered = orderAssets(assets)
  if (state.exists)
    return {
      say: `release ${tag} exists${state.draft ? ' (draft)' : ''} on ${repo}: replace its assets in order, one line after the other, then its notes`,
      commands: [...uploadCommands({ tag, repo, assets }), `gh release edit ${q(tag)} -R ${repo} --title ${q(title)} --notes-file ${q(notesFile)}`]
    }
  if (state.exists === false) return { say: `no release ${tag} on ${repo} yet: create it as a draft`, commands: [ghCommand({ tag, repo, title, notesFile, assets: ordered })] }
  return {
    say: `could not tell whether release ${tag} exists on ${repo} (${state.error}) — the first line if it does not, the others in order if it does`,
    commands: [ghCommand({ tag, repo, title, notesFile, assets: ordered }), ...uploadCommands({ tag, repo, assets })]
  }
}

// ---------------------------------------------------------------- the metadata every release carries
// tracy_setting.json (what the fleet reads: the archives' names and hashes), tracy_design_inspiration.json (the
// design card) and, for a fix release, the measure it was accepted on. The first is written from the port's
// published one; the card and the measure are copied byte for byte.
const SETTING_FILE = 'tracy_setting.json'
const CARD_FILE = 'tracy_design_inspiration.json'
const MEASURE_FILE = 'fix-measure.json'
/** `ja-vega` of `quickstart/ja-vega/wp7`: the template slug a port's metadata names. */
const slugOf = (id) => (typeof id === 'string' ? (id.split('/').slice(-2, -1)[0] ?? null) : null)

/**
 * Where the wp-config.php inside a webroot archive (its bytes) differs from the accepted form: messages naming the
 * archive and the line; an archive that cannot be listed or holds no wp-config.php is one problem of its own.
 */
export function webrootConfigProblems(bytes, archiveName) {
  let rows
  try {
    rows = listArchive('-', { input: bytes, read: CONFIG_MEMBERS })
  } catch (e) {
    return [`${archiveName}: the webroot archive cannot be read (${String(e.message).split('\n')[0]})`]
  }
  return archiveConfig(rows, archiveName).problems
}

/**
 * The directory of a --previous (the release directory, or the VERIFICATION.json in it) and its `tracy_*.json` files, after
 * its SHA256SUMS has been checked: every line `<sha256>  <plain name>` once, each file there and the bytes it lists, the
 * release-notes.md one too. Throws an Error naming the file that fails when the directory or SHA256SUMS cannot be read or
 * checked, or a `tracy_*.json` is not a regular file or is not listed. Returns {dir, names (sorted)}.
 */
export function previousRelease(previous) {
  let dir = previous
  try {
    if (!lstatSync(previous).isDirectory()) dir = path.dirname(previous)
  } catch (e) {
    throw new Error(`--previous ${previous} cannot be read (${e.message})`)
  }
  const sumsFile = path.join(dir, 'SHA256SUMS')
  let sums
  try {
    sums = readRegular(sumsFile).bytes.toString('utf8')
  } catch (e) {
    throw new Error(`${sumsFile} cannot be read (${String(e.message).split('\n')[0]}): --previous ${dir} is not a release directory whose files can be checked`)
  }
  const lines = sums.split('\n').filter((l) => l !== '')
  const bad = lines.filter((l) => !/^[0-9a-f]{64} {2}\S.*$/.test(l) || !isArtifactName(l.slice(66)))
  if (!lines.length) throw new Error(`${sumsFile} is empty`)
  if (bad.length) throw new Error(`${sumsFile} has a line that is not "<sha256>  <plain file name>": ${JSON.stringify(bad[0].slice(0, 80))}`)
  const listed = parseSums(sums).map((x) => x.file)
  const twice = listed.find((f, i) => listed.indexOf(f) !== i)
  if (twice) throw new Error(`${sumsFile} lists ${twice} more than once`)
  const failures = checkSums(dir, sums)
  if (failures.length) throw new Error(`${sumsFile} does not hold for ${failures.slice(0, 3).map((f) => `${f.file}${f.missing ? ' (missing)' : ''}`).join(', ')}${failures.length > 3 ? ` and ${failures.length - 3} more` : ''}`)
  let entries
  try {
    entries = readdirSync(dir)
  } catch (e) {
    throw new Error(`${dir} cannot be listed (${e.message})`)
  }
  const manifestFile = path.join(dir, 'manifest.json')
  let assets = []
  try {
    const m = JSON.parse(readRegular(manifestFile).bytes.toString('utf8'))
    const a = m?.assets ?? []
    if (!Array.isArray(a)) throw new Error('assets is not a list')
    assets = a.map((x) => (typeof x === 'string' ? x : x?.name ?? x?.file ?? x?.path))
    if (assets.some((x) => typeof x !== 'string' || !isArtifactName(x))) throw new Error('an asset has no plain file name')
  } catch (e) {
    throw new Error(`${manifestFile} cannot be read as a release manifest (${String(e.message).split('\n')[0]})`)
  }
  const names = entries.filter((n) => /^tracy_.+\.json$/.test(n)).sort()
  const odd = names.filter((n) => {
    try {
      return !lstatSync(path.join(dir, n)).isFile()
    } catch {
      return true
    }
  })
  if (odd.length) throw new Error(`${dir}: ${odd.join(', ')} ${odd.length === 1 ? 'is' : 'are'} not ${odd.length === 1 ? 'a regular file' : 'regular files'} — the release cannot carry ${odd.length === 1 ? 'it' : 'them'}`)
  const uncovered = [...new Set(['manifest.json', 'VERIFICATION.json', 'README.md', ...assets, ...entries.filter((e) => e !== 'SHA256SUMS' && e !== 'release-notes.md')])].filter((f) => !listed.includes(f))
  if (uncovered.length) throw new Error(`${sumsFile} does not list ${uncovered.slice(0, 4).join(', ')}${uncovered.length > 4 ? ` and ${uncovered.length - 4} more` : ''}: ${uncovered.length === 1 ? 'it is' : 'they are'} not protected by a checksum`)
  return { dir, names }
}

/**
 * The new tracy_setting.json from a published one of the same port: `version` from the manifest, the archives'
 * names and sha256 from the manifest, and `cms` from the WordPress version when the template has one; everything
 * else kept, in the template's order. A template of another port is refused. → {problems: [message], text, notes}.
 */
export function settingFromTemplate(bytes, manifest) {
  const problems = []
  const notes = []
  let t = null
  try {
    t = JSON.parse(Buffer.from(bytes).toString('utf8'))
  } catch (e) {
    return { problems: [`--setting-template is not valid JSON (${e.message})`], text: null, notes }
  }
  if (!obj(t)) return { problems: ['--setting-template is not a JSON object'], text: null, notes }
  const slug = slugOf(manifest.id)
  if (typeof t.template !== 'string' || t.template !== slug) problems.push(`--setting-template is of template ${JSON.stringify(t.template ?? null)}, this pack is ${manifest.id} (${slug})`)
  if (t.platform !== manifest.platform) problems.push(`--setting-template is of platform ${JSON.stringify(t.platform ?? null)}, this pack is ${manifest.platform}`)
  if (!obj(t.install) || !obj(t.install.webroot) || !obj(t.install.database)) problems.push('--setting-template has no install.webroot / install.database to rewrite')
  if (problems.length) return { problems, text: null, notes }
  const next = JSON.parse(JSON.stringify(t))
  next.version = manifest.version
  if ('cms' in next && next.cms !== manifest.wpVersion) {
    notes.push(`${SETTING_FILE}: cms ${next.cms} → ${manifest.wpVersion} (the manifest's WordPress version)`)
    next.cms = manifest.wpVersion
  }
  for (const key of ['webroot', 'database']) {
    next.install[key].file = manifest[key].file
    next.install[key].sha256 = manifest[key].sha256
  }
  return { problems, text: JSON.stringify(next, null, 2) + '\n', notes }
}

/** Why `bytes` is not the design card of the port `manifest` is: a list of messages. */
export function cardProblems(bytes, manifest) {
  let card = null
  try {
    card = JSON.parse(Buffer.from(bytes).toString('utf8'))
  } catch (e) {
    return [`--card is not valid JSON (${e.message})`]
  }
  if (!obj(card)) return ['--card is not a JSON object']
  const slug = slugOf(manifest.id)
  if (card.template !== undefined && card.template !== slug) return [`--card is of template ${JSON.stringify(card.template)}, this pack is ${manifest.id} (${slug})`]
  return []
}

// ---------------------------------------------------------------- acceptance and assembly
// The files a release writes itself: no archive, theme zip or asset may carry one of these names.
const RELEASE_FILES = ['manifest.json', 'VERIFICATION.json', 'README.md', 'release-notes.md', 'SHA256SUMS']
const REFUSED = 'release refused — nothing was written'
const ABORTED = 'release aborted — an input changed while the release was assembled; nothing was replaced'

/**
 * The pack files readPack reads — SHA256SUMS, manifest.json and every file the sums name — recorded
 * in the snapshot of what the release was accepted on. readPack itself reads each through a
 * descriptor that follows no link and waits on no FIFO, so a file replaced after this check is still
 * never followed or blocked on. A name that is not plain or a file that is absent is left to readPack.
 */
function checkPackFiles(pack) {
  const text = readRegular(path.join(pack, 'SHA256SUMS')).bytes.toString('utf8')
  for (const { file } of parseSums(text)) {
    const p = path.join(pack, file)
    if (!isArtifactName(file) || !lexists(p)) continue
    if (file === 'manifest.json') readRegular(p)
    else checkRegular(p)
  }
}

/**
 * Everything the release is accepted on, read once: the pack (readPack, then both archives hashed
 * from the bytes read), the theme zip and extra assets, the contracts, the restore report and
 * parity.json, the checkpoint. Nothing is written. Throws AcceptanceError naming every problem;
 * returns the validated bytes, the acceptance record and `snapshot` — every file read, by path, with
 * its hash, size and mtime.
 */
export function acceptRelease(o, { now = Date.now() } = {}) {
  const outer = reads
  reads = new Map()
  try {
    let accepted
    try {
      accepted = accept(o, now)
    } catch (e) {
      // The last net under the named checks: an input shape none of them foresaw is still a named
      // refusal, never a stack trace that leaves the caller unsure whether anything was accepted.
      if (e instanceof AcceptanceError) throw e
      throw new AcceptanceError(REFUSED, [problem('input-invalid', `an input does not have the shape the release reads: ${String(e?.message ?? e).split('\n')[0]}`)])
    }
    accepted.snapshot = Object.fromEntries([...reads.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))
    return accepted
  } finally {
    reads = outer
  }
}

function accept(o, now) {
  const problems = []
  const pack = path.resolve(o.pack)
  let manifest = null
  let manifestSha = null
  try {
    checkPackFiles(pack)
    ;({ manifest, manifestSha } = readPack(pack))
    const names = [manifest.webroot.file, manifest.database.file]
    if (names[0] === names[1]) throw new Error(`manifest.json names ${names[0]} as both archives`)
    for (const n of names) if (RELEASE_FILES.includes(n)) throw new Error(`manifest.json names an archive ${n}, a file the release writes itself`)
    const fields = releaseManifestProblems(manifest)
    if (fields.length) throw new Error(`manifest.json does not hold what the release writes: ${fields.join('; ')}`)
  } catch (e) {
    manifest = null
    problems.push(problem('pack-invalid', `the pack ${pack} does not check out: ${e.message}`))
  }
  const files = new Map() // release file name → {bytes, sha256 (hex), source}
  const artifacts = {}
  const take = (key, file, want = null) => {
    try {
      const { bytes, stat } = readRegular(file)
      const hex = sha256Text(bytes)
      if (want && hex !== want) throw new Error(`is ${hex} now, the manifest says ${want}`)
      artifacts[key] = { file: path.basename(file), sha256: `sha256:${hex}`, bytes: bytes.length, mtimeMs: stat.mtimeMs }
      return { bytes, sha256: hex, source: path.resolve(file) }
    } catch (e) {
      problems.push(problem(key === 'theme' ? 'theme-zip-invalid' : 'pack-invalid', `${key}: ${e.message}`))
      return null
    }
  }
  if (manifest)
    for (const key of ['webroot', 'database']) {
      const got = take(key, path.join(pack, manifest[key].file), manifest[key].sha256)
      if (got) files.set(manifest[key].file, got)
    }
  if (manifest && files.has(manifest.webroot.file)) {
    const wp = webrootConfigProblems(files.get(manifest.webroot.file).bytes, manifest.webroot.file)
    problems.push(...wp.map((m) => problem('pack-invalid', m)))
  }
  const themeZip = o.themeZip ? path.resolve(o.themeZip) : null
  // A fix release names its theme zip as the previous releases did, `<theme>-<version>.zip`, whatever the file it was built into is called.
  const themeName = themeZip ? (o.patch && manifest?.theme?.name && manifest.theme.version ? `${manifest.theme.name}-${manifest.theme.version}.zip` : path.basename(themeZip)) : null
  if (!themeZip) problems.push(problem('theme-zip-missing', 'no --theme-zip: the Visual QA tiers cannot be bound to a theme'))
  else if (!isArtifactName(themeName) || RELEASE_FILES.includes(themeName) || (manifest && [manifest.webroot.file, manifest.database.file].includes(themeName)))
    problems.push(problem('unsafe-file', `--theme-zip ${themeZip}: ${!isArtifactName(themeName) ? 'not a plain file name' : RELEASE_FILES.includes(themeName) ? 'a name the release writes itself' : 'the name of a pack archive'}`))
  else {
    const got = take('theme', themeZip)
    if (got) files.set(themeName, got)
  }
  const extra = []
  for (const a of o.asset ?? []) {
    const name = path.basename(a)
    if (path.resolve(a) === themeZip) continue
    if ([SETTING_FILE, CARD_FILE, MEASURE_FILE].includes(name)) {
      problems.push(problem('unsafe-file', `--asset ${a}: the release writes ${name} itself${name === SETTING_FILE ? ' (from --setting-template)' : name === CARD_FILE ? ' (from --card)' : ''}; it is not an asset`))
      continue
    }
    if (!isArtifactName(name) || RELEASE_FILES.includes(name) || files.has(name) || name === themeName) {
      problems.push(problem('unsafe-file', `--asset ${a}: ${files.has(name) || name === themeName ? 'a second asset with this name' : 'not a plain file name the release may carry'}`))
      continue
    }
    try {
      const { bytes } = readRegular(a)
      files.set(name, { bytes, sha256: sha256Text(bytes), source: path.resolve(a) })
      extra.push(name)
    } catch (e) {
      problems.push(problem('asset-invalid', e.message))
    }
  }
  // The metadata a release carries: written from / copied from the port's published files.
  const notes = []
  const metadata = (flag, name, file, make) => {
    if (!file || !manifest) return
    if (files.has(name)) return void problems.push(problem('unsafe-file', `${flag} ${file}: a second asset named ${name}`))
    try {
      const { bytes } = readRegular(file)
      const made = make(bytes)
      if (made.problems.length) return void problems.push(...made.problems.map((m) => problem('metadata-invalid', m)))
      const out = Buffer.from(made.bytes)
      files.set(name, { bytes: out, sha256: sha256Text(out), source: path.resolve(file) })
      extra.push(name)
      notes.push(...(made.notes ?? []))
    } catch (e) {
      problems.push(problem('metadata-invalid', `${flag}: ${e.message}`))
    }
  }
  metadata('--setting-template', SETTING_FILE, o.settingTemplate, (bytes) => {
    const r = settingFromTemplate(bytes, manifest)
    return { problems: r.problems, bytes: r.text, notes: r.notes }
  })
  metadata('--card', CARD_FILE, o.card, (bytes) => ({ problems: cardProblems(bytes, manifest), bytes }))
  // A fix release carries what the release before it carried: a metadata file it has and this one would not is named, and
  // one it carries (other than the setting, which is rewritten) is the same bytes, the card too.
  if (o.patch && o.previous && manifest) {
    let carried = []
    let prevDir = o.previous
    try {
      ;({ names: carried, dir: prevDir } = previousRelease(o.previous))
    } catch (e) {
      problems.push(problem('metadata-invalid', `--previous: ${e.message}`))
    }
    for (const n of carried) {
      if (!files.has(n)) {
        problems.push(problem('metadata-missing', `--previous holds ${n} and this release would not carry it: pass ${n === SETTING_FILE ? '--setting-template' : n === CARD_FILE ? '--card' : '--asset'} ${path.join(prevDir, n)}`))
        continue
      }
      if (n === SETTING_FILE) continue
      try {
        const before = sha256Text(readRegular(path.join(prevDir, n)).bytes)
        if (before !== files.get(n).sha256) problems.push(problem('metadata-changed', `${n} is not the bytes --previous carried (${files.get(n).source ?? n}): a fix release carries it unchanged`))
      } catch (e) {
        problems.push(problem('metadata-invalid', `--previous ${n}: ${e.message}`))
      }
    }
  }
  // Each evidence stage under its own net: a shape its checks did not foresee is named for that stage.
  const guarded = (code, what, fn, empty) => {
    try {
      return fn()
    } catch (e) {
      if (e instanceof AcceptanceError) throw e
      problems.push(problem(code, `${what} does not have the shape the release reads (${String(e?.message ?? e).split('\n')[0]})`))
      return empty
    }
  }
  const patch = Boolean(o.patch)
  // A fix release runs no design or visual contract gate: its evidence is the targeted measure (fixProblems), which reads visual.contract.json only for its routes and source site.
  const { problems: cp, contracts, parsed } = patch ? { problems: [], contracts: {}, parsed: {} } : guarded('contract-invalid', 'the canonical contracts', () => contractProblems({ runRoot: o.runRoot, specDir: o.spec ?? null, artifactPath: artifacts.theme ? themeZip : null }), { problems: [], contracts: {}, parsed: {} })
  problems.push(...cp)
  const readEvidence = (file, code, what) => {
    if (!file) {
      problems.push(problem(code, `no ${what}`))
      return null
    }
    try {
      return readJsonRegular(file).json
    } catch (e) {
      problems.push(problem(code, `${what}: ${e.message}`))
      return null
    }
  }
  const restoreReport = readEvidence(o.restoreReport, 'restore-missing', '--restore-report')
  const parity = readEvidence(o.parity, 'parity-missing', '--parity')
  let runtime = null
  let restoredAt = null
  // The statuses parity routes are held to come from the spec-pack, never from parity.json alone.
  const declared = specRouteExpectations(o.spec ?? null)
  if (o.spec) problems.push(...declared.problems)
  if (restoreReport && parity && manifest && artifacts.webroot && artifacts.database) {
    const measured = { manifest: manifestSha, webrootArchive: artifacts.webroot.sha256.slice(7), databaseArchive: artifacts.database.sha256.slice(7) }
    const r = guarded('restore-invalid', 'the restore report or parity.json', () => runtimeProblems({ restore: restoreReport, parity, measured, archives: [artifacts.webroot, artifacts.database], theme: manifest.theme?.name ?? null, expectations: declared.expectations, now }), { problems: [], runtime: null })
    problems.push(...r.problems)
    runtime = r.runtime
    restoredAt = r.restoredAt ?? null
  }
  const bind = guarded('contract-bind-invalid', 'the contract bind evidence', () =>
    contractBindProblems({
      file: o.contractBind,
      measured: manifest && artifacts.webroot && artifacts.database ? { manifest: manifestSha, webrootArchive: artifacts.webroot.sha256.slice(7), databaseArchive: artifacts.database.sha256.slice(7) } : null,
      themeSha: artifacts.theme?.sha256.slice(7) ?? null,
      restoredAt,
      now
    }), { problems: [], contractBind: null })
  problems.push(...bind.problems)
  // The site every tier must have measured: the restored one restore and parity are of.
  const siteUrl = runtime?.siteUrl ?? (isSiteUrl(parity?.b) ? normalSiteUrl(parity.b) : null)
  let visual = null
  let fix = null
  if (patch) {
    const specDir = o.spec ?? (o.runRoot && existsSync(path.join(o.runRoot, 'spec', 'page-map.json')) ? path.join(o.runRoot, 'spec') : null)
    let contract = null
    try {
      if (o.runRoot) contract = readJsonRegular(path.join(o.runRoot, 'visual.contract.json')).json
    } catch {
      contract = null
    }
    const r = guarded('measure-invalid', 'the fix evidence', () => fixProblems({ previous: o.previous, sweep: o.sweep, measure: o.measure, noBaseline: o.noBaseline, baselineVersion: o.baselineVersion, changedFrom: o.changedFrom, manifest, themeSha: artifacts.theme?.sha256.slice(7) ?? null, themeBytes: files.get(themeName)?.bytes ?? null, siteUrl, restoredAt, now, contract, specDir, runRoot: o.runRoot, readSource: o.readSource ?? readSourceNow }), { problems: [], fix: null })
    problems.push(...r.problems)
    fix = r.fix
    // the measure the release was accepted on travels with it, byte for byte
    if (fix?.measureBytes) {
      if (files.has(MEASURE_FILE)) problems.push(problem('unsafe-file', `a second asset named ${MEASURE_FILE}: the release writes the measure there`))
      else {
        files.set(MEASURE_FILE, { bytes: fix.measureBytes, sha256: sha256Text(fix.measureBytes), source: path.resolve(o.measure) })
        extra.push(MEASURE_FILE)
      }
    }
  } else if (parsed.visual && contracts.visual && artifacts.theme && artifacts.webroot && artifacts.database) {
    // --restore-smoke asks for the reuse path; a checkpoint that cannot be reused is held to today's gate (four tiers on the restored site)
    let skipped = null
    if (o.restoreSmoke) {
      const u = guarded('checkpoint-invalid', 'the build checkpoint and the restored smoke', () => reuseProblems({ ledger: o.visualLedger, build: o.checkpoint, smoke: o.restoreSmoke, visualContract: parsed.visual, visualIdentity: contracts.visual, artifacts, parity, runtime, restoredAt, now }), { problems: ['the evidence does not have the shape the release reads'], visual: null })
      visual = u.visual
      if (!visual) skipped = u.problems
    }
    if (!visual) {
      const r = guarded('checkpoint-invalid', 'the Visual QA checkpoint', () => checkpointProblems({ ledger: o.visualLedger, run: o.checkpoint, visualContract: parsed.visual, visualIdentity: contracts.visual, artifacts, siteUrl, restoredAt, now }), { problems: [], visual: null })
      problems.push(...r.problems)
      if (skipped && r.problems.length) problems.push(problem('restore-smoke-ineligible', `--restore-smoke ${o.restoreSmoke} cannot stand in for four tiers on the restored site, so --checkpoint must be that checkpoint, and it is not: ${skipped.join('; ')}`))
      visual = r.visual && { ...r.visual, path: 'restored-checkpoint', ...(skipped && { reuseRefused: skipped }) }
    }
  } else if (!o.visualLedger || !o.checkpoint) problems.push(...readCheckpoint({ ledger: o.visualLedger, run: o.checkpoint }).problems)
  // A first release carries the behaviour pass; a fix release keeps its measure.
  let behaviour = null
  if (!patch) {
    const behaviorSpec = o.spec ?? (o.runRoot && existsSync(path.join(o.runRoot, 'spec', 'page-map.json')) ? path.join(o.runRoot, 'spec') : null)
    const r = guarded('behaviour-pass-invalid', 'the behaviour pass', () => behaviourProblems({ file: o.behaviourSweep, siteUrl, themeSha: artifacts.theme?.sha256.slice(7) ?? null, restoredAt, pages: dossierPlan({ contract: parsed.visual }).pages.length, sourceDarkDerived: Boolean(contracts.visual) && darkDerivedProblems(parsed.visual, { specDir: o.spec ?? null }).length === 0, now, contract: parsed.visual, specDir: behaviorSpec, runRoot: o.runRoot }), { problems: [], behaviour: null })
    problems.push(...r.problems)
    behaviour = r.behaviour
    // the behaviour pass was taken against the source as it is now (the sweep records a fingerprint of it)
    if (o.behaviourSweep && behaviour && behaviour.applicability?.status !== 'all-none') {
      const g = guarded('behaviour-source-invalid', 'the behaviour pass source', () => {
        const doc = readJsonRegular(o.behaviourSweep).json
        const specDir = o.spec ?? (o.runRoot && existsSync(path.join(o.runRoot, 'spec', 'page-map.json')) ? path.join(o.runRoot, 'spec') : null)
        return sourceGateProblems(doc.sourceFingerprint, doc.source, { contract: parsed.visual, specDir, readSource: o.readSource ?? readSourceNow }, { prefix: 'behaviour', what: 'the behaviour sweep' })
      }, [])
      problems.push(...g)
    }
  }
  // The finish audit: a clean, current receipt of THIS dossier and the restored site, over this release's own evidence.
  let audit = null
  if (patch || visual) {
    const r = guarded('audit-invalid', 'the finish audit', () => {
      const tiers = visual?.tiers ?? []
      const audited = (visual?.restoreSmoke?.tiers ?? tiers).map((t) => Date.parse(t.measuredAt)).filter(Number.isFinite)
      return auditReceiptProblems({
        dossier: o.runRoot ? path.resolve(o.runRoot) : null,
        site: siteUrl ?? '',
        routes: declared.expectations ? [...declared.expectations.keys()] : [],
        scope: patch ? 'patch' : 'visual',
        ...(patch
          ? { theme: artifacts.theme?.sha256.slice(7) ?? null, themeFile: themeZip, notBefore: restoredAt }
          : {
              // the interaction records of the tiers measured on the restored site: all four, or the smoke's alone on the reuse path (each tier's probe covers every owed case)
              interaction: (visual.restoreSmoke?.tiers ?? tiers).map((t) => ({ file: path.join(t.dir, 'interaction.json'), routes: (parsed.visual.pages ?? []).map((x) => x.path).filter(Boolean), source: parsed.visual.source?.site ?? null })),
              notBefore: audited.length ? Math.max(...audited) : restoredAt
            }),
        now,
        onRead: (file, got) => reads?.set(path.resolve(file), { sha256: sha256Text(got.bytes), size: got.bytes.length, mtimeMs: got.mtimeMs })
      })
    }, { problems: [], audit: null })
    problems.push(...r.problems.map((p) => problem(p.code, p.message)))
    audit = r.audit
  }
  if (problems.length) throw new AcceptanceError(REFUSED, problems)
  const plain = (a) => ({ file: a.file, sha256: a.sha256, bytes: a.bytes })
  const acceptance = {
    schema: 'tracy-release-acceptance/v1',
    artifacts: Object.fromEntries(ARTIFACT_KEYS.map((k) => [k, plain(artifacts[k])])),
    manifest: `sha256:${manifestSha}`,
    ...(patch && { gate: 'patch' }),
    audit: audit && { file: 'port-audit.json', sha256: audit.sha256, at: audit.at, scope: audit.scope, ...(audit.advisories && { advisories: audit.advisories }) },
    visual,
    ...(behaviour && { behaviour }),
    runtime
  }
  return { manifest, files, extra, themeName, contracts, parity, restoreReport, acceptance, contractBind: bind.contractBind, fix, notes }
}

/** Files of `before` (a snapshot) that are not, byte for byte and mtime for mtime, in `after`. */
function snapshotChanges(before, after) {
  const same = (a, b) => a && b && a.sha256 === b.sha256 && a.size === b.size && a.mtimeMs === b.mtimeMs
  return [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((f) => !same(before?.[f], after?.[f])).sort()
}

/**
 * What `out` holds now: null when it does not exist, else `{notes}` — the bytes of its
 * release-notes.md to keep (null for none or with `forceNotes`). Only an empty directory or a
 * completed earlier release is replaced — exactly what assembleRelease writes: flat regular files,
 * a release manifest.json whose `assets` are plain, distinct names, a VERIFICATION.json of that
 * release, a README.md, and a SHA256SUMS that lists exactly manifest.json, VERIFICATION.json,
 * README.md and every asset — no more, no fewer — and holds for each; release-notes.md optional.
 * Anything else is someone's data, not an earlier release; notes that exist and cannot be read are
 * not replaced by the template.
 */
function earlierRelease(out, { forceNotes = false } = {}) {
  const refuse = (code, message) => new AcceptanceError(REFUSED, [problem(code, message)])
  let st
  try {
    st = lstatSync(out)
  } catch {
    return null
  }
  if (st.isSymbolicLink() || !st.isDirectory()) throw refuse('unsafe-file', `--out ${out} exists and is not a directory`)
  const entries = readdirSync(out)
  if (!entries.length) return { notes: null }
  // notes written ahead of the first run are the only thing a target may hold besides a release
  const onlyNotes = entries.length === 1 && entries[0] === 'release-notes.md' && lstatSync(path.join(out, 'release-notes.md')).isFile()
  const why = []
  const odd = entries.filter((e) => !lstatSync(path.join(out, e)).isFile())
  const readJson = (name) => {
    try {
      const json = JSON.parse(readRegular(path.join(out, name)).bytes.toString('utf8'))
      if (!obj(json)) throw new Error('not a JSON object')
      return json
    } catch (e) {
      why.push(`no readable ${name} (${String(e.message).split('\n')[0]})`)
      return null
    }
  }
  if (odd.length) why.push(`holds ${odd.slice(0, 3).join(', ')}, not regular files`)
  else if (!onlyNotes) {
    const missing = RELEASE_FILES.filter((f) => f !== 'release-notes.md' && !entries.includes(f))
    if (missing.length) why.push(`lacks ${missing.join(', ')}`)
    let sums = null
    if (entries.includes('SHA256SUMS'))
      try {
        sums = readRegular(path.join(out, 'SHA256SUMS')).bytes.toString('utf8')
      } catch (e) {
        why.push(`no readable SHA256SUMS (${e.message})`)
      }
    const released = entries.includes('manifest.json') ? readJson('manifest.json') : null
    const verification = entries.includes('VERIFICATION.json') ? readJson('VERIFICATION.json') : null
    let assets = null
    if (released) {
      const a = released.assets
      if (typeof released.release !== 'string' || !released.release) why.push('its manifest.json names no release')
      else if (!Array.isArray(a) || !a.length || !a.every((x) => typeof x === 'string' && isArtifactName(x) && !RELEASE_FILES.includes(x)) || new Set(a).size !== a.length)
        why.push('its manifest.json assets are not a list of distinct plain file names')
      else if (![released.webroot?.file, released.database?.file].every((f) => a.includes(f))) why.push('its manifest.json assets do not include both archives it names')
      else assets = a
      if (verification && verification.release !== released.release) why.push(`its VERIFICATION.json is of ${JSON.stringify(verification.release ?? null)}, not ${JSON.stringify(released.release)}`)
    }
    if (sums !== null) {
      const bad = sums.split('\n').filter((l) => l.trim() && !/^[0-9a-f]{64} {2}\S.*$/.test(l))
      // release-notes.md is a person's file: listed since the sums cover everything written, but its bytes may have changed since
      const all = parseSums(sums).map((x) => x.file)
      const listed = all.filter((f) => f !== 'release-notes.md')
      if (all.length - listed.length > 1) why.push('its SHA256SUMS lists release-notes.md more than once')
      else if (bad.length) why.push('its SHA256SUMS has lines that are not "<sha256>  <file>"')
      else if (listed.some((f) => !isArtifactName(f)) || new Set(listed).size !== listed.length) why.push('its SHA256SUMS names a file twice or a file that is not a plain name')
      else {
        const unlisted = entries.filter((e) => e !== 'SHA256SUMS' && e !== 'release-notes.md' && !listed.includes(e))
        if (unlisted.length) why.push(`holds ${unlisted.slice(0, 3).join(', ')}, not in its SHA256SUMS`)
        if (assets) {
          const want = ['manifest.json', 'VERIFICATION.json', 'README.md', ...assets].sort()
          if (JSON.stringify([...listed].sort()) !== JSON.stringify(want)) why.push(`its SHA256SUMS lists ${[...listed].sort().join(', ')}, the release it describes is ${want.join(', ')}`)
        }
        const failures = checkSums(out, sums).filter((f) => f.file !== 'release-notes.md')
        if (failures.length) why.push(`its SHA256SUMS does not hold for ${failures.slice(0, 3).map((f) => f.file).join(', ')}`)
      }
    }
  }
  if (why.length) throw refuse('output-not-release', `--out ${out} is not a completed earlier release (${why.join('; ')}) — give an empty or new directory`)
  // A person's notes survive a re-run; only --force-notes puts the template back.
  if (forceNotes || !entries.includes('release-notes.md')) return { notes: null }
  try {
    return { notes: readRegular(path.join(out, 'release-notes.md')).bytes }
  } catch (e) {
    throw refuse('output-notes-unreadable', `${e.message} — the notes written there cannot be kept; make them readable or pass --force-notes`)
  }
}

/**
 * Write the accepted release: assembled in a temporary directory beside `out` from the validated
 * bytes, every copy hashed again, then the whole release accepted again (acceptRelease) and its
 * snapshot compared with the one accepted — a file replaced, rewritten or touched since, or evidence
 * that no longer holds, aborts — then swapped in for `out` under a lock. On any failure the temporary
 * directory is removed and an earlier `out` is left as it was. Returns the list of release files.
 */
export function assembleRelease(accepted, o) {
  const out = path.resolve(o.out)
  let lock
  try {
    lock = acquireLock(`release\n${out}`)
  } catch (e) {
    throw new AcceptanceError(REFUSED, [problem('output-busy', `another release assembly holds ${out}: ${e.message}`)])
  }
  let tmp = null
  try {
    const existing = earlierRelease(out, { forceNotes: o.forceNotes })
    const { manifest, files, extra, themeName, contracts, parity, restoreReport, acceptance, contractBind, fix } = accepted
    mkdirSync(path.dirname(out), { recursive: true })
    tmp = mkdtempSync(path.join(path.dirname(out), `.${path.basename(out)}.assembling-`))
    for (const [name, f] of files) writeFileSync(path.join(tmp, name), f.bytes)
    const assets = [themeName, ...extra]
    const released = { ...manifest, release: manifest.id, repository: o.repo, assets: [manifest.webroot.file, manifest.database.file, ...assets] }
    writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(released, null, 2) + '\n')
    const visual = acceptance.visual && {
      run: acceptance.visual.checkpoint,
      identity: contracts.visual,
      at: acceptance.visual.end,
      summary: { stages: Object.fromEntries(acceptance.visual.tiers.map((t) => [t.stage, t.status])), findings: 0 },
      path: acceptance.visual.path,
      restoreSmoke: acceptance.visual.restoreSmoke && { checkpoint: acceptance.visual.restoreSmoke.checkpoint, end: acceptance.visual.restoreSmoke.end, stages: Object.fromEntries(acceptance.visual.restoreSmoke.tiers.map((t) => [t.stage, t.status])) }
    }
    // VERIFICATION.json is published and kept in the dossier: every path in it is written as lib/record-paths.mjs writes one
    // (relative to the dossier's repository, or under ~), never as this machine lays it out.
    const verification = verificationRecord({ manifest, parity, restoreReport, contracts, visual, acceptance, contractBind, fix }, { repoRoot: repoRootOf(o.runRoot ?? out) })
    writeFileSync(path.join(tmp, 'VERIFICATION.json'), JSON.stringify(verification, null, 2) + '\n')
    const title = o.title ?? titleFor(manifest)
    writeFileSync(path.join(tmp, 'README.md'), readmeText(manifest, { repo: o.repo, extraAssets: assets, admin: o.admin, title }))
    let notes = existing?.notes ?? null
    // notes that outlive a re-run still carry the unverified exception of this release, its reason as VERIFICATION.json records it
    if (notes !== null && verification.noBaseline) {
      const text = Buffer.from(notes).toString('utf8')
      if (!text.includes(unverifiedNoBaselineNote(verification.noBaseline))) notes = `${text.replace(/\n*$/, '\n')}\n${unverifiedNoBaselineNote(verification.noBaseline)}\n`
    }
    // a fix release never leaves placeholders: its notes are written whole from the measure evidence
    const notesText = notes ?? (fix ? patchNotes(manifest, verification, { title }) : notesTemplate(manifest, verification, { title }))
    writeFileSync(path.join(tmp, 'release-notes.md'), notesText)
    const listed = [...files.keys(), 'manifest.json', 'VERIFICATION.json', 'README.md', 'release-notes.md'].sort()
    writeFileSync(path.join(tmp, 'SHA256SUMS'), sumsText(listed.map((f) => ({ file: f, sha256: sha256File(path.join(tmp, f)) }))))
    for (const [name, f] of files)
      if (sha256File(path.join(tmp, name)) !== f.sha256) throw new AcceptanceError('release aborted', [problem('output-failed', `${name}: the copy written is not the bytes accepted`)])
    // Accepted again, now: every input read the first time is read again and must be the same
    // bytes with the same mtime, and every check must still hold.
    let again
    try {
      again = acceptRelease(o)
    } catch (e) {
      if (e instanceof AcceptanceError) throw new AcceptanceError(ABORTED, e.problems)
      throw e
    }
    const changed = snapshotChanges(accepted.snapshot, again.snapshot)
    if (changed.length) throw new AcceptanceError(ABORTED, changed.map((f) => problem('input-changed', `${f} changed while the release was assembled — run it again`)))
    const previous = existing ? `${out}.previous-${process.pid}-${Date.now()}` : null
    if (previous) renameSync(out, previous)
    try {
      renameSync(tmp, out)
    } catch (e) {
      if (previous) renameSync(previous, out)
      throw e
    }
    tmp = null
    if (previous) rmSync(previous, { recursive: true, force: true })
    return { out, files: [...listed, 'SHA256SUMS'].filter((f, i, a) => a.indexOf(f) === i), title, notes: notes !== null, placeholders: /\{\{/.test(Buffer.from(notesText).toString('utf8')) }
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
    lock.release()
  }
}

/** The whole release: accept, assemble, print the publish commands (`state` injectable; nothing is published). */
export function runRelease(o, { state = null, log = console.log, now = Date.now() } = {}) {
  if (o.patch) {
    const ignored = [['--visual-ledger', o.visualLedger], ['--checkpoint', o.checkpoint], ['--restore-smoke', o.restoreSmoke]].filter(([, v]) => v).map(([f]) => f)
    if (ignored.length) log(`note: ${ignored.join(', ')} ignored in --patch mode: a fix release is accepted on --measure and the finish audit, not on a checkpoint or the contract gates (--run-root is the dossier holding the audit; its visual.contract.json supplies the routes and the source site)`)
  }
  const accepted = acceptRelease(o, { now })
  const done = assembleRelease(accepted, o)
  const { manifest } = accepted
  for (const n of [...(accepted.notes ?? []), ...(accepted.fix?.notes ?? [])]) log(`note: ${n}`)
  for (const w of accepted.fix?.warnings ?? []) log(`WARNING: ${w}`)
  const advisory = advisoryWarning(accepted.acceptance.audit?.advisories)
  if (advisory) log(`WARNING: ${advisory}`)
  const notes = path.join(done.out, 'release-notes.md')
  const shipped = done.files.filter((f) => f !== 'release-notes.md' && f !== 'SHA256SUMS')
  const assets = [...shipped, 'SHA256SUMS'].map((f) => path.join(done.out, f))
  log(
    accepted.fix
      ? `release: ${done.out} — ${assets.length} assets (fix release of ${accepted.fix.previous.version}, accepted on ${accepted.fix.measure.passed}/${accepted.fix.measure.total} targeted checks bound to the theme zip)`
      : accepted.acceptance.visual?.path === 'build-checkpoint-plus-smoke'
        ? `release: ${done.out} — ${assets.length} assets (accepted on the build checkpoint ${o.checkpoint}, four tiers bound to the theme zip, webroot and database, and the ${SMOKE_TIER} smoke ${o.restoreSmoke} on the restored site; parity found no style drift)`
        : `release: ${done.out} — ${assets.length} assets (accepted on checkpoint ${o.checkpoint}, four tiers bound to the theme zip, webroot and database)`
  )
  for (const f of [...shipped, 'SHA256SUMS']) log(`  ${f}`)
  if (done.notes) log('==> release-notes.md kept (already written)')
  // Notes with a placeholder are not a release to publish: no publish command, and the CLI exits 1. The
  // release stays written (its notes are kept by the next run), so fill them in place and run again.
  if (done.placeholders) {
    log(`\n!! ${notes} still has {{placeholders}} — fill them and run again (the notes are kept); nothing to publish yet`)
    return done
  }
  // A release that already exists refuses `gh release create`: re-running this after a fix
  // printed a command that could only fail (Tracy Base 1.1.0). Asked read-only, never published.
  const publish = publishCommands({ tag: manifest.id, repo: o.repo, title: done.title, notesFile: notes, assets, state: state ?? releaseState({ tag: manifest.id, repo: o.repo }) })
  log(`\nPublish (not run by this tool) — ${publish.say}:\n`)
  for (const c of publish.commands) log('  ' + c)
  for (const r of accepted.fix?.reminders ?? []) log(`\nREMINDER: ${r}`)
  return done
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain)
  cli(async () => {
    const o = parseArgs(
      process.argv.slice(2),
      SPEC,
      'usage: release.mjs --pack <dir> --out <dir> --parity <parity.json> --restore-report <json> --run-root <dossier> --spec <dir> --theme-zip <zip> --visual-ledger <rounds.jsonl> --checkpoint <run> [--restore-smoke <run>] --behaviour-sweep <site-sweep.json> --contract-bind <contract-bind.json> [--setting-template <tracy_setting.json>] [--card <tracy_design_inspiration.json>] [--asset <file>]… [--repo owner/name] [--title "…"]  |  --patch --previous <VERIFICATION.json|dir> --measure <file> --run-root <dossier> [--no-baseline <reason>] [--changed-from <zip>] (instead of --visual-ledger --checkpoint --restore-smoke)'
    )
    startDeadline(Number(o.timeout), 'release')
    if (o.patch) {
      for (const [flag, v] of [['--previous', o.previous], ['--measure', o.measure], ['--run-root', o.runRoot]]) if (!v) throw new UsageError(`${flag} is required with --patch`)
    } else for (const [flag, v] of [['--run-root', o.runRoot], ['--spec', o.spec], ['--visual-ledger', o.visualLedger], ['--checkpoint', o.checkpoint]]) if (!v) throw new UsageError(`${flag} is required (unless --patch)`)
    return runRelease(o).placeholders ? 1 : 0
  })
