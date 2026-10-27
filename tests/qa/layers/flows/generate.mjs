#!/usr/bin/env node
// Generates the flows layer's denominator.json and cases/*.json from the code:
//   - the journey registry of tests/e2e-dev/run.mjs (JOURNEYS),
//   - the capability table of CONTEXT.md §6,
//   - the doors the journeys call (static string paths only, read from the syntax tree; every other construct is listed as unresolved),
//   - registry.mjs (the flow table) and scenario-meta.mjs (assertion names).
//
//   node tests/qa/layers/flows/generate.mjs            write denominator.json + cases/*.json
//   node tests/qa/layers/flows/generate.mjs --check [--out DIR]
//                                                      regenerate in memory, compare with the files
//                                                      on disk (exit 1 on any difference); with --out
//                                                      the regenerated copies are written there too
//
// The output is byte-stable: same inputs → same files.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import * as acorn from 'acorn'
import { MAX_LAYER_FILE_BYTES, readBoundedSync, readTextSync } from '../../lib/bounded-reader.mjs'
import { assertDenominator, DENOMINATOR_SCHEMA_ID, NaTable } from '../../lib/denominator.mjs'
import { docRel } from '../../lib/doc-source.mjs'
import { ALL_FLOW_TAGS, COMMON_TAGS, FLOWS, FLOW_TAGS, JOURNEY_TITLES } from './registry.mjs'
import { assertionIdsOf, legacyAssertionIds, SCENARIOS } from './scenario-meta.mjs'
import { LAYER_DIR, REPO, UsageError, sha256, stableStringify, writeAtomic } from './util.mjs'

export const COMMAND = 'node tests/qa/layers/flows/generate.mjs'

/** CONTEXT.md §6 row name → the flows that serve it. A row missing here is reported unresolved. */
export const CAPABILITY_FLOWS = {
  'Build a new site': ['add-site', 'import-site', 'build-resume', 'delete-site', 'my-sites-design'],
  'Edit by chat': ['agent-edit'],
  'Comment on the page': ['comment-resolve'],
  'Site changes · Diff · Undo · Backup': ['site-changes-undo', 'backup-restore'],
  Team: ['team-invite', 'team-role'],
  'Inbox + email': ['inbox'],
  'AI assistant (`/help`)': ['assistant-readonly'],
  Brand: ['brand-inspiration'],
  'Eight interface languages': ['settings']
}

const slug = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const rd = (rel) => readTextSync(path.join(REPO, rel))

/** The fields a JOURNEYS row may carry; `smoke` picks the short run and is not part of a journey's identity. */
const JOURNEY_FIELDS = new Set(['id', 'perCms', 'notCovered', 'smoke'])

/** Parses a whole source; a source that does not parse stops the generator, it never yields a partial list. */
/** The commas of each parsed source, by tree: an array hole has no node, so its line comes from its comma. */
const COMMAS = new WeakMap()

function parseSource(text, rel) {
  const options = { ecmaVersion: 'latest', locations: true, allowHashBang: true }
  const tryParse = (sourceType) => {
    const commas = []
    const ast = acorn.parse(text, {
      ...options,
      sourceType,
      onToken: (t) => t.type.label === ',' && commas.push({ start: t.start, loc: t.loc })
    })
    COMMAS.set(ast, commas)
    return ast
  }
  try {
    return tryParse('module')
  } catch (moduleError) {
    try {
      return tryParse('script')
    } catch {
      const at = moduleError.loc ? `:${moduleError.loc.line}:${moduleError.loc.column + 1}` : ''
      throw new Error(
        `${rel}${at}: cannot parse this source (${moduleError.message.replace(/ \(\d+:\d+\)$/, '')})`
      )
    }
  }
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue
    if (Array.isArray(value)) for (const item of value) walk(item, visit)
    else if (value && typeof value === 'object') walk(value, visit)
  }
}

const gap = (rel, node, construct, reason, kind) => ({
  source: rel,
  kind,
  reason: `${rel}:${node.loc.start.line}: ${reason}`,
  detail: { line: node.loc.start.line, construct }
})

/**
 * The journeys of tests/e2e-dev/run.mjs, read from the syntax tree of its top-level `JOURNEYS` table.
 * Every construct this reader does not support (a spread, a computed key, a row built by a call, an
 * unknown field, a mutation of the table...) becomes an `unresolved` entry naming file, line and
 * construct; the row is left out of `items` only together with that entry. A source that does not parse throws.
 */
