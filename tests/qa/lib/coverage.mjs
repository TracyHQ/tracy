// `pnpm qa coverage`: per-layer denominator accounting. No blended percentage, ever: each
// number is a separate count, and anything missing, stale or unreviewed stays open.
import fs from 'node:fs/promises'
import path from 'node:path'
import { KNOWN_LAYERS, LAYER_NAME } from './args.mjs'
import { validateAgainst } from './contracts.mjs'
import { verifyEntryReceipts } from './evidence.mjs'
import {
  containedPath,
  hashJson,
  lstatOrNull,
  listRegularFiles,
  readJsonFile,
  sha256,
  readRegularFile
} from './fsafe.mjs'
import { parseNa, revisionCommitTokens, validateCommitted } from './denominator.mjs'
import { validate } from './schema.mjs'

const COMPLETE_SCHEMA = {
  type: 'object',
  required: [
    'schema_version',
    'layer',
    'target',
    'area',
    'run_id',
    'started_at',
    'git_sha',
    'tree_fingerprint',
    'counts',
    'outcome',
    'exit_code',
    'finished_at',
    'dirty'
  ],
  properties: {
    finished_at: { type: 'string', format: 'date-time' },
    dirty: { type: 'boolean' },
    schema_version: { const: '1' },
    layer: { type: 'string', minLength: 1 },
    target: { type: 'string' },
    area: { type: ['string', 'null'] },
    run_id: { type: 'string', minLength: 1 },
    started_at: { type: 'string', format: 'date-time' },
    git_sha: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    tree_fingerprint: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    counts: { type: 'object' },
    outcome: { enum: ['success', 'failure', 'skipped', 'cancelled'] },
    exit_code: { type: 'integer' }
  }
}

const PROVENANCE_SCHEMA = {
  type: 'object',
  required: [
    'schema_version',
    'layer',
    'git_sha',
    'tree_fingerprint',
    'target',
    'area',
    'dirty',
    'node_version',
    'report_sha256'
  ],
  properties: {
    dirty: { type: 'boolean' },
    node_version: { type: 'string', pattern: '^v\\d+\\.\\d+\\.\\d+' },
    report_sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    target: { type: 'string' },
    area: { type: ['string', 'null'] },
    schema_version: { const: '1' },
    layer: { type: 'string', minLength: 1 },
    git_sha: { type: 'string', pattern: '^[0-9a-f]{40}$' },
    tree_fingerprint: { type: 'string', pattern: '^[0-9a-f]{64}$' }
  }
}

const CASES_SCHEMA = {
  type: 'object',
  required: ['schema_version', 'layer', 'run_id', 'target', 'area', 'cases', 'counts'],
  properties: {
    counts: { type: 'object' },
    target: { type: 'string' },
    area: { type: ['string', 'null'] },
    schema_version: { const: '1' },
    layer: { type: 'string', minLength: 1 },
    run_id: { type: 'string', minLength: 1 },
    cases: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'verdict', 'manifestHash', 'evidence'],
        properties: {
          id: { type: 'string', minLength: 1 },
          verdict: { enum: ['PASS', 'FAIL', 'ENV', 'PENDING'] },
          evidence: { type: 'array', items: { type: 'string', minLength: 1 } },
          manifestHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
          redProof: {
            type: ['object', 'null'],
            required: ['kind', 'ref', 'assertionId', 'log'],
            properties: {
              kind: { enum: ['commit', 'mutation'] },
              ref: { type: 'string', minLength: 1 },
              assertionId: { type: 'string', minLength: 1 },
              log: { type: 'string', minLength: 1 }
            }
          }
        }
      }
    }
  }
}

const CHECKLIST_SCHEMA = {
  type: 'object',
  required: ['schema_version', 'items'],
  properties: {
    schema_version: { const: '1' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'artifact', 'sha256'],
        properties: {
          id: { type: 'string', minLength: 1 },
          artifact: { type: 'string', minLength: 1 },
          sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }
        }
      }
    }
  }
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['schema_version', 'reviewer', 'reviewed_at', 'revision', 'receipts'],
  properties: {
    schema_version: { const: '1' },
    reviewer: { type: 'string', minLength: 1 },
    reviewed_at: { type: 'string', format: 'date-time' },
    revision: { type: 'string', minLength: 1 },
    receipts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'status', 'artifact_sha256'],
        properties: {
          id: { type: 'string', minLength: 1 },
          status: { enum: ['accepted', 'rejected'] },
          artifact_sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' }
        }
      }
    }
  }
}

