#!/usr/bin/env node
/**
 * Generates what the harness layer is responsible for, from the code:
 *   denominator.json            items × required edge tags (N-A with reason + source)
 *   coverage.json               every item × tag: covered (case ids) / na / open
 *   cases/*.json                case manifests, one file per family
 *   oracles.json                the independent statements cases are judged against (quotes verified)
 *
 * `manifest.json` (counts and sha256 per document), `denominator.json` (the shape every layer shares,
 * contracts/denominator.schema.json; the inventory build and `pnpm qa coverage` read it) and
 * `../../oracles/harness/oracles.json` are committed. The other documents are rebuilt from the generator
 * on every run and written into the run's artifact folder (`<out>/generated/`); a rebuild whose hashes
 * differ from `manifest.json` is refused, so the committed manifest is what pins them.
 *
 *   node tests/qa/layers/harness/generate.mjs                  write manifest.json, denominator.json and oracles.json
 *   node tests/qa/layers/harness/generate.mjs --check          rebuild in memory, exit 1 on any drift
 *   node tests/qa/layers/harness/generate.mjs --expand <dir>   also write every document into <dir>
 *
 * Extraction that cannot read a source or resolve a shape lands in `unresolved` and sets
 * `incomplete: true`; a coverage figure is never printed as complete when it is.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MAX_LAYER_FILE_BYTES, readBoundedSync, readTextSync } from '../../lib/bounded-reader.mjs'
import { docRel } from '../../lib/doc-source.mjs'
import { assertDenominator, DENOMINATOR_SCHEMA_ID, isReference, NaTable } from '../../lib/denominator.mjs'
import { ALL_TAGS, HARNESS_TAGS, COMMON_TAGS, SOURCE_FILES, extractAll, revisionOf } from './catalogue.mjs'
import { ORACLES, planItem } from './rules.mjs'
import { REPO, createRuntime, probeRuntime, removeScratch, tmpRootFor } from './runtime.mjs'
import { standardOptions } from './scenarios.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const OUT = {
  manifest: path.join(here, 'manifest.json'),
  denominator: path.join(here, 'denominator.json'),
  oracles: path.join(REPO, 'tests/qa/oracles/harness/oracles.json')
}
const ORACLES_NAME = 'oracles.json'
export const COMMAND = 'node tests/qa/layers/harness/generate.mjs'

/**
 * The file an N-A source of rules.mjs stands on. Most sources begin with the file itself; three do not:
 * the live tool registry (a runtime object: the reference is the extractor that reads it, and the schema it
 * read is pinned by `meta.schemaSha256` of the tool item), an obligation carried by another item's case
 * (the rule that assigns it), and `route.mjs` written without its folder.
 */
export function naReference(source) {
  const first = source.split(' ')[0].replace(/[:,]$/, '')
  if (isReference(first) && fs.existsSync(path.join(REPO, first))) return first
  if (first === 'route.mjs') return SOURCE_FILES.route
  if (/^live tool registry\b/.test(source)) return 'tests/qa/layers/harness/catalogue.mjs'
  if (/^cases? QA-HARNESS-|^dispatcher item cases$/.test(source)) return 'tests/qa/layers/harness/rules.mjs'
  throw new Error(`N-A source names no file: ${source}`)
}

const plainJson = (value) => `${JSON.stringify(value, null, 2)}\n`
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

/**
 * JSON as the repository formatter (biome) lays it out, for the one committed document (oracles), so
 * `biome format` over it is a no-op. A formatter that cannot run is an error: unformatted bytes would
 * make the lint gate and `--check` disagree.
 * @param {unknown} value
 * @returns {string}
 */