export function extractJourneys(source, rel = 'tests/e2e-dev/run.mjs') {
  const ast = parseSource(source, rel)
  const items = []
  const unresolved = []
  const add = (node, construct, reason) => unresolved.push(gap(rel, node, construct, reason, 'journeys'))
  const tables = []
  for (const stmt of ast.body) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt
    if (decl?.type !== 'VariableDeclaration') continue
    for (const d of decl.declarations) {
      if (d.id.type === 'Identifier' && d.id.name === 'JOURNEYS') tables.push(d)
      else if (d.id.type !== 'Identifier') {
        const bound = []
        walk(d.id, (n) => n.type === 'Identifier' && n.name === 'JOURNEYS' && bound.push(n))
        if (bound.length) add(d, d.id.type, 'JOURNEYS is bound by a destructuring pattern')
      }
    }
  }
  if (tables.length === 0) {
    unresolved.push({
      source: rel,
      kind: 'journeys',
      reason: `${rel} has no top-level \`const JOURNEYS = [...]\` declaration`,
      detail: { line: 1, construct: 'missing JOURNEYS' }
    })
    return { items, unresolved }
  }
  if (tables.length > 1) add(tables[1], 'VariableDeclarator', 'JOURNEYS is declared more than once')
  const table = tables[0]
  if (table.init?.type !== 'ArrayExpression') {
    add(
      table,
      table.init?.type ?? 'no initializer',
      `JOURNEYS is not an array literal (${table.init?.type ?? 'no initializer'})`
    )
  } else {
    if (table.init.elements.length === 0) add(table, 'ArrayExpression', 'the JOURNEYS table is empty')
    const { elements } = table.init
    // Commas that separate elements: inside the array but not inside any element.
    const commas = (COMMAS.get(ast) ?? []).filter(
      (c) =>
        c.start > table.init.start &&
        c.start < table.init.end &&
        !elements.some((e) => e && c.start >= e.start && c.start < e.end)
    )
    let prevEnd = table.init.start
    let holes = 0
    for (const row of elements) {
      if (row === null) {
        // `[a, , b]`: after `a` the first comma ends `a`, the next one ends the hole; at the start of the
        // array (`[, a]`) the first comma already ends the hole.
        holes += 1
        const after = commas.filter((c) => c.start >= prevEnd)
        const comma = after[prevEnd === table.init.start ? holes - 1 : holes]
        add(
          { loc: comma?.loc ?? table.init.loc },
          'array hole',
          'the JOURNEYS table has an empty slot (array hole)'
        )
        continue
      }
      holes = 0
      prevEnd = row.end
      readJourneyRow(row, items, add)
    }
  }
  // Data flow is out of scope, so the only use of `JOURNEYS` this reader understands is its own declaration.
  // Every other mention (a call argument, a constructor, a template tag, an assignment, a return, a callback,
  // an export, a plain read...) is reported as a use it has not analysed: it may change the table, and no
  // list of "harmful" contexts is kept, so a context nobody thought of is reported too.
  const visit = (node, parent, key) => {
    if (!node || typeof node.type !== 'string') return
    const isName = node.type === 'Identifier' && node.name === 'JOURNEYS'
    const isLabelOrKey =
      parent &&
      ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
        ((parent.type === 'Property' ||
          parent.type === 'PropertyDefinition' ||
          parent.type === 'MethodDefinition') &&
          key === 'key' &&
          !parent.computed &&
          !parent.shorthand))
    if (isName && node !== table.id && !isLabelOrKey)
      add(
        node,
        parent?.type ?? 'Program',
        'JOURNEYS is used after its declaration in a way this reader does not analyse'
      )
    for (const [k, value] of Object.entries(node)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue
      if (Array.isArray(value)) for (const item of value) visit(item, node, k)
      else if (value && typeof value === 'object') visit(value, node, k)
    }
  }
  visit(ast, null, null)
  return { items, unresolved }
}