// The denominator contract (structure, N-A grammar `<reason>; source: <reference>`) is lib/denominator.mjs,
// shared with the inventory build and the layer generators.
export { parseNa }

async function readManifests(casesDir, contractsDir) {
  const files = await listRegularFiles(casesDir, '.json')
  const manifests = []
  const invalid = []
  for (const file of files) {
    if (!file.regular) {
      invalid.push(`${file.name}: not a regular file`)
      continue
    }
    let doc
    try {
      doc = await readJsonFile(path.join(casesDir, file.name))
    } catch (error) {
      invalid.push(error.message)
      continue
    }
    for (const manifest of Array.isArray(doc) ? doc : [doc]) {
      const errors = await validateAgainst('case.schema.json', manifest, contractsDir)
      if (errors.length > 0) invalid.push(`${file.name}: ${errors[0]}`)
      else manifests.push(manifest)
    }
  }
  return { manifests, invalid }
}

// Completed runs are found by what complete.json says (layer, target, area), not by directory
// name, so `--out qa-results/canary` and run folders under `--runs DIR` are found too.
// `extraRoots` entries are either a run directory itself or a folder of run directories.
// A directory that never finished (no usable complete.json) is still a run: when it is newer than
// the newest complete one it shadows it, so an interrupted run is never hidden by an older PASS.
const RESERVATION = '.qa-reserved'
const STAMP_NAME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-(.+?)(?:-\d+)?$/

// Files whose presence marks a directory as a run, finished or not. A custom --out directory whose
// marker was deleted or corrupted is still recognised by what else the runner wrote there.
const RUN_FILES = ['complete.json', RESERVATION, 'cases.json', 'results.json', 'provenance.json', 'report.md']

async function isRunDir(dir) {
  for (const name of RUN_FILES) if ((await lstatOrNull(path.join(dir, name))) !== null) return true
  return false
}

// → { dirs, problem }. A results root may be absent (nothing ran yet); a root named with --runs
// must exist and be a real directory, otherwise coverage cannot say what it was pointed at.
async function runDirsUnder(root, { explicit }) {
  const info = await lstatOrNull(root)
  if (!info) return explicit ? { dirs: [], problem: `--runs path ${root} does not exist` } : { dirs: [] }
  if (info.isSymbolicLink()) return { dirs: [], problem: `${root} is a symlink; coverage does not follow it` }
  if (!info.isDirectory()) return { dirs: [], problem: `${root} is not a directory` }
  if (await isRunDir(root)) return { dirs: [root] }
  const dirs = []
  for (const entry of await fs.readdir(root, { withFileTypes: true }))
    if (entry.isDirectory()) dirs.push(path.join(root, entry.name))
  return { dirs }
}

const readOrNull = (file) => readJsonFile(file).catch(() => null)

// The exact shape reserveDir writes: run_id, layer, target, area (string or null, always present),
// started_at and pid. Anything missing, extra or mistyped cannot authenticate a run, and every
// shared field must equal what complete.json says.
const RESERVATION_KEYS = ['area', 'layer', 'pid', 'run_id', 'started_at', 'target']

function reservationMatches(marker, complete) {
  if (marker === null || typeof marker !== 'object' || Array.isArray(marker)) return false
  if (Object.keys(marker).sort().join() !== RESERVATION_KEYS.join()) return false
  const text = (v) => typeof v === 'string' && v !== ''
  if (!text(marker.run_id) || !text(marker.layer) || !text(marker.target) || !text(marker.started_at))
    return false
  if (marker.area !== null && !text(marker.area)) return false
  if (!Number.isSafeInteger(marker.pid) || marker.pid <= 0) return false
  return (
    marker.run_id === complete.run_id &&
    marker.layer === complete.layer &&
    marker.target === complete.target &&
    marker.area === complete.area &&
    marker.started_at === complete.started_at
  )
}