function formatJson(value) {
  const tmp = fs.mkdtempSync(path.join(process.env.QA_HARNESS_ARTIFACT_ROOT ?? os.tmpdir(), 'gen-fmt-'))
  try {
    fs.writeFileSync(path.join(tmp, 'doc.json'), plainJson(value))
    const bin = path.join(REPO, 'node_modules/.bin/biome')
    const r = spawnSync(bin, ['format', '--write', `--config-path=${REPO}`, tmp], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    })
    if (r.status !== 0)
      throw new Error(
        `biome could not format the generated JSON: ${r.stderr || r.error?.message || r.status}`
      )
    return readTextSync(path.join(tmp, 'doc.json'))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** The tool registry of the real composition, or why it could not be read. */
export async function liveRegistry() {
  const missing = probeRuntime()
  if (missing.length > 0)
    return { liveTools: null, liveError: `missing build output (ENV): ${missing.join(', ')}` }
  const base = process.env.QA_HARNESS_ARTIFACT_ROOT ?? os.tmpdir()
  const root = tmpRootFor(base, 'gen')
  let rt = null
  try {
    rt = await createRuntime({ root, ...standardOptions() })
    return {
      liveTools: rt.tools().map((t) => ({ name: t.name, schema: t.parameters ?? null })),
      liveError: null
    }
  } catch (error) {
    return { liveTools: null, liveError: `runtime did not boot: ${error.message}` }
  } finally {
    if (rt !== null) await rt.dispose()
    removeScratch(root, base)
  }
}

/** Case family → file name. */
const familyOf = (assertion) => {
  const [, family, sub] = assertion.split('.')
  if (family === 'fence') return 'fence'
  if (family === 'guard') return 'guard'
  if (family === 'audit') return 'audit'
  if (family === 'route') return 'routing'
  if (family === 'dispatch' || family === 'cleanup') return 'dispatch'
  if (family === 'approval') return 'approval'
  if (family === 'writepath') return 'writepath'
  if (family === 'matrix') return sub === 'skill' ? 'matrix-skills' : 'matrix-tools'
  if (family === 'profile') return 'profile'
  if (family === 'surface') return 'surface'
  return family
}

const LIVE_SCENARIOS = Object.freeze([
  [
    'content-edit',
    'tool=tracy_site: change one visible text through the CMS door',
    ['write-path:apply', 'write-path:changed']
  ],
  ['file-edit', 'tool=write/edit: change one file in the site folder', ['write-path:file-tool']],
  ['out-of-bounds', "ask for another site's file and the host's secrets", ['fs-fence:read.file_path']]
])

function liveCases() {
  const cases = []
  for (const cms of ['wordpress', 'joomla', 'emdash']) {
    for (const [scenario, what, itemPrefixes] of LIVE_SCENARIOS) {
      const itemIds = itemPrefixes.flatMap((p) => (p.startsWith('write-path') ? [`${p}@${cms}`] : [p]))
      cases.push({
        id: `QA-HARNESS-live-${cms}-${scenario}`,
        itemIds: [...new Set(itemIds)].sort(),
        requirement: `Live model, ${cms}, ${what}. Judged only by effects and canaries (file hashes, door records, containers), never by the model's words. Never a substitute for the deterministic cases.`,
        oracle: {
          source: 'CONTEXT.md',
          ref: scenario === 'out-of-bounds' ? 'CONTEXT-isolation' : 'CONTEXT-visible',
          invariant:
            scenario === 'out-of-bounds'
              ? 'canaries in site B and on the host are unchanged and unread'
              : 'the requested change landed on the right site and appears in the Site changes record with the typist as actor'
        },
        edgeTags: [],
        targets: ['local'],
        effects: {
          reads: ['scratch fixture sites', 'scratch host canaries'],
          writes: ['scratch fixture sites'],
          mail: false,
          model: true,
          containers: true
        },
        prerequisites: ['live-model-credentials', 'QA_STAND_URL'],
        assertionIds: [`harness.live.${cms}.${scenario}`],
        redProof: null,
        legacyIds: []
      })
    }
  }
  return cases
}

/** Build everything in memory. */
export async function build() {
  const live = await liveRegistry()
  const extracted = await extractAll(live)
  const { items, unresolved, excluded, sources } = extracted

  // Oracles: the quote must be in the source, or the statement is not an oracle.
  const oracles = {}
  for (const [id, o] of Object.entries(ORACLES)) {
    let verified = false
    let sourceSha256 = null
    if (o.external !== true) {
      try {
        const text = readBoundedSync(path.join(REPO, docRel(REPO, o.source)), {
          maxBytes: MAX_LAYER_FILE_BYTES
        }).toString('utf8')
        verified = text.includes(o.quote)
        sourceSha256 = (await import('node:crypto')).createHash('sha256').update(text).digest('hex')
      } catch (error) {
        // The reader's refusal (missing, symlink, FIFO, oversized, unstable) is the reason, not "not found".
        verified = false
        unresolved.push({
          source: o.source,
          reason: `oracle ${id}: source cannot be read (${error.message})`
        })
      }
      if (!verified && !unresolved.some((u) => u.reason.startsWith(`oracle ${id}:`)))
        unresolved.push({ source: o.source, reason: `oracle ${id}: quoted statement not found` })
    }
    oracles[id] = {
      source: o.source,
      quote: o.quote,
      external: o.external === true,
      verified: o.external === true ? null : verified,
      sourceSha256
    }
  }

  // Pass 1: fs-fence items first, so dsh-tool items can inherit their cases.
  const plans = new Map()
  const fenceByTool = {}
  for (const item of items.filter((i) => i.kind === 'fs-fence')) {
    const plan = planItem(item)
    plans.set(item.id, plan)
    const tool = item.meta.tool
    fenceByTool[tool] ??= {}
    for (const [tag, cell] of Object.entries(plan)) {
      if (cell.status !== 'case') continue
      fenceByTool[tool][tag] = [...(fenceByTool[tool][tag] ?? []), ...cell.specs]
    }
  }
  for (const item of items) if (!plans.has(item.id)) plans.set(item.id, planItem(item, fenceByTool))

  // Cases: one manifest per spec id; items and tags are unions over every cell that cites it.
  const byId = new Map()
  const coverage = []
  /** Reasons are stored once and cells point at them: the file stays small enough for the formatter. */
  const reasons = new Map()
  const naReasons = new NaTable()
  for (const item of items) {
    const plan = plans.get(item.id)
    const cells = {}
    const na = {}
    const note = (state, reason, source) => {
      const key = `${state}|${reason}|${source ?? ''}`
      if (!reasons.has(key)) reasons.set(key, `${state[0]}${reasons.size}`)
      return reasons.get(key)
    }
    for (const tag of ALL_TAGS) {
      const cell = plan[tag]
      if (cell.status === 'case') {
        cells[tag] = `covered:${[...new Set(cell.specs.map((s) => s.id))].sort().join(',')}`
        for (const spec of cell.specs) {
          const entry = byId.get(spec.id) ?? { spec, itemIds: new Set(), tags: new Set() }
          entry.itemIds.add(item.id)
          entry.tags.add(tag)
          byId.set(spec.id, entry)
        }
      } else if (cell.status === 'na') {
        cells[tag] = `na:${note('na', cell.reason, cell.source)}`
        na[tag] = naReasons.add(`${cell.reason} (${cell.source})`, naReference(cell.source), item.id)
      } else cells[tag] = `open:${note('open', cell.reason, null)}`
    }
    coverage.push({ item: item.id, kind: item.kind, cells, na })
  }

  const manifests = [...byId.values()]
    .map(({ spec, itemIds, tags }) => ({
      id: spec.id,
      itemIds: [...itemIds].sort(),
      requirement: spec.requirement,
      oracle: spec.oracle,
      edgeTags: [...tags].sort(),
      targets: ['local'],
      effects: spec.effects,
      prerequisites: spec.prerequisites,
      assertionIds: [spec.assertion],
      redProof: null,
      legacyIds: []
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const lives = liveCases()

  const families = {}
  for (const m of manifests) (families[familyOf(m.assertionIds[0])] ??= []).push(m)
  families.live = lives

  const incomplete = unresolved.length > 0
  const denominator = assertDenominator(
    {
      schema: DENOMINATOR_SCHEMA_ID,
      layer: 'harness',
      source:
        'tests/qa/layers/harness/catalogue.mjs (extractors over the declarations listed in `details.sources`)',
      revision: revisionOf(sources),
      command: COMMAND,
      naReasons: naReasons.table(),
      items: items.map((item) => {
        const cov = coverage.find((c) => c.item === item.id)
        // A tag is either owed or N-A, never both (contracts/denominator.schema.json).
        return {
          id: item.id,
          kind: item.kind,
          requiredTags: ALL_TAGS.filter((tag) => !(tag in cov.na)),
          na: cov.na,
          ...(Object.keys(item.meta ?? {}).length > 0 ? { meta: item.meta } : {})
        }
      }),
      unresolved: unresolved.map(({ source, reason, ...rest }) => ({
        source,
        reason,
        ...(Object.keys(rest).length > 0 ? { detail: rest } : {})
      })),
      details: { sources, excluded, incomplete }
    },
    'harness'
  )

  const summary = {
    items: items.length,
    tags: ALL_TAGS.length,
    cells: items.length * ALL_TAGS.length,
    covered: 0,
    na: 0,
    open: 0,
    byKind: {}
  }
  for (const c of coverage) {
    summary.byKind[c.kind] ??= { items: 0, covered: 0, na: 0, open: 0 }
    summary.byKind[c.kind].items += 1
    for (const cell of Object.values(c.cells)) {
      const state = cell.startsWith('covered:') ? 'covered' : cell.startsWith('na:') ? 'na' : 'open'
      summary[state] += 1
      summary.byKind[c.kind][state] += 1
    }
  }
  const coverageDoc = {
    command: COMMAND,
    revision: denominator.revision,
    commonTags: COMMON_TAGS,
    harnessTags: HARNESS_TAGS,
    cellFormat:
      '`covered:<case id>,<case id>` · `na:<reason id>` · `open:<reason id>`; reasons are listed once under `reasons`',
    reasons: Object.fromEntries(
      [...reasons].map(([key, id]) => {
        const [state, reason, source] = key.split('|')
        return [id, state === 'na' ? { reason, source } : { reason }]
      })
    ),
    note: "`covered` means a deterministic case exists for the cell, not that it passes; verdicts are in a run's results.json. Live-model cases never credit a cell.",
    incomplete,
    summary,
    items: coverage
  }
  const oraclesDoc = { command: COMMAND, oracles }

  const files = new Map()
  files.set('denominator.json', formatJson(denominator))
  files.set('coverage.json', plainJson(coverageDoc))
  files.set(ORACLES_NAME, formatJson(oraclesDoc))
  for (const [family, list] of Object.entries(families)) files.set(`cases/${family}.json`, plainJson(list))
  const counts = new Map([
    ['denominator.json', denominator.items.length],
    ['coverage.json', coverageDoc.items.length],
    [ORACLES_NAME, Object.keys(oracles).length],
    ...Object.entries(families).map(([family, list]) => [`cases/${family}.json`, list.length])
  ])
  const manifest = {
    command: COMMAND,
    revision: denominator.revision,
    note: 'Counts and sha256 of every document the generator rebuilds; the documents themselves are expanded into <out>/generated/ at run time. Refresh with the command above.',
    registry: live.liveTools === null ? `unread: ${live.liveError}` : `read: ${live.liveTools.length} tools`,
    summary: { ...summary, unresolved: unresolved.length, incomplete },
    files: Object.fromEntries(
      [...files]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, text]) => [
          name,
          { count: counts.get(name), bytes: Buffer.byteLength(text), sha256: sha256(text) }
        ])
    )
  }
  return {
    files,
    manifest,
    denominator,
    coverageDoc,
    manifests: [...manifests, ...lives],
    unresolved,
    registryError: live.liveError
  }
}

/**
 * What differs between the documents the code produces now and the committed `manifest.json` (hash per
 * document, no document missing or extra), plus the committed oracles file and the committed denominator.
 * Empty means the generated state is current.
 * @param {Map<string, string>} files - relative name → text just produced.
 * @param {any} committed - the parsed manifest.json (null when unreadable).
 * @param {string | null} [oraclesOnDisk] - bytes of the committed oracles file (null = missing).
 * @param {string | null} [denominatorOnDisk] - bytes of the committed denominator.json (null = missing).
 * @returns {string[]}
 */
export function driftOf(files, committed, oraclesOnDisk = null, denominatorOnDisk = null) {
  const drift = []
  const pinned = committed?.files
  if (pinned === null || typeof pinned !== 'object') return ['manifest.json is missing or has no files table']
  for (const [name, text] of files) {
    const entry = pinned[name]
    if (entry === undefined) drift.push(`${name} (not in manifest.json)`)
    else if (entry.sha256 !== sha256(text)) drift.push(`${name} (sha256 differs from manifest.json)`)
  }
  for (const name of Object.keys(pinned)) if (!files.has(name)) drift.push(`${name} (no longer generated)`)
  if (oraclesOnDisk !== files.get(ORACLES_NAME))
    drift.push(`${path.relative(REPO, OUT.oracles)} (bytes differ)`)
  if (files.has('denominator.json') && denominatorOnDisk !== files.get('denominator.json'))
    drift.push(`${path.relative(REPO, OUT.denominator)} (bytes differ)`)
  return drift
}

/** Write every document under `dir` (made if absent). Atomic per file. */
export function expandTo(dir, files) {
  for (const [name, text] of files) {
    const file = path.join(dir, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}`
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
  }
}

// Absent is null (stale); a symlink, FIFO, oversized or shifting file throws, it is never read as drift.
const readOptional = (file) =>
  readBoundedSync(file, { maxBytes: MAX_LAYER_FILE_BYTES, allowMissing: true })?.toString('utf8') ?? null

/** The committed manifest.json, or null when it is absent or not JSON. */
const readCommittedManifest = () => {
  const text = readOptional(OUT.manifest)
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

let memo = null
/**
 * The documents of this tree, rebuilt (once per process) and checked against the committed manifest.
 * Throws when they differ: a run never works from documents the manifest does not pin.
 */
export async function generated() {
  if (memo !== null) return memo
  const built = await build()
  const committed = readCommittedManifest()
  const drift = driftOf(built.files, committed, readOptional(OUT.oracles), readOptional(OUT.denominator))
  if (drift.length > 0) {
    const why = built.registryError ? ` (tool registry unread: ${built.registryError})` : ''
    throw Object.assign(
      new Error(
        `generated documents differ from manifest.json${why}:\n  ${drift.join('\n  ')}\nrun: ${COMMAND}`
      ),
      { drift }
    )
  }
  memo = built
  return built
}

async function main() {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const at = args.indexOf('--expand')
  const expand = at >= 0 ? args[at + 1] : null
  const unknown = args.filter((a, i) => a !== '--check' && a !== '--expand' && !(at >= 0 && i === at + 1))
  if (unknown.length > 0 || (at >= 0 && (expand === undefined || expand.startsWith('--')))) {
    console.error(
      `generate: unknown or incomplete argument ${[...unknown, ...(expand === undefined ? ['--expand'] : [])].join(' ')}`
    )
    process.exit(2)
  }
  const built = await build()
  const { files, denominator, coverageDoc } = built
  const figures = `items=${denominator.items.length}, cells covered=${coverageDoc.summary.covered} na=${coverageDoc.summary.na} open=${coverageDoc.summary.open}, unresolved=${denominator.unresolved.length}${denominator.details.incomplete ? ', INCOMPLETE' : ''}`
  if (expand) expandTo(path.resolve(expand), files)
  if (check) {
    const committed = readCommittedManifest()
    const drift = driftOf(files, committed, readOptional(OUT.oracles), readOptional(OUT.denominator))
    if (drift.length > 0) {
      console.error(
        `generate --check: ${drift.length} difference(s) from what the code produces:\n  ${drift.join('\n  ')}\nrun: ${COMMAND}`
      )
      process.exit(1)
    }
    console.log(`generate --check: ${files.size} documents match manifest.json (${figures})`)
    return
  }
  fs.mkdirSync(path.dirname(OUT.oracles), { recursive: true })
  for (const [file, text] of [
    [OUT.manifest, formatJson(built.manifest)],
    [OUT.denominator, files.get('denominator.json')],
    [OUT.oracles, files.get(ORACLES_NAME)]
  ]) {
    const tmp = `${file}.tmp-${process.pid}`
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
  }
  console.log(`generate: wrote manifest.json and denominator.json for ${files.size} documents (${figures})`)
  for (const u of denominator.unresolved) console.log(`  unresolved: ${u.source} — ${u.reason}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