function readJourneyRow(row, items, add) {
  const node = row
  if (row.type === 'SpreadElement') return add(row, row.type, 'the JOURNEYS table spreads another value')
  if (row.type !== 'ObjectExpression')
    return add(row, row.type, `a JOURNEYS row is not an object literal (${row.type})`)
  const fields = {}
  let ok = true
  for (const prop of row.properties) {
    if (prop.type === 'SpreadElement') {
      add(prop, prop.type, 'a JOURNEYS row spreads another value')
      ok = false
      continue
    }
    if (prop.computed || prop.kind !== 'init' || prop.method || prop.shorthand) {
      const what = prop.computed
        ? 'computed key'
        : prop.shorthand
          ? 'shorthand property'
          : prop.kind !== 'init'
            ? 'accessor'
            : 'method'
      add(prop, `Property (${what})`, `a JOURNEYS row has a ${what}`)
      ok = false
      continue
    }
    const key =
      prop.key.type === 'Identifier'
        ? prop.key.name
        : prop.key.type === 'Literal'
          ? String(prop.key.value)
          : null
    if (key === null || !JOURNEY_FIELDS.has(key)) {
      add(
        prop,
        'Property (unknown field)',
        `a JOURNEYS row has the field \`${key}\`, which this reader does not know`
      )
      ok = false
      continue
    }
    const v = prop.value
    const want = key === 'id' || key === 'notCovered' ? 'string' : 'boolean'
    if (v.type !== 'Literal' || typeof v.value !== want) {
      add(prop, `Property (${key})`, `the \`${key}\` of a JOURNEYS row is not a ${want} literal (${v.type})`)
      ok = false
      continue
    }
    if (key in fields) {
      add(prop, `Property (${key})`, `a JOURNEYS row sets \`${key}\` twice`)
      ok = false
    }
    fields[key] = v.value
  }
  if (typeof fields.id !== 'string' || typeof fields.perCms !== 'boolean') {
    if (ok) add(node, 'ObjectExpression', 'a JOURNEYS row lacks `id` or `perCms`')
    return
  }
  if (items.some((x) => x.id === fields.id)) {
    add(node, 'ObjectExpression', `the journey id \`${fields.id}\` appears twice`)
    return
  }
  if (!ok) return
  items.push({ id: fields.id, perCms: fields.perCms, notCovered: fields.notCovered ?? null })
}

/** The capability rows of CONTEXT.md §6. */
export function extractCapabilities(source) {
  const from = source.indexOf('## 6.')
  const to = source.indexOf('## 7.', from)
  if (from === -1) return { items: [], problem: 'CONTEXT.md has no §6' }
  const rows = []
  for (const line of source.slice(from, to === -1 ? undefined : to).split('\n')) {
    const m = /^\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$/.exec(line)
    if (m) rows.push({ name: m[1].trim(), oneLine: m[2].trim(), why: m[3].trim() })
  }
  return { items: rows, problem: rows.length === 0 ? 'no capability rows parsed from CONTEXT.md §6' : null }
}

const DOOR_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch'])

/**
 * Doors named by a static string path in the journeys, read from the syntax tree: calls inside a comment
 * or a string are not calls. A call to a door method whose path is not a static string (a template that does not start with "/",
 * a variable, a helper result, a missing argument, a computed method) is `unresolved`, with file,
 * line and construct. A source that does not parse throws.
 */
export function extractDoors(files) {
  const doors = new Map()
  const unresolved = []
  for (const { rel, text } of files) {
    const add = (node, construct, reason) => unresolved.push(gap(rel, node, construct, reason, 'door'))
    walk(parseSource(text, rel), (node) => {
      if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return
      const { callee } = node
      const first = node.arguments[0]
      let method = null
      if (!callee.computed && callee.property.type === 'Identifier') method = callee.property.name
      else if (
        callee.computed &&
        callee.property.type === 'Literal' &&
        typeof callee.property.value === 'string'
      )
        method = callee.property.value
      else if (callee.computed) {
        // `x[name](...)` may be a door call whatever its arguments are; it cannot be classified, so it is said.
        add(node, 'CallExpression (computed method)', 'a call whose method is a computed expression')
        return
      }
      if (!DOOR_METHODS.has(method)) return
      if (!first) return add(node, 'CallExpression (no argument)', `\`.${method}()\` has no path argument`)
      if (first.type === 'SpreadElement')
        return add(node, 'SpreadElement', `\`.${method}(...)\` passes its path as a spread`)
      let p = null
      if (first.type === 'Literal' && typeof first.value === 'string') p = first.value
      else if (first.type === 'TemplateLiteral') {
        const head = first.quasis[0].value.cooked ?? ''
        if (/^https?:/.test(head)) return
        // The door is known, only the value of a segment is not: each interpolation becomes `:param`.
        if (first.expressions.length > 0 && !/^\/(?!\/)/.test(head))
          return add(
            node,
            'TemplateLiteral (interpolation)',
            `\`.${method}()\` has a path with an interpolation that does not start with "/"`
          )
        p = first.quasis.map((q, i) => (i === 0 ? '' : ':param') + (q.value.cooked ?? '')).join('')
      } else return add(node, first.type, `\`.${method}()\` has a non-literal path argument (${first.type})`)
      if (/^https?:/.test(p) || !/^\/(?!\/)/.test(p)) return
      p = p.split('?')[0]
      const id = `door:${method.toUpperCase()} ${p}`
      if (!doors.has(id)) doors.set(id, { method: method.toUpperCase(), path: p, sources: new Set() })
      doors.get(id).sources.add(rel)
    })
  }
  return { doors, unresolved }
}