// What an unfinished directory can say about itself: layer from its reservation record, else its
// cases.json, else its default name. When none says (marker corrupt or deleted, custom name) the
// layer is unknown and the directory is assumed to be a candidate, because assuming otherwise
// would let an older PASS hide it.
async function describeUnfinished(dir, layer) {
  const reservation = await readOrNull(path.join(dir, RESERVATION))
  const name = path.basename(dir)
  const stamp = STAMP_NAME.exec(name)
  const reserved = reservation && typeof reservation === 'object' ? reservation : null
  const casesDoc = await readOrNull(path.join(dir, 'cases.json'))
  const known = [reserved?.layer, casesDoc?.layer, stamp?.[7]].filter((l) => typeof l === 'string')
  if (known.length > 0 && !known.includes(layer)) return null
  // A reserved run for another target or an --area slice can never have been credited anyway.
  if (reserved && (reserved.target !== 'local' || (reserved.area ?? null) !== null)) return null
  let time = Date.parse(reserved?.started_at ?? '')
  if (Number.isNaN(time) && stamp)
    time = Date.UTC(+stamp[1], +stamp[2] - 1, +stamp[3], +stamp[4], +stamp[5], +stamp[6])
  if (Number.isNaN(time)) time = (await lstatOrNull(dir)).mtimeMs
  return { dir, time }
}

async function latestRun(resultsRoot, layer, fingerprint, extraRoots = []) {
  if (!fingerprint)
    return { run: null, reason: 'tree identity unavailable; no run can be matched to the tree' }
  const dirs = []
  const rootProblems = []
  for (const [i, root] of [resultsRoot, ...extraRoots].entries()) {
    const found = await runDirsUnder(root, { explicit: i > 0 })
    dirs.push(...found.dirs)
    if (found.problem) rootProblems.push(found.problem)
  }
  if (rootProblems.length > 0)
    return { run: null, reason: `cannot search for runs: ${rootProblems.join('; ')}` }
  if (dirs.length === 0) return { run: null, reason: 'no qa-results directory' }
  const candidates = []
  const unfinished = []
  for (const dir of dirs) {
    // A default run name (<stamp>-<layer>) marks a run even when it holds no file at all.
    if (!STAMP_NAME.test(path.basename(dir)) && !(await isRunDir(dir))) continue
    let complete = null
    let problem = null
    try {
      complete = await readJsonFile(path.join(dir, 'complete.json'))
    } catch (error) {
      problem = error.message
    }
    if (complete !== null && problem === null) {
      const bad = validate(COMPLETE_SCHEMA, complete)
      if (bad.length === 0) {
        if (complete.layer === layer && complete.area === null && complete.target === 'local') {
          // A run is creditable only with the reservation the runner wrote when it claimed the
          // directory; without it the run still shadows older ones but is never credited.
          const marker = await readOrNull(path.join(dir, RESERVATION))
          if (reservationMatches(marker, complete)) candidates.push({ dir, complete })
          else
            unfinished.push({
              dir,
              time: Date.parse(complete.started_at),
              problem: `${RESERVATION} marker is missing or does not match complete.json`
            })
        }
        continue
      }
      if (complete?.layer !== layer && !(await describeUnfinished(dir, layer))) continue
      problem = `complete.json invalid: ${bad[0]}`
    }
    const described = await describeUnfinished(dir, layer)
    if (described) unfinished.push({ ...described, problem: problem ?? 'no complete.json' })
  }
  candidates.sort((a, b) => (a.complete.started_at < b.complete.started_at ? 1 : -1))
  const run = candidates[0]
  const newest = unfinished.sort((a, b) => b.time - a.time)[0]
  if (newest && (!run || newest.time > Date.parse(run.complete.started_at))) {
    return {
      run: null,
      reason: `${run ? 'a newer' : 'the only'} run ${path.basename(newest.dir)} never completed (${newest.problem}); older runs are not credited in its place`
    }
  }
  if (!run) return { run: null, reason: 'no completed full local run found' }
  if (run.complete.tree_fingerprint !== fingerprint) {
    return {
      run: null,
      stale: run,
      reason: `latest run ${path.basename(run.dir)} tested other tree content (${run.complete.tree_fingerprint.slice(0, 12)}, tree is ${fingerprint.slice(0, 12)}): stale`
    }
  }
  return { run }
}

