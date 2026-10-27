#!/usr/bin/env node
// Regenerates everything the api layer derives from its oracle:
//   tests/qa/layers/api/denominator.json   items × required tags (N-A with reason + source), unresolved
//   tests/qa/layers/api/coverage.plan.json per item per tag: cases / N-A / open, with reasons (compact, see planfile.mjs)
//   tests/qa/layers/api/cases.manifest.json per family of cases: count + sha256 (the cases themselves are expanded at run time)
// The expanded door list is NOT written anywhere: it is derived from the pinned git revision on every run.
//
//   node tests/qa/layers/api/generate.mjs            rewrite the files
//   node tests/qa/layers/api/generate.mjs --check    exit 1 when any file differs from a regeneration
//   node tests/qa/layers/api/generate.mjs --expand DIR  write the expanded cases (DIR/<family>.json) for review; not committed
//   node tests/qa/layers/api/generate.mjs --pin SHA  re-pin the oracle to another revision (deliberate)
//
// Exit: 0 ok, 1 files differ (--check), 2 invalid usage or unreadable/invalid input, 3 the pinned source
// is unavailable or does not match its pin (ENV, with the probe output).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ContractError, readJson, sha256, stableStringify } from './io.mjs'
import { OracleEnvError, loadDoors, readPin, routeDocsListing, toOpenApiPath } from './oracle.mjs'
import { MAX_LAYER_FILE_BYTES, readBoundedSync, readTextSync } from '../../lib/bounded-reader.mjs'
import { assertDenominator, DENOMINATOR_SCHEMA_ID, NaTable } from '../../lib/denominator.mjs'
import { caseIdsFor, compactPlan } from './planfile.mjs'
import { API_TAGS, COMMON_TAGS, LAYER, REQUIRED_TAGS, caseId, planDoor, sourceOf } from './plan.mjs'

import { scenarioManifests } from './scenarios.mjs'

/** The family name of the door scenarios in cases.manifest.json. */
export const SCENARIO_FAMILY = 'scenario'
const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO = join(HERE, '..', '..', '..', '..')
const ORACLE_DIR = join(REPO, 'tests/qa/oracles/api')
export const CASES_MANIFEST = 'tests/qa/layers/api/cases.manifest.json'
const CASES_DIR = join(HERE, 'cases')
export const COMMAND = 'node tests/qa/layers/api/generate.mjs'
/**
 * Nothing this layer commits may reach 300 KB (a file that size cannot be reviewed). The ceiling was 200 KB
 * until the denominator took the shape every layer shares (contracts/denominator.schema.json): it lists
 * the required tags of each door, where the old file kept one list for all doors.
 */
export const MAX_FILE_BYTES = 300_000