const JOURNEYS_DIR = 'tests/e2e-dev/journeys'

/**
 * The journey sources, and a gap for each one that is missing: the directory itself, or the file of a
 * journey the table lists (`J10` → `J10.test.mjs`). A journey marked `notCovered` has no source by design.
 */
export function listJourneyFiles(journeyItems, dir = path.join(REPO, JOURNEYS_DIR)) {
  const gaps = []
  const missing = (reason) =>
    gaps.push({
      source: JOURNEYS_DIR,
      kind: 'door',
      reason,
      detail: { line: 1, construct: 'missing journey source' }
    })
  if (!existsSync(dir)) {
    missing(`${JOURNEYS_DIR} does not exist: the doors the journeys call cannot be read`)
    return { files: [], gaps }
  }
  const names = readdirSync(dir)
    .filter((f) => /^J\w+\.test\.mjs$/.test(f))
    .sort()
  for (const j of journeyItems)
    if (!j.notCovered && !names.includes(`${j.id}.test.mjs`))
      missing(
        `${JOURNEYS_DIR}/${j.id}.test.mjs is missing: journey ${j.id} is in JOURNEYS but its doors are not read`
      )
  const files = names.map((f) => ({
    rel: `${JOURNEYS_DIR}/${f}`,
    text: readTextSync(path.join(dir, f))
  }))
  return { files, gaps }
}

/**
 * The repository formatter is part of lint, and it formats JSON too: generated files are passed
 * through it, so a regenerated file is byte-identical to a formatted committed one.
 */
function formatJson(text, name) {
  const biome = path.join(REPO, 'node_modules/.bin/biome')
  if (!existsSync(biome))
    throw new Error('biome is not installed: cannot produce formatted JSON (run pnpm install)')
  return execFileSync(biome, ['format', '--stdin-file-path', name], {
    input: text,
    encoding: 'utf8',
    cwd: REPO
  })
}