// A run is credited only when its whole artifact set agrees: complete.json, cases.json,
// results.json and provenance.json name one run, one layer and one tree, every case id appears
// once, every PASS carries RED-proof metadata and the tallies match.
async function loadRun(run, layer, contractsDir, manifestsById, repoRoot) {
  const read = async (name) => {
    const doc = await readJsonFile(path.join(run.dir, name))
    if (doc === null) throw new Error(`${name} is missing`)
    return doc
  }
  try {
    const casesDoc = await read('cases.json')
    const bad = validate(CASES_SCHEMA, casesDoc)
    if (bad.length > 0) return { problem: `cases.json invalid: ${bad[0]}` }
    const { complete } = run
    if (casesDoc.layer !== layer || casesDoc.run_id !== complete.run_id)
      return { problem: 'cases.json names another run or layer than complete.json' }
    if (casesDoc.target !== complete.target || casesDoc.area !== complete.area)
      return { problem: 'cases.json target or area disagrees with complete.json' }
    // Every manifest must have exactly one result and every result a manifest, checked before
    // anything is credited.
    const resultIds = new Set(casesDoc.cases.map((c) => c.id))
    const missing = [...manifestsById.keys()].filter((id) => !resultIds.has(id))
    const extra = [...resultIds].filter((id) => !manifestsById.has(id))
    if (missing.length > 0 || extra.length > 0)
      return {
        problem: `case IDs differ between manifests and cases.json (missing: ${missing.slice(0, 3).join(', ') || 'none'}; extra: ${extra.slice(0, 3).join(', ') || 'none'})`
      }
    const ids = new Set()
    const tally = { PASS: 0, FAIL: 0, ENV: 0, PENDING: 0 }
    for (const entry of casesDoc.cases) {
      if (ids.has(entry.id)) return { problem: `cases.json repeats case ${entry.id}` }
      ids.add(entry.id)
      if (entry.verdict === 'PASS') {
        if (!entry.redProof)
          return { problem: `cases.json credits PASS to ${entry.id} without RED-proof metadata` }
        const manifest = manifestsById.get(entry.id)
        if (manifest && hashJson(manifest) === entry.manifestHash) {
          const why = await verifyEntryReceipts(entry, manifest, run.dir, repoRoot)
          if (why) return { problem: `${why} (rerun the layer)` }
        }
      }
      tally[entry.verdict] += 1
    }
    const sameCounts = (counts) =>
      counts !== null &&
      typeof counts === 'object' &&
      Object.keys(counts).length === 4 &&
      Object.keys(tally).every((verdict) => counts[verdict] === tally[verdict])
    if (!sameCounts(complete.counts)) return { problem: 'complete.json counts disagree with the cases' }
    if (!sameCounts(casesDoc.counts)) return { problem: 'cases.json counts disagree with its cases' }
    const results = await read('results.json')
    const resultErrors = await validateAgainst('result.schema.json', results, contractsDir)
    if (resultErrors.length > 0) return { problem: `results.json invalid: ${resultErrors[0]}` }
    if (results.run_id !== complete.run_id || results.revision !== complete.git_sha)
      return { problem: 'results.json names another run or revision than complete.json' }
    // One expected state is computed from the cases; every artifact must carry exactly that.
    const failing = tally.FAIL > 0
    const open = tally.ENV + tally.PENDING > 0 || casesDoc.cases.length === 0
    const expected = failing ? 'failure' : open ? 'skipped' : 'success'
    const expectedExit = failing ? 1 : open ? 3 : 0
    if (complete.outcome !== expected || results.outcome !== expected)
      return { problem: `outcome ${complete.outcome}/${results.outcome} does not fit the case tallies` }
    if (complete.exit_code !== expectedExit || results.exit_code !== expectedExit)
      return { problem: `exit code does not fit the case tallies (expected ${expectedExit})` }
    if (results.started_at !== complete.started_at || results.finished_at !== complete.finished_at)
      return { problem: 'results.json start or finish time disagrees with complete.json' }
    // The run's own file set: the three fixed artifacts plus every evidence file any case lists,
    // each present as a regular file (report.md also non-empty).
    const expectedArtifacts = [
      'cases.json',
      'report.md',
      'provenance.json',
      ...new Set(casesDoc.cases.flatMap((e) => e.evidence))
    ].sort()
    if (JSON.stringify([...results.artifacts].sort()) !== JSON.stringify(expectedArtifacts))
      return { problem: 'results.json artifacts do not match the files the run produced' }
    for (const artifact of expectedArtifacts) {
      const info = await lstatOrNull(await containedPath(run.dir, artifact))
      if (!info?.isFile()) return { problem: `artifact ${artifact} is missing or not a regular file` }
      if (artifact === 'report.md' && info.size === 0) return { problem: 'report.md is empty' }
    }
    // report.md must be the report the runner wrote (hash recorded in provenance.json) and its
    // header and tally line must say what the cases say.
    const report = (await readRegularFile(await containedPath(run.dir, 'report.md')))?.toString('utf8')
    const tallyLine = `- PASS ${tally.PASS} · FAIL ${tally.FAIL} · ENV ${tally.ENV} · PENDING ${tally.PENDING} · total ${casesDoc.cases.length}`
    const reportLines = (report ?? '').split('\n')
    if (
      !reportLines.includes(`# QA report: ${layer}`) ||
      !reportLines.includes(`- run: ${complete.run_id}`) ||
      !reportLines.includes(tallyLine)
    )
      return { problem: 'report.md does not match the run: layer, run id or tallies differ' }
    if (results.environment?.workflow_ref !== 'manual:pnpm-qa')
      return { problem: 'results.json environment.workflow_ref is not manual:pnpm-qa' }
    if (results.adapter !== `tch-qa-${layer}`)
      return { problem: `results.json adapter is ${results.adapter}, expected tch-qa-${layer}` }
    const provenance = await read('provenance.json')
    const provenanceErrors = validate(PROVENANCE_SCHEMA, provenance)
    if (provenanceErrors.length > 0) return { problem: `provenance.json invalid: ${provenanceErrors[0]}` }
    if (
      provenance.layer !== layer ||
      provenance.git_sha !== complete.git_sha ||
      provenance.tree_fingerprint !== complete.tree_fingerprint ||
      provenance.dirty !== complete.dirty ||
      provenance.target !== complete.target ||
      provenance.area !== complete.area
    )
      return { problem: 'provenance.json disagrees with complete.json' }
    if (sha256(await readRegularFile(await containedPath(run.dir, 'report.md'))) !== provenance.report_sha256)
      return { problem: 'report.md changed after the run (hash differs from provenance.json)' }
    if (
      typeof provenance.command !== 'string' ||
      !provenance.command.startsWith('pnpm qa ') ||
      provenance.command !== results.command
    )
      return { problem: 'results.json command disagrees with provenance.json' }
    if (typeof provenance.prove_red !== 'boolean' || provenance.prove_red !== casesDoc.proveRed)
      return { problem: 'provenance.json prove_red disagrees with cases.json' }
    return { casesDoc }
  } catch (error) {
    return { problem: error.message }
  }
}