const ORACLE_TEXT = {
  happy: [
    'route reference: the door answers 200 to its valid caller',
    'a valid caller of a read door gets a success status (2xx/304), never a 5xx'
  ],
  empty: [
    "route reference: a caller with no data sees none of another person's",
    'an account with no seats receives no fixture data of another tenant and no 5xx'
  ],
  invalid: [
    'snapshot: path/query parameter schemas',
    'a malformed identifier is refused with a 4xx and never succeeds or crashes'
  ],
  boundary: [
    'snapshot: parameter and body schema bounds',
    'a value one outside a declared bound is rejected (400/422) or clamped, never a 5xx and never accepted as written'
  ],
  'dependency-failure': [
    'snapshot: declared response statuses',
    'with the host unreachable the door answers a status its snapshot entry declares'
  ],
  repeat: [
    'HTTP semantics (RFC 9110 §9.2.2): safe methods',
    'two identical reads give the same status and the same JSON key set'
  ],
  anonymous: [
    'route reference: auth',
    'a door whose reference says it needs a credential refuses a call with none or a malformed one (401/403, or a redirect to sign-in) and writes nothing'
  ],
  'expired-auth': [
    'snapshot: security schemes session/bearer/actor',
    'an expired, forged, revoked or wrong-secret credential is refused exactly like none'
  ],
  'wrong-role': [
    'route reference: auth=admin (a tracy_admin seat)',
    'a signed-in person who is not Tracy staff gets 403 and nothing else'
  ],
  'other-tenant': [
    "CONTEXT.md / ADR 0014: one customer never reaches another customer's site",
    'a principal of site B addressing site A receives no 2xx and no data of A'
  ],
  'wrong-method': [
    'snapshot: the methods declared for a path',
    'a method the path does not declare is answered 404/405 and never 2xx or 5xx'
  ],
  'malformed-body': [
    'snapshot: requestBody schema',
    'a body the schema forbids is rejected with 400/413/415/422, never 2xx or 5xx'
  ],
  'encoding-injection': [
    'snapshot: parameters are opaque strings',
    'hostile text never causes a 5xx, a SQL/stack echo, header injection, a delay or a write'
  ],
  'csrf-origin': [
    'issue #662 and test/csrf.test.mjs',
    'a cookie-carrying write from a foreign Origin or a same-site Fetch-Metadata page is refused 403 CSRF_ORIGIN'
  ],
  pagination: [
    'snapshot: limit/offset/cursor parameters',
    'out-of-range paging values give 200/400/422 and never a 5xx'
  ],
  concurrent: [
    'HTTP semantics: safe methods',
    'parallel identical reads all give one status, none a 5xx, all within the deadline'
  ],
  'partial-write': [
    'atomicity: a refused request changes nothing',
    'after every refused body variant the row count of every table is unchanged'
  ],
  'no-secret-leak': [
    'CLAUDE.md §5 / SYSTEM.md: secrets never leave the server',
    'no planted secret value appears in any response body or header the door produced, and a session cookie is HttpOnly'
  ]
}

function loadExceptions() {
  const path = join(ORACLE_DIR, 'exceptions.json')
  return existsSync(path) ? readJson(path) : { anonymous: {}, 'wrong-method': {}, 'csrf-origin': {} }
}

/** Routes the tree under test registers (all domains mounted, nothing called), as METHOD path ids. */
async function registeredRoutes() {
  const any = new Proxy(function () {}, {
    get: (_, key) => (key === 'then' ? undefined : any),
    apply: () => any
  })
  const config = new Proxy({}, { get: (_, key) => (key === 'then' ? undefined : 'x') })
  const mod = await import(pathToFileURL(join(REPO, 'apps/tracy-web/src/app.js')).href)
  const app = mod.buildApp({ config, pool: any, sites: any, host: any, seats: any, mail: any, fleet: any })
  return app.routes.map((r) => ({ method: r.method, path: toOpenApiPath(r.path) }))
}

const patternToRegex = (pattern) =>
  new RegExp(
    `^${pattern
      .replace(/[.+?^$()|[\]\\]/g, '\\$&')
      .replace(/\{[^}]+\}/g, '[^/]+')
      .replace(/\*/g, '.*')}$`
  )