/** Build every generated file as { relPath → text } without touching the disk. */
export function build() {
  const inputs = {
    'tests/e2e-dev/run.mjs': rd('tests/e2e-dev/run.mjs'),
    'CONTEXT.md': rd(docRel(REPO, 'CONTEXT.md'))
  }
  const layerInputs = {}
  for (const f of ['registry.mjs', 'scenario-meta.mjs']) {
    layerInputs[`tests/qa/layers/flows/${f}`] = readTextSync(path.join(LAYER_DIR, f))
  }
  const journeys = extractJourneys(inputs['tests/e2e-dev/run.mjs'])
  const { files: journeyFiles, gaps: journeyFileGaps } = listJourneyFiles(journeys.items)
  const sourceHashes = Object.fromEntries(
    [...Object.entries(inputs), ...Object.entries(layerInputs), ...journeyFiles.map((f) => [f.rel, f.text])]
      .map(([k, v]) => [k, sha256(v)])
      .sort(([a], [b]) => a.localeCompare(b))
  )
  const revision = `sha256:${sha256(JSON.stringify(sourceHashes))}`

  const unresolved = []
  unresolved.push(...journeys.unresolved, ...journeyFileGaps)
  if (journeys.items.length === 0 && journeys.unresolved.length === 0)
    throw new Error('tests/e2e-dev/run.mjs: no journey rows read and nothing said unresolved')
  const caps = extractCapabilities(inputs['CONTEXT.md'])
  if (caps.problem) unresolved.push({ source: 'CONTEXT.md', reason: caps.problem })
  const { doors, unresolved: doorGaps } = extractDoors(journeyFiles)
  unresolved.push(...doorGaps)
  unresolved.push(
    {
      source: 'runtime graph',
      reason:
        'the actions reachable in the browser (UI route/slot/control graph) are not extracted here; the ui layer owns them. Flow items come from journeys, CONTEXT.md and the registry'
    },
    {
      source: 'CONTEXT.md',
      reason:
        'sign-in, publish, own domain, the waitlist and isolation have no row in CONTEXT.md §6; their oracles are the pinned API reference, issue #993, the regression cases REG-PR-936/948/972/973/998 and ADR 0014'
    }
  )

  // Items ----------------------------------------------------------------------------------------
  const items = []
  const flowsByCap = new Map()
  for (const [cap, keys] of Object.entries(CAPABILITY_FLOWS)) for (const k of keys) flowsByCap.set(k, cap)
  const knownJourneys = new Set(journeys.items.map((j) => j.id))
  for (const j of journeys.items)
    items.push({
      id: `journey:${j.id}`,
      kind: 'journey',
      requiredTags: [...ALL_FLOW_TAGS],
      na: {},
      meta: { title: JOURNEY_TITLES[j.id] ?? null, perCms: j.perCms, notCovered: j.notCovered }
    })
  for (const f of FLOWS)
    items.push({
      id: `flow:${f.key}`,
      kind: 'flow',
      requiredTags: [...ALL_FLOW_TAGS],
      na: {},
      meta: { title: f.title }
    })
  for (const c of caps.items) {
    const flows = CAPABILITY_FLOWS[c.name]
    if (!flows)
      unresolved.push({ source: 'CONTEXT.md §6', reason: `capability "${c.name}" is mapped to no flow` })
    items.push({
      id: `capability:${slug(c.name)}`,
      kind: 'capability',
      requiredTags: [...ALL_FLOW_TAGS],
      na: {},
      meta: { title: c.name, flows: flows ?? [] }
    })
  }
  // The master plan's §3 table is committed as inventory/edge-tags.json; its "flow" group is these tags.
  const reasons = new NaTable()
  const doorReason = reasons.add(
    'a door is one request; the flow-level tags belong to the flow that calls it (plan §3, row "Flow")',
    'tests/qa/inventory/edge-tags.json'
  )
  const doorNa = Object.fromEntries(
    FLOW_TAGS.filter((t) => !COMMON_TAGS.includes(t)).map((t) => [t, doorReason])
  )
  for (const [id, d] of [...doors.entries()].sort(([a], [b]) => a.localeCompare(b)))
    items.push({
      id,
      kind: 'door',
      requiredTags: [...COMMON_TAGS],
      na: doorNa,
      meta: { method: d.method, path: d.path, calledBy: [...d.sources].sort() }
    })
  for (const f of FLOWS)
    for (const j of f.journeys)
      if (knownJourneys.size && !knownJourneys.has(j))
        unresolved.push({
          source: 'registry.mjs',
          reason: `flow ${f.key} names journey ${j}, which the JOURNEYS table does not have`
        })
  for (const j of knownJourneys)
    if (!FLOWS.some((f) => f.journeys.includes(j)))
      unresolved.push({
        source: 'tests/e2e-dev/run.mjs',
        reason: `journey ${j} is served by no flow of registry.mjs`
      })

  // Cases ----------------------------------------------------------------------------------------
  const files = {}
  const seen = new Set()
  for (const f of FLOWS) {
    const cap = flowsByCap.get(f.key)
    const capItem = cap ? `capability:${slug(cap)}` : null
    const cases = []
    for (const s of f.scenarios) {
      const id = `QA-FLOWS-${f.key}-${s.tag}-${s.variant}`
      if (seen.has(id)) throw new Error(`duplicate case id ${id} in registry.mjs`)
      seen.add(id)
      const itemIds = [`flow:${f.key}`]
      if (capItem) itemIds.push(capItem)
      let assertionIds = []
      let legacyIds = []
      const prerequisites = []
      if (s.kind === 'scripted') {
        if (!SCENARIOS[s.ref]) throw new Error(`${id}: scenario ${s.ref} is not in scenario-meta.mjs`)
        assertionIds = assertionIdsOf(s.ref)
        prerequisites.push(...SCENARIOS[s.ref].needs)
      } else if (s.kind === 'legacy') {
        if (knownJourneys.size && !knownJourneys.has(s.ref))
          throw new Error(`${id}: journey ${s.ref} is not in the JOURNEYS table`)
        itemIds.push(`journey:${s.ref}`)
        assertionIds = legacyAssertionIds(s.ref)
        legacyIds = [s.ref]
        prerequisites.push('stand', 'legacy-runner')
        if (f.effects.model) prerequisites.push('model-credentials')
      } else if (s.kind === 'pilot') {
        assertionIds = [`pilot:${s.ref}#rows`]
        prerequisites.push('stand', 'browser')
      }
      cases.push({
        id,
        itemIds,
        requirement: `${f.title} — ${s.variant.replace(/-/g, ' ')} (${s.tag})${
          s.kind === 'legacy' ? ` [journey ${s.ref}: ${JOURNEY_TITLES[s.ref] ?? ''}]` : ''
        }`,
        oracle: { ...f.oracle },
        edgeTags: [s.tag],
        targets: ['local'],
        effects: {
          reads: f.effects.reads ?? [],
          writes: f.effects.writes ?? [],
          mail: Boolean(f.effects.mail),
          model: Boolean(f.effects.model),
          containers: Boolean(f.effects.containers)
        },
        prerequisites,
        assertionIds,
        redProof: null,
        legacyIds,
        // Not part of the shared contract; the layer reads them to dispatch.
        kind: s.kind,
        ref: s.ref ?? null,
        ...(s.kind === 'pending' ? { pendingReason: s.reason } : {})
      })
    }
    files[`cases/${f.key}.json`] = formatJson(stableStringify(cases), `cases/${f.key}.json`)
  }

  const denominator = assertDenominator(
    {
      schema: DENOMINATOR_SCHEMA_ID,
      layer: 'flows',
      source:
        'tests/e2e-dev/run.mjs JOURNEYS + CONTEXT.md §6 + doors called by tests/e2e-dev/journeys + tests/qa/layers/flows/registry.mjs',
      revision,
      command: COMMAND,
      naReasons: reasons.table(),
      items,
      unresolved,
      details: {
        extractionKind: 'journey-table + capability-table + door-literals + flow-registry',
        sourceHashes,
        complete: false,
        incompleteBecause:
          'the UI action graph and doors built from variables are not extracted (see unresolved); flows beyond the journeys are listed by hand in registry.mjs'
      }
    },
    'flows'
  )
  files['denominator.json'] = formatJson(stableStringify(denominator), 'denominator.json')
  return files
}