// Manual obligations are what the layer declares in denominator.json `manual` plus what its
// checklist lists. A missing or unreadable checklist therefore leaves declared checks required
// and uncaptured; it never shrinks the requirement. Receipts count once per distinct id.
async function manualCounts(run, declared) {
  const out = { required: 0, captured: 0, reviewed: 0, rejected: 0, notes: [] }
  const requiredIds = new Set(declared)
  const finish = () => {
    out.required = requiredIds.size
    return out
  }
  let checklist = null
  try {
    checklist = run ? await readJsonFile(path.join(run.dir, 'manual-checklist.json')) : null
  } catch (error) {
    out.notes.push(`manual-checklist.json unreadable: ${error.message}`)
    return finish()
  }
  if (!checklist) {
    if (declared.length > 0)
      out.notes.push('manual-checklist.json is missing; declared manual checks stay open')
    return finish()
  }
  const bad = validate(CHECKLIST_SCHEMA, checklist)
  if (bad.length > 0) {
    out.notes.push(`manual-checklist.json invalid: ${bad[0]}`)
    return finish()
  }
  const listed = new Set()
  const duplicated = new Set()
  for (const item of checklist.items) {
    if (listed.has(item.id)) duplicated.add(item.id)
    listed.add(item.id)
    requiredIds.add(item.id)
  }
  if (duplicated.size > 0)
    out.notes.push(`manual-checklist.json repeats id(s) ${[...duplicated].join(', ')}; they stay open`)
  const missing = declared.filter((id) => !listed.has(id))
  if (missing.length > 0)
    out.notes.push(`manual-checklist.json lacks declared check(s): ${missing.slice(0, 3).join(', ')}`)
  const captured = new Map()
  for (const item of checklist.items) {
    if (duplicated.has(item.id)) continue
    try {
      const buffer = await readRegularFile(await containedPath(run.dir, item.artifact), {
        maxBytes: 512 * 1024 * 1024
      })
      if (buffer && sha256(buffer) === item.sha256) captured.set(item.id, item.sha256)
    } catch {}
  }
  out.captured = captured.size
  let review
  try {
    review = await readJsonFile(path.join(run.dir, 'manual-review.json'))
  } catch (error) {
    out.notes.push(`manual-review.json unreadable: ${error.message}`)
    return finish()
  }
  if (!review) return finish()
  const reviewBad = validate(REVIEW_SCHEMA, review)
  if (reviewBad.length > 0) {
    out.notes.push(`manual-review.json invalid: ${reviewBad[0]}`)
    return finish()
  }
  if (review.revision !== run.complete.git_sha) {
    out.notes.push('manual-review.json is bound to a different revision; receipts ignored')
    return finish()
  }
  const byId = new Map()
  for (const receipt of review.receipts) {
    // Any second receipt for an id, even an identical one, leaves that id open.
    byId.set(receipt.id, byId.has(receipt.id) ? { status: 'conflict' } : receipt)
  }
  for (const [id, receipt] of byId) {
    if (receipt.status === 'conflict') {
      out.notes.push(`manual-review.json has repeated or conflicting receipts for ${id}; it stays open`)
      continue
    }
    if (captured.get(id) !== receipt.artifact_sha256) continue
    if (receipt.status === 'accepted') out.reviewed += 1
    else out.rejected += 1
  }
  return finish()
}