// Which file an N-A reason of the planner rests on. The reason keeps the planner's own wording (with the
// pinned revision and the detail in brackets); the reference is the file that wording cites first.
const NA_SOURCES = [
  [/api-reference\.snapshot\.json/, (pin) => pin.snapshot.path],
  [/api-reference\/routes|ROUTE_DOCS/, () => 'apps/tracy-web/src/api-reference/routes/index.js'],
  [/csrf\.test\.mjs/, () => 'apps/tracy-web/test/csrf.test.mjs']
]
/** The file one planner reason cites first; a reason citing no known file is a planner bug. */
export function naSource(reason, pin) {
  const hits = NA_SOURCES.map(([re, file]) => ({ at: reason.search(re), file: file(pin) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at)
  if (hits.length === 0) throw new ContractError(`N-A reason cites no source file: ${reason}`)
  return hits[0].file
}

function findUnresolved(doors, routes, snapshotUnresolved) {
  const unresolved = snapshotUnresolved.map((u) => ({ kind: 'snapshot-ref', ...u }))
  const ids = new Set(doors.map((d) => d.id))
  const hasApplyExpansion = doors.some((d) => /^\/api\/sites\/\{key\}\/apply\/[^/{}]+$/.test(d.path))
  for (const r of routes) {
    if (r.method === 'ALL') {
      unresolved.push({
        kind: 'dynamic-mount',
        id: `ALL ${r.path}`,
        reason:
          'wildcard or app.all mount: the methods it answers cannot be enumerated from route registration'
      })
      continue
    }
    if (ids.has(`${r.method} ${r.path}`)) continue
    if (r.path === '/api/sites/{key}/apply/{action}' && hasApplyExpansion) continue
    // A trailing wildcard is documented as one `{path}` parameter (`/docs/*` ↔ `/docs/{path}`).
    if (r.path.endsWith('/*') && ids.has(`${r.method} ${r.path.slice(0, -1)}{path}`)) continue
    unresolved.push({
      kind: 'route-missing-from-snapshot',
      id: `${r.method} ${r.path}`,
      reason: 'the tree registers this route but the pinned snapshot has no such METHOD path'
    })
  }
  const served = routes.map((r) => ({ method: r.method, re: patternToRegex(r.path) }))
  for (const d of doors) {
    const concrete = d.path.replace(/\{[^}]+\}/g, 'x')
    if (!served.some((s) => (s.method === d.method || s.method === 'ALL') && s.re.test(concrete)))
      unresolved.push({
        kind: 'snapshot-not-served',
        id: d.id,
        reason: 'the pinned snapshot lists this door but the tree registers no route that matches it'
      })
  }
  const dedupe = new Map(unresolved.map((u) => [`${u.kind}|${u.id ?? u.where}|${u.reason}`, u]))
  return [...dedupe.values()].sort((a, b) =>
    `${a.kind}${a.id ?? a.where}` < `${b.kind}${b.id ?? b.where}` ? -1 : 1
  )
}

function buildManifest(door, planned, src, membership) {
  const [ref, invariant] = ORACLE_TEXT[planned.tag]
  const ids = planned.itemIds ?? [door.id]
  return {
    id: caseId(door, planned.tag, planned.variant),
    itemIds: ids,
    membership,
    requirement: `${door.id}: ${invariant}`,
    oracle: {
      source:
        planned.tag === 'happy' || planned.tag === 'wrong-method'
          ? src.snapshot
          : `${src.snapshot}; ${src.docs}`,
      ref,
      invariant
    },
    edgeTags: [planned.tag],
    variant: planned.variant,
    targets: ['local'],
    effects: {
      reads: ['owned-postgres:per-run database'],
      writes: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(door.method)
        ? ['owned-postgres:per-run database (refused requests only)']
        : [],
      mail: false,
      model: false,
      containers: false
    },
    prerequisites: ['docker', 'owned-postgres'],
    assertionIds: [planned.assertionId],
    redProof: null,
    legacyIds: []
  }
}

/**
 * Every door of the pinned oracle, its 21 tags and the case manifests, all derived in memory. Nothing here
 * touches the repository: the expanded cases are never committed, only their per-family count and hash.
 */
export async function expandAll({ repoRoot = REPO, pinPath = join(ORACLE_DIR, 'pin.json') } = {}) {
  const pin = readPin(pinPath)
  const { doors, unresolved: refs, provenance } = await loadDoors(repoRoot, pinPath)
  const src = sourceOf(pin)
  const exceptions = loadExceptions()

  const byPath = new Map()
  for (const d of doors) byPath.set(d.path, [...(byPath.get(d.path) ?? []), d])

  const items = []
  const naReasons = new NaTable()
  const plan = []
  const manifests = new Map(REQUIRED_TAGS.map((t) => [t, []]))
  for (const door of doors) {
    const siblings = byPath.get(door.path)
    const membership = door.public ? 'public' : 'internal-only'
    const planned = planDoor(door, { siblings, src, exceptions })
    const tagStatus = {}
    for (const tag of REQUIRED_TAGS) {
      const mine = planned.cases.filter((c) => c.tag === tag)
      if (mine.length)
        tagStatus[tag] = { status: 'cases', cases: mine.map((c) => caseId(door, tag, c.variant)) }
      else if (planned.covered[tag]) tagStatus[tag] = { status: 'covered-by', cases: [planned.covered[tag]] }
      else if (planned.na[tag]) tagStatus[tag] = { status: 'na', reason: planned.na[tag] }
      else if (planned.open[tag]) tagStatus[tag] = { status: 'open', reason: planned.open[tag] }
      else tagStatus[tag] = { status: 'open', reason: 'unclassified by the planner' }
    }
    for (const c of planned.cases) {
      const itemIds = c.tag === 'wrong-method' ? siblings.map((s) => s.id) : [door.id]
      manifests.get(c.tag).push(buildManifest(door, { ...c, itemIds }, src, membership))
    }
    // A tag is either owed or N-A, never both (contracts/denominator.schema.json).
    items.push({
      id: door.id,
      kind: 'api-door',
      requiredTags: REQUIRED_TAGS.filter((t) => !planned.na[t]),
      na: Object.fromEntries(
        Object.entries(planned.na).map(([t, r]) => [t, naReasons.add(r, naSource(r, pin), door.id)])
      ),
      meta: { membership }
    })
    plan.push({ id: door.id, membership, tags: tagStatus })
  }

  const lists = new Map()
  for (const [tag, list] of manifests) {
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const ids = new Set()
    for (const m of list) {
      if (ids.has(m.id)) throw new ContractError(`duplicate case id ${m.id}`)
      ids.add(m.id)
    }
    lists.set(tag, list)
  }
  // Door scenarios are a family of their own: named outcomes, not one request shape per door.
  lists.set(SCENARIO_FAMILY, scenarioManifests(doors, src))
  return { pin, doors, refs, provenance, exceptions, items, naReasons, plan, lists }
}

/** The family table that is committed in place of the expanded cases: count and sha256 per tag. */
export const familyTable = (lists) =>
  Object.fromEntries(
    [...lists].map(([tag, list]) => [tag, { count: list.length, sha256: sha256(stableStringify(list, 0)) }])
  )

/** Case lists back from the committed family table: a count or hash that differs means the manifest is stale. */
export function verifyFamilies(lists, committed) {
  const table = familyTable(lists)
  const want = committed?.families
  if (!want || typeof want !== 'object') throw new ContractError('cases.manifest.json: families missing')
  const names = new Set([...Object.keys(table), ...Object.keys(want)])
  const bad = []
  for (const tag of [...names].sort()) {
    const a = table[tag]
    const b = want[tag]
    if (!a || !b) bad.push(`${tag}: ${a ? 'not in' : 'only in'} cases.manifest.json`)
    else if (a.count !== b.count) bad.push(`${tag}: ${a.count} cases expanded, manifest says ${b.count}`)
    else if (a.sha256 !== b.sha256) bad.push(`${tag}: content hash differs from cases.manifest.json`)
  }
  if (bad.length)
    throw new ContractError(
      `expanded cases do not match cases.manifest.json (run generate.mjs): ${bad.join('; ')}`
    )
}

/** One `<family>.json` per tag under `dir` (created if needed); returns the number of cases written. */
export function writeExpanded(lists, dir) {
  mkdirSync(dir, { recursive: true })
  let n = 0
  for (const [tag, list] of lists) {
    writeFileSync(join(dir, `${tag}.json`), stableStringify(list, 0))
    n += list.length
  }
  return n
}

export async function generate(opts = {}) {
  const { pin, doors, refs, provenance, exceptions, items, naReasons, plan, lists } = await expandAll(opts)
  const routes = await registeredRoutes()
  const unresolved = findUnresolved(doors, routes, refs)

  const publicCount = doors.filter((d) => d.public).length
  const files = new Map()
  // The plan promises exactly the cases the manifests hold: check it before it is written.
  const allManifests = [...lists.values()].flat()
  for (const row of plan)
    for (const [tag, t] of Object.entries(row.tags)) {
      if (t.status !== 'cases' && t.status !== 'covered-by') continue
      const have = caseIdsFor(allManifests, row.id, tag)
      if (
        have.length === 0 ||
        (t.status === 'cases' && [...have].sort().join('|') !== [...t.cases].sort().join('|'))
      )
        throw new ContractError(`${row.id}/${tag}: the plan names cases the manifests do not hold`)
    }
  const planFile = compactPlan(plan, REQUIRED_TAGS)
  const denominator = assertDenominator(
    {
      schema: DENOMINATOR_SCHEMA_ID,
      layer: LAYER,
      source: `${pin.snapshot.path} (public.paths and internal.paths) + ROUTE_DOCS, derived at run time from the pin`,
      revision: pin.revision,
      command: COMMAND,
      note: 'internalDocument contains every public door; internalOnly = internalDocument − public. Never add public and internalDocument.',
      naReasons: naReasons.table(),
      items,
      // A dangling $ref is reported against the door it was found in (`where`).
      unresolved: unresolved.map((u) => ({ kind: u.kind, id: u.id ?? u.where, reason: u.reason })),
      details: {
        complete: unresolved.length === 0,
        counts: {
          internalDocument: doors.length,
          public: publicCount,
          internalOnly: doors.length - publicCount,
          requiredTags: REQUIRED_TAGS.length
        },
        provenance: {
          snapshotSha256: provenance.snapshotSha256,
          routeDocsSha256: provenance.routeDocsSha256,
          exceptionsSha256: sha256(stableStringify(exceptions))
        },
        requiredTagGroups: { common: COMMON_TAGS, api: API_TAGS }
      }
    },
    LAYER
  )
  files.set('tests/qa/layers/api/denominator.json', stableStringify(denominator))
  files.set(
    'tests/qa/layers/api/coverage.plan.json',
    stableStringify({
      revision: pin.revision,
      command: COMMAND,
      requiredTags: REQUIRED_TAGS,
      note: 'tags: one token per required tag — c cases, v covered by a sibling door case, n<i> N-A, o<i> open; i indexes reasons ({id} = the door id). Case ids are the manifests naming the door under that tag.',
      reasons: planFile.reasons,
      items: planFile.items
    })
  )
  files.set(
    CASES_MANIFEST,
    stableStringify({
      revision: pin.revision,
      command: COMMAND,
      note: 'The expanded case manifests are never committed: run.mjs and generate.mjs --expand DIR derive them from the pinned oracle. Each family (edge tag) lists its case count and the sha256 of its stable JSON; --check recomputes both.',
      total: [...lists.values()].reduce((n, l) => n + l.length, 0),
      families: familyTable(lists)
    })
  )
  const formatted = formatJsonFiles(files)
  for (const [rel, content] of formatted) files.set(rel, content)
  for (const [rel, content] of files) {
    if (Buffer.byteLength(content) >= MAX_FILE_BYTES)
      throw new ContractError(
        `${rel} is ${Buffer.byteLength(content)} bytes; a committed file stays under ${MAX_FILE_BYTES}`
      )
  }
  return { files, doors, items, unresolved, plan, lists }
}

/**
 * The repository formatter owns the final shape of a JSON file (a `biome format` check runs over these
 * folders), so the generator pipes its output through it: what is written is what the formatter keeps.
 * One biome run for all files: they are written to a scratch folder, formatted in place and read back.
 */
function formatJsonFiles(files) {
  const base = process.env.QA_API_SCRATCH_DIR || tmpdir()
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'qa-api-format-'))
  try {
    const names = new Map()
    let n = 0
    for (const [rel, content] of files) {
      const name = `f${n++}.json`
      names.set(rel, name)
      writeFileSync(join(dir, name), content)
    }
    const r = spawnSync(
      'pnpm',
      ['exec', 'biome', 'format', '--write', '--files-max-size=8388608', `--config-path=${REPO}`, dir],
      { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 170_000 }
    )
    if (r.status !== 0)
      throw new ContractError(
        `the formatter failed: ${(r.stderr || r.error || 'no output').toString().slice(0, 300)}`
      )
    return new Map([...names].map(([rel, name]) => [rel, readTextSync(join(dir, name))]))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const formatJson = (rel, content) => formatJsonFiles(new Map([[rel, content]])).get(rel)

function parseArgs(argv) {
  const opts = { check: false, pin: null, expand: null }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--check') opts.check = true
    else if (a === '--expand') {
      opts.expand = argv[(i += 1)]
      if (!opts.expand || opts.expand.startsWith('--')) throw new ContractError('--expand needs a directory')
    } else if (a === '--pin') {
      opts.pin = argv[(i += 1)]
      if (!/^[0-9a-f]{40}$/.test(opts.pin ?? ''))
        throw new ContractError('--pin needs a full 40-hex commit sha')
    } else throw new ContractError(`unknown argument ${a}`)
  }
  return opts
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.pin) {
    const path = join(ORACLE_DIR, 'pin.json')
    const pin = readPin(path)
    const bytes = execFileSync('git', ['-C', REPO, 'show', `${opts.pin}:${pin.snapshot.path}`], {
      maxBuffer: 1 << 28
    })
    writeFileSync(
      path,
      formatJson(
        'tests/qa/oracles/api/pin.json',
        stableStringify(
          {
            ...pin,
            revision: opts.pin,
            snapshot: { ...pin.snapshot, sha256: sha256(bytes) },
            routeDocs: {
              ...pin.routeDocs,
              sha256: sha256(routeDocsListing(REPO, { ...pin, revision: opts.pin }))
            }
          },
          2
        )
      )
    )
    console.log(`pinned ${opts.pin}`)
  }
  const { files, items, unresolved, lists } = await generate()
  if (opts.expand) {
    const written = writeExpanded(lists, opts.expand)
    console.log(`expanded ${written} cases into ${opts.expand}`)
    if (!opts.check) return
  }
  const dirty = []
  for (const [rel, content] of files) {
    const abs = join(REPO, rel)
    const current =
      readBoundedSync(abs, { maxBytes: MAX_LAYER_FILE_BYTES, allowMissing: true })?.toString('utf8') ?? null
    if (current !== content) dirty.push(rel)
  }
  // Expanded cases must never be committed: a leftover cases/ folder is a difference too.
  const stale = existsSync(CASES_DIR) ? readdirSync(CASES_DIR).map((f) => `cases/${f}`) : []
  if (opts.check) {
    for (const f of stale) dirty.push(`tests/qa/layers/api/${f} (expanded cases are not committed)`)
    // The expanded door list must never be committed again.
    if (existsSync(join(ORACLE_DIR, 'doors.json')))
      dirty.push('tests/qa/oracles/api/doors.json (derived at run time, not committed)')
    if (dirty.length) {
      console.error(
        `generate --check: ${dirty.length} file(s) differ from a regeneration:\n  ${dirty.join('\n  ')}`
      )
      process.exit(1)
    }
    console.log(
      `generate --check: ${files.size} files identical; ${items.length} items, ${unresolved.length} unresolved`
    )
    return
  }
  if (existsSync(CASES_DIR)) rmSync(CASES_DIR, { recursive: true, force: true })
  for (const [rel, content] of files) {
    const abs = join(REPO, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  console.log(`wrote ${files.size} files; ${items.length} items, ${unresolved.length} unresolved`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    () => process.exit(0),
    (error) => {
      if (error instanceof OracleEnvError) {
        console.error(`env: ${error.message}\nprobe: ${error.probe}`)
        process.exit(3)
      }
      console.error(error instanceof ContractError ? `contract error: ${error.message}` : error)
      process.exit(2)
    }
  )
}