/** Compare generated text with the disk; returns the list of differing relative paths. */
export function diffAgainstDisk(files, dir = LAYER_DIR) {
  const bad = []
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, rel)
    const onDisk = readBoundedSync(file, { maxBytes: MAX_LAYER_FILE_BYTES, allowMissing: true })
    if (onDisk === null || onDisk.toString('utf8') !== text) bad.push(rel)
  }
  const casesDir = path.join(dir, 'cases')
  if (existsSync(casesDir))
    for (const f of readdirSync(casesDir))
      if (f.endsWith('.json') && !(`cases/${f}` in files)) bad.push(`cases/${f} (stale: no longer generated)`)
  return bad.sort()
}

export function writeAll(files, dir = LAYER_DIR) {
  for (const [rel, text] of Object.entries(files)) writeAtomic(path.join(dir, rel), text)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { values } = parseArgs({
      options: { check: { type: 'boolean', default: false }, out: { type: 'string' } },
      allowPositionals: false,
      strict: true
    })
    const files = build()
    if (values.out) writeAll(files, path.resolve(values.out, 'generated'))
    if (values.check) {
      const bad = diffAgainstDisk(files)
      if (bad.length) {
        console.error(`generate: out of date (${bad.length}): ${bad.join(', ')}\nrun: ${COMMAND}`)
        process.exit(1)
      }
      console.log(`generate: ${Object.keys(files).length} file(s) identical to the committed ones`)
    } else {
      writeAll(files)
      console.log(`generate: wrote ${Object.keys(files).length} file(s) into ${LAYER_DIR}`)
    }
  } catch (error) {
    console.error(`generate: ${error.message}`)
    process.exit(error instanceof UsageError || error.code?.startsWith('ERR_PARSE_ARGS') ? 2 : 1)
  }
}