// A denominator is current when the sources it was extracted from are unchanged since its
// recorded revision. The revision is a commit (full SHA, or a hex token of at least 7 characters
// inside a note such as "origin/develop fa4dc66a5") that must be an ancestor of HEAD. The sources
// are `sourcePaths` from denominator.json, or the whole tree except tests/qa when it names none.
// Committing or merging the denominator itself therefore does not make it stale; changing the
// code it was extracted from does. Returns null when current, else the reason it is not.
async function denominatorStaleness(git, denominator) {
  // Guard first: null or a content hash names no commit, so there is nothing to compare the sources with.
  if (denominator.revision === null) return 'revision is unknown (null): freshness cannot be proven'
  const tokens = revisionCommitTokens(denominator.revision)
  if (tokens.length === 0)
    return `revision "${denominator.revision}" is a content hash, not a commit: freshness cannot be proven`
  let rev = null
  for (const token of tokens) {
    try {
      rev = (await git(['rev-parse', '--verify', '--end-of-options', `${token}^{commit}`])).trim()
      break
    } catch {}
  }
  if (!rev) return `revision "${denominator.revision}" names no commit in this repository`
  try {
    await git(['merge-base', '--is-ancestor', rev, 'HEAD'])
  } catch {
    return `revision ${rev.slice(0, 12)} is not an ancestor of the tree`
  }
  const specs = denominator.sourcePaths?.length ? denominator.sourcePaths : ['.', ':(exclude)tests/qa']
  try {
    const changed = (await git(['diff', '--name-only', '-z', rev, '--', ...specs]))
      .split('\0')
      .filter(Boolean)
    const added = (await git(['ls-files', '-z', '--others', '--exclude-standard', '--', ...specs]))
      .split('\0')
      .filter(Boolean)
    const all = [...changed, ...added]
    if (all.length > 0)
      return `${all.length} source path(s) changed since ${rev.slice(0, 12)}, e.g. ${all[0]}`
  } catch (error) {
    return `cannot compare the sources with ${rev.slice(0, 12)}: ${error.message}`
  }
  return null
}

export async function layerCoverage(deps, layer, tree) {
  const base = { layer, status: 'present', reasons: [] }
  const layerDir = path.join(deps.layersDir, layer)
  const info = await lstatOrNull(layerDir)
  if (!info)
    return {
      ...base,
      status: 'missing',
      reasons: [`layer folder tests/qa/layers/${layer} does not exist yet`],
      open: 1,
      fail: 0
    }
  if (!info.isDirectory())
    return { ...base, status: 'invalid', reasons: ['layer path is not a directory'], open: 1, fail: 0 }

  let denominator = null
  try {
    denominator = await readJsonFile(path.join(layerDir, 'denominator.json'))
    if (denominator === null) base.reasons.push('denominator.json is missing')
    else {
      const errors = validateCommitted(denominator, layer).problems
      if (errors.length > 0) {
        base.reasons.push(`denominator.json invalid: ${errors[0]}`)
        denominator = null
      }
    }
  } catch (error) {
    base.reasons.push(error.message)
  }
  const { manifests, invalid } = await readManifests(path.join(layerDir, 'cases'), deps.contractsDir).catch(
    (error) => ({
      manifests: [],
      invalid: [error.message]
    })
  )
  if (invalid.length > 0)
    base.reasons.push(`${invalid.length} invalid case manifest(s), first: ${invalid[0]}`)
  const found = await latestRun(deps.resultsRoot, layer, tree.fingerprint, deps.extraRuns)
  if (!found.run) base.reasons.push(found.reason)
  const hashes = new Map(manifests.map((m) => [m.id, hashJson(m)]))
  let casesDoc = null
  let runUsable = false
  if (found.run) {
    const loaded = await loadRun(
      found.run,
      layer,
      deps.contractsDir,
      new Map(manifests.map((m) => [m.id, m])),
      deps.repoRoot
    )
    if (loaded.problem) base.reasons.push(`${loaded.problem}; the run is not credited`)
    else {
      casesDoc = loaded.casesDoc
      runUsable = true
    }
  }
  let extractionOpen = 0
  if (!tree.headSha || !tree.fingerprint) {
    extractionOpen += 1
    base.reasons.push('git state unavailable; coverage cannot be tied to a tree and stays open')
  } else if (denominator) {
    const stale = await denominatorStaleness(deps.git, denominator)
    if (stale) {
      extractionOpen += 1
      base.reasons.push(`denominator.json is stale: ${stale}; regenerate it`)
    }
  }
  if (denominator && denominator.items.length === 0) {
    extractionOpen += 1
    base.reasons.push('denominator.json has no items: an empty extraction proves nothing')
  }
  if (!runUsable) extractionOpen += 1
  const current = new Map()
  let staleResults = 0
  for (const entry of casesDoc?.cases ?? []) {
    if (hashes.get(entry.id) === entry.manifestHash) current.set(entry.id, entry)
    else staleResults += 1
  }
  // A result for a case that changed or no longer exists means the run does not describe this
  // manifest set, whatever else it says: it keeps the layer open and none of its results is credited.
  if (staleResults > 0) {
    current.clear()
    extractionOpen += 1
    base.reasons.push(
      `${staleResults} result(s) do not match the current manifests (changed, removed or unsolicited); the run is stale`
    )
  }

  const caseCounts = { PASS: 0, FAIL: 0, ENV: 0, PENDING: 0 }
  for (const manifest of manifests) caseCounts[current.get(manifest.id)?.verdict ?? 'PENDING'] += 1

  const obligations = {
    required: 0,
    na: 0,
    implemented: 0,
    executed: 0,
    redProven: 0,
    verdicts: { PASS: 0, FAIL: 0, ENV: 0, PENDING: 0 }
  }
  let unobligated = 0
  const inObligation = new Set()
  const seenItems = new Set()
  for (const item of denominator?.items ?? []) {
    seenItems.add(item.id)
    // An item owes something when it requires a tag or declares one N-A; with neither, nothing can be proven.
    if (item.requiredTags.length === 0 && Object.keys(item.na).length === 0) unobligated += 1
    // The contract keeps required and N-A disjoint and every N-A in the accepted form (a file that breaks
    // either is rejected whole above), so an N-A entry is one obligation the item does not owe.
    obligations.na += Object.keys(item.na).length
    for (const tag of item.requiredTags) {
      obligations.required += 1
      const covering = manifests.filter((m) => m.itemIds.includes(item.id) && m.edgeTags.includes(tag))
      for (const m of covering) inObligation.add(m.id)
      if (covering.length > 0) obligations.implemented += 1
      const results = covering.map((m) => current.get(m.id)).filter(Boolean)
      if (results.some((r) => r.verdict === 'PASS' || r.verdict === 'FAIL')) obligations.executed += 1
      if (results.some((r) => r.verdict === 'PASS' && r.redProof)) obligations.redProven += 1
      let verdict = 'PENDING'
      if (results.some((r) => r.verdict === 'FAIL')) verdict = 'FAIL'
      else if (
        results.length > 0 &&
        results.length === covering.length &&
        results.every((r) => r.verdict === 'PASS')
      )
        verdict = 'PASS'
      else if (results.some((r) => r.verdict === 'ENV')) verdict = 'ENV'
      obligations.verdicts[verdict] += 1
    }
  }
  // A manifest naming an item the denominator does not know cannot be tied to any obligation.
  let unknownItemRefs = 0
  if (denominator)
    for (const manifest of manifests)
      for (const itemId of manifest.itemIds)
        if (!seenItems.has(itemId)) {
          unknownItemRefs += 1
          base.reasons.push(`case ${manifest.id} names item ${itemId} that denominator.json does not list`)
        }
  // Cases outside every required obligation still count: a FAIL/ENV/PENDING there keeps the layer open.
  let strayOpen = 0
  let strayFail = 0
  for (const manifest of manifests) {
    if (inObligation.has(manifest.id)) continue
    const verdict = current.get(manifest.id)?.verdict ?? 'PENDING'
    if (verdict === 'PASS') continue
    strayOpen += 1
    if (verdict === 'FAIL') strayFail += 1
  }
  if (strayOpen > 0)
    base.reasons.push(`${strayOpen} case(s) outside the required obligations are not PASS and stay open`)
  if (unobligated > 0)
    base.reasons.push(
      `${unobligated} item(s) in denominator.json require no edge tag: nothing is owed, so nothing can be proven`
    )

  const declaredManual = [...new Set((denominator?.manual ?? []).map((m) => m.id))]
  const manual = await manualCounts(runUsable ? found.run : null, declaredManual)
  for (const note of manual.notes) base.reasons.push(note)
  const unresolved = denominator?.unresolved.length ?? 0
  const openObligations = obligations.required - obligations.verdicts.PASS
  const open =
    (denominator ? 0 : 1) +
    extractionOpen +
    unresolved +
    openObligations +
    strayOpen +
    unknownItemRefs +
    unobligated +
    invalid.length +
    (manual.required - manual.reviewed)
  return {
    ...base,
    items: denominator?.items.length ?? 0,
    unresolved,
    obligations,
    cases: { manifests: manifests.length, invalid: invalid.length, verdicts: caseCounts },
    run: found.run
      ? { id: path.basename(found.run.dir), target: 'local', sha: found.run.complete.git_sha }
      : null,
    manual: {
      required: manual.required,
      captured: manual.captured,
      reviewed: manual.reviewed,
      rejected: manual.rejected
    },
    open,
    fail: obligations.verdicts.FAIL + strayFail
  }
}

export async function computeCoverage(deps, { layer }) {
  const layers = layer ? [layer] : [...new Set([...KNOWN_LAYERS, ...(await presentLayers(deps.layersDir))])]
  const tree = { headSha: null, fingerprint: null }
  try {
    const sha = (await deps.git(['rev-parse', 'HEAD'])).trim()
    if (/^[0-9a-f]{40}$/.test(sha)) tree.headSha = sha
    const fingerprint = await deps.fingerprint()
    if (tree.headSha && /^[0-9a-f]{64}$/.test(fingerprint)) tree.fingerprint = fingerprint
  } catch {}
  const reports = []
  for (const name of layers) {
    if (!LAYER_NAME.test(name)) throw new Error(`invalid layer name ${name}`)
    reports.push(await layerCoverage(deps, name, tree))
  }
  return reports
}

async function presentLayers(layersDir) {
  const info = await lstatOrNull(layersDir)
  if (!info?.isDirectory()) return []
  return (await fs.readdir(layersDir, { withFileTypes: true }))
    .filter((e) => LAYER_NAME.test(e.name))
    .map((e) => e.name)
}

export function renderCoverage(reports) {
  const lines = ['QA coverage (per layer; every count is separate, there is no overall percentage)', '']
  for (const r of reports) {
    if (r.status !== 'present') {
      lines.push(`${r.layer}: ${r.status.toUpperCase()} — ${r.reasons.join('; ')}`, '')
      continue
    }
    const o = r.obligations
    const v = o.verdicts
    lines.push(
      `${r.layer}: items ${r.items} · unresolved ${r.unresolved}`,
      `  obligations: required ${o.required} · N-A ${o.na} · implemented ${o.implemented} · executed ${o.executed} · RED-proven ${o.redProven}`,
      `  obligation verdicts: PASS ${v.PASS} · FAIL ${v.FAIL} · ENV ${v.ENV} · PENDING ${v.PENDING}`,
      `  cases: ${r.cases.manifests} manifests (${r.cases.invalid} invalid) · PASS ${r.cases.verdicts.PASS} · FAIL ${r.cases.verdicts.FAIL} · ENV ${r.cases.verdicts.ENV} · PENDING ${r.cases.verdicts.PENDING}`,
      `  manual: required ${r.manual.required} · captured ${r.manual.captured} · reviewed ${r.manual.reviewed} · rejected ${r.manual.rejected}`,
      `  run: ${r.run ? `${r.run.id} @ ${r.run.sha.slice(0, 12)}` : 'none usable'}`,
      `  open: ${r.open}${r.fail > 0 ? ` (${r.fail} FAIL)` : ''}`
    )
    for (const reason of r.reasons) lines.push(`  note: ${reason}`)
    lines.push('')
  }
  return `${lines.join('\n')}`
}

export function coverageExitCode(reports, requireComplete) {
  if (!requireComplete) return 0
  if (reports.some((r) => r.fail > 0 || r.open > 0)) return 3
  return 0
}
